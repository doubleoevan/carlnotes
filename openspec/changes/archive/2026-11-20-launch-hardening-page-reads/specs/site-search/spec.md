## ADDED Requirements

### Requirement: A search never waits more than two seconds on the query's embedding

The search function SHALL return its Topics, Findings, teams, and people without waiting more than two seconds on the
embedding of the query that the Podcast Episode search asks for. A search whose embedding takes longer SHALL return the
Podcast Episodes' title and description matches alone, as the podcast-episode-search capability states, with a 200
status.

#### Scenario: A slow embedding leaves the other kinds on time

- **WHEN** a visitor searches "orbit" while the embedding provider takes ten seconds to return
- **THEN** the search returns within about two seconds of its text matches being ready, with its Topic, Finding, team,
  and profile rows and the Podcast Episodes that match by title or description

#### Scenario: The bar, the page, and the tool get the same bound

- **WHEN** the search bar, the `/search` page, and the MCP `search` tool search a new query while embeddings are slow
- **THEN** each gets the text matches after the same two-second limit, and none waits for the embedding
