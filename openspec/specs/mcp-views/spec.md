# mcp-views Specification

## Purpose
Define CarlNotes MCP views, their declared UI resources, host integration, and text fallback while preserving authorization and existing Topic and Finding actions.

## Requirements

### Requirement: Ten tools name an MCP view through the MCP Apps extension

The MCP server SHALL register six MCP view kinds through `@modelcontextprotocol/ext-apps`, each of type
`text/html;profile=mcp-app`: `ui://carlnotes/search.html`, `ui://carlnotes/topic.html`, `ui://carlnotes/findings.html`,
`ui://carlnotes/suggest-topics.html`, `ui://carlnotes/updates.html`, and `ui://carlnotes/scan.html`. `search` SHALL
name the search MCP view, `edit_topic`, `create_topic`, and `send_to_topic` the topic MCP view, `read_topic_feed` and
`search_topic_findings` the findings MCP view, `suggest_topics` the suggestion MCP view, `read_updates` the updates
MCP view, and `start_scan` and `read_scan_status` the scan MCP view, in `_meta.ui.resourceUri`. No other tool SHALL name
an MCP view. Preferred UI resource URIs append the current `?v=` version. Unversioned aliases and versions two through
eight remain readable for cached connections, and each stored version stays readable from its own bundle. Every tool,
with an MCP view or without, SHALL return its full structured result and a readable text summary, so a client that
renders no MCP view reads the same result it reads today.

#### Scenario: A client lists the UI resources

- **WHEN** a client lists the server's resources
- **THEN** it receives the six preferred versioned UI resources, their unversioned aliases, and each stored version,
  each of type `text/html;profile=mcp-app`

#### Scenario: A tool names its MCP view

- **WHEN** a client lists tools
- **THEN** `search` names `ui://carlnotes/search.html`, `edit_topic`, `create_topic`, and `send_to_topic` name
  `ui://carlnotes/topic.html`, `read_topic_feed` and `search_topic_findings` name `ui://carlnotes/findings.html`,
  `suggest_topics` names `ui://carlnotes/suggest-topics.html`, `read_updates` names `ui://carlnotes/updates.html`,
  and `start_scan` and `read_scan_status` name `ui://carlnotes/scan.html`

#### Scenario: A client without MCP views reads the same result

- **WHEN** a client that renders no MCP view calls each tool that names an MCP view
- **THEN** each result has its structured content and its text summary, the same with or without the UI resource
  registered

### Requirement: The MCP view bundle is built in apps/web and read by the api

The MCP views SHALL be built in `apps/web` from its own components and Nightshift's tokens into one script and one
stylesheet under `apps/web/dist/mcp-views/`, with every asset inlined, by the same `build:ui` that builds the web app.
The api SHALL read the two built files from that directory, keep them in memory, and return each UI resource as one
self-contained HTML document holding the stylesheet, the script, and the name of its MCP view, with every `</script` in the
script escaped. If the built files are missing, the resource read SHALL fail with a message naming `bun run build:ui`,
and every tool SHALL still work. No module of `apps/api` SHALL import `apps/web`.

#### Scenario: A resource read returns the built MCP view

- **GIVEN** `bun run build:ui` has run
- **WHEN** a client reads `ui://carlnotes/topic.html`
- **THEN** it receives one HTML document whose style and script are the built files and which names the topic MCP view

#### Scenario: A missing build fails only the MCP view

- **GIVEN** the MCP view bundle was never built
- **WHEN** a client reads a UI resource and then calls `search`
- **THEN** the read fails with a message naming `bun run build:ui`, and the search returns its result

### Requirement: Each MCP view's security policy names the media origins and no connections

Each UI resource SHALL declare `resourceDomains` with the site's origin, the Google Fonts origins its stylesheet
imports from, and the origin of the presigned object storage url the audio redirects to, SHALL declare the site's
origin as its only `baseUriDomains`, so a relative url in the MCP view resolves against the site, and SHALL declare no
`connectDomains`, so an MCP view fetches nothing itself and reads only what tool results carry and tool calls return.

#### Scenario: The policy names the site and object storage

- **WHEN** a client reads a UI resource
- **THEN** its `_meta.ui.csp.resourceDomains` holds the site's origin and the object storage origin, its
  `baseUriDomains` holds the site's origin, and it has no `connectDomains`

