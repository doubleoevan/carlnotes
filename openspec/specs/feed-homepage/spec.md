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
The homepage's control row SHALL show an Add Topic primary button beside Refresh, opening the shared topic modal in create mode. Under the button, a remaining line ("N left", the topic limit is on held topics, never per day) SHALL link to the pricing page with an "Upgrade for more" tooltip, hydrate in once the feed payload lands (with a same-height placeholder while loading), and the button SHALL be disabled while loading and at zero remaining. A successful create, from the modal or from Carl in the new-topic chat, SHALL refresh the feed and navigate to the new topic's page. A signed-in user who owns no Topic and follows none SHALL also find the chat panel open on the new-topic chat when they land.

#### Scenario: Creating a topic lands on its page
- **WHEN** the user saves the Add Topic modal within the limit, or says yes to Carl in the new-topic chat
- **THEN** the topic is created and the app navigates to its detail page

#### Scenario: A reached topic cap disables the button
- **WHEN** the user holds as many topics as their limit allows
- **THEN** the remaining line shows "0 left" and Add Topic is disabled

#### Scenario: A first visit opens Carl
- **WHEN** a signed-in user who owns no Topic and follows none lands on the homepage
- **THEN** the chat panel is open on the new-topic chat beside the empty feed

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

### Requirement: The homepage opens the section that has something in it
For a signed-in user the homepage SHALL open the "Your topics" section first, except when the user owns no Topic and
follows at least one, when it SHALL open "Your subscribed topics" instead. A visitor SHALL still see the featured Topics
first. A closed section SHALL be in the html and SHALL show without JavaScript, so a reader who cannot open it still
reads it, and SHALL hide with JavaScript until opened.

#### Scenario: A follower who owns nothing lands on what they follow
- **WHEN** a user who follows a Topic but owns none loads the homepage
- **THEN** "Your subscribed topics" is the open section

#### Scenario: An owner lands on their own topics
- **WHEN** a user who owns a Topic loads the homepage
- **THEN** "Your topics" is the open section, whatever they follow

#### Scenario: A closed section shows without JavaScript
- **WHEN** a client with no JavaScript loads a visitor's homepage
- **THEN** the Popular section's topics are shown under the open Featured section, and a browser with JavaScript sees
  them only once the section is opened

### Requirement: Resources are read/watch/listen rows limited to five with an expander
Each Topic SHALL list its Findings' Resources as rows typed by Resource kind — read, watch, or listen — each with a
matching type icon, the Resource title, an ⓘ control, and source + age meta, with dashed rules between rows.
Activating a row SHALL open the Resource link in a new tab. At most five rows SHALL show, with a "+ N more / show
less" expander for the rest. Without JavaScript the expander SHALL be a plain link to the Topic's page, where every
Finding is in the html, and the expander button SHALL be hidden. The Resource ⓘ popover SHALL show Carl's summary, a
mark-read/unread control, and thumbs up/down.

#### Scenario: Only five resources show until expanded
- **WHEN** a Topic has more than five Findings in view
- **THEN** five Resource rows show, each bearing its read/watch/listen type icon, and a "+ N more" expander reveals the
  rest

#### Scenario: The resource info popover shows summary, read state, and thumbs
- **WHEN** the user activates a Resource's ⓘ control
- **THEN** a popover shows Carl's summary, a mark-read/unread control, and thumbs up/down

#### Scenario: The expander is a link without JavaScript
- **WHEN** a client with no JavaScript reads a homepage card with more than five Findings
- **THEN** "+ N more" is a link to the Topic's page, and no button is shown

### Requirement: The featured and popular order is shared across replicas

The ids of the featured and popular sections SHALL be read through the Redis store's read-through cache under one shared
key with a 60-second time to live, so every api replica serves the same order. Every change to a Topic's feature order,
setting one or releasing one, SHALL delete the shared key, so the next request on any replica reads the new order. While
Redis is unreachable the ids SHALL load from Postgres on each request.

#### Scenario: Two replicas read the same order after a featuring change

