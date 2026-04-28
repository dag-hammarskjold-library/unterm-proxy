# UNTERM Linked Data Proxy

A Node.js server that transforms UNTERM (United Nations Terminology) data into linked data formats (JSON-LD, Turtle) and provides SPARQL query capabilities.

## Overview

This server acts as a proxy that fetches terminology data from the UNTERM API and transforms it into linked data formats. It supports:
- Converting individual records to JSON-LD or Turtle if the request is supplied with an appropriate Accept Header
- Querying data using SPARQL
- Searching countries with filtering options
- Redirecting to web views for records when no specific Accept Header is supplied

## Features

- **Linked Data Transformation**: Converts UNTERM API records into JSON-LD and Turtle formats
- **SPARQL Endpoint**: Execute SPARQL queries against the transformed data
- **Country Search**: Filter countries by language or label
- **Multiple Output Formats**: Supports JSON-LD and Turtle output, as well as HTML redirects
- **Docker Support**: Easy deployment with Docker

## Installation

### Prerequisites

- Node.js 22+
- npm

### From Source

```bash
git clone https://github.com/dag-hammarskjold-library/unterm-proxy
cd unterm-proxy
npm install
```

### Using Docker

```bash
docker build -t unterm-proxy .
docker run -p 3000:3000 unterm-proxy
```

## Running the Server

### Local Development

```bash
npm start
```

Or directly with Node:

```bash
node server.mjs
```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `DEBUG_REQUEST_HEADERS` - Enable detailed request logging (default: false)

### Docker

```bash
docker run -p 3000:3000 -e PORT=3000 unterm-linked-data-proxy
```

## API Endpoints

### Health Check
```
GET /
```

### Individual Record
```
GET /unterm/countries/{recordID}
```
Returns linked data for a specific record, with SPARQL support.

### Countries List
```
GET /unterm/countries
```
Returns all countries with optional filtering:
- `language` - Filter by language (e.g., `en`, `fr`)
- `prefLabel` - Filter by label text

### SPARQL Queries
Add SPARQL query via query parameters:
```
GET /unterm/countries/{recordID}?query=SELECT%20*%20WHERE%20{%20?s%20?p%20?o%20}
GET /unterm/countries?query=SELECT%20*%20WHERE%20{%20?s%20?p%20?o%20}
```

## Usage Examples

### Get Record as JSON-LD
```
GET /unterm/countries/12345
Accept: application/ld+json
```

### Get Record as Turtle
```
GET /unterm/countries/12345
Accept: text/turtle
```

### SPARQL Query
```
GET /unterm/countries/12345?query=SELECT%20?s%20?p%20?o%20WHERE%20{%20?s%20?p%20?o%20}
```

### Search Countries
```
GET /unterm/countries?language=en&prefLabel=United
```

## Output Formats

- **JSON-LD** (`application/ld+json`): Standard linked data format
- **Turtle** (`text/turtle`): RDF serialization format
- **HTML Redirect**: Redirects to web view when no Accept header specified

## Dependencies

- `@comunica/query-sparql`: SPARQL query engine
- `jsonld`: JSON-LD processing
- `n3`: RDF N3 parser and writer
- `node:http`: Built-in Node.js HTTP module