### Requirement: An MCP view's actions are ordinary tool calls

Every control in an MCP view that reads or writes SHALL call a tool through the host, and SHALL NOT reach the api any
other way. Those tools are `follow_topic`, `rate_finding`, `send_finding_feedback`, `bookmark_finding`,
`mark_finding_consumed`, `search`, `edit_topic`, `create_topic`, `suggest_topics`, `suggest_sources`, `send_to_topic`,
`read_topic_feed`, `search_topic_findings`, `read_scan_status`, and `stop_scan`. A call from an MCP view SHALL pass the
same authorization and the same rate limits as the same call from the model, and a visitor's MCP view SHALL show no
control for a write that needs an account.

#### Scenario: A rating from an MCP view is the tool's rating

- **WHEN** a user clicks thumbs up in a Finding's expanded row in the findings MCP view
- **THEN** the host calls `rate_finding` for that Finding, and the rating is written under the same rule as a model's
  call

#### Scenario: Feedback from an MCP view is the tool's feedback

- **WHEN** a user who may rate a Finding types why in its expanded row and clicks the thumb beside the box
- **THEN** the host calls `rate_finding` and then `send_finding_feedback` for that Finding, and a line of thanks
  replaces the box

#### Scenario: A failed feedback send keeps the words

- **WHEN** the host returns an error result for `send_finding_feedback`
- **THEN** the box keeps the user's words, so the next thumb click sends them again

#### Scenario: A visitor's MCP view offers no writes

- **WHEN** a visitor's client renders the findings MCP view
- **THEN** the MCP view shows no thumbs, bookmark, mark read, or Follow control

#### Scenario: An MCP view's links open on the site

- **WHEN** a user clicks a Topic's name in the findings or search MCP view
- **THEN** the MCP view asks the host to open the Topic's page on the site's origin

### Requirement: The search MCP view is a table of the search page's results

The search MCP view SHALL render the `search` result as a table whose cells reuse the `/search` page's row components,
with the same links, play pills, and Finding notes. Its paging SHALL call `search` again with the next page and the same
search, showing one skeleton row per result the page holds while it loads. A Topic row SHALL have a Follow control that
calls `follow_topic` for a signed-in caller and shows whether they follow it. A Finding's expanded row SHALL save its
rating, bookmark, and consumption through `rate_finding`, `bookmark_finding`, and `mark_finding_consumed`, as the
findings MCP view does. A See all control SHALL ask the host to open `/search` with the same url parameters.

#### Scenario: Paging calls search again

- **WHEN** a user clicks next page in the search MCP view
- **THEN** the host calls `search` with the same query, kinds, sort, and page size and the next page, and the MCP view
  shows the new page

#### Scenario: A page that did not load

- **WHEN** the host returns an error for a page of the search or findings MCP view, or the call fails
- **THEN** the MCP view keeps the page it shows and a line says that the page did not load, until the next try

#### Scenario: See all opens the same search

- **WHEN** a user clicks See all in the search MCP view for the query "orbit" with the kind `topics` and the sort
  `newest`
- **THEN** the host opens `/search?q=orbit&kinds=topics&sort=newest` on the site, every value at its default left out

#### Scenario: Follow from the search MCP view

- **WHEN** a signed-in user clicks Follow on a public Topic's row
- **THEN** the host calls `follow_topic`, and the row shows Following

#### Scenario: A search row expands

- **WHEN** a user expands a Finding's row in the search MCP view
- **THEN** the row shows its relevance explanation, and the sender's own private annotation beneath it if they have one

#### Scenario: A second search row expands

- **WHEN** a user expands a Finding's row while another Finding's row is open in the search MCP view
- **THEN** the open row closes, and the new row shows its relevance explanation

### Requirement: The Topic MCP view reuses the chat's Topic Draft card

The topic MCP view SHALL render `edit_topic` and `create_topic` results with the TopicDraftCard component in chat. For an `edit_topic` preview it SHALL show the edit over the Topic as it stands, marked as a proposed edit, and a
Save button that calls `edit_topic` again with the same edit and the result's confirmation, then shows the saved
result. For a saved edit and a created Topic it SHALL show the Topic as saved, its name linking to the Topic's page.

#### Scenario: A preview shows the edit and Save

