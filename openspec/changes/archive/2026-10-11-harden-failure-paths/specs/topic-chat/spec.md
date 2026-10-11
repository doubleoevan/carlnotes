## MODIFIED Requirements

### Requirement: Retrieval ranks by vector similarity over the Topic's existing Resource embeddings
The turn's question SHALL be embedded with the same embedding model that produced `resources.embedding`, and candidate
Resources SHALL be ranked by vector similarity against that question vector. The ranking SHALL be exact: the query SHALL
first collect the Topics' shown Findings with their Resources in a materialized common table expression and then order
that set by distance, so the planner never serves it from the global HNSW index, whose approximate walk returns the
nearest Resources of the whole table before the Topic filter and can leave a Topic's results short or empty. This covers
the single-Topic ranking that chat and the MCP search tool use and the multi-Topic ranking a Team's chat uses. The
global duplicate check keeps the HNSW index, which is the right use of it. The system SHALL NOT build a chat-specific
retrieval index; the Topic's Finding set is already trimmed to the Topic's max-results.

#### Scenario: Candidates are ranked against the question
- **WHEN** a turn's question is embedded and the Topic's Findings are ranked
- **THEN** the Findings whose Resources are most similar to the question vector are the ones selected for context

#### Scenario: No separate chat index is created
- **WHEN** the retrieval path runs
- **THEN** it reads `resources.embedding` values written by the review pipeline, and no chat-specific embedding table
  or column exists

#### Scenario: A topic's findings all come back
- **WHEN** a Topic holds eight shown Findings and thousands of other Topics' Resources sit closer to the question
- **THEN** the ranking returns all eight, up to the limit, ordered by distance

#### Scenario: The ranking uses no HNSW scan
- **WHEN** `explain` runs on the Topic ranking query
- **THEN** the plan holds no index scan on `resources_embedding_hnsw`
