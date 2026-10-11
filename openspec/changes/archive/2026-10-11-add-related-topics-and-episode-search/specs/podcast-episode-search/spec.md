## ADDED Requirements

### Requirement: The search bar finds podcast episodes by title and by meaning

The search bar SHALL offer Podcasts as a result type in its filters, on by default like the others. Each Podcasts row
SHALL show the Podcast Episode's title and its Topic's name, and SHALL link to the Podcast Episode's page. The search
SHALL go to the server behind the search bar's debounce, only for a query of at least the search bar's minimum length.
The route SHALL return up to five published Podcast Episodes the caller may see: the Podcast Episodes whose title
matches the query first, then those whose description matches, then the nearest by meaning, with no Podcast Episode
listed twice. A query under three characters SHALL get its title and description matches alone, with no embedding.

#### Scenario: A title match comes before a description match

- **GIVEN** a published Podcast Episode whose description contains "agents" and another whose title contains it
- **WHEN** a user searches "agents"
- **THEN** the title match is listed first, then the description match

#### Scenario: A word in no title finds an episode by its subject

- **GIVEN** a published Podcast Episode about language models whose title and description never say "LLM"
- **WHEN** a user searches "LLM"
- **THEN** the Podcast Episode is listed under Podcasts by meaning

#### Scenario: A two-character query matches text alone

- **WHEN** a user searches "ai"
- **THEN** the route returns the Podcast Episodes whose title or description contains "ai", and embeds nothing

#### Scenario: A short query searches nothing

- **WHEN** a user types one character
- **THEN** no episode search is sent

### Requirement: The episode search applies the episode view rules

The episode search SHALL list only published Podcast Episodes. A visitor SHALL find only the Podcast Episodes of public
shown Topics. A user SHALL also find the Podcast Episodes of the Topics they own, of their teams' Topics, and of an
invite Topic they subscribe to, an invite Topic's only those published after their subscription activated. An admin
SHALL find every published Podcast Episode. A recording, failed, or removed Podcast Episode SHALL never be listed.

#### Scenario: A visitor never finds a private or invite topic's episode

- **GIVEN** published Podcast Episodes titled "agents" on a private Topic, an invite Topic, a public Topic with fewer
  than three Findings, and a public shown Topic
- **WHEN** a visitor searches "agents"
- **THEN** only the public shown Topic's Podcast Episode is listed

#### Scenario: A subscriber finds an invite topic's later episodes alone

- **GIVEN** an invite Topic with one published Podcast Episode before a user's subscription activated and one after
- **WHEN** the user searches a word in both titles
- **THEN** only the later Podcast Episode is listed

### Requirement: The search's query vector is cached, billed, and rate limited

The search SHALL embed the query with the instruction that chat retrieval uses, and SHALL cache the vector in Redis by
the normalized query, its letters lowercased and its spaces collapsed, so a repeated query makes no model call. A
user's embedding SHALL bill to their own LiteLLM key, and a visitor's to the public key, as the mcp search bills. A
visitor's embedding SHALL be rate limited per client address in Redis. A rate-limited visitor, a visitor with no public
key configured, and any search whose key's month is spent SHALL get the title and description matches alone, with no
error. An embedding that fails for any other reason SHALL be reported and SHALL also return the text matches alone.

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

### Requirement: The episode search's text match is index-backed

The search's title and description match SHALL read pg_trgm GIN indexes on the lowercased episode title and the
lowercased episode description, and the nearest-by-meaning read SHALL rank through the episode vectors' HNSW cosine
index, each bounded by the search's limit. A visitor's nearest-by-meaning read SHALL rank through the index of the
vectors saved as public and shown, and a user's through the index of every vector.

#### Scenario: The text match plans through the trigram indexes

- **WHEN** the episode search's text match is planned with sequential and plain index scans off
- **THEN** the plan scans the title and description trigram indexes

#### Scenario: A visitor's meaning match plans through the public and shown index

- **WHEN** a visitor's meaning match is planned with sequential scans and sorts off
- **THEN** the plan scans `episode_vectors_public_and_shown_embedding_hnsw`, and a user's plan scans
  `episode_vectors_embedding_hnsw`
