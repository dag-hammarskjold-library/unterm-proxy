#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const LANG_TAGS = {
  english: "en",
  french: "fr",
  spanish: "es",
  arabic: "ar",
  chinese: "zh",
  russian: "ru",
  german: "de",
  portuguese: "pt"
};

export const context = {
  "@vocab": "http://schema.org/",
  dct: "http://purl.org/dc/terms/",
  skos: "http://www.w3.org/2004/02/skos/core#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  unterm: "https://metadata.un.org/UNTERM/ontology#"
};

const TURTLE_PREFIXES = {
  dct: context.dct,
  skos: context.skos,
  xsd: context.xsd,
  unterm: context.unterm,
  schema: context["@vocab"]
};

//const DEFAULT_RECORD_IRI_BASE = "https://conferences.unite.un.org/untermapi/api/record/";
const DEFAULT_RECORD_IRI_BASE = "http://metadata.un.org/unterm/"

function asLangLiteral(value, lang) {
  if (!value || typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return { "@value": value, "@language": lang };
}

function toDateTimeLiteral(value) {
  if (!value) {
    return null;
  }
  return { "@value": value, "@type": "xsd:dateTime" };
}

function getLanguageSections(obj) {
  const sections = [];
  for (const [key, value] of Object.entries(obj)) {
    if (LANG_TAGS[key] && value && typeof value === "object") {
      sections.push([key, value, LANG_TAGS[key]]);
    }
  }
  return sections;
}

export function prune(value) {
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((x) => x !== null && x !== undefined && !(Array.isArray(x) && x.length === 0));
    return arr;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const p = prune(v);
      if (p === null || p === undefined) {
        continue;
      }
      if (Array.isArray(p) && p.length === 0) {
        continue;
      }
      out[k] = p;
    }
    return out;
  }
  return value;
}

function buildLanguageIdMap(record) {
  const out = new Map();
  for (const [languageName, section, langTag] of getLanguageSections(record)) {
    const terms = Array.isArray(section.terms) ? section.terms : [];
    for (const term of terms) {
      if (term?.languageID && !out.has(term.languageID)) {
        out.set(term.languageID, { languageName, langTag });
      }
    }
  }
  return out;
}

export function transformRecordToLinkedData(record, options = {}) {
  const recordIriBase = options.recordIriBase || DEFAULT_RECORD_IRI_BASE;
  const recordIri = `${recordIriBase}${record.recordID}`;

  const prefLabel = [];
  const altLabel = [];
  const definitions = [];
  const notes = [];
  const languageData = [];

  for (const [languageName, section, langTag] of getLanguageSections(record)) {
    const terms = Array.isArray(section.terms) ? section.terms : [];
    const langNode = {
      "@id": `${recordIri}#lang-${langTag}`,
      "@type": "unterm:LanguageSection",
      "dct:language": langTag,
      "unterm:languageName": languageName,
      "unterm:isRTL": Boolean(section.isRTL),
      "unterm:validationStatus": section.validationStatus || null,
      "unterm:terms": []
    };

    const hasShortPreferred = terms.some(
      (t) => t?.termStatus === "preferred" && t?.termType === "short" && typeof t?.term === "string" && t.term.trim() !== ""
    );

    for (const term of terms) {
      if (!term || typeof term.term !== "string" || term.term.trim() === "") {
        continue;
      }

      const termNode = {
        "@id": `${recordIri}#term-${term.termID}`,
        "@type": "unterm:Term",
        "unterm:termValue": term.term,
        "unterm:termStatus": term.termStatus || null,
        "unterm:termType": term.termType || null,
        "dct:created": toDateTimeLiteral(term.created),
        "dct:modified": toDateTimeLiteral(term.modified)
      };
      langNode["unterm:terms"].push(termNode);

      if (term.termStatus === "preferred") {
        const lit = asLangLiteral(term.term, langTag);
        if (!lit) {
          continue;
        }
        if (term.termType === "short" || !hasShortPreferred) {
          prefLabel.push(lit);
        } else {
          altLabel.push(lit);
        }
      }
    }

    const def = asLangLiteral(section.definition, langTag);
    const note = asLangLiteral(section.note, langTag);
    if (def) {
      definitions.push(def);
    }
    if (note) {
      notes.push(note);
    }

    languageData.push(langNode);
  }

  const languageIdMap = buildLanguageIdMap(record);
  const specialFields = (record.specialFields || []).map((f) => ({
    "@id": `${recordIri}#special-${f.id}`,
    "@type": "unterm:SpecialField",
    "unterm:fieldName": f.name,
    "unterm:fieldValue": f.value,
    "unterm:fieldLevel": f.fieldLevel,
    "unterm:fieldOrder": f.fieldOrder,
    "unterm:stacking": f.stacking,
    "dct:language": languageIdMap.get(f.languageId)?.langTag || null
  }));

  const linkedData = {
    "@context": context,
    "@id": recordIri,
    "@type": ["skos:Concept", "unterm:Country"],
    "dct:identifier": record.recordID,
    "dct:type": record.recordType || null,
    "dct:title": asLangLiteral(record.title, "en"),
    "dct:created": toDateTimeLiteral(record.created),
    "dct:modified": toDateTimeLiteral(record.modified),
    "dct:creator": record.createdBy || null,
    "dct:contributor": record.modifiedBy || null,
    "skos:prefLabel": prefLabel,
    "skos:altLabel": altLabel,
    "skos:definition": definitions,
    "skos:note": notes,
    "unterm:status": record.status || null,
    "unterm:distribution": record.distribution || null,
    "unterm:dbName": record.dbName || null,
    "unterm:space": record.space || null,
    "unterm:subjects": Array.isArray(record.subjects) ? record.subjects : [],
    "unterm:languages": Array.isArray(record.languages) ? record.languages : [],
    "unterm:specialFields": specialFields,
    "unterm:languageData": languageData
  };

  return prune(linkedData);
}