- **WHEN** `edit_topic` returns a confirmation for making a Topic public
- **THEN** the topic MCP view shows the Topic as public, marked as proposed, with a Save button

#### Scenario: Save confirms the edit

- **WHEN** the user clicks Save on that MCP view
- **THEN** the host calls `edit_topic` with the same edit and the confirmation, the Topic is saved as public, and the
  MCP view shows it as saved with no Save button

### Requirement: The findings MCP view is a table of the feed's Findings under a topic header

The findings MCP view SHALL render the `read_topic_feed` and `search_topic_findings` results as a table under a header
holding the Topic's name, its latest Podcast Episode's play button, and Follow. Its columns SHALL show the title,
source, publish date, and the control that expands the row, from the same components the topic page's rows use. A row
SHALL expand on demand to its relevance explanation, and beneath it the caller's own private annotation if they have
one. A signed-in caller's expanded row SHALL end with the controls of the Finding's note popover, from the same
component: thumbs up and down beside the feedback box, bookmark, and mark read, calling `rate_finding`,
`send_finding_feedback`, `bookmark_finding`, and `mark_finding_consumed`. The expanded row SHALL show the result of each
call. One row SHALL stay open at a time. Paging SHALL call the same tool with its cursor.

#### Scenario: Done marks a finding consumed

- **WHEN** a signed-in user clicks Mark read in a Finding's expanded row in the findings MCP view
- **THEN** the host calls `mark_finding_consumed` for that Finding, and the row reads as consumed

#### Scenario: The header plays the latest episode

- **WHEN** a user clicks the play button in the findings MCP view's header
- **THEN** the Topic's latest published Podcast Episode plays in the MCP view

#### Scenario: A row expands to its explanation

- **WHEN** a user expands a Finding's row
- **THEN** the row shows the full relevance explanation with no separate popover

#### Scenario: A second row expands

- **WHEN** a user expands a Finding's row while another row is open
- **THEN** the open row closes, and the new row shows its relevance explanation

#### Scenario: The sender reads their annotation

- **WHEN** a sender expands a Finding their Personal sources shaped
- **THEN** their private annotation shows beneath the public explanation, and no other caller's result holds it

#### Scenario: A cursor opens the next page

- **WHEN** a user opens the next page of a large Topic
- **THEN** the host calls `read_topic_feed` with the result's cursor, the table shows the new page, and the previous
  page control returns to the page before it

### Requirement: An MCP view plays podcast audio through the audio route with a signed play token

A tool result SHALL give each Podcast Episode it names the audio route's absolute url with a play token valid for 24
hours, signed over the episode, the caller's user or none, and its expiry. The audio route SHALL accept a valid token in
place of a session, as that user or as a visitor, then check the caller's access to the episode, count the listener,
and redirect as it does for a page. A token for another episode, an expired token, or a forged one SHALL be rejected as
missing. A MCP view SHALL have one player for every play button it shows. If the audio fails to play, the MCP view SHALL replace
the player with a link that asks the host to open the episode's page.

#### Scenario: A private episode plays for its owner

- **WHEN** the owner of a private Topic plays its Podcast Episode from an MCP view
- **THEN** the audio route accepts the play token as the owner, counts the listen, and the audio plays

#### Scenario: A token for another episode is rejected

- **WHEN** a request names one Podcast Episode's audio with the play token of another
- **THEN** the route responds as if the episode did not exist

#### Scenario: A blocked player offers the episode page

- **WHEN** a host's frame blocks the audio, or the token has expired
- **THEN** the MCP view shows a link that opens the Podcast Episode's page in place of the player

### Requirement: Every MCP view has a story

Each MCP view SHALL have a story under the MCP views section of the Nightshift component browser, rendered from invented
tool results, for a visitor and for a user, with the fetch guard on, so an MCP view that reaches the api fails its
story.

#### Scenario: The MCP view stories render

- **WHEN** the component browser builds
- **THEN** the search, topic, findings, suggestion, updates, and scan MCP views each render for a visitor and for a
  user with no `/api` request

### Requirement: A test host renders each MCP view from fixture tool results

