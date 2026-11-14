## MODIFIED Requirements

### Requirement: The search's query vector is cached, billed, and rate limited

The search SHALL embed the query with the instruction that chat retrieval uses, and SHALL cache the vector in Redis by
the normalized query, its letters lowercased and its spaces collapsed, so a repeated query makes no model call. The
vector SHALL be kept for an hour, in a compact form and never as JSON text. A user's embedding SHALL bill to their own
LiteLLM key, and a visitor's to the public key, as the mcp search bills. A visitor's embedding SHALL be rate limited per
client address in Redis, and a request that the search limit skips, a page render's own search, SHALL skip that count
too. A rate-limited visitor, a visitor with no public key configured, and any search whose key's month is spent SHALL
get the title and description matches alone, with no error. An embedding SHALL be given two seconds and no retry, and a
search whose embedding takes longer SHALL return the title and description matches alone, so the other kinds a search
finds never wait on it. An embedding that fails for any other reason SHALL be reported and SHALL also return the text
matches alone.

#### Scenario: A repeated query makes no model call

- **GIVEN** a query searched once, with its vector cached
- **WHEN** a visitor searches the same query with different capitals and spacing
- **THEN** the cached vector ranks the Podcast Episodes and no embedding is requested

#### Scenario: A rate-limited visitor gets text matches

- **GIVEN** a visitor over the episode search's rate limit
- **WHEN** they search a query that is not cached
- **THEN** the route returns the title and description matches alone with a 200 status

#### Scenario: A spent key gets text matches

- **GIVEN** the public key's month is spent
- **WHEN** a visitor searches a query that is not cached
- **THEN** the route returns the title and description matches alone with a 200 status

#### Scenario: A slow embedding returns the text matches

- **WHEN** the embedding of a new query has not returned after two seconds
- **THEN** the search returns the title and description matches alone with a 200 status, with its Topics, Findings,
  teams, and people, and the embedding is not tried again for that request

#### Scenario: A query's vector leaves after an hour

- **WHEN** a query was searched once, more than an hour ago
- **THEN** Redis no longer holds its vector, and the next search of it embeds it again

#### Scenario: A render's search is not counted

- **WHEN** the server renders a visitor's search page and embeds its query
- **THEN** the embedding joins no address's count, so no visitor's own search is turned away for it
