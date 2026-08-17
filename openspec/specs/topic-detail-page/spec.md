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
Beside the History list (top-aligned with it, not with Findings), a single info card SHALL show, separated by thin dashed rules: Carl's Notes (the latest succeeded Scan's recap, when one exists); Carl's Prompt; Sources; Attachments as links where a url opens its page and a file downloads for the owner only; Schedule as the frequency, a muted "last scan" age, and how long that scan took; Visibility with its glyph (🔒 private, 🌐 public, ✉ invite); and, for the owner or an admin, this calendar month's total scan spend. The Sources section SHALL lead with one line per kind in the shared default-Source registry — today Carl's built-in web scout (the search Source, whose ingester derives queries from the topic prompt), labeled `web` — each shown as on or muted off, followed by one line per custom Source with a type glyph, its kind, and a config summary (feed host, subreddit, channel/playlist id, or a podcast's podcast id).

Carl's Notes, and the same recap wherever the scan-history and activity drill-downs render it, SHALL render through the sanitized markdown subset `injection-defense` requires: bold, lists, and headings render, a citation of a kept Finding's stored url renders as a real link, and every other link, image, or piece of raw HTML is neutralized into inert text — because a model wrote it from attacker-reachable content. A recap citing an item pruned since (or shown on a surface without the findings in hand, like the Activity drill-down) renders that citation inert rather than guessing.

#### Scenario: The info card renders every section
- **WHEN** the owner views a Topic with sources and a finished Scan
- **THEN** the card shows Carl's notes, the prompt, one line per registered default source plus per-custom-source kind + summary lines, the schedule with its last-scan age and duration, and the visibility glyph

#### Scenario: A topic without a search source shows the scout as off
- **WHEN** the user views a Topic that has no search Source
- **THEN** the Sources section still leads with the web scout line, muted and marked off

#### Scenario: A podcast source is listed as a custom one
- **WHEN** the user views a Topic carrying a `podcast` Source
- **THEN** it renders in the custom list with its own glyph and its show's podcast id, not in the default group

#### Scenario: Carl's notes link only to kept findings
- **WHEN** the latest Scan's recap cites a kept Finding's url and also contains a link elsewhere or HTML syntax
- **THEN** the kept citation renders as a real link, everything else shows as inert text with no clickable link and no embedded markup, and the recap's bold and lists still render

#### Scenario: A topic without a search source shows the web search as off
- **WHEN** the user views a Topic that has no search Source
- **THEN** the Sources section still leads with the web search line, muted and marked off

#### Scenario: A Google News source reads as its publisher
- **WHEN** the user views a Topic holding a Google News Source
- **THEN** it is listed among the custom Sources summarized by the publisher it covers, not by `news.google.com`

#### Scenario: A topic missing a default source shows it as off
- **WHEN** the user views a Topic that has no Source of a preselected kind
- **THEN** the Sources section still leads with that kind's line, muted and marked off

#### Scenario: A Bluesky account source shows its handle
- **WHEN** the user views a Topic with a bluesky Source
- **THEN** that custom source line summarizes it as the account's `@handle`

### Requirement: Access to the page follows Topic visibility

The topic page payload SHALL be served to the owner always, to an admin for any Topic (the single platform override, so an admin can open any Topic to edit or delete it), to anyone for public Topics, and for invite Topics only to users whose account email is invited or who already subscribe. Private Topics SHALL be served only to the owner or an admin. Access SHALL be decided through `isAllowed(user, "topic:view", topic)`.

A request for a Topic that exists but is not visible to the caller SHALL be told how it is gated (`invite` or `private`), plus the Topic's name when the gate is `invite` — its owner hands that link out knowingly — and nothing else. A `private` answer SHALL reveal neither name, owner, nor content, since a private Topic's name alone can tell a stranger what its owner watches. A request naming a Topic id that matches no row SHALL get a bare not-found answer.

#### Scenario: An uninvited user cannot open an invite topic

