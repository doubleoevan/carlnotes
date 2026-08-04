# feed-homepage Specification

## Purpose
TBD - created by archiving change add-feed-homepage. Update Purpose after archive.
## Requirements
### Requirement: The homepage renders the Feed from the committed design export
The homepage SHALL implement the committed design export at `docs/design/homepage.html`: the dark hero band with Carl's headline, the overlapping search field (visual for now), and the collapsible Topic sections **Your topics**, **Featured**, and **Popular**. Display type SHALL use Architects Daughter and body type SHALL use Karla. The export is the source of truth for layout and interaction; the shipped theming and ambient background have since evolved past it.

#### Scenario: Homepage shows the hero and topic sections
- **WHEN** the homepage loads against the seeded dev data
- **THEN** it renders the hero band with the headline and the Your topics / Featured / Popular sections, each collapsible

### Requirement: A Topic shows its identity, tags, new count, and info popover
Each Topic SHALL show its title in the display font and its tag pills, keeping the Topic's prompt distinct from its title, plus a "N new" count. A click/tap ⓘ popover SHALL show Title, Carl's Prompt, Attachments, Additional sources, and Schedule (frequency, last scan, created date). Attachment download SHALL be offered only on the user's own Topics.

#### Scenario: Topic info popover opens with details
- **WHEN** the user activates a Topic's ⓘ control
- **THEN** a popover shows the Topic's prompt, attachments, sources, and schedule, with attachment downloads present only for the user's own Topics

### Requirement: Resources are read/watch/listen rows capped with an expander
Each Topic SHALL list its Findings' Resources as rows typed by Resource kind — read, watch, or listen — each with a matching type icon, the Resource title, an ⓘ control, and source + age meta, with dashed rules between rows. Activating a row SHALL open the Resource link in a new tab. At most five rows SHALL show, with a "+ N more / show less" expander for the rest. The Resource ⓘ popover SHALL show Carl's summary, a mark-read/unread control, and thumbs up/down.

#### Scenario: Only five resources show until expanded
- **WHEN** a Topic has more than five Findings in view
- **THEN** five Resource rows show, each bearing its read/watch/listen type icon, and a "+ N more" expander reveals the rest

#### Scenario: The resource info popover carries summary, read state, and thumbs
- **WHEN** the user activates a Resource's ⓘ control
- **THEN** a popover shows Carl's summary, a mark-read/unread control, and thumbs up/down

### Requirement: A Resource's rating persists through the Feed API
Each Resource's ⓘ popover SHALL offer thumbs up/down that write the underlying Finding's rating through the Feed API, and that rating SHALL survive a reload.

#### Scenario: A rating persists across reload
- **WHEN** the user rates a Resource from its ⓘ popover and reloads the homepage
- **THEN** the rating is still shown, read back from the Feed API

### Requirement: The homepage is a per-user inbox with read items muted
The homepage SHALL present the Feed as a per-user inbox: by default it SHALL show every Finding with read (consumed) rows visually muted and unread rows emphasized, and each Topic's "N new" count SHALL be its number of unread Findings. An **All / Unread** toggle SHALL switch between the full inbox and unread-only. The Resource ⓘ popover SHALL offer a mark-read/unread control; opening a Resource SHALL mark it read, and marking unread SHALL restore its emphasis. Read state SHALL persist per user through the Feed API.

#### Scenario: Opening a resource marks it read and mutes its row
- **WHEN** the user opens a Resource
- **THEN** its Finding is marked read for that user and its row is shown muted in the inbox

#### Scenario: The Unread view narrows to unread findings
- **WHEN** the user selects Unread
- **THEN** only unread Findings show, and selecting All returns to the full inbox with read rows muted

#### Scenario: N new counts unread findings
- **WHEN** a Topic has unread Findings
- **THEN** its "N new" count equals the number of unread Findings

### Requirement: The homepage themes, animates, and adapts responsively
The homepage SHALL support the Latte (light) and Dark-roast (dark) palettes toggled by the ☀/☾ control, SHALL adapt between the wide and narrow layouts — collapsing the theme and sign-in controls into a menu on narrow — and SHALL play its entrance motion at most once per Topic per visit. An ambient animated background SHALL sit behind the feed, and a loading skeleton mirroring the feed's section/topic/row shape SHALL show while the Feed loads. A Refresh control SHALL re-fetch the Feed and replay the entrance motion. All motion SHALL honor prefers-reduced-motion.

#### Scenario: Theme toggle switches palettes
- **WHEN** the user activates the theme control
- **THEN** the homepage switches between the Latte and Dark-roast palettes

#### Scenario: Narrow layout collapses the header controls
- **WHEN** the viewport is at the narrow layout
- **THEN** the theme and sign-in controls collapse into a menu