The repo SHALL hold an MCP view test host. It SHALL load each MCP view's html as the api builds it from the built MCP view bundle,
in a sandboxed frame under that UI resource's content security policy. Through the MCP Apps host bridge it SHALL send
tool input, a tool result with `structuredContent` and `_meta`, and the host theme. It SHALL record each tool call and
link the MCP view asks for. Its fixtures SHALL be typed from the MCP view contracts.

#### Scenario: An MCP view waits for its result

- **WHEN** the host sends tool input and holds the result back
- **THEN** the MCP view shows its loading state

#### Scenario: An MCP view follows the host's dark theme

- **WHEN** the host's theme is dark
- **THEN** the MCP view renders in the Dark roast palette

#### Scenario: The states each MCP view shows

- **WHEN** the MCP view tests run
- **THEN** each MCP view renders for a visitor and a user, and the search and findings MCP views render with no results, with
  long names and long text, and from an error result

#### Scenario: A contract change breaks a stale fixture

- **WHEN** a commit renames a field in the search MCP view's result type
- **THEN** the type check fails on the MCP view fixture that still sets the old field

### Requirement: Each MCP view action is asserted through the test host

The MCP view tests SHALL assert each MCP view action through the test host: Save, Follow, rating, feedback, bookmark,
mark read, sort, paging, See all, a Topic link, back, a one-hop move, a display mode request, stop, and the scan
poll. For each one they SHALL assert the tool call or link the MCP view asks for, with its arguments, and the MCP
view's state after a successful result. They SHALL also assert the state after an error result. The MCP server's
protocol and authorization tests SHALL stay in the api's own tests, apart from the MCP view host.

#### Scenario: Follow calls the tool and flips the button

- **WHEN** a user clicks Follow in the search MCP view and the host returns a successful `follow_topic` result
- **THEN** the host recorded `follow_topic` with the Topic's id and `is_following: true`, and the button shows Following

#### Scenario: A failed bookmark keeps its state

- **WHEN** the host returns an error result for `bookmark_finding`
- **THEN** the Finding's bookmark control shows its earlier state

#### Scenario: See all opens through the host

- **WHEN** a user clicks See all in the search MCP view
- **THEN** the host recorded a link to the site's search page for the query, and the MCP view made no request of its own

### Requirement: The topic MCP view confirms accepted Personal sources content

The topic MCP view SHALL render send outcomes without another MCP view kind. Acceptance SHALL show one confirmation with
its title in bold, the destination count, linked Topics, and numbered next-brew links. Links SHALL come from bounded,
sender-authorized MCP view-only metadata. Refusals SHALL not claim that anything was saved.

#### Scenario: A send succeeds
- **WHEN** `send_to_topic` returns an accepted entry
- **THEN** each linked Topic has “Links for next brew” and a flush numbered list of this send’s live queued candidates
- **AND** candidates use stored page titles or full-URL fallback, safe truncation, Nightshift styling, and launch icons
- **AND** confirmation metadata excludes transcripts and private chat references
- **AND** its Topic link opens through the host with no direct API call

#### Scenario: A new Topic needs confirmation
- **WHEN** `create_topic` returns a Topic Draft preview
- **THEN** the existing Topic Draft MCP view shows the private draft and a Create confirmation action
- **AND** nothing creates or sends until the user confirms

#### Scenario: The host cannot render MCP views
- **WHEN** a client displays only the tool's text
- **THEN** it receives the same acceptance or refusal information without needing the MCP view

#### Scenario: Long or hostile text is displayed
- **WHEN** the result contains a maximum-length title or markup-like text
- **THEN** the MCP view renders it safely within its layout without revealing private chat links or executing markup

### Requirement: Suggestions provide an explicit multi-Topic picker

The suggestion MCP view SHALL use the existing MCP Apps bundle and host bridge to list all editable Topics by relevance.
Strong best matches SHALL start checked; weaker editable Topics SHALL remain unchecked. Search SHALL filter names, and
the shared paginator SHALL follow tool cursors. Private send content SHALL stay in host arguments. The MCP view SHALL
make no direct API requests.

#### Scenario: Best matches and manual choices
- **WHEN** the MCP view opens with relevant editable matches
- **THEN** up to three matches within 0.02 of the highest editable score start checked, in ranked order
- **AND** no send, follow, draft, or creation occurs until the user chooses the respective action