- **WHEN** a signed-in user who is neither invited nor subscribed requests an invite Topic
- **THEN** the api answers that the Topic is gated as `invite`, and the page offers a way in rather than the Topic itself

#### Scenario: An admin can open any topic

- **WHEN** an admin requests a private Topic they do not own
- **THEN** the api serves the payload so the admin can edit or delete it

#### Scenario: A nonexistent topic reveals nothing

- **WHEN** a request names a Topic id that matches no row
- **THEN** the api answers not-found, the same answer a gated Topic's id would never give

### Requirement: The bell toggles this user's Subscription
The 🔔 bell SHALL toggle a Subscription for the current user through the api, rendering filled when subscribed and outline when not. Subscribing SHALL be permitted on public Topics for anyone and on invite Topics for invited users — where subscribing IS accepting the invite, activating the subscription from that moment and carrying the same next-scan disclaimer as the Activity page's accept control. The api SHALL reject subscription writes on private Topics.

#### Scenario: Subscribing persists
- **WHEN** a non-owner activates the bell on a public Topic and reloads
- **THEN** the bell renders filled and a Subscription row exists for that user

#### Scenario: The bell accepts an invite
- **WHEN** an invited user activates the bell on an invite Topic
- **THEN** their pending invite becomes an active subscription, and the next-scan expectation is shown

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

### Requirement: The info card shows the Max results row
The topic info card SHALL show a "Max results" row rendering "Carl's top {max_results}" through the same shared info component its other rows use, with wording identical to the edit-topic modal's select.

#### Scenario: The row reflects the stored value
- **WHEN** a topic with `max_results` 15 renders its info card
- **THEN** a "Max results" row reads "Carl's top 15"

### Requirement: The topic page carries the same filter and sort as the feed
The topic page SHALL honor the same All / Unread / Bookmarked view — set through the shared search bar's Filters menu — and offer the same "Sort" menu (relevant / newest / trending) as the homepage feed, with the pinned bookmark group above the auto-kept Findings in every mode.

#### Scenario: The topic page sorts and filters like the feed
- **WHEN** a user switches the sort or filter on a topic page
- **THEN** the findings section behaves exactly as the homepage feed does for that mode

### Requirement: The topic page carries a docked Coffee Talk panel with three states
The topic page SHALL carry a chat panel labeled "Coffee Talk", docked bottom-right, in one of three states: collapsed to a pill, open, or enlarged to full screen. An empty conversation SHALL open by default on wide screens as the invitation to talk, and SHALL start at the collapsed pill on narrow screens, where the open panel would take the whole page. Once the conversation holds any exchange, every page load SHALL start at the pill, so a return visit gets the page and summons Carl on demand. The collapsed and open states SHALL NOT dim the page behind them, so the Findings a reply cites stay readable; only the enlarged state SHALL dim, since it occupies the page.

#### Scenario: The panel opens by default on a wide screen
- **WHEN** a user loads a topic page they may chat about on a wide screen, with no conversation yet
- **THEN** the Coffee Talk panel is docked bottom-right in its open state, with no page scrim

#### Scenario: An existing conversation starts at the pill
- **WHEN** a user loads a topic page where their conversation already holds an exchange
- **THEN** the panel starts as the collapsed pill on any screen size

#### Scenario: A narrow screen starts at the pill
- **WHEN** a user loads a topic page they may chat about on a narrow screen
- **THEN** the panel starts as the collapsed pill and opens on tap

#### Scenario: Collapsing leaves a pill and a fully usable page
- **WHEN** the user collapses the panel
- **THEN** it becomes a labeled pill bottom-right, the page is undimmed, and nothing on the page is obscured

#### Scenario: Enlarging fills the screen
- **WHEN** the user enlarges the panel
- **THEN** it fills the screen and the page behind it is dimmed

### Requirement: The message list grows to a maximum height and then scrolls
The open panel's message list SHALL start short and grow with the conversation up to a maximum height, after which it SHALL scroll internally rather than growing further.

#### Scenario: A short conversation renders short
- **WHEN** a conversation has one or two turns
- **THEN** the message list occupies only the height its messages need

