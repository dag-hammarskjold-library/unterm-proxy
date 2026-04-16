#!/usr/bin/env node

import http from "node:http";
import { context, linkedDataToTurtle, transformRecordToLinkedData } from "./scripts/map-to-linked-data.mjs";

const PORT = Number(process.env.PORT || 3000);

// This is where the app gets the json serialized record from
const REMOTE_API_BASE = "https://conferences.unite.un.org/untermapi/api/record/";

// This is the base for the "URI" that will be generated for interstitial use 
const API_BASE = "http://metadata.un.org/unterm/"

// This is the URL base for the web view version of the terms 
const WEB_BASE = "https://unterm.un.org/unterm2/view/";

// And this is the API for the specific countries page
const COUNTRIES_API_BASE = "https://conferences.unite.un.org/untermapi/api/term/countries";
const COUNTRIES_SCHEME_ID = `${API_BASE}countries`;

const COUNTRIES_SEARCH_BODY = {
  searchType: 0,
  searchLanguages: ["en", "fr", "es", "ru", "zh", "ar"],
  languagesDisplay: ["en", "fr", "es", "ru", "zh", "ar"],
  datasets: [],
  bodies: [],
  subjects: [],
  recordTypes: [],
  acronymSearch: true,
  localDBSearch: true,
  termTitleSearch: true,
  phraseologySearch: false,
  footnoteSearch: false,
  fullTextSearch: false,
  facetedSearch: false,
  buildSubjectList: true
};

function sendJson(res, statusCode, payload, contentType = "application/json; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(`${text}\n`);
}

function wantsTurtle(req) {
  const accept = String(req.headers.accept || "").toLowerCase();
  return accept.includes("text/turtle");
}

function wantsJsonLd(req) {
  const accept = String(req.headers.accept || "").toLowerCase();
  return accept.includes("application/ld+json");
}

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
        "skos:inScheme": { "@id": COUNTRIES_SCHEME_ID },
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

async function fetchCountriesPage(pageNumber) {
  const upstreamUrl = `${COUNTRIES_API_BASE}?page=${pageNumber}`;
  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(COUNTRIES_SEARCH_BODY)
  });

  if (!response.ok) {
    const message = `Countries upstream request failed (page ${pageNumber})`;
    const error = new Error(message);
    error.upstreamStatus = response.status;
    error.upstreamUrl = upstreamUrl;
    throw error;
  }

  const payload = await response.json();
  return { payload, upstreamUrl };
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendText(res, 400, "Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method !== "GET") {
    sendText(res, 405, "Method not allowed. Use GET.");
    return;
  }

  if (url.pathname === "/" || url.pathname === "/health") {
    sendJson(res, 200, {
      service: "unterm-linked-data-proxy",
      status: "ok",
      endpoints: ["/unterm/{recordID}", "/unterm/countries"]
    });
    return;
  }

  if (url.pathname === "/unterm/countries") {
    try {
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
        // Fallback for unknown totals: keep reading until an empty page.
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
        const filteredDoc = {
          "@context": context,
          "@graph": conceptList
        };

        if (wantsTurtle(req)) {
          const turtle = linkedDataToTurtle(filteredDoc);
          sendText(res, 200, turtle, "text/turtle; charset=utf-8");
          return;
        }

        sendJson(res, 200, filteredDoc, "application/ld+json; charset=utf-8");
        return;
      }

      const concepts = graph.map((country) => ({
        ...country,
        "unterm:webURL": `${WEB_BASE}${country["dct:identifier"]}`,
        "skos:inScheme": { "@id": COUNTRIES_SCHEME_ID }
      }));

      const graphDoc = {
        "@context": context,
        "@id": COUNTRIES_SCHEME_ID,
        "@type": "skos:ConceptScheme",
        "dct:title": {
          "@value": "UNTERM countries",
          "@language": "en"
        },
        "skos:hasTopConcept": concepts
      };

      if (wantsTurtle(req)) {
        const turtle = linkedDataToTurtle(graphDoc);
        sendText(res, 200, turtle, "text/turtle; charset=utf-8");
        return;
      }

      sendJson(res, 200, graphDoc, "application/ld+json; charset=utf-8");
      return;
    } catch (error) {
      sendJson(res, 502, {
        error: "Failed to fetch paginated countries and transform records",
        detail: error instanceof Error ? error.message : String(error),
        upstreamStatus: error?.upstreamStatus || null,
        upstreamUrl: error?.upstreamUrl || COUNTRIES_API_BASE
      });
      return;
    }
  }

  const match = url.pathname.match(/^\/unterm\/([^/]+)$/);
  if (!match) {
    sendText(res, 404, "Not found. Use /unterm/{recordID} or /unterm/countries");
    return;
  }

  const recordID = decodeURIComponent(match[1]);
  const upstreamUrl = `${REMOTE_API_BASE}${encodeURIComponent(recordID)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!upstream.ok) {
      sendJson(res, upstream.status, {
        error: "Upstream request failed",
        upstreamStatus: upstream.status,
        upstreamUrl
      });
      return;
    }

    const record = await upstream.json();
    const linkedData = {
      ...transformRecordToLinkedData(record, { recordIriBase: API_BASE }),
      "skos:inScheme": { "@id": COUNTRIES_SCHEME_ID }
    };
    if (wantsTurtle(req)) {
      const turtle = linkedDataToTurtle(linkedData);
      sendText(res, 200, turtle, "text/turtle; charset=utf-8");
      return;
    }

    if (wantsJsonLd(req)) {
      sendJson(res, 200, linkedData, "application/ld+json; charset=utf-8");
      return;
    }

    res.writeHead(302, {
      Location: `${WEB_BASE}${encodeURIComponent(recordID)}`,
      "Cache-Control": "no-store"
    });
    res.end();
  } catch (error) {
    sendJson(res, 502, {
      error: "Failed to fetch or transform source record",
      detail: error instanceof Error ? error.message : String(error),
      upstreamUrl
    });
  }
});

server.listen(PORT, () => {
  console.log(`UNTERM linked data app listening on http://localhost:${PORT}`);
});