#### Scenario: The loading state shows a skeleton
- **WHEN** the Feed has not yet loaded
- **THEN** a skeleton mirroring the feed's section, topic, and row shape shows in its place

#### Scenario: Reduced motion is honored
- **WHEN** the user has prefers-reduced-motion set
- **THEN** the entrance motion and the ambient background animation do not play

### Requirement: The homepage offers topic creation beside Refresh
The homepage's control row SHALL show an Add Topic primary button beside Refresh, opening the shared topic modal in create mode. Under the button, a cap line ("N left" — the topic cap is on held topics, never per day) SHALL link to the pricing page with an "Upgrade for more" tooltip, hydrate in once the feed payload lands (with a same-height placeholder while loading), and the button SHALL be disabled while loading and at zero remaining. A successful create SHALL refresh the feed and navigate to the new topic's page.

#### Scenario: Creating a topic lands on its page
- **WHEN** the user saves the Add Topic modal within the cap
- **THEN** the topic is created and the app navigates to its detail page

#### Scenario: A reached topic cap disables the button
- **WHEN** the user holds as many topics as their cap allows
- **THEN** the cap line shows "0 left" and Add Topic is disabled

### Requirement: The homepage filters topics by tag
Below the control row and above the sections, the homepage SHALL show a tag filter built on the shared tag picker without tag creation: a "Tags:" text label leading the selected tag pills — solid like the topic tag pills — and a "+" opening the search picker over the feed's known tags. Far right in the same row, a Tag Filters button styled like the search bar's Filters control (same icon) SHALL open a menu of match modes — Any Match (default), All Match, Exclude Tags, and Off, the active one checked: with tags selected, sections narrow to topics carrying at least one, every one, or none of them respectively, while Off ignores the tag filter and shows every topic without clearing the selected pills; with no tags selected, all topics show regardless of mode. A filter or mode change SHALL replay the sections' entrance motion, like the other view filters.

#### Scenario: Selecting a tag narrows the sections
- **WHEN** the user selects a tag from the picker under the Any mode
- **THEN** every section shows only topics carrying that tag, and clearing the pills restores the full feed

#### Scenario: The match mode changes what the tags mean
- **WHEN** the user selects two tags and switches the mode to All, then to Exclude Tags
- **THEN** sections first narrow to topics carrying both tags, then to topics carrying neither

#### Scenario: Off ignores the tag filter
- **WHEN** the user has tags selected and switches the mode to Off
- **THEN** every topic shows again while the selected pills stay in place

#### Scenario: The homepage picker cannot create tags
- **WHEN** the user types text matching no known tag in the homepage picker
- **THEN** no Create row is offered

### Requirement: The feed bar offers three sort modes

The feed bar SHALL offer a "Sort"-labelled menu with three modes: relevant (the default, by relevance score), newest (by resource recency), and trending (by the Resource's captured engagement signal, degrading to newest where the signal is null). Sorting SHALL be pure read-side ranking over the delivered Findings, and the chosen mode SHALL be a UI concern, never persisted.

Relevant sort SHALL settle equal scores by resource recency, and any remaining tie by a stable per-Finding key, so the ordering is total. Relevance scores bunch at the top of the scale and most of a first page ties outright, which leaves the tiebreak — not the score — deciding what a reader actually sees first. An ordering that instead falls through to the order rows arrived in is not reproducible: the homepage and the topic page build a topic's list from separately queried rows, so the same Findings under the same sort would present in two different orders.

#### Scenario: Newest reorders by recency
- **WHEN** the user switches the sort to newest
- **THEN** Findings order by resource recency without any new data being fetched

#### Scenario: Trending falls back to newest without a signal
- **WHEN** the user switches to trending on a feed where some Findings carry no engagement signal
- **THEN** Findings with a signal rank by it and the rest fall back to recency order behind them

#### Scenario: Equally relevant Findings order by recency
- **WHEN** several Findings share the same relevance score
- **THEN** they order among themselves newest first, rather than in the order they were delivered

#### Scenario: One topic sorts identically wherever it is rendered
- **WHEN** the same Findings are sorted by relevance on the homepage and on the topic page
- **THEN** the Findings common to both appear in the same relative order on each

### Requirement: The view filter lives in the search bar's Filters menu
The search bar's Filters menu SHALL offer the All, Unread, and Bookmarked views as a radio group above a divider, with the resource-kind checks below it. One view is active at a time. Bookmarked shows only the requesting user's bookmarked Findings and SHALL render only for a signed-in user; All and Unread keep their existing behavior.

#### Scenario: The menu cycles all three views
- **WHEN** the user moves the view radio through All, Unread, and Bookmarked
- **THEN** each view renders and the sort menu keeps working in every one

#### Scenario: A visitor sees no Bookmarked view
- **WHEN** a signed-out visitor opens the Filters menu
- **THEN** the view radios offer only All and Unread