#### Scenario: A long conversation scrolls internally
- **WHEN** a conversation's messages exceed the panel's maximum height
- **THEN** the panel keeps that height and the message list scrolls inside it

### Requirement: The composer placeholder names the Topic
The composer input's placeholder SHALL read `Chat about <topic name>` using the Topic's name, and SHALL fall back to `Chat about this topic` when the name is missing.

#### Scenario: The placeholder interpolates the name
- **WHEN** the panel renders for a Topic named "AI startups worth applying to"
- **THEN** the composer placeholder reads "Chat about AI startups worth applying to"

#### Scenario: A missing name falls back
- **WHEN** the panel renders for a Topic with no name
- **THEN** the composer placeholder reads "Chat about this topic"

### Requirement: The composer keys read like a chat
The composer SHALL be multiline: Enter SHALL send the draft, Shift+Enter SHALL break a line, and the box SHALL grow with the draft to a cap before scrolling internally. A non-empty draft SHALL offer a clear control that wipes it and returns focus to the box, and the control SHALL hide while the draft is empty. Escape anywhere inside the panel SHALL collapse it to the pill, and the composer SHALL take focus when the panel opens.

#### Scenario: A draft clears from its own control
- **WHEN** a user with a non-empty draft clicks its clear control
- **THEN** the draft empties, focus returns to the composer, and the control hides

#### Scenario: Files attach from the paperclip or a paste
- **WHEN** a user picks files from the composer's attach control or pastes an image
- **THEN** each becomes a removable chip above the draft — a tiny thumbnail for an image, a named chip for text — until the send carries them

#### Scenario: A long paste folds into a chip
- **WHEN** a user pastes text past the chip threshold
- **THEN** the paste becomes a "Pasted text" chip with its size instead of filling the draft box

#### Scenario: Enter sends and Shift+Enter breaks a line
- **WHEN** the reader presses Enter with a non-empty draft
- **THEN** the turn sends, while Shift+Enter inserts a line break instead

#### Scenario: Escape collapses the panel
- **WHEN** the reader presses Escape with focus inside the panel
- **THEN** the panel collapses to its pill

#### Scenario: The composer takes focus on open
- **WHEN** the panel opens
- **THEN** the composer is focused and typing lands in it immediately

### Requirement: Replies render full Markdown with sanitized links
Replies SHALL render Markdown formatting — emphasis, lists, code, tables, and headings — rather than raw text. A Markdown link SHALL render as a live link only for `http` and `https` destinations, routed through the shared link component so an external destination opens in a new tab with `noopener`; any other scheme SHALL render as inert text. Raw HTML SHALL NOT parse, and an image SHALL NOT auto-load — it SHALL render as a link to itself, since an auto-fetched image URL is an exfiltration channel for injected instructions. Messages SHALL render as bubbles rounded on three corners with the corner nearest their speaker squared.

#### Scenario: Formatting renders
- **WHEN** a reply contains Markdown lists, emphasis, code, tables, or headings
- **THEN** the panel renders them as formatted elements, not as literal Markdown source

#### Scenario: A web link is live and sandboxed
- **WHEN** a reply links an `https` URL
- **THEN** the panel renders a clickable link that opens in a new tab with `noopener noreferrer`

#### Scenario: A script scheme renders inert
- **WHEN** a reply contains a link whose destination is not `http` or `https`
- **THEN** the panel renders the link's text with no clickable destination

#### Scenario: Raw HTML does not render as markup
- **WHEN** a reply contains raw HTML
- **THEN** the panel renders it as text rather than parsing it as markup

#### Scenario: An image never auto-loads
- **WHEN** a reply contains a Markdown image
- **THEN** the panel renders a link to the image rather than fetching it

#### Scenario: Bubbles distinguish speaker
- **WHEN** the message list holds both a sent question and a received reply
- **THEN** each bubble is rounded with one squared corner on its own speaker's side

### Requirement: Waiting and streaming states use the coffee mug and a shimmer
While a turn is awaiting its first token, the panel SHALL show the animated steaming coffee mug rather than a generic spinner. While reply text is streaming in, the incoming line SHALL carry a shimmer.

