import { COUNTRIES_API_BASE, COUNTRIES_SEARCH_BODY, REMOTE_API_BASE, UPSTREAM_TIMEOUT_MS } from "../config.mjs";

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  return {
    signal: controller.signal,
    cancel() {
      clearTimeout(timeout);
    }
  };
}

async function fetchJsonWithTimeout(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : UPSTREAM_TIMEOUT_MS;
  const timeout = createTimeoutSignal(timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: timeout.signal
    });
  } finally {
    timeout.cancel();
  }
}

export async function fetchCountriesPage(pageNumber, { timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  const upstreamUrl = `${COUNTRIES_API_BASE}?page=${pageNumber}`;
  const response = await fetchJsonWithTimeout(upstreamUrl, {
    timeoutMs,
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

export async function fetchRecord(recordID, { timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  const upstreamUrl = `${REMOTE_API_BASE}${encodeURIComponent(recordID)}`;
  const response = await fetchJsonWithTimeout(upstreamUrl, {
    timeoutMs,
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const error = new Error("Upstream request failed");
    error.upstreamStatus = response.status;
    error.upstreamUrl = upstreamUrl;
    throw error;
  }

  return { record: await response.json(), upstreamUrl };
}
