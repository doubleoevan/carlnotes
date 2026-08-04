## ADDED Requirements

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

### Requirement: The panel surfaces refusals in place of replies
A turn refused for budget SHALL show an upgrade prompt in the message list, never a silent failure or a generic error.

#### Scenario: A budget refusal prompts an upgrade
- **WHEN** a turn is refused because the user's remaining monthly budget cannot cover it
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
