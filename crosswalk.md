# JSON -> Linked Data Crosswalk

This crosswalk documents how `term.json` maps to RDF/JSON-LD in `scripts/map-to-linked-data.mjs`.

| Source path | Target class/predicate | Transform rule |
|---|---|---|
| `recordID` | `@id`, `dct:identifier` | Build record IRI as `https://conferences.unite.un.org/untermapi/api/record/{recordID}` and keep UUID as identifier. |
| `recordType` | `dct:type` + `@type` | Set `dct:type` to source value and include `unterm:Country` when record type is country-like data. |
| `title` | `dct:title` | Emit language-tagged literal (`@language: en`) because title is English in source. |
| `created`, `modified` | `dct:created`, `dct:modified` | Map to typed literals with `xsd:dateTime`. |
| `createdBy`, `modifiedBy` | `dct:creator`, `dct:contributor` | String literal mapping. |
| `status` | `unterm:status` | Keep source status as controlled string value. |
| `distribution` | `unterm:distribution` | String literal mapping. |
| `dbName` | `unterm:dbName` | String literal mapping. |
| `space` | `unterm:space` | String literal mapping. |
| `subjects[]` | `unterm:subjects` | Keep as repeated string values. |
| `languages[]` | `unterm:languages` | Keep as repeated string values. |
| `{language}.terms[]` with `termStatus=preferred`, `termType=short` | `skos:prefLabel` | Emit language-tagged preferred labels (`en`, `fr`, `es`, `ar`, `zh`, `ru`, etc.). |
| `{language}.terms[]` with `termStatus=preferred`, `termType=full` | `skos:altLabel` (fallback to `skos:prefLabel` if no short form exists) | Preserve multilingual full forms. |
| `{language}.definition` | `skos:definition` | Emit language-tagged literal when non-empty. |
| `{language}.note` | `skos:note` | Emit language-tagged literal when non-empty. |
| `{language}.isRTL` | `unterm:isRTL` inside `unterm:LanguageSection` | Boolean mapping for UI/text-direction metadata. |
| `{language}.validationStatus` | `unterm:validationStatus` inside `unterm:LanguageSection` | String literal mapping. |
| `{language}.terms[].termID` | `@id` of `unterm:Term` node | Build term IRI fragment `#term-{termID}`. |
| `{language}.terms[].term` | `unterm:termValue` | String literal mapping. |
| `{language}.terms[].termStatus` | `unterm:termStatus` | String literal mapping. |
| `{language}.terms[].termType` | `unterm:termType` | String literal mapping. |
| `{language}.terms[].created`, `{language}.terms[].modified` | `dct:created`, `dct:modified` on `unterm:Term` | Typed `xsd:dateTime` literals. |
| `specialFields[]` | `unterm:SpecialField` nodes in `unterm:specialFields` | Preserve name/value/level/order/stacking and infer language tag from `languageId` where possible. |
| `specialFields[].name` | `unterm:fieldName` | String literal mapping. |
| `specialFields[].value` | `unterm:fieldValue` | String literal mapping. |
| `specialFields[].fieldLevel` | `unterm:fieldLevel` | String literal mapping. |
| `specialFields[].fieldOrder` | `unterm:fieldOrder` | Integer mapping. |
| `specialFields[].stacking` | `unterm:stacking` | Integer mapping. |
| `specialFields[].languageId` | `dct:language` on `unterm:SpecialField` | Best-effort join via term `languageID` values to emit BCP47 tag. |

## Notes

- Standard vocabularies used: `skos`, `dct`, and `schema.org` (`@vocab`).
- Source-specific fields are preserved in custom namespace `unterm:` to avoid data loss.
- Empty strings and nulls are dropped from output to keep JSON-LD compact.
- Web endpoint supports content negotiation: `Accept: application/ld+json` returns JSON-LD and `Accept: text/turtle` returns Turtle.
