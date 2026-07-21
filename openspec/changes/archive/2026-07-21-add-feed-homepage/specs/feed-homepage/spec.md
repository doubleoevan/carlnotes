## ADDED Requirements

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