#### Scenario: Search and pagination retain selection
- **WHEN** the user searches editable Topic names or moves through tool cursors
- **THEN** every prior choice remains selected or unselected, including choices on other pages
- **AND** selected Topic names remain visible before sending
- **AND** search retains the minimum suggested relevance and lists five editable Topics per page without public
  discovery

#### Scenario: Topic picker metadata and layout
- **WHEN** the user opens matching suggestions
- **THEN** editable rows reuse the standard Topic search-result layout, title, viewer/follower metadata, and authorized
  podcast pill, with a checkbox replacing the rank and kind icon and a Best match pill at the right
- **AND** display metadata uses bounded current-page reads, podcast playback uses the existing MCP view-only tokenized
  player data, and no private annotations are read
- **AND** the MCP view uses the shared numbered paginator, discovers intervening opaque cursors for direct jumps, and
  preserves the current page on failure
- **AND** the single search field offers debounced name-only autocomplete through the host, supports keyboard selection,
  and submits filtering on Enter/Search
- **AND** every selected Topic appears under Topics to share this chat with using the shared TagPill padding and shadow,
  synchronized immediately with checkbox checks, unchecks, and pill removal
- **AND** both footer actions use standard Button size and padding, with Start a new topic for this chat available on
  every page/search and Send this chat to N topics reflecting the selected count
- **AND** outlined Send comes before the highlighted new-Topic Button in reading and keyboard order, with no extra
  hidden-audio gap below the footer
- **AND** the site mug and CarlNotes brand open the connected site through the host in a new tab
- **AND** loading replaces only the dynamic results/paginator without changing MCP view height, keeping the header,
  search, selected pills, and footer visible
- **AND** the footer and long labels fit narrow screens without horizontal overflow

#### Scenario: One click sends every checked Topic
- **WHEN** the user chooses Send with one to twenty checked editable Topics
- **THEN** the MCP view calls `send_to_topic` once through `callMcpViewTool` with every checked ID and one stable retry
  ID
- **AND** a double-click makes no second concurrent call, and a lost-response retry reuses the same ID
- **AND** the result shows every accepted destination, or an accurate refusal

#### Scenario: A new Topic requires explicit confirmation
- **WHEN** the user chooses Start a new topic for this chat on any page or search
- **THEN** the existing source suggestion and Topic Draft flow previews a private Topic under existing limits
- **AND** confirming the exact edited draft creates the Topic and saves this chat once to that Topic. A failed save
  retries against the same created Topic.

#### Scenario: Bound and text-only clients
- **WHEN** the MCP view runs on a Topic-bound connection
- **THEN** only the bound Topic can be checked, and actions requiring another Topic point to the account-wide connection
- **WHEN** the host cannot render an MCP view
- **THEN** the same editable Topics appear as a numbered text list with best matches, cursor, and a new-Topic offer on
  every page

### Requirement: Suggestion MCP view stories cover the routing sequence

The component browser SHALL provide default, searched, page 2, and sent stories for the suggestion MCP view. Each SHALL
open in its named state using synthetic data and the existing host-tool bridge mock. Existing error, empty, bound-route,
and long-title coverage SHALL remain.

#### Scenario: Default suggestions are previewed
- **WHEN** the default story opens
- **THEN** it shows ranked best-match checkboxes, live selected Topic pills and the new-Topic and Send controls without
  triggering a write

#### Scenario: Search results are previewed
- **WHEN** the searched story opens
- **THEN** the submitted query and filtered matches are visible, including preserved off-page selections

#### Scenario: The second page is previewed
- **WHEN** the page 2 story opens
- **THEN** it shows the second cursor page, the correct page indicator, navigation, and selections retained from page 1

#### Scenario: A completed send is previewed
- **WHEN** the sent story opens
- **THEN** it shows all accepted destinations and their confirmations without an enabled duplicate-send action
- **AND** interactive evidence verifies one host send call for the complete checked set

#### Scenario: Autocomplete and selection updates are previewed
- **WHEN** the Autocomplete, SelectionSynced, or Loading story opens
- **THEN** it demonstrates the corresponding keyboard/pointer name choices, bidirectional checkbox/pill state, or
  results-only loading with stable surrounding content

### Requirement: MCP view links work independently of the document base

