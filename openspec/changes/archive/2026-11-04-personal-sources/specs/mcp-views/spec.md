## RENAMED Requirements

- FROM: `### Requirement: Five tools name an MCP view through the MCP Apps extension`
- TO: `### Requirement: Seven tools name an MCP view through the MCP Apps extension`

## MODIFIED Requirements

### Requirement: Seven tools name an MCP view through the MCP Apps extension

The MCP server SHALL register four MCP view kinds through `@modelcontextprotocol/ext-apps`, each of type
`text/html;profile=mcp-app`: `ui://carlnotes/search.html`, `ui://carlnotes/topic.html`, and
`ui://carlnotes/findings.html`, and `ui://carlnotes/suggest-topics.html`. `search` SHALL name the search MCP view, `edit_topic`, `create_topic`, and `send_to_topic` the topic MCP view, and
`read_topic_feed` and `search_topic_findings` the findings MCP view, and `suggest_topics` the suggestion MCP view, in `_meta.ui.resourceUri`. No other tool SHALL name a
MCP view. Preferred UI resource URIs append `?v=9`. Unversioned aliases and versions two through eight remain readable for cached connections. Every tool, with an MCP view or without, SHALL return its full structured result and a readable text summary, so a
client that renders no MCP view reads the same result it reads today.

#### Scenario: A client lists the UI resources

- **WHEN** a client lists the server's resources
- **THEN** it receives the four preferred versioned UI resources and their unversioned aliases, each of type `text/html;profile=mcp-app`

#### Scenario: A tool names its MCP view

- **WHEN** a client lists tools
- **THEN** `search` names `ui://carlnotes/search.html`, `edit_topic`, `create_topic`, and `send_to_topic` name
  `ui://carlnotes/topic.html`, `read_topic_feed` and `search_topic_findings` name `ui://carlnotes/findings.html`,
  and `suggest_topics` names `ui://carlnotes/suggest-topics.html`

#### Scenario: A client without MCP views reads the same result

- **WHEN** a client that renders no MCP view calls each tool that names an MCP view
- **THEN** each result has its structured content and its text summary, the same with or without the UI resource
  registered


## ADDED Requirements

### Requirement: The topic MCP view confirms accepted Personal sources content

The topic MCP view SHALL render send outcomes without another MCP view kind. Acceptance SHALL show one confirmation with its title in bold, the destination count, linked Topics, and numbered next-brew links. Links SHALL come from bounded, sender-authorized MCP view-only metadata. Refusals SHALL not claim that anything was saved.

#### Scenario: A send succeeds
- **WHEN** `send_to_topic` returns an accepted entry
- **THEN** each linked Topic has “Links for next brew” and a flush numbered list of this send’s live queued candidates
- **AND** candidates use stored page titles or full-URL fallback, safe truncation, Nightshift styling, and launch icons
- **AND** receipt metadata excludes transcripts and private chat references
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

The suggestion MCP view SHALL use the existing MCP Apps bundle and host bridge to list all editable Topics by relevance. Strong best matches SHALL start checked; weaker editable Topics SHALL remain unchecked. Search SHALL filter names, and the shared paginator SHALL follow tool cursors. Private send content SHALL stay in host arguments. The MCP view SHALL make no direct API requests.

#### Scenario: Best matches and manual choices
- **WHEN** the MCP view opens with relevant editable matches
- **THEN** up to three matches within 0.02 of the highest editable score start checked, in ranked order
- **AND** no send, follow, draft, or creation occurs until the user chooses the respective action

#### Scenario: Search and pagination retain selection
- **WHEN** the user searches editable Topic names or moves through tool cursors
- **THEN** every prior choice remains selected or unselected, including choices on other pages
- **AND** selected Topic names remain visible before sending
- **AND** search retains the strong-match recommendation floor and lists five editable Topics per page without public discovery

#### Scenario: Topic picker metadata and layout
- **WHEN** the user opens matching suggestions
- **THEN** editable rows reuse the standard Topic search-result layout, title, viewer/follower metadata, and authorized podcast pill, with a checkbox replacing the rank and kind icon and a Best match pill at the right
- **AND** display metadata uses bounded current-page reads, podcast playback uses the existing MCP view-only tokenized player data, and no private annotations are read
- **AND** the MCP view uses the shared numbered paginator, discovers intervening opaque cursors for direct jumps, and preserves the current page on failure
- **AND** the single search field offers debounced name-only autocomplete through the host, supports keyboard selection, and submits filtering on Enter/Search
- **AND** every selected Topic appears under Topics to share this chat with using the shared TagPill padding and shadow, synchronized immediately with checkbox checks, unchecks, and pill removal
- **AND** both footer actions use standard Button size and padding, with Start a new topic for this chat available on every page/search and Send this chat to N topics reflecting the selected count
- **AND** outlined Send comes before the highlighted new-Topic Button in reading and keyboard order, with no extra hidden-audio gap below the footer
- **AND** the site mug and CarlNotes brand open the connected site through the host in a new tab
- **AND** loading replaces only the dynamic results/paginator without changing MCP view height, keeping the header, search, selected pills, and footer visible
- **AND** the footer and long labels fit narrow screens without horizontal overflow

#### Scenario: One click sends every checked Topic
- **WHEN** the user chooses Send with one to twenty checked editable Topics
- **THEN** the MCP view calls `send_to_topic` once through `callMcpViewTool` with every checked ID and one stable retry ID
- **AND** a double-click makes no second concurrent call, and a lost-response retry reuses the same ID
- **AND** the result shows every accepted destination, or an accurate refusal

#### Scenario: A new Topic requires explicit confirmation
- **WHEN** the user chooses Start a new topic for this chat on any page or search
- **THEN** the existing source suggestion and Topic Draft flow previews a private Topic under existing limits
- **AND** confirming the exact edited draft creates the Topic and saves this chat once to that Topic. A failed save retries against the same created Topic.

#### Scenario: Bound and text-only clients
- **WHEN** the MCP view runs on a Topic-bound connection
- **THEN** only the bound Topic can be checked, and actions requiring another Topic point to the account-wide connection
- **WHEN** the host cannot render an MCP view
- **THEN** the same editable Topics appear as a numbered text list with best matches, cursor, and a new-Topic offer on every page

### Requirement: Suggestion MCP view stories cover the routing sequence

The component browser SHALL provide default, searched, page 2, and sent stories for the suggestion MCP view. Each SHALL open in its named state using synthetic data and the existing host-tool bridge mock. Existing error, empty, bound-route, and long-title coverage SHALL remain.

#### Scenario: Default suggestions are previewed
- **WHEN** the default story opens
- **THEN** it shows ranked best-match checkboxes, live selected Topic pills and the new-Topic and Send controls without triggering a write

#### Scenario: Search results are previewed
- **WHEN** the searched story opens
- **THEN** the submitted query and filtered matches are visible, including preserved off-page selections

#### Scenario: The second page is previewed
- **WHEN** the page 2 story opens
- **THEN** it shows the second cursor page, the correct page indicator, navigation, and selections retained from page 1

#### Scenario: A completed send is previewed
- **WHEN** the sent story opens
- **THEN** it shows all accepted destinations and their receipts without an enabled duplicate-send action
- **AND** interactive evidence verifies one host send call for the complete checked set


#### Scenario: Autocomplete and selection updates are previewed
- **WHEN** the Autocomplete, SelectionSynced, or Loading story opens
- **THEN** it demonstrates the corresponding keyboard/pointer name choices, bidirectional checkbox/pill state, or results-only loading with stable surrounding content

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
