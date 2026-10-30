# mcp-cards Specification

## Purpose
TBD - created by archiving change add-unified-search-and-mcp-cards. Update Purpose after archive.

## Requirements

### Requirement: Five tools name a card through the MCP Apps extension

The MCP server SHALL register three card resources through `@modelcontextprotocol/ext-apps`, each of type
`text/html;profile=mcp-app`: `ui://carlnotes/search.html`, `ui://carlnotes/topic.html`, and
`ui://carlnotes/findings.html`. `search` SHALL name the search card, `edit_topic` and `create_topic` the topic card, and
`read_topic_feed` and `search_topic_findings` the findings card, in `_meta.ui.resourceUri`. No other tool SHALL name a
card. Every tool, with a card or without, SHALL return its full structured result and a readable text summary, so a
client that renders no card reads the same result it reads today.

#### Scenario: A client lists the card resources

- **WHEN** a client lists the server's resources
- **THEN** it receives the three card resources, each of type `text/html;profile=mcp-app`

#### Scenario: A tool names its card

- **WHEN** a client lists tools
- **THEN** `search` names `ui://carlnotes/search.html`, `edit_topic` and `create_topic` name
  `ui://carlnotes/topic.html`, `read_topic_feed` and `search_topic_findings` name `ui://carlnotes/findings.html`, and
  no other tool names a card

#### Scenario: A client without cards reads the same result

- **WHEN** a client that renders no card calls each tool that names a card
- **THEN** each result has its structured content and its text summary, the same with or without the card resource
  registered

### Requirement: The card bundle is built in apps/web and read by the api

The cards SHALL be built in `apps/web` from its own components and Nightshift's tokens into one script and one
stylesheet under `apps/web/dist/mcp-cards/`, with every asset inlined, by the same `build:ui` that builds the web app.
The api SHALL read the two built files from that directory, keep them in memory, and return each card resource as one
self-contained HTML document holding the stylesheet, the script, and the name of its card, with every `</script` in the
script escaped. If the built files are missing, the resource read SHALL fail with a message naming `bun run build:ui`,
and every tool SHALL still work. No module of `apps/api` SHALL import `apps/web`.

#### Scenario: A resource read returns the built card

- **GIVEN** `bun run build:ui` has run
- **WHEN** a client reads `ui://carlnotes/topic.html`
- **THEN** it receives one HTML document whose style and script are the built files and which names the topic card

#### Scenario: A missing build fails only the card

- **GIVEN** the card bundle was never built
- **WHEN** a client reads a card resource and then calls `search`
- **THEN** the read fails with a message naming `bun run build:ui`, and the search returns its result

### Requirement: Each card's security policy names the media origins and no connections

Each card resource SHALL declare `resourceDomains` with the site's origin, the Google Fonts origins its stylesheet
imports from, and the origin of the presigned object storage url the audio redirects to, SHALL declare the site's
origin as its only `baseUriDomains`, so a relative url in the card resolves against the site, and SHALL declare no
`connectDomains`, so a card fetches nothing itself and reads only what tool results carry and tool calls return.

#### Scenario: The policy names the site and object storage

- **WHEN** a client reads a card resource
- **THEN** its `_meta.ui.csp.resourceDomains` holds the site's origin and the object storage origin, its
  `baseUriDomains` holds the site's origin, and it has no `connectDomains`

### Requirement: A card's actions are ordinary tool calls

Every control in a card that reads or writes SHALL call a tool through the host, `follow_topic`, `rate_finding`,
`bookmark_finding`, `mark_finding_consumed`, `search`, or `edit_topic`, and SHALL NOT reach the api any other way. A
call from a card SHALL pass the same authorization and the same rate limits as the same call from the model, and a
visitor's card SHALL show no control for a write that needs an account.

#### Scenario: A rating from a card is the tool's rating

- **WHEN** a user clicks thumbs up on a Finding in the findings card
- **THEN** the host calls `rate_finding` for that Finding, and the rating is written under the same rule as a model's
  call

#### Scenario: A visitor's card offers no writes

- **WHEN** a visitor's client renders the findings card
- **THEN** the card shows no thumbs, bookmark, done, or Follow control

#### Scenario: A card's links open on the site

- **WHEN** a user clicks a Topic's name in any card
- **THEN** the card asks the host to open the Topic's page on the site's origin

### Requirement: The search card is the search page's list

The search card SHALL render the `search` result in the same results list component the `/search` page renders, with
the same links, play pills, and Finding notes. Its paging SHALL call `search` again with the next page and the same
search, showing one skeleton row per result the page holds while it loads. A Topic row SHALL have a Follow control that
calls `follow_topic` for a signed-in caller and shows whether they follow it. A Finding's note SHALL save its rating,
bookmark, and read mark through `rate_finding`, `bookmark_finding`, and `mark_finding_consumed`, as the findings card
does. A See all control SHALL ask the host to open `/search` with the same url parameters.

#### Scenario: Paging calls search again

- **WHEN** a user clicks next page in the search card
- **THEN** the host calls `search` with the same query, kinds, sort, and page size and the next page, and the card
  shows the new page

#### Scenario: See all opens the same search

- **WHEN** a user clicks See all in the search card for the query "orbit" with the kind `topics` and the sort `newest`
- **THEN** the host opens `/search?q=orbit&kinds=topics&sort=newest` on the site, every value at its default left out

#### Scenario: Follow from the search card