#### Scenario: Waiting shows the steaming mug
- **WHEN** a turn has been sent and no reply token has arrived
- **THEN** the panel shows the animated steaming coffee mug

#### Scenario: Streaming text shimmers
- **WHEN** reply text is arriving incrementally
- **THEN** the incoming line carries a shimmer until the reply completes

### Requirement: The panel surfaces rejections in place of replies
A turn rejected for budget SHALL show an upgrade prompt in the message list, never a silent failure or a generic error.

#### Scenario: A budget rejection prompts an upgrade
- **WHEN** a turn is rejected because the user's remaining monthly budget cannot cover it
- **THEN** the panel shows an upgrade prompt in place of a reply

### Requirement: A signed-out visitor's composer is a signup funnel
A signed-out visitor on a visible Topic SHALL see the panel and type freely into its composer, and sending — Enter or the arrow button — SHALL route to the signup page instead of posting a turn. The arrow SHALL stay enabled and SHALL show a "Sign up to chit-chat" tooltip on hover. No anonymous request SHALL be posted to the chat api.

#### Scenario: A visitor's send routes to signup
- **WHEN** a signed-out visitor types into the composer and presses Enter or the arrow
- **THEN** the app navigates to the signup page and no chat request is sent

#### Scenario: The visitor's arrow carries the signup tooltip
- **WHEN** a signed-out visitor hovers the enabled arrow button
- **THEN** a tooltip reads "Sign up to chit-chat"

### Requirement: The panel marks where word-for-word memory begins
When a conversation outgrows the verbatim character budget, the panel SHALL show a divider at the exchange where the model's word-for-word window starts, positioned by the same shared boundary walk the send uses. The copy SHALL be placement-relative so it stays true wherever the budget lands the boundary: "Carl has a lot on his mind. Everything above this line he skims, everything below he holds word for word." The line SHALL announce itself with a single shimmer sweep on render, then rest, honoring a reduced-motion preference by staying still. Exchanges above the divider SHALL still display and still ride to the model compacted, so the copy says skimmed rather than forgotten.

#### Scenario: A long conversation shows the memory line
- **WHEN** a conversation's exchanges outweigh the verbatim character budget
- **THEN** the divider sits at the boundary the shared walk computes, and older exchanges remain visible above it

#### Scenario: A short conversation shows no memory line
- **WHEN** a conversation fits inside the verbatim budget
- **THEN** no divider appears

### Requirement: Message footers offer copy and time on hover
Hovering a settled message on either side SHALL reveal a quiet footer: a copy control carrying a "Copy message" tooltip, and the turn's relative time. A reply's copy SHALL carry its raw Markdown, and a question's its text.

#### Scenario: A reply's footer shows copy and time
- **WHEN** the reader hovers a settled reply
- **THEN** a copy control with a "Copy message" tooltip and a relative time like "2 minutes ago" appear

#### Scenario: The reader's own message has the same footer
- **WHEN** the reader hovers one of their own messages
- **THEN** the same copy control and relative time appear

### Requirement: A gated topic's page offers a way in instead of a dead end

When a reader may not view a Topic, the topic page SHALL keep its own loading skeleton behind a notice naming how the Topic is gated (invite-only or private), so a pasted link never looks broken. The notice SHALL NOT dismiss into an empty page: closing it SHALL navigate to the homepage instead.

An invite Topic's name SHALL show in the page's own title position behind the notice, dimmed like a page almost there, while the notice itself stays generic — the gate reads like the invitation that linked there, and its owner hands the link out knowingly. A private Topic's name SHALL NOT appear anywhere on the gated page, and the gated api answer SHALL NOT include it, since a private Topic's name alone can tell a stranger what its owner watches.

The invite gate's Sign up action SHALL carry a signup attribution tag: the `src` marker stamped on the invitation email's link when the reader arrived through one, and the gate's own tag otherwise, so `signup_completed` counts what converted.

