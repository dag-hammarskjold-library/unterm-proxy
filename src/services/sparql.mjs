import { QueryEngine } from "@comunica/query-sparql";
import jsonld from "jsonld";
import { Parser as N3Parser, Store as N3Store, Writer as N3Writer } from "n3";
import { context } from "../../scripts/map-to-linked-data.mjs";
import { SPARQL_RESULTS_CONTENT_TYPE } from "../config.mjs";
import { sendJson, sendText } from "../response-helpers.mjs";

const queryEngine = new QueryEngine();

function getSparqlQuery(url) {
  const query = String(url.searchParams.get("query") || url.searchParams.get("sparql") || "").trim();
  return query.length > 0 ? query : null;
}

function detectSparqlForm(query) {
  const normalized = query.replace(/#[^\n\r]*/g, " ").trim().toUpperCase();
  const match = normalized.match(/\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/);
  return match ? match[1] : null;
}

function termToSparqlBinding(term) {
  if (!term || typeof term !== "object") {
    return null;
  }

  if (term.termType === "NamedNode") {
    return { type: "uri", value: term.value };
  }

  if (term.termType === "BlankNode") {
    return { type: "bnode", value: term.value };
  }

  if (term.termType === "Literal") {
    const binding = {
      type: "literal",
      value: term.value
    };
    if (term.language) {
      binding["xml:lang"] = term.language;
    } else if (term.datatype?.value) {
      binding.datatype = term.datatype.value;
    }
    return binding;
  }

  return null;
}

async function buildStoreFromLinkedData(linkedDataDoc) {
  const nquads = await jsonld.toRDF(linkedDataDoc, { format: "application/n-quads" });
  const parser = new N3Parser({ format: "N-Quads" });
  const quads = parser.parse(nquads);
  return new N3Store(quads);
}

async function serializeQuadsToTurtle(quadsStream) {
  const writer = new N3Writer({
    prefixes: {
      dct: context.dct,
      skos: context.skos,
      xsd: context.xsd,
      unterm: context.unterm,
      schema: context["@vocab"]
    }
  });

  for await (const quad of quadsStream) {
    writer.addQuad(quad);
  }

  return new Promise((resolve, reject) => {
    writer.end((error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(output);
    });
  });
}

async function executeSparqlAgainstLinkedData(linkedDataDoc, query) {
  const form = detectSparqlForm(query);
  if (!form) {
    throw new Error("Unsupported SPARQL query form. Use SELECT, ASK, CONSTRUCT, or DESCRIBE.");
  }

  const source = await buildStoreFromLinkedData(linkedDataDoc);

  if (form === "SELECT") {
    const bindingsStream = await queryEngine.queryBindings(query, { sources: [source] });
    const variables = [];
    const variableSet = new Set();
    const rows = [];

    for await (const binding of bindingsStream) {
      const row = {};
      binding.forEach((term, variable) => {
        const variableName = variable.value;
        if (!variableSet.has(variableName)) {
          variableSet.add(variableName);
          variables.push(variableName);
        }
        const value = termToSparqlBinding(term);
        if (value) {
          row[variableName] = value;
        }
      });
      rows.push(row);
    }

    return {
      contentType: SPARQL_RESULTS_CONTENT_TYPE,
      body: {
        head: { vars: variables },
        results: { bindings: rows }
      }
    };
  }

  if (form === "ASK") {
    const result = await queryEngine.queryBoolean(query, { sources: [source] });
    return {
      contentType: SPARQL_RESULTS_CONTENT_TYPE,
      body: {
        head: {},
        boolean: Boolean(result)
      }
    };
  }

  if (form === "CONSTRUCT" || form === "DESCRIBE") {
    const quadsStream = await queryEngine.queryQuads(query, { sources: [source] });
    const turtle = await serializeQuadsToTurtle(quadsStream);
    return {
      contentType: "text/turtle; charset=utf-8",
      body: turtle
    };
  }

  throw new Error("Unsupported SPARQL query form.");
}

export async function respondToSparqlIfRequested(req, res, url, linkedDataDoc) {
  const query = getSparqlQuery(url);
  if (!query) {
    return false;
  }

  try {
    const response = await executeSparqlAgainstLinkedData(linkedDataDoc, query);
    if (response.contentType === SPARQL_RESULTS_CONTENT_TYPE) {
      sendJson(res, 200, response.body, response.contentType);
      return true;
    }

    sendText(res, 200, response.body, response.contentType);
    return true;
  } catch (error) {
    sendJson(res, 400, {
      error: "Invalid or unsupported SPARQL query",
      detail: error instanceof Error ? error.message : String(error)
    });
    return true;
  }
}
