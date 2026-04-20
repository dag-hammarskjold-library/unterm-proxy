import { parseBoolean, parsePositiveInteger, parseRequiredUrl } from "./runtime.mjs";

const DEFAULT_REMOTE_API_BASE = "https://conferences.unite.un.org/untermapi/api/record/";
const DEFAULT_API_BASE = "https://metadata.un.org/unterm/";
const DEFAULT_WEB_BASE = "https://unterm.un.org/unterm2/view/";
const DEFAULT_COUNTRIES_API_BASE = "https://conferences.unite.un.org/untermapi/api/term/countries";

export const PORT = parsePositiveInteger(process.env.PORT, 3000);
export const DEBUG_REQUEST_HEADERS = parseBoolean(process.env.DEBUG_REQUEST_HEADERS);
export const UPSTREAM_TIMEOUT_MS = parsePositiveInteger(process.env.UPSTREAM_TIMEOUT_MS, 15000);
export const SHUTDOWN_TIMEOUT_MS = parsePositiveInteger(process.env.SHUTDOWN_TIMEOUT_MS, 10000);

export const REMOTE_API_BASE = String(process.env.REMOTE_API_BASE || DEFAULT_REMOTE_API_BASE);
export const API_BASE = String(process.env.API_BASE || DEFAULT_API_BASE);
export const WEB_BASE = String(process.env.WEB_BASE || DEFAULT_WEB_BASE);

export const COUNTRIES_API_BASE = String(process.env.COUNTRIES_API_BASE || DEFAULT_COUNTRIES_API_BASE);
export const COUNTRIES_SCHEME_ID = `${API_BASE}countries`;
export const COUNTRIES_SCHEME_NODE = {
  "@id": COUNTRIES_SCHEME_ID,
  "@type": "skos:ConceptScheme",
  "skos:prefLabel": {
    "@value": "UNTERM",
    "@language": "en"
  }
};

export const SPARQL_RESULTS_CONTENT_TYPE = "application/sparql-results+json; charset=utf-8";

export const COUNTRIES_SEARCH_BODY = {
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

parseRequiredUrl(REMOTE_API_BASE, "REMOTE_API_BASE");
parseRequiredUrl(API_BASE, "API_BASE");
parseRequiredUrl(WEB_BASE, "WEB_BASE");
parseRequiredUrl(COUNTRIES_API_BASE, "COUNTRIES_API_BASE");