MCP views SHALL resolve relative links against their explicit connected site URL, without an HTML base element. Links SHALL use the MCP Apps host bridge. Host refusal, disconnection, or failure SHALL show a useful error and SHALL never trigger a sandbox-policy bypass. Preferred resource versions SHALL change when a cached bundle must be replaced.

#### Scenario: A sandbox blocks page base URLs
- **WHEN** the host document has an opaque origin and refuses an HTML base
- **THEN** relative Topic and CarlNotes links resolve against the connected site, and absolute article URLs remain unchanged

#### Scenario: A send is retried after review or deletion
- **WHEN** an accepted send is revisited after its links are reviewed or its entry is deleted
- **THEN** its MCP view does not present those links as waiting for another brew

### Requirement: The picker preserves private conversation references

An optional validated conversation URL SHALL survive suggestion paging, search, selection, confirmed Topic creation, and the final send. It SHALL remain outside matching prompts, embeddings, public candidate queues and result summaries. Stored references SHALL stay encrypted and sender-only. A missing reference SHALL never cause an invented URL or automatic share publication.

#### Scenario: A chat with a reference is sent through the picker
- **WHEN** the host supplies a valid conversation URL and the sender confirms destinations
- **THEN** the single send preserves that reference in every destination
- **AND** the shared AI sender label is a Nightshift link with the launch icon on web and mobile

#### Scenario: The host supplies no reference
- **WHEN** the same flow has no conversation URL
- **THEN** the send succeeds with a plain sender label and no fabricated backlink

### Requirement: One shell holds every MCP view

Every MCP view SHALL render inside one shell with a slim brand bar. The bar SHALL hold the mug and CarlNotes, which open
the site through the host, and a back button once the MCP view has moved. An MCP view has no browser back, so the back
button SHALL be its only way to return.

#### Scenario: An MCP view opens with nothing to go back to

- **WHEN** an MCP view opens from a tool result
- **THEN** the brand bar shows the mug and CarlNotes and no back button

#### Scenario: The brand link opens the site

- **WHEN** a user clicks the brand in any MCP view
- **THEN** the host opens the site's home page

### Requirement: Each MCP view opens at its own route

Each MCP view SHALL have one route in a memory router: `/search`, `/topic`, `/findings/:topicId`, `/send`,
`/updates`, and `/brew/:topicId`. The initial route SHALL come from the MCP view name in the html and, where the route
has a Topic, from the tool result. Every version of a UI resource SHALL open on these routes.

#### Scenario: The html picks the route

- **WHEN** a host loads `ui://carlnotes/findings.html` and sends a `read_topic_feed` result
- **THEN** the MCP view opens at `/findings/` with that result's Topic

#### Scenario: An older alias opens the current route

- **WHEN** a host reads an unversioned alias of a UI resource
- **THEN** the MCP view opens on the same route as the preferred version

### Requirement: In-view navigation goes one hop

An MCP view SHALL move at most one hop from the route it opened on: an updates row to its Topic's findings, a
finished Scan to its Topic's findings, and a sent checklist to the Topic it went to. Any link past that hop SHALL open
on the site through the host. The hop's data SHALL come from a tool call.

#### Scenario: An updates row opens its Topic

- **WHEN** a user clicks a row's Topic in the updates MCP view
- **THEN** the host calls `read_topic_feed` for that Topic, the MCP view moves to its findings, and back returns to the
  list without another tool call

#### Scenario: A second hop leaves the MCP view

- **WHEN** a user on that findings route clicks another Topic link
- **THEN** the host opens the Topic's page on the site and the MCP view stays where it is

### Requirement: A path outside the MCP view routes opens on the site

A shared component that navigates to a path no MCP view route holds SHALL open that path on the site through the host,
and the MCP view SHALL stay on its route.

#### Scenario: A plan limit links to Plans

- **WHEN** a control in an MCP view navigates to `/plans`
- **THEN** the host opens `/plans` on the site, which keeps upgrades out of the host

### Requirement: The brand link and the back button are shared components

The site header and the MCP view shell SHALL render one brand link component, and the back button SHALL be one reusable
component. Both, and every other new reusable component, SHALL appear in the Nightshift inventory with a story.

#### Scenario: The inventory lists the new components

- **WHEN** a reader opens the Nightshift inventory
- **THEN** the brand link and the back button each appear with a story

### Requirement: MCP views follow the host's theme

