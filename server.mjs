#!/usr/bin/env node

import http from "node:http";
import { linkedDataToTurtle, transformRecordToLinkedData } from "./scripts/map-to-linked-data.mjs";
import {
  API_BASE,
  COUNTRIES_API_BASE,
  COUNTRIES_SCHEME_NODE,
  DEBUG_REQUEST_HEADERS,
  PORT,
  REMOTE_API_BASE,
  SHUTDOWN_TIMEOUT_MS,
  UPSTREAM_TIMEOUT_MS,
  WEB_BASE
} from "./src/config.mjs";
import { sendJson, sendText, wantsJsonLd, wantsTurtle } from "./src/response-helpers.mjs";
import { fetchRecord } from "./src/clients/unterm-api.mjs";
import { buildCountriesDocument } from "./src/services/countries.mjs";
import { respondToSparqlIfRequested } from "./src/services/sparql.mjs";

const activeSockets = new Set();

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendText(res, 400, "Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  console.log(`[${new Date().toISOString()}] ${req.method || "UNKNOWN"} ${url.pathname}${url.search}`);
  if (DEBUG_REQUEST_HEADERS) {
    console.log(`[${new Date().toISOString()}] Incoming request headers:\n${JSON.stringify(req.headers, null, 2)}`);
  }

  if (req.method !== "GET") {
    sendText(res, 405, "Method not allowed. Use GET.");
    return;
  }

  if (url.pathname === "/" || url.pathname === "/health") {
    sendJson(res, 200, {
      service: "unterm-linked-data-proxy",
      status: "ok",
      endpoints: ["/unterm/{recordID}", "/unterm/countries"],
      sparqlQueryParameter: ["query", "sparql"]
    });
    return;
  }

  if (url.pathname === "/unterm/countries") {
    try {
      const countriesDoc = await buildCountriesDocument(url);

      if (await respondToSparqlIfRequested(req, res, url, countriesDoc)) {
        return;
      }

      if (wantsTurtle(req)) {
        const turtle = linkedDataToTurtle(countriesDoc);
        sendText(res, 200, turtle, "text/turtle; charset=utf-8");
        return;
      }

      sendJson(res, 200, countriesDoc, "application/ld+json; charset=utf-8");
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
    const upstreamResponse = await fetchRecord(recordID, { timeoutMs: UPSTREAM_TIMEOUT_MS });
    const record = upstreamResponse.record;

    const linkedData = {
      ...transformRecordToLinkedData(record, { recordIriBase: API_BASE }),
      "skos:inScheme": COUNTRIES_SCHEME_NODE
    };

    if (await respondToSparqlIfRequested(req, res, url, linkedData)) {
      return;
    }

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
      upstreamUrl: error?.upstreamUrl || upstreamUrl
    });
  }
});

server.requestTimeout = UPSTREAM_TIMEOUT_MS + 5000;
server.headersTimeout = UPSTREAM_TIMEOUT_MS + 10000;
server.keepAliveTimeout = 5000;

server.on("connection", (socket) => {
  activeSockets.add(socket);
  socket.on("close", () => activeSockets.delete(socket));
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    for (const socket of activeSockets) {
      socket.destroy();
    }
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  server.close(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.listen(PORT, () => {
  console.log(`UNTERM linked data app listening on http://localhost:${PORT}`);
});
