# Spec Delta

## MODIFIED Requirements

### Requirement: Model-written text renders with formatting and allowlisted reach

Every page that renders the scan report — the topic page, the activity drill-down, mobile reading views, and email —
SHALL render it through a sanitized markdown subset: bold, lists, and headings MAY render as markup, and a link SHALL
be clickable only when its destination exactly matches a kept Finding's stored Resource url available to that view.
The destination must already be one the product links to, so the note adds no reach. Every other link SHALL render
as its label and destination in plain text with no anchor, an image SHALL render nothing, raw HTML SHALL render as
the characters the model typed, and a bare url SHALL NOT be autolinked unless it too matches the allowlist. A view
with no kept-Finding urls in hand SHALL render every link inert rather than guessing. The relevance explanation
SHALL render as plain text with no markdown interpretation at all — so injection cannot become phishing.
Web and mobile SHALL apply one parser-based recap policy before rendering. That policy SHALL remove image nodes
and raw-HTML interpretation, preserve raw HTML as inert characters, and leave disallowed link destinations as text
that the renderer cannot turn back into links. This extraction SHALL preserve the current web's appearance and safety tests.

#### Scenario: A citation of a kept item is a link, anything else is inert

- **WHEN** a scan report cites a kept Finding's stored url and also contains a link to any other destination, an HTML anchor, or an image
- **THEN** the kept citation renders as a real link, and everything else shows its label and destination as inert text — no anchor, no image, no embedded markup — while the report's bold and lists still render as formatting

#### Scenario: The relevance explanation renders as text

- **WHEN** a Finding's relevance explanation is shown on a feed card or in email
- **THEN** it renders as a text node, with no markdown or HTML interpretation

#### Scenario: A hostile recap reads the same on both clients

- **WHEN** web and mobile render the same recap and allowed-URL set
- **THEN** their clickable destinations and visible text agree, raw HTML stays inert, and images trigger no load

#### Scenario: Disallowed URLs cannot regain links

- **WHEN** a recap contains an unapproved inline link, reference link, bare URL, or nested linked image
- **THEN** it produces no clickable destination or image request on either client
- **AND** visible disallowed link labels retain their destination once as plain text

#### Scenario: Empty or unusual input fails closed

- **WHEN** the allowlist is absent, or markup contains malformed, encoded, or unsupported nodes
- **THEN** no additional navigation, embedded content, or resource fetching is introduced
- **AND** literal code and readable text remain inert

## ADDED Requirements

### Requirement: Recap headings retain compact typography

Every recap heading level SHALL render with the compact Nightshift display-font treatment used by the web recap. Native headings SHALL use the same visual role in light and dark themes and scale with system text. The shared safety policy SHALL preserve heading text and document order without introducing editor-style heading sizes.

#### Scenario: A recap uses all heading levels

- **WHEN** a recap contains heading levels one through six among paragraphs and lists
- **THEN** heading text retains its order and compact display styling on both clients
- **AND** long headings wrap without clipping or changing allowed links
