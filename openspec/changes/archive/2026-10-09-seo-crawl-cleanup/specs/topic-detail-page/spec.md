## ADDED Requirements

### Requirement: A public topic page links more topics

A public shown Topic's page SHALL end with a "More topics" section of up to five plain links to other public shown
Topics, rendered on the server so a crawler and a visitor without JavaScript read them. The Topics SHALL be chosen in
this order: other public shown Topics that a public team holding this Topic also holds, owned or shared; then public
shown Topics sharing a tag with this Topic, most shared tags first; then the public shown Topics with the newest
Finding. The Topic itself SHALL never be listed, a Topic SHALL be listed once, and a private or invite Topic, or a
Topic held only by a private team, SHALL never be listed. Each link SHALL use the Topic's slugged url and show its
name. A Topic page that is not public, or a public one not yet shown, SHALL have no such section.

#### Scenario: A team's other topics come first

- **GIVEN** a public Topic held by a public team with three other public shown Topics, and two more public Topics
  sharing its tag
- **WHEN** a visitor opens its page
- **THEN** "More topics" lists the three team Topics, then the two tagged ones

#### Scenario: Recent topics fill the rest

- **GIVEN** a public Topic with no team and no tag
- **WHEN** a crawler fetches its page without running JavaScript
- **THEN** "More topics" lists the five other public shown Topics with the newest Findings, each as a plain link

#### Scenario: A private topic has no section

- **WHEN** an owner opens their private Topic's page
- **THEN** there is no "More topics" section

### Requirement: Findings render as a five-row, collapsible list reusing the homepage row
A `▾ Findings` accordion (default expanded) SHALL list the Topic's Findings with the homepage row anatomy:
resource-kind icon, title (emphasized when unread, muted when read), muted source + age meta, and a right-aligned ⓘ
popover with Carl's notes, the fetched date, the view count, a mark-read/unread control, and thumbs. The list SHALL
honor the app's shared view filters — the All/Unread toggle and the resource-kind filters — exactly as the homepage
does. The Findings SHALL be in the HTML, up to fifty. At most five rows SHALL show with JavaScript, with a "+ N more /
show less" expander for the rest, and the expander SHALL be hidden without JavaScript, where every row shows. Row
actions SHALL persist through the api and refresh the page's own payload.

#### Scenario: Five findings show with an expander
- **WHEN** a Topic has seven Findings
- **THEN** five rows show and "+ 2 more" reveals the rest in place

#### Scenario: The Unread view narrows the findings
- **WHEN** the user selects Unread on the topic page
- **THEN** only unread Findings show, and selecting All restores the full list with read rows muted

#### Scenario: A reader without JavaScript sees the findings whole
- **WHEN** a client with no JavaScript fetches a public Topic with seven Findings
- **THEN** all seven rows are in the HTML and shown, with no expander

## REMOVED Requirements

### Requirement: Findings render as a capped, collapsible list reusing the homepage row

**Reason**: Renamed, since "capped" is a retired word, and the requirement gains the rows for a reader without
JavaScript.

**Migration**: "Findings render as a five-row, collapsible list reusing the homepage row" keeps both scenarios, with
the expander scenario reworded, and adds the reader without JavaScript.
