## ADDED Requirements

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