A signed-out reader SHALL be offered a way in as the notice's action buttons, each carrying a return path back to the Topic, so completing one lands the reader back where they started. On an invite Topic the lead says to sign up and Sign up is the primary action, since the invitation email probably reached somebody new — with Log in beside it as the quiet secondary, because the invited address may already belong to an account the reader is not signed into. On a private Topic the only action SHALL be Log in, since only its owner can ever see it and a fresh account offers no way in. The notice SHALL NOT carry a close button or any action that merely leaves, beyond closing it.

A signed-in reader who lacks access SHALL NOT be offered to log in, since that is not what stands between them and the Topic. They SHALL instead be told to ask the Topic's owner.

#### Scenario: A signed-out reader can sign in and return to the topic

- **WHEN** a signed-out reader opens an invite or private Topic they are not shown
- **THEN** the notice's actions offer a way in — Sign up leading with Log in beside it on an invite Topic, Log in alone on a private one — each carrying a return path to the Topic

#### Scenario: A signed-in reader without access is told to ask the owner

- **WHEN** a signed-in reader who lacks access opens a gated Topic
- **THEN** the notice asks them to reach the owner, and offers no sign-in link

#### Scenario: Closing the notice never leaves an empty page

- **WHEN** a reader closes the gate notice
- **THEN** they land on the homepage rather than on the Topic page with nothing to show

### Requirement: The info card and popover number the findings under Carl's Top N

The topic info SHALL render the Topic's Findings as a numbered list under the scan note, in the info card and the info popover alike — the scan email's list in app form: the rank, the linked title, the host, and the model's relevance explanation at the note's own size. The explanations read inline there, where the findings feed keeps them behind a hover a phone does not have. The section SHALL be titled `Carl's Top N`, N the finding count, and fall back to `Carl's Notes` when the Topic has none.

In the card, Read more SHALL expand the note and its findings into the bounded scroll box the popover already uses, with Read less sitting just below the box, so the card keeps its height and collapsing never needs a page-scroll back. The popover SHALL show the same content in its scroll box outright.

The brew diary's popover SHALL list the findings its own scan produced the same way, under that scan's note — each finding carries its producing scan on the wire, so a diary never borrows another brew's findings. A diary whose findings are no longer among the topic's kept rows lists none.

#### Scenario: Expanding the card reveals the numbered findings

- **WHEN** a reader expands the info card's Read more on a Topic with Findings
- **THEN** the full note and the numbered finding list scroll together inside a bounded box, each entry linking its title and stating why Carl kept it, with Read less just below the box

#### Scenario: The popover carries the same list

- **WHEN** a reader opens the topic info popover on a Topic with Findings
- **THEN** its scroll box holds the note followed by the same numbered finding list, under the same Carl's Top N title

#### Scenario: A topic with no findings lists nothing

- **WHEN** the Topic has no Findings
- **THEN** the section stays titled Carl's Notes and renders the note alone, with no empty list under it

### Requirement: Every notes scroll box offers its content as Markdown for an AI

Each notes scroll box — Carl's Top N in the info card and popover, the brew diary popover, and the topic finding popover, on the topic page, the feed, the profile popup, and the Activity drill-down alike — SHALL show a copy control on hover or keyboard focus, tooltip `Copy Markdown for AI`. Clicking it SHALL put the box's content on the clipboard as Markdown: the topic title as a link to its page, the topic prompt where the surface has it, the note, and the numbered findings as Markdown links with their relevance explanations; a finding popover copies its finding's linked title and explanation. The control SHALL confirm as a checkmark reading copied, then offer to copy again.

#### Scenario: Copying the notes hands an AI the full context

- **WHEN** a reader clicks the copy control on Carl's Top N
- **THEN** the clipboard holds the linked topic title, the prompt, the note, and the numbered finding links, and the control confirms with a checkmark

#### Scenario: A finding copies as a link

- **WHEN** a reader copies from a topic finding popover
- **THEN** the clipboard's Markdown includes the finding's title and url as a Markdown link above its relevance explanation

