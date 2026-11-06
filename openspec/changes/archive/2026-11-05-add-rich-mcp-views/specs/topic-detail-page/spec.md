## MODIFIED Requirements

### Requirement: Findings render as a five-row, collapsible list reusing the homepage row
A `▾ Findings` accordion (default expanded) SHALL list the Topic's Findings with the homepage row anatomy: title
(emphasized when unread, muted when read), muted source + age meta, and a right-aligned ⓘ popover with Carl's notes,
the fetched date, the view count, a mark-read/unread control, and thumbs. The list SHALL honor the app's shared view
filters — the All/Unread toggle and the resource-kind filters — exactly as the homepage does. The Findings SHALL be in
the HTML, up to fifty. At most five rows SHALL show with JavaScript, with a "+ N more / show less" expander for the
rest, and the expander SHALL be hidden without JavaScript, where every row shows. Row actions SHALL persist through the
api and refresh the page's own payload.

#### Scenario: Five findings show with an expander
- **WHEN** a Topic has seven Findings
- **THEN** five rows show and "+ 2 more" reveals the rest in place

#### Scenario: The Unread view narrows the findings
- **WHEN** the user selects Unread on the topic page
- **THEN** only unread Findings show, and selecting All restores the full list with read rows muted

#### Scenario: A reader without JavaScript sees the findings whole
- **WHEN** a client with no JavaScript fetches a public Topic with seven Findings
- **THEN** all seven rows are in the HTML and shown, with no expander
