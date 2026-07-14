## ADDED Requirements

### Requirement: Search adapter emits Resources from LLM-generated Exa queries

`searchAdapter` SHALL handle Sources of kind `search`. It SHALL read the Source's topic `context_doc` (via `source.topic_id`), generate a bounded list of search queries from it with an LLM through the LiteLLM proxy (AI SDK structured output with a Zod schema), run each query through Exa's search API using `EXA_API_KEY`, and emit one Resource per result with a canonical URL (the result URL), a title, and `kind` `read`. Results SHALL be deduped by canonical URL within the adapter run. It SHALL require no Integration (`integration_id` may be null; `EXA_API_KEY` and the proxy credential are read from the environment). It SHALL leave `fallbackMode` unset — search has no keyless fallback. It SHALL leave `embedding` and `embedding_model` unset for the curation pipeline.

#### Scenario: Context doc drives queries and Exa results become Resources

- **WHEN** a Source of kind `search` whose topic has a non-empty `context_doc` is scanned
- **THEN** `searchAdapter` generates queries from the `context_doc`, searches Exa for each, and emits one `read` Resource per result, each keyed by its canonical URL

#### Scenario: Empty context doc falls back to the topic name

- **WHEN** the topic's `context_doc` is empty
- **THEN** query generation falls back to the topic `name` rather than sending an empty prompt

#### Scenario: Results dedupe across queries

- **WHEN** two generated queries return results that resolve to the same canonical URL
- **THEN** only one Resource is emitted for that URL

#### Scenario: Adapter reports Exa's cost

- **WHEN** `searchAdapter` completes a scan that called Exa
- **THEN** it returns a `cost` equal to the sum of the dollar cost Exa reported across the queries (not `0`), and that cost is summed into the Scan's `cost`

#### Scenario: No results yields no Resources without failing

- **WHEN** query generation returns no queries, or Exa returns no results
- **THEN** the adapter emits zero Resources and does not fail the Source

#### Scenario: Missing key or search error degrades only this Source

- **WHEN** `EXA_API_KEY` is absent, the LiteLLM proxy is unreachable, or Exa returns an error
- **THEN** the `search` Source fails in isolation without aborting the Scan, and `fallbackMode` is left unset
