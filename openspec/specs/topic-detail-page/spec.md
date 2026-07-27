# topic-detail-page Specification

## Purpose
TBD - created by archiving change add-topic-detail-and-edit-pages. Update Purpose after archive.
## Requirements
### Requirement: The topic page renders a Topic's detail view
`/topics/:id` SHALL render the Topic detail view in the homepage's visual system: first a control row aligned with the homepage's — the shared All/Unread toggle left and the owner's Run-now block right (per scan-history) — then `← All topics` as a plain text link, then a full-width title row with the Topic name in the display font and the unread-Findings count ("N new") right-aligned — the count opening the same Topic info popover the homepage's count does, anchored to itself — and a tags row with the Topic's tag pills left-aligned. The control row and back link SHALL render statically before the payload loads — never animating in — with the Run-now trigger disabled until the quota is known and its quota line hydrating in once it is. The header, findings, and history sections SHALL play the homepage's staggered hydrate entrance (honoring prefers-reduced-motion), the homepage's ambient steam background SHALL sit behind the page, and the loading skeleton SHALL mirror the body below the static controls: header, findings rows, and the history-plus-card layout. Action icons SHALL sit right-aligned on the `← All topics` back-link line as bare glyphs matching the ⓘ icon weight, styled without button chrome but implemented as keyboard-focusable icon buttons with accessible labels and a visible focus ring: for the owner a ✎ edit and 🗑 delete icon; for a non-owner a 🔔 subscribe bell when visibility is public or invite. An owner never gets a bell, since they already hold the Topic, and private topics SHALL never show the bell.

#### Scenario: Owner sees edit and delete, no bell
- **WHEN** the owner views their invite-visibility Topic
- **THEN** the back-link line shows ✎ and 🗑 as bare glyphs (no bell, since the owner already holds the Topic), and the title row shows the unread count

#### Scenario: Non-owner sees only the bell
- **WHEN** a non-owner views a public Topic
- **THEN** only the 🔔 bell renders, with no ✎ or 🗑

### Requirement: Findings render as a capped, collapsible list reusing the homepage row
A `▾ Findings` accordion (default expanded) SHALL list the Topic's Findings with the homepage row anatomy: resource-kind icon, title (emphasized when unread, muted when read), muted source + age meta, and a right-aligned ⓘ popover with Carl's notes, the fetched date, the view count, a mark-read/unread control, and thumbs. The list SHALL honor the app's shared view filters — the All/Unread toggle and the resource-kind filters — exactly as the homepage does. At most five rows SHALL show, with a "+ N more / show less" expander for the rest. Row actions SHALL persist through the api and refresh the page's own payload.

#### Scenario: Findings cap at five with an expander
- **WHEN** a Topic has seven Findings
- **THEN** five rows show and "+ 2 more" reveals the rest in place

#### Scenario: The Unread view narrows the findings
- **WHEN** the user selects Unread on the topic page
- **THEN** only unread Findings show, and selecting All restores the full list with read rows muted

### Requirement: A right-rail info card summarizes the Topic
Beside the History list (top-aligned with it, not with Findings), a single info card SHALL show, separated by thin dashed rules: Carl's Notes (the latest succeeded Scan's recap, when one exists); Carl's Prompt; Sources; Attachments as links where a url opens its page and a file downloads for the owner only; Schedule as the frequency, a muted "last scan" age, and how long that scan took; Visibility with its glyph (🔒 private, 🌐 public, ✉ invite); and, for the owner or an admin, this calendar month's total scan spend. The Sources section SHALL lead with the default source — Carl's built-in web scout (the search Source, whose adapter derives queries from the topic prompt), labeled `web` and shown as on or muted off — followed by one line per custom Source with a type glyph, its kind, and a config summary (feed host, subreddit, or channel/playlist id).

#### Scenario: The info card renders every section
- **WHEN** the owner views a Topic with sources and a finished Scan
- **THEN** the card shows Carl's notes, the prompt, the web-scout default line plus per-custom-source kind + summary lines, the schedule with its last-scan age and duration, and the visibility glyph

#### Scenario: A topic without a search source shows the scout as off
- **WHEN** the user views a Topic that has no search Source
- **THEN** the Sources section still leads with the web scout line, muted and marked off

### Requirement: Access to the page follows Topic visibility
The topic page payload SHALL be served to the owner always, to anyone for public Topics, and for invite Topics only to users whose account email is invited or who already subscribe. Private Topics SHALL be served only to the owner. Any other request SHALL get not-found, and the ui SHALL render a not-found message rather than an empty page.

#### Scenario: An uninvited user cannot open an invite topic
- **WHEN** a signed-in user who is neither invited nor subscribed requests an invite Topic
- **THEN** the api responds not-found and the page shows the not-found message

### Requirement: The bell toggles this user's Subscription
The 🔔 bell SHALL toggle a Subscription for the current user through the api, rendering filled when subscribed and outline when not. Subscribing SHALL be permitted on public Topics for anyone and on invite Topics for invited users; the api SHALL reject subscription writes on private Topics.

#### Scenario: Subscribing persists
- **WHEN** a non-owner activates the bell on a public Topic and reloads
- **THEN** the bell renders filled and a Subscription row exists for that user

### Requirement: A failed last Scan is surfaced on the topic page

When a Topic's most recent Scan ended `failed`, the topic page SHALL say so and SHALL show that Scan's recorded error, so a Topic whose Sources have all stopped working is distinguishable from one that legitimately found nothing. The Scan history SHALL show the same error on a failed row. The rest of the page SHALL keep describing the last `succeeded` Scan — its recap, age, and duration — so a failed day does not erase the last real result.

#### Scenario: A topic whose newest Scan failed says so

- **WHEN** the owner opens a Topic whose most recent Scan ended `failed`
- **THEN** the page states that the last scan failed and shows the error recorded on that Scan

#### Scenario: A failed newest Scan does not replace the last succeeded recap

- **WHEN** a Topic has an older `succeeded` Scan with a recap and a newer `failed` Scan
- **THEN** the page still shows the succeeded Scan's recap and last-scan time, alongside the failure notice

#### Scenario: A quiet Topic is not mistaken for a failing one

- **WHEN** a Topic's most recent Scan `succeeded` but kept nothing
- **THEN** no failure notice is shown