An MCP view SHALL read the host's color scheme, colors, and radii through the host's CSS variables, with Nightshift's
values as fallbacks in both palettes. Host variables that would change Nightshift's fonts or font weights SHALL NOT
apply.

#### Scenario: A host sends its colors

- **WHEN** a host sends a background and a text color
- **THEN** the MCP view's surfaces and text use them

#### Scenario: A host sends no variables

- **WHEN** a host sends only a dark color scheme
- **THEN** the MCP view renders in the Dark roast palette

### Requirement: MCP views fit narrow containers

MCP view layouts SHALL respond to the host's container width, never the device's. On a narrow container a table SHALL
keep its title and controls in view, move other columns into the row's expanded details, and show no horizontal page
scroll.

#### Scenario: A mobile host

- **WHEN** a findings MCP view renders at a container width of 320 pixels
- **THEN** every row's title and controls show, its source and date show on expanding it, and the page does not scroll
  sideways

### Requirement: MCP views ask for display modes the host offers

Tables SHALL offer fullscreen and the podcast player SHALL offer picture-in-picture, each only if the host lists that
mode, and each only on a user's click. The host SHALL decide the mode, and an MCP view SHALL render correctly in
whichever mode it returns.

#### Scenario: A host with fullscreen

- **WHEN** a user clicks fullscreen on a table in a host that lists it
- **THEN** the MCP view asks for fullscreen and lays out for the mode the host returns

#### Scenario: A host without fullscreen

- **WHEN** a host lists only inline
- **THEN** no fullscreen control shows

### Requirement: The brand bar shows more only in fullscreen

In fullscreen the brand bar SHALL add the route's title and a link to the same page on the site. Inline it SHALL show
only the brand, the back button, and the display mode buttons that the route offers.

#### Scenario: A fullscreen findings table

- **WHEN** the findings MCP view is fullscreen
- **THEN** the brand bar shows the Topic's name and a link that opens the Topic's page on the site

#### Scenario: A fullscreen updates list

- **WHEN** the updates MCP view is fullscreen
- **THEN** the brand bar shows the list's heading and a link that opens the page of its more link

### Requirement: The updates MCP view shows the list

The updates MCP view SHALL show the opener, each Finding with its Topic and reading time, and the more link in one card,
from the `read_updates` result. Each Finding SHALL be a row of the findings table, with its favicon, source, date,
chapter pill, notes, and controls. The rows' Topics and podcast episodes SHALL reach the MCP view in its data. The more
link SHALL open on the site. An empty list SHALL show the empty state.

#### Scenario: The list renders

- **WHEN** a host renders a `read_updates` result
- **THEN** the MCP view shows the opener, the rows in ranked order, and the more link, and makes no tool call on load

#### Scenario: A list with no opener

- **WHEN** the result has no opener
- **THEN** the rows render with nothing in the opener's place

### Requirement: The scan MCP view shows a Scan's progress and per-Source results

The scan MCP view SHALL show the Topic's current Scan or, with none running, its latest recap. A running Scan SHALL show
the topic page's running heading, what it has kept so far, and each Source's found count in the Source results chart's
rows. It SHALL read `read_scan_status` every 10 seconds for two minutes and every 30 seconds after that, and a rate
limited call SHALL wait for the next poll.

#### Scenario: A Scan moves through its stages

- **WHEN** a Scan the MCP view is polling moves from waiting to gathering to reviewing
- **THEN** the MCP view shows what it has kept so far, and each Source's found count once gathering ends

#### Scenario: A poll is rate limited

- **WHEN** a `read_scan_status` call fails with a rate limit
- **THEN** the MCP view keeps its last state and polls again on schedule

#### Scenario: Nothing has run

- **WHEN** the Topic has no Scan
- **THEN** the MCP view shows the empty state

### Requirement: The scan MCP view offers stop to who may stop

A running Scan SHALL show a stop control only to a caller who may stop it. Stopping SHALL call `stop_scan`, and the MCP
view SHALL then show that the Scan stopped, with its kept count.

#### Scenario: The owner stops a Scan

- **WHEN** the Topic's owner clicks stop in the scan MCP view
- **THEN** the host calls `stop_scan`, polling ends, and the MCP view shows the stopped state

#### Scenario: A reader who may not stop