function escapeLiteral(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\"/g, '\\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function toTermRef(value, { isType = false } = {}) {
  if (typeof value !== "string") {
    return null;
  }
  if (/^https?:\/\//.test(value)) {
    return `<${value}>`;
  }
  if (value.includes(":")) {
    return value;
  }
  if (isType) {
    return `schema:${value}`;
  }
  return null;
}

function literalObjectToTurtle(value) {
  const escaped = escapeLiteral(value["@value"]);
  if (value["@language"]) {
    return `"${escaped}"@${value["@language"]}`;
  }
  if (value["@type"]) {
    return `"${escaped}"^^${value["@type"]}`;
  }
  return `"${escaped}"`;
}

function objectToTurtleObject(value) {
  if (value && typeof value === "object") {
    if (typeof value["@id"] === "string") {
      return toTermRef(value["@id"]);
    }
    if (Object.prototype.hasOwnProperty.call(value, "@value")) {
      return literalObjectToTurtle(value);
    }
  }
  if (typeof value === "string") {
    const iri = toTermRef(value);
    if (iri) {
      return iri;
    }
    return `"${escapeLiteral(value)}"`;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? `${value}` : `${value}`;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return null;
}

function collectIdNodes(value, nodes) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectIdNodes(item, nodes);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (typeof value["@id"] === "string") {
    if (!nodes.has(value["@id"])) {
      nodes.set(value["@id"], value);
    }
  }

  for (const v of Object.values(value)) {
    collectIdNodes(v, nodes);
  }
}

function serializeNode(node) {
  const subject = toTermRef(node["@id"]);
  const lines = [];

  const predicates = [];
  for (const [predicate, raw] of Object.entries(node)) {
    if (predicate === "@id" || predicate === "@context" || predicate === "@type") {
      continue;
    }

    const values = Array.isArray(raw) ? raw : [raw];
    const objects = [];

    for (const value of values) {
      if (value === null || value === undefined) {
        continue;
      }

      if (predicate === "@type") {
        const typeRef = typeof value === "string" ? toTermRef(value, { isType: true }) : null;
        if (typeRef) {
          objects.push(typeRef);
        }
        continue;
      }

      const obj = objectToTurtleObject(value);
      if (obj) {
        objects.push(obj);
      }
    }

    if (objects.length === 0) {
      continue;
    }

    const pred = predicate.includes(":") ? predicate : `schema:${predicate}`;
    predicates.push(`  ${pred} ${objects.join(", ")}`);
  }

  if (predicates.length === 0) {
    return null;
  }

  lines.push(`${subject}`);
  if (Object.prototype.hasOwnProperty.call(node, "@type")) {
    const typeValues = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    const typeObjects = typeValues
      .map((v) => (typeof v === "string" ? toTermRef(v, { isType: true }) : null))
      .filter(Boolean);
    if (typeObjects.length > 0) {
      lines.push(`  a ${typeObjects.join(", ")} ;`);
    }
  }

  for (let i = 0; i < predicates.length; i += 1) {
    const suffix = i === predicates.length - 1 ? " ." : " ;";
    lines.push(`${predicates[i]}${suffix}`);
  }

  return lines.join("\n");
}

export function linkedDataToTurtle(linkedData) {
  const prefixes = Object.entries(TURTLE_PREFIXES)
    .map(([prefix, iri]) => `@prefix ${prefix}: <${iri}> .`)
    .join("\n");

  const nodes = new Map();
  collectIdNodes(linkedData, nodes);

  const blocks = [];
  for (const node of nodes.values()) {
    const block = serializeNode(node);
    if (block) {
      blocks.push(block);
    }
  }

  return `${prefixes}\n\n${blocks.join("\n\n")}\n`;
}

function runCli() {
  const [inputPath = "term.json", outputPath = "linked-data.jsonld"] = process.argv.slice(2);
  const raw = fs.readFileSync(inputPath, "utf8");
  const record = JSON.parse(raw);
  const cleaned = transformRecordToLinkedData(record);
  fs.writeFileSync(outputPath, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");

  const outputAbs = path.resolve(outputPath);
  console.log(`Wrote JSON-LD: ${outputAbs}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
