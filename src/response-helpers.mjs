export function sendJson(res, statusCode, payload, contentType = "application/json; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(`${text}\n`);
}

export function wantsTurtle(req) {
  const accept = String(req.headers.accept || "").toLowerCase();
  return accept.includes("text/turtle");
}

export function wantsJsonLd(req) {
  const accept = String(req.headers.accept || "").toLowerCase();
  return accept.includes("application/ld+json");
}
