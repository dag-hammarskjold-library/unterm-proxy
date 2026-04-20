import { context, transformRecordToLinkedData } from "../../scripts/map-to-linked-data.mjs";
import {
  API_BASE,
  WEB_BASE,
  COUNTRIES_SCHEME_ID,
  COUNTRIES_SCHEME_NODE,
} from "../config.mjs";
import { fetchCountriesPage } from "../clients/unterm-api.mjs";

function parseCountriesFilters(url) {
  const language = String(url.searchParams.get("language") || "").trim().toLowerCase();
  const prefLabel = String(url.searchParams.get("prefLabel") || "").trim().toLowerCase();
  return {
    language,
    prefLabel,
    hasFilters: language.length > 0 || prefLabel.length > 0
  };
}

function isLangLiteral(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value["@value"] === "string" &&
    typeof value["@language"] === "string"
  );
}

function groupMatchesForConceptList(matches) {
  const grouped = new Map();

  for (const match of matches) {
    const id = match?.["@id"];
    if (typeof id !== "string" || id.length === 0) {
      continue;
    }

    if (!grouped.has(id)) {
      grouped.set(id, {
        "@id": id,
        "unterm:webURL": match["unterm:webURL"] || null,
        "skos:inScheme": COUNTRIES_SCHEME_NODE,
        "skos:prefLabel": []
      });
    }

    const node = grouped.get(id);
    const label = match["skos:prefLabel"];
    if (!isLangLiteral(label)) {
      continue;
    }

    const exists = node["skos:prefLabel"].some(
      (existing) =>
        existing["@language"] === label["@language"] && existing["@value"] === label["@value"]
    );

    if (!exists) {
      node["skos:prefLabel"].push(label);
    }
  }

  return Array.from(grouped.values());
}

export async function buildCountriesDocument(url) {
  const filters = parseCountriesFilters(url);
  const firstPage = await fetchCountriesPage(1);
  const firstPayload = firstPage.payload;
  const pageSize = Number(firstPayload.pageSize || 0);
  const totalHits = Number(firstPayload.totalHits || 0);
  const firstResults = Array.isArray(firstPayload.results) ? firstPayload.results : [];

  let allResults = [...firstResults];
  let totalPages = 1;
  let usedFallbackPaging = false;

  if (pageSize > 0 && totalHits > 0) {
    totalPages = Math.ceil(totalHits / pageSize);
  } else {
    usedFallbackPaging = true;
    let page = 2;
    while (true) {
      const next = await fetchCountriesPage(page);
      const pageResults = Array.isArray(next.payload.results) ? next.payload.results : [];
      if (pageResults.length === 0) {
        break;
      }
      allResults = allResults.concat(pageResults);
      page += 1;
      totalPages = page - 1;
    }
  }

  if (!usedFallbackPaging && totalPages > 1) {
    for (let page = 2; page <= totalPages; page += 1) {
      const next = await fetchCountriesPage(page);
      const pageResults = Array.isArray(next.payload.results) ? next.payload.results : [];
      allResults = allResults.concat(pageResults);
    }
  }

  const graph = allResults.map((record) => transformRecordToLinkedData(record, { recordIriBase: API_BASE }));

  if (filters.hasFilters) {
    const matches = [];
    const hasLanguageFilter = Boolean(filters.language);
    const hasPrefLabelFilter = Boolean(filters.prefLabel);

    for (const country of graph) {
      const labels = Array.isArray(country["skos:prefLabel"]) ? country["skos:prefLabel"] : [];
      const languageLabels = labels.filter(isLangLiteral);

      const matchingPrefLabels = hasPrefLabelFilter && !hasLanguageFilter
        ? (() => {
          const hasAnyMatch = languageLabels.some((label) =>
            label["@value"].toLowerCase().includes(filters.prefLabel)
          );
          return hasAnyMatch ? languageLabels : [];
        })()
        : languageLabels.filter((label) => {
          const languageOk = hasLanguageFilter ? label["@language"].toLowerCase() === filters.language : true;
          const prefLabelOk = hasPrefLabelFilter ? label["@value"].toLowerCase().includes(filters.prefLabel) : true;
          return languageOk && prefLabelOk;
        });

      for (const label of matchingPrefLabels) {
        matches.push({
          "@id": country["@id"],
          "unterm:webURL": `${WEB_BASE}${country["dct:identifier"]}`,
          "skos:prefLabel": label
        });
      }
    }

    const conceptList = groupMatchesForConceptList(matches);
    return {
      "@context": context,
      "@graph": [COUNTRIES_SCHEME_NODE, ...conceptList]
    };
  }

  const concepts = graph.map((country) => ({
    ...country,
    "unterm:webURL": `${WEB_BASE}${country["dct:identifier"]}`,
    "skos:inScheme": COUNTRIES_SCHEME_NODE
  }));

  return {
    "@context": context,
    "@id": COUNTRIES_SCHEME_ID,
    "@type": "skos:ConceptScheme",
    "dct:title": {
      "@value": "UNTERM",
      "@language": "en"
    },
    "skos:prefLabel": COUNTRIES_SCHEME_NODE["skos:prefLabel"],
    "skos:hasTopConcept": concepts
  };
}