- **WHEN** a follower of a public Topic watches its Scan
- **THEN** no stop control shows

### Requirement: The scan MCP view ends on the recap

A finished Scan SHALL show the same recap the topic page's note shows, with its Source results chart and summary, and a
control that moves to its Topic's findings. Costs and failure reasons SHALL show only to callers the topic page shows
them to.

#### Scenario: A Scan succeeds

- **WHEN** a Scan the MCP view is polling succeeds
- **THEN** the MCP view shows the recap and a control to its Topic's findings

#### Scenario: A follower reads a recap

- **WHEN** a follower reads a recap in the scan MCP view
- **THEN** the chart shows no cost and no failure reason

### Requirement: The scan recap plays its Podcast Episode

A Scan started over MCP SHALL render its Podcast Episode like any other Scan. The recap SHALL show that Podcast
Episode's state and play it through the MCP view's one podcast player. If the host blocks the audio, the MCP view SHALL
show the link to the Podcast Episode's page that the findings MCP view shows.

#### Scenario: The Podcast Episode publishes while the MCP view is open

- **WHEN** a Scan has succeeded and its Podcast Episode is recording
- **THEN** the recap shows that it is recording, keeps polling, and shows a play control once it publishes

#### Scenario: The recap plays the Podcast Episode

- **WHEN** a user clicks play on a recap's Podcast Episode
- **THEN** it plays through the MCP view podcast player with a signed play token

#### Scenario: The host blocks audio

- **WHEN** the host's frame blocks the audio, or the token has expired
- **THEN** the MCP view shows a link that opens the Podcast Episode's page in place of the player

#### Scenario: The Topic has no Podcast Episode for this Scan

- **WHEN** the Topic's podcast is off, or the Podcast Episode failed
- **THEN** the recap shows no play control, and polling ends

#### Scenario: A host without UI

- **WHEN** a client that renders no MCP view reads a finished Scan
- **THEN** its text names the Podcast Episode's state and, once published, the link to its page

### Requirement: A stored version serves its own bundle

The api SHALL serve each MCP view version named in the version manifest from that version's stored bundle, so a host
locked to it keeps the MCP view it was reviewed with. The current version SHALL always be newer than every stored one. A
stored bundle that cannot be read SHALL fall back to the current bundle and report the failure.

#### Scenario: A locked host reads its version

- **GIVEN** version 9 is stored and the current version is newer
- **WHEN** a client reads `ui://carlnotes/findings.html?v=9`
- **THEN** it receives version 9's own script and stylesheet

#### Scenario: The current URI serves the current build

- **WHEN** a client reads the current version's URI
- **THEN** it receives the bundle built with the running api

#### Scenario: A stored bundle is missing

- **WHEN** a stored version's files cannot be read
- **THEN** the read returns the current bundle, the failure is reported, and no tool is affected

#### Scenario: An MCP view newer than a version

- **WHEN** a client lists resources
- **THEN** a stored version lists only the MCP views that version holds

### Requirement: Results stay readable to stored bundles

A tool result's `structuredContent` and MCP view metadata SHALL only gain fields, so a stored bundle can read a newer
server's results. The metadata key SHALL stay `carlnotes/card`.

#### Scenario: A stored bundle reads a new result

- **WHEN** a host locked to version 9 receives a `read_topic_feed` result that holds annotations and cursors
- **THEN** the stored bundle renders the fields it knows and ignores the rest

### Requirement: The findings MCP view shows a Finding's reactions

The findings MCP view SHALL show, in a Finding's expanded details, the same reaction row the web shows: the six
types, each with its count, and the caller's own marked. A press on a type SHALL call `save_reaction` through the
host, and the row SHALL show the result. The view SHALL mount no comment thread. The view SHALL have a story with
reactions and one with none.

#### Scenario: A Finding's reactions show in the view

- **WHEN** a host renders the findings MCP view from a feed result whose Finding has reactions
- **THEN** the expanded Finding shows the counts

#### Scenario: A press on a type calls the tool

- **WHEN** a connected user presses a type in the view
- **THEN** the view calls `save_reaction` with that Finding and type, and the count rises by one

#### Scenario: A visitor's press opens the site

- **WHEN** a user with no connected account presses a type in the view
- **THEN** the view opens the site's sign-up link through the host and saves nothing