- **WHEN** an admin sets a Topic's feature order through one api replica and the homepage loads through another
- **THEN** both replicas serve the new order on their next request

#### Scenario: A released feature order clears the shared key

- **WHEN** a featured Topic's feature order is released by a visibility change or its deletion
- **THEN** the shared key is deleted, and the next request reads the order without that Topic

#### Scenario: Redis down reads Postgres

- **WHEN** Redis is unreachable
- **THEN** each homepage request reads the section ids from Postgres, and the order is correct

### Requirement: The search bar finds topics by name on the server

The search bar's topic matches SHALL come from `GET /api/topics/search?q=`, requested with the same debounce and the
same two-character minimum as the user and team searches, limited to five matches ordered by the shortest name first.
The route SHALL apply the `topic:view` rules in SQL, so a Topic the user has a role on, a public Topic with at least the
minimum shown findings, the user's own public Topic at any size, and an invite Topic the user is invited to or
subscribed to match, and a private Topic the user has no role on never does. A visitor SHALL match public Topics with at
least the minimum shown findings alone. The rules SHALL apply before the limit, so the five matches are the first five
the user may see. Finding matches SHALL keep coming from the loaded home feed.

#### Scenario: A public topic off the home feed is found

- **WHEN** a visitor types the name of a public Topic that is neither featured nor popular
- **THEN** the Topic is in the matches

#### Scenario: A private topic never appears

- **WHEN** a user types the exact name of a private Topic they have no role on
- **THEN** the Topic is not in the matches

#### Scenario: An invite topic appears only for its invitees

- **WHEN** two users type the name of an invite Topic, one invited to it and one not
- **THEN** the invited user sees the Topic and the other does not

#### Scenario: A small public topic appears for its owner alone

- **WHEN** a public Topic has fewer than the minimum shown findings and its owner and a visitor each type its name
- **THEN** the owner sees the Topic and the visitor does not

#### Scenario: The rules apply before the limit

- **WHEN** six private Topics and one public Topic share a name prefix a visitor types
- **THEN** the public Topic is in the matches

### Requirement: A visitor's homepage shows the topic tutorial video card
The homepage SHALL show a visitor a card right above the Featured topics section, under the tags and the New Topic
button, centered in the page body. The card SHALL be titled "A Fresh Brew with Carl ☕" in the display font, and SHALL
hold the topic tutorial video: the YouTube video on making a topic. The card SHALL be in the server-rendered html. A
page load that brings a session cookie SHALL not show the card, even before the session request finishes, and a
signed-in user SHALL never see it.

The video SHALL show its thumbnail, served from this origin, at full color with YouTube's red play button over it, and
nothing SHALL reach YouTube until the play button is pressed. Pressing it SHALL play the video in place from
`www.youtube-nocookie.com`, with its sound on.
The thumbnail SHALL be a link to the video's YouTube page, so a visitor without JavaScript and a click with a modifier
key open the video on YouTube instead.

The link preview card's YouTube player SHALL be the same player, so a YouTube link preview in a chat or a finding
plays the same way and links the same way, with the app's own play button over a dimmed thumbnail.

#### Scenario: A visitor sees the card above Featured topics
- **WHEN** a visitor opens the homepage
- **THEN** the server-rendered html includes the card titled "A Fresh Brew with Carl ☕" above the Featured topics
  section, with the video's thumbnail linked to the video's YouTube page

#### Scenario: A signed-in user does not see the card
- **WHEN** a signed-in user opens the homepage
- **THEN** the page shows no topic tutorial video card, including before the session request finishes

#### Scenario: Pressing play plays the video in place
- **WHEN** a visitor presses the card's play button
- **THEN** the thumbnail is replaced by the video playing from `www.youtube-nocookie.com` with its sound on, and the
  page stays on the homepage

#### Scenario: A visitor without JavaScript opens the video on YouTube
- **WHEN** a visitor without JavaScript presses the thumbnail
- **THEN** the browser opens the video's YouTube page