- **WHEN** a signed-in user clicks Follow on a public Topic's row
- **THEN** the host calls `follow_topic`, and the row shows Following

### Requirement: The topic card is the chat's topic card

The topic card SHALL render `edit_topic` and `create_topic` results with the component that shows the topic card in
chat. For an `edit_topic` preview it SHALL show the edit over the Topic as it stands, marked as a proposed edit, and a
Save button that calls `edit_topic` again with the same edit and the result's confirmation, then shows the saved
result. For a saved edit and a created Topic it SHALL show the Topic as saved, its name linking to the Topic's page.

#### Scenario: A preview shows the edit and Save

- **WHEN** `edit_topic` returns a confirmation for making a Topic public
- **THEN** the topic card shows the Topic as public, marked as proposed, with a Save button

#### Scenario: Save confirms the edit

- **WHEN** the user clicks Save on that card
- **THEN** the host calls `edit_topic` with the same edit and the confirmation, the Topic is saved as public, and the
  card shows it as saved with no Save button

### Requirement: The findings card is the feed's finding rows under a topic header

The findings card SHALL render the `read_topic_feed` and `search_topic_findings` results as the feed's finding rows
under a header holding the Topic's name, its latest Podcast Episode's play button, and Follow. A signed-in caller's
rows SHALL have thumbs up and down, bookmark, and done, calling `rate_finding`, `bookmark_finding`, and
`mark_finding_consumed`, and each row SHALL show the result of its call.

#### Scenario: Done marks a finding consumed

- **WHEN** a signed-in user clicks done on a Finding in the findings card
- **THEN** the host calls `mark_finding_consumed` for that Finding, and the row reads as consumed

#### Scenario: The header plays the latest episode

- **WHEN** a user clicks the play button in the findings card's header
- **THEN** the Topic's latest published Podcast Episode plays in the card

### Requirement: A card plays podcast audio through the audio route with a signed play token

A tool result SHALL give each Podcast Episode it names the audio route's absolute url with a play token valid for 24
hours, signed over the episode, the caller's user or none, and its expiry. The audio route SHALL accept a valid token in
place of a session, as that user or as a visitor, then check the caller's access to the episode, count the listener,
and redirect as it does for a page. A token for another episode, an expired token, or a forged one SHALL be rejected as
missing. A card SHALL have one player for every play button it shows. If the audio fails to play, the card SHALL replace
the player with a link that asks the host to open the episode's page.

#### Scenario: A private episode plays for its owner

- **WHEN** the owner of a private Topic plays its Podcast Episode from a card
- **THEN** the audio route accepts the play token as the owner, counts the listen, and the audio plays

#### Scenario: A token for another episode is rejected

- **WHEN** a request names one Podcast Episode's audio with the play token of another
- **THEN** the route responds as if the episode did not exist

#### Scenario: A blocked player offers the episode page

- **WHEN** a host's frame blocks the audio, or the token has expired
- **THEN** the card shows a link that opens the Podcast Episode's page in place of the player

### Requirement: Every card has a story

Each card SHALL have a story in the Nightshift component browser rendered from invented tool results, for a visitor
and for a user, with the fetch guard on, so a card that reaches the api fails its story.

#### Scenario: The card stories render

- **WHEN** the component browser builds
- **THEN** the search, topic, and findings cards each render for a visitor and for a user with no `/api` request

### Requirement: A test host renders each card from fixture tool results

The repo SHALL hold a card test host. It SHALL load each card's html as the api builds it from the built card bundle,
in a sandboxed frame under that card resource's content security policy. Through the MCP Apps host bridge it SHALL send
tool input, a tool result with `structuredContent` and `_meta`, and the host theme. It SHALL record each tool call and
link the card asks for. Its fixtures SHALL be typed from the card contracts.

#### Scenario: A card waits for its result

- **WHEN** the host sends tool input and holds the result back
- **THEN** the card shows its loading state

#### Scenario: A card follows the host's dark theme

- **WHEN** the host's theme is dark
- **THEN** the card renders in the Dark roast palette

#### Scenario: The states each card shows

- **WHEN** the card tests run
- **THEN** each card renders for a visitor and a user, and the search and findings cards render with no results, with
  long names and long text, and from an error result

#### Scenario: A contract change breaks a stale fixture

- **WHEN** a commit renames a field in the search card's result type
- **THEN** the type check fails on the card fixture that still sets the old field

### Requirement: Each card action is asserted through the test host

The card tests SHALL assert each card action through the test host: Save, Follow, rating, bookmark, done, sort, paging,
See all, and a Topic link. For each one they SHALL assert the tool call or link the card asks for, with its arguments,
and the card's state after a successful result. They SHALL also assert the state after an error result. The MCP
server's protocol and authorization tests SHALL stay in the api's own tests, apart from the card host.

#### Scenario: Follow calls the tool and flips the button

- **WHEN** a user clicks Follow in the search card and the host returns a successful `follow_topic` result
- **THEN** the host recorded `follow_topic` with the Topic's id and `is_following: true`, and the button shows
  Following

#### Scenario: A failed bookmark keeps its state

- **WHEN** the host returns an error result for `bookmark_finding`
- **THEN** the Finding's bookmark control shows its earlier state

#### Scenario: See all opens through the host

- **WHEN** a user clicks See all in the search card
- **THEN** the host recorded a link to the site's search page for the query, and the card made no request of its own
