## MODIFIED Requirements

### Requirement: One MCP server serves the feed over streamable HTTP
The api SHALL serve a Model Context Protocol server over streamable HTTP at `/mcp`, in the same process and origin as
the app, using the official v2 MCP server SDK, `@modelcontextprotocol/server`, through its web-standard transport
inside a Hono route. The server SHALL run stateless. Each request builds its own server and transport bound to the
resolved caller, and no session id is issued. The tool list SHALL be the same for every caller. Identity changes what a
call returns, never which tools exist. The tools SHALL be the four reads `list_topics`, `read_topic_feed`,
`search_topic_findings`, and `search`, the four per-user writes `mark_finding_consumed`, `rate_finding`,
`bookmark_finding`, and `follow_topic`, and the three Topic Tools `edit_topic`, `suggest_sources`, and `create_topic`.

#### Scenario: An anonymous client initializes and lists tools
- **WHEN** a client with no credentials sends an initialize request and then a tools list request to `/mcp`
- **THEN** both succeed, and the tool list names the four read tools, the four per-user writes, and the three Topic
  Tools, and no `update_topic_prompt`, `update_topic_fields`, `add_source`, or `remove_source`

#### Scenario: The tool list does not change with identity
- **WHEN** an authenticated client lists tools
- **THEN** it receives the same tools an anonymous client does, in the same order

### Requirement: Results fit the client's limit, Findings whole or not at all
Every list result but `search`'s SHALL paginate with an opaque cursor and include a next cursor when more remains. A
page SHALL be packed under a character budget well inside a client's result limit of about 30,000 tokens, adding
Findings in order until the next would overflow and always including at least one. A Finding SHALL never be returned
with a truncated relevance explanation. Trimming returns fewer Findings. Results SHALL include structured content beside
their text. `search` SHALL page by number, with the page and page size the `/search` url takes, and its largest page,
50 rows of names, links, and counts, SHALL fit inside the same budget.

#### Scenario: A large feed pages
- **WHEN** a Topic holds more Findings than fit one page
- **THEN** the first result holds as many whole Findings as fit and a next cursor, and following the cursor returns
  the rest

#### Scenario: Trimming moves a whole Finding to the next page
- **WHEN** the next Finding's full explanation would overflow the page's character budget
- **THEN** the page ends before it and that Finding leads the next page, intact

#### Scenario: A feed past the topic page's read limit still pages to its end
- **WHEN** a Topic has more Findings than the topic page's read limit
- **THEN** following the cursor returns every Finding

#### Scenario: Search pages by number
- **WHEN** a client calls `search` with `page: 2` and `size: 10`
- **THEN** the result holds the second ten rows, the row count, and the page count, and no cursor

## ADDED Requirements

### Requirement: The search tool runs the site's search
The server SHALL expose `search`, taking the same `q`, `kinds`, `sort`, `page`, and `size` the `/search` url takes,
validated by the same contract, and returning the site search's page for the caller: a visitor's public results, or a
user's results under their access. Each row SHALL include its absolute url on the site, and the result SHALL include
the absolute `/search` url of the same search. The tool SHALL count one hit against the search rate limit under the
caller's rate limit key and SHALL return a message, not a result, to a caller past it. It SHALL be annotated
`readOnlyHint: true`, and its text SHALL list each row's kind, name, and url.

#### Scenario: An agent finds a team by name
- **WHEN** an anonymous client calls `search` with `q: "orbit"` and `kinds: ["teams"]`
- **THEN** the result lists the public teams named "orbit" with their urls, the same rows `/search?q=orbit&kinds=teams`
  shows a visitor

#### Scenario: A user's search includes their private topics
- **WHEN** an authenticated client searches the name of the user's private Topic
- **THEN** that Topic is listed, and an anonymous client's same search does not list it

#### Scenario: The search tool is read-only
- **WHEN** a client lists tools
- **THEN** `search` has a read-only hint

### Requirement: The server follows a topic for a connected account
The server SHALL expose `follow_topic`, taking a topic id and `is_following`, and calling the topic page's subscribe
write for the connected account, with `mcp` as the subscription's source. A visitor's call SHALL return the
connect-an-account result. A Topic the account may not view, a private Topic it does not own, and an owner unfollowing
their own Topic SHALL be rejected with a message, as the page's write rejects them. On the topic-bound route the topic
id SHALL default to the bound Topic. Its name, description, and argument SHALL say follow, and it SHALL be annotated
`readOnlyHint: false`, `destructiveHint: false`, and `idempotentHint: true`.

#### Scenario: An agent follows a public topic
- **WHEN** an authenticated client calls `follow_topic` with `is_following: true` on a public Topic
- **THEN** the account follows the Topic, its follower count includes them, and the event names `mcp` as the source

#### Scenario: An agent unfollows
- **WHEN** an authenticated client calls `follow_topic` with `is_following: false` on a Topic it follows
- **THEN** the account no longer follows the Topic

#### Scenario: A visitor cannot follow
- **WHEN** an anonymous client calls `follow_topic`
- **THEN** the result says an account is needed and nothing is written

#### Scenario: An owner cannot unfollow their own topic
- **WHEN** a Topic's owner calls `follow_topic` with `is_following: false` on it
- **THEN** the result says the owner always follows their own Topic, and nothing changes

## REMOVED Requirements

### Requirement: The server changes a topic's settings
**Reason**: `edit_topic` takes every setting this tool took, beside the prompt and the sources, and confirms making a
Topic public, which this tool saved with no confirmation.
**Migration**: Call `edit_topic` with the settings to change. `create_topic` still takes tags, frequency, and the
results count.
