# mobile-chat Specification

## Purpose
Let people use chat on mobile for private Topic conversations and Team rooms, with the web's behavior, shared chat logic, safe answers, and confirmed Topic edits.

## Requirements

### Requirement: Shared chat behavior preserves web compatibility

Web and mobile SHALL share portable chat behavior and reusable presentation composition. Native adaptations SHALL preserve web terminology, permissions, actions, icons, formatting, and Nightshift appearance except for the explicit mobile differences in this capability. Existing web chat behavior SHALL remain unchanged.

#### Scenario: A conversation is opened on either client
- **WHEN** the same person opens the same conversation on web and mobile
- **THEN** both clients read the same server history and permissions
- **AND** history selection, tool outcomes, proposed edits, and rejection wording follow the same rules
- **AND** mobile-specific layout and transport do not create a second chat backend

#### Scenario: Web-only workflows remain available
- **WHEN** this capability ships
- **THEN** web voice, attachments, new-topic chat, podcast chat, and pricing links retain their existing behavior

### Requirement: chat opens the appropriate native conversation

Mobile SHALL offer a shared bottom-right chat pill on every signed-in page, above the safe area. It SHALL open a full-screen conversation using the web's context rules, with private Topic fallback when no room is available. The selector SHALL preserve web labels, avatars, and selection states.

#### Scenario: The launcher would overlap another control
- **WHEN** chat or the keyboard is open
- **THEN** the launcher is hidden
- **AND** when visible, its reserved space keeps footer and note controls reachable

#### Scenario: A page has no Topic or Team context
- **WHEN** a person opens the global pill on Home, Profile, Teams, Activity, Account, or Plans
- **THEN** the web's default available room opens
- **AND** a person without rooms can choose private chat on a Topic from their Feed, or browse Topics if their Feed is empty
- **AND** deferred new-topic chat is not presented as available

#### Scenario: A Team holds the Topic
- **WHEN** a person opens chat on a Topic their Team holds
- **THEN** the same available room the web would select opens natively
- **AND** the person can switch to a private conversation about that Topic or another available room

#### Scenario: A person chooses another conversation
- **WHEN** the person opens the conversation selector
- **THEN** a full-width native sheet lists private chat first and available rooms alphabetically
- **AND** avatars, selected state, and the orange scroll indicator remain visible and usable

#### Scenario: chat opens from a Profile
- **WHEN** the person opens chat from a Profile page
- **THEN** the shared web rule prefers Topic rooms and the Teams shared with that Profile

#### Scenario: A Topic has no available Team room
- **WHEN** a person opens chat on that Topic
- **THEN** its private conversation opens natively

#### Scenario: The Team's own room is opened
- **WHEN** a person opens chat from a Team page
- **THEN** the Team's own room opens without inventing a Topic association

#### Scenario: A conversation is closed
- **WHEN** the person uses Close or native back
- **THEN** they return to the originating page without losing its reading position

### Requirement: Private answers stream and can be stopped

Mobile SHALL send private text turns through the existing authenticated chat API and render answer text as chunks arrive. It SHALL offer Stop while a request is active, prevent duplicate sends, and retain finished text and tool outcomes using the web's rules. It SHALL NOT automatically replay an interrupted send.

#### Scenario: An answer arrives incrementally
- **WHEN** Carl sends multiple answer chunks before the response ends
- **THEN** the person sees those chunks before completion
- **AND** Stop remains available until the request finishes or is stopped

#### Scenario: A partial answer is stopped
- **WHEN** the person stops after some text has arrived
- **THEN** the request is aborted and the partial answer remains without a failure notice

#### Scenario: Stop happens before answer text
- **WHEN** the person stops before any answer text arrives
- **THEN** an empty turn is removed unless it contains a tool outcome that the web retains

#### Scenario: A send fails
- **WHEN** a request fails after the person has submitted text
- **THEN** the same failure and retry behavior as web is available for the supported text turn
- **AND** retry does not duplicate the failed turn in Carl's retained history

### Requirement: Private history and clearing follow server results

Mobile SHALL load private conversation history, restore outstanding Topic edit previews, and preserve compacted tool history using the web's rules. Clearing SHALL require confirmation and SHALL remove local history only after the server accepts the clear. A failed load SHALL provide a recoverable error rather than an apparently empty conversation.

#### Scenario: History is reopened
- **WHEN** the person reopens an existing private conversation
- **THEN** its messages, attachment names, and outstanding edit preview are restored from the server

#### Scenario: Clear is cancelled or rejected
- **WHEN** the person cancels the clear confirmation or the server rejects the clear
- **THEN** existing messages remain visible

#### Scenario: Clear succeeds
- **WHEN** the person confirms and the server accepts the clear
- **THEN** the conversation shows the same cleared state as web

### Requirement: Room connections authenticate and resume safely

Mobile room messages SHALL load from the existing room API and update through its event stream. Connections SHALL carry the current session header, resume after the highest received message cursor, deduplicate replayed messages, and use bounded reconnect backoff. Authentication or access failure SHALL end the unauthorized connection rather than retry indefinitely.

#### Scenario: A connection drops
- **WHEN** a room connection drops after messages have arrived
- **THEN** reconnect requests messages after the highest received cursor
- **AND** duplicate or out-of-order deliveries do not duplicate messages or move the cursor backwards

#### Scenario: A connection becomes stale
- **WHEN** the stream stops delivering its expected activity without reporting an error
- **THEN** the client detects the stale connection and reconnects using the existing recovery policy

#### Scenario: Session or membership is no longer valid
- **WHEN** initial loading or reconnection reports an expired session or denied room access
- **THEN** the client applies the existing sign-in or access-denied behavior
- **AND** it does not keep an unauthorized stream open or expose another room's cached messages

### Requirement: Native lifecycle retires inactive requests

Mobile SHALL close room connections when backgrounded or closed and reopen the active room on return, reconciling history with the server. It SHALL abort private generation when leaving its conversation or backgrounding, retain received text, and reload server history on return. Switching accounts SHALL retire requests and in-memory conversation state from the former account.

#### Scenario: The app returns to the foreground
- **WHEN** the app returns with a room still selected
- **THEN** one authenticated connection resumes for that room
- **AND** server history reconciles messages deleted or cleared while the app was inactive

#### Scenario: A private answer is interrupted by backgrounding
- **WHEN** the app backgrounds while Carl is answering privately
- **THEN** the request is aborted without an automatic resend
- **AND** returning reloads the server's conversation before another send

#### Scenario: A late event belongs to another session
- **WHEN** a callback arrives after an account or conversation switch
- **THEN** it cannot update the selected conversation, its draft card, or its permissions

### Requirement: Rooms retain history and posting behavior

Mobile SHALL show room messages with authors, avatars, timestamps, and the web's supported message actions. Earlier messages SHALL load without losing reading position. A rejected post SHALL retain the person's text and reply selection. Carl SHALL answer according to the existing room addressing rules.

#### Scenario: Earlier messages are requested
- **WHEN** a person reaches older room history
- **THEN** another page loads without duplicate rows or an unexpected jump to the newest message

#### Scenario: A post is rejected
- **WHEN** a room post fails or Carl's requested reply is rejected
- **THEN** the person sees the appropriate feedback
- **AND** unaccepted composer text and reply selection are retained
- **AND** no unfinished Carl reply remains indefinitely

#### Scenario: A person addresses Carl
- **WHEN** a room message addresses Carl, addresses everyone, or replies to Carl under the existing room rules
- **THEN** the existing server decides whether Carl responds
- **AND** ordinary member messages do not start an additional private request

### Requirement: Rooms support mentions and replies

Typing an eligible @ mention SHALL offer Carl and the room's members using the web's matching rules. Selecting a suggestion SHALL insert the mention without losing surrounding text. Mobile SHALL support replying to a message, showing its quoted context, selecting the web's reply targets, and clearing a reply target.

#### Scenario: A mention is selected in the middle of text
- **WHEN** the person chooses a member suggestion
- **THEN** the selected mention replaces only the active mention query
- **AND** the remaining composer text is preserved

#### Scenario: A message is a reply
- **WHEN** a person selects Reply on a room message
- **THEN** the composer shows the selected target and can cancel it
- **AND** the posted message retains the parent reference and readable quoted context

#### Scenario: The reply target disappears
- **WHEN** a selected parent message is deleted or the person switches rooms
- **THEN** a stale reply selection cannot be sent to the new room

### Requirement: Room deletion and clearing preserve permissions

Mobile SHALL permit people to delete their own room messages and preserve the web's existing leader/admin moderation controls. Individual-message deletion SHALL follow the web action; clearing the room SHALL require confirmation. Local state SHALL change only after the server accepts the operation; rejected actions SHALL leave history intact.

#### Scenario: A person deletes their own message
- **WHEN** the person chooses Delete on a message they are allowed to delete
- **THEN** the existing delete API is called and accepted deletion refreshes the room

#### Scenario: An ordinary member views someone else's message
- **WHEN** the member lacks the web's moderation permission
- **THEN** controls for deleting that message or clearing the room are unavailable

#### Scenario: A moderator clears a room
- **WHEN** an authorized leader or administrator confirms clearing
- **THEN** the room clears only after server acceptance
- **AND** a rejected clear preserves the visible history

### Requirement: Opening a room acknowledges its mentions

Opening a room SHALL mark that room's mentions viewed through the existing API and shared room state. This acknowledgement SHALL NOT mark other rooms viewed or require broader live badge work.

#### Scenario: A room with unseen mentions is opened
- **WHEN** the person opens the room successfully
- **THEN** its mention acknowledgement is sent and its local unseen state is updated
- **AND** unseen mentions in other rooms remain unchanged

### Requirement: Answers use safe streaming Markdown

Carl's mobile answers SHALL render Markdown during streaming and after completion. Raw HTML SHALL remain visible as literal text. Only HTTP(S) links SHALL be actionable; unsafe destinations SHALL retain readable labels without navigation. Web and mobile SHALL share this link policy. The new-topic chat invitation SHALL be plain text on mobile until native new-topic chat exists.

#### Scenario: An answer contains hostile markup or links
- **WHEN** an answer includes raw HTML, script-like destinations, or non-HTTP(S) URLs
- **THEN** HTML is not interpreted, embedded content is not fetched, and unsafe links cannot be opened or previewed
- **AND** their readable text remains visible

#### Scenario: Safe links and images occur in an answer
- **WHEN** an answer contains a valid HTTP(S) link or Markdown image
- **THEN** the link is actionable and the image is represented as safe link text as on web
- **AND** the renderer does not load the image inline merely because it occurs in Markdown

#### Scenario: The answer invites the person to start another Topic
- **WHEN** the invitation phrase or its special new-topic chat link appears
- **THEN** mobile displays its text without an active new-topic action
- **AND** web retains its existing new-topic button

#### Scenario: Markup arrives in incomplete chunks
- **WHEN** a chunk ends within a link, code fence, HTML-like fragment, or table
- **THEN** partial content remains readable and inert
- **AND** completion cannot turn a rejected destination into an actionable link

### Requirement: Generated tables remain readable on a phone

Mobile chat tables SHALL follow the Mobile page's content rule: wide generated tables become cards per row with column labels instead of horizontal scrolling. Values, links, and row order SHALL be preserved. This adaptation SHALL NOT change the web's table layout or the mobile app's fixed-column domain tables. Both clients SHALL use Nightshift table colors in light and dark themes.

#### Scenario: A finished answer contains a wide table
- **WHEN** its columns cannot fit the current viewport and text size legibly
- **THEN** each row renders as a readable card with its header/value relationships intact
- **AND** no value requires horizontal scrolling to read

#### Scenario: A table is still streaming
- **WHEN** only part of a row has arrived
- **THEN** the partial row is not presented as a complete record
- **AND** completed rows remain readable while later rows arrive

### Requirement: Topic draft previews show the complete editable Topic

During a Topic edit, mobile SHALL show the web's draft card fields and ordering with Carl's proposal overlaid on the current Topic. Unchanged settings SHALL remain visible. Dismissing a preview SHALL follow the web's behavior and SHALL NOT save an edit. Missing or inaccessible Topic data SHALL NOT be replaced with an invented draft.

#### Scenario: Carl proposes changing one setting
- **WHEN** a proposal changes the prompt, schedule, Sources, or another editable setting
- **THEN** the card shows the proposed values alongside all applicable unchanged settings
- **AND** it preserves Name, Carl's Prompt, Tags, Frequency, Max findings, Podcast, Visibility, Team, Invites, and Sources in the web's order

#### Scenario: The proposal is dismissed
- **WHEN** the person dismisses the proposed edit
- **THEN** the card returns to the web's standing Topic view without applying a server mutation

### Requirement: Topic edits use server confirmation and refresh

Topic edit tools SHALL use the same server authorization and conversational confirmation as web. A proposed edit SHALL NOT be saved by local preview code. After a successful save, the card SHALL reload the authoritative Topic and show its current settings. In a room, another person's assent SHALL NOT confirm someone else's proposal.

#### Scenario: A person confirms Carl's proposal in chat
- **WHEN** the server accepts the authorized person's confirmation and saves the edit
- **THEN** mobile shows the save feedback, clears the preview, and refreshes the Topic and card

#### Scenario: A proposal is cancelled or a save is rejected
- **WHEN** Carl cancels the proposal or the server rejects the save
- **THEN** mobile applies the same preview and rejection behavior as web
- **AND** it does not claim the Topic changed

#### Scenario: Another room member answers yes
- **WHEN** that member is not the proposer authorized by the existing confirmation flow
- **THEN** the client does not apply the proposal or present it as saved on their behalf

### Requirement: Tool feedback remains visible

Every tool outcome the web exposes within supported text chat SHALL have equivalent mobile feedback. Save notices and save rejections SHALL remain notices; proposed edits SHALL remain draft cards; tool history SHALL retain the same meaning. Unsupported new-topic navigation SHALL produce clear feedback without opening an unavailable native flow.

#### Scenario: A tool saves or rejects a Topic change
- **WHEN** a tool outcome reports success or failure
- **THEN** the person sees the same outcome text and appropriate success or error styling
- **AND** a tool-only turn is not discarded merely because it has no answer text

#### Scenario: Carl requests the deferred new-topic flow
- **WHEN** a tool requests opening new-topic chat
- **THEN** mobile explains that this flow is available on web and remains in the current conversation
- **AND** it does not display a pricing link or fabricate a newly created Topic

### Requirement: Rejections retain Carl's wording without pricing links

Mobile SHALL reuse the web's budget, rate-limit, access, failure, and applicable Topic-limit wording in Carl's voice. It SHALL omit the plans link and any dependent pricing call to action. A Topic creation quota SHALL NOT prevent an otherwise permitted conversation about an existing Topic.

#### Scenario: Budget or rate limit rejects a reply
- **WHEN** the server reports budget exhaustion or rate limiting
- **THEN** mobile shows the corresponding shared rejection text without “Pick up more coffee” or a plans link

#### Scenario: Topic quota is reached
- **WHEN** the account has used its Topic allowance
- **THEN** the shared Topic-limit notice can explain the limit without a pricing link
- **AND** an existing Topic conversation remains available when its chat permissions and budget allow it

### Requirement: Deferred media stays outside native text chat

This capability SHALL expose no voice input, spoken answers, attachment upload/removal, podcast chat controls, or native new-topic chat. Existing attachments in history SHALL render as named chips. Unsupported media SHALL not prevent reading or continuing a supported text conversation.

#### Scenario: History includes attachments or spoken content
- **WHEN** that conversation opens on mobile
- **THEN** available message text remains readable and attachment names appear as chips
- **AND** mobile does not offer unsupported upload, recording, or playback controls

### Requirement: Conversation layout is accessible and consistent

Mobile SHALL use Nightshift tokens and matching icons in light and dark themes, keep the composer above the keyboard, and preserve reading position when new content arrives away from the end. Controls SHALL meet the mobile accessibility bar, support text scaling and reduced motion, and identify actions and authors to assistive technology.

#### Scenario: The keyboard opens on a small phone
- **WHEN** the person focuses the composer
- **THEN** its input and send/stop actions remain reachable above the keyboard and safe area
- **AND** the conversation can still be read and scrolled

#### Scenario: The person reads older messages
- **WHEN** new content arrives while the person is away from the latest message
- **THEN** their position is preserved and an accessible action can return them to the latest content

#### Scenario: Appearance or accessibility settings change
- **WHEN** the person uses dark mode, larger text, reduced motion, or a screen reader
- **THEN** text, cards, tables, focus states, and controls remain usable with the shared visual hierarchy

### Requirement: Monitoring does not disclose conversation content

Mobile chat SHALL retain existing monitoring redaction and platform/device attribution. It SHALL NOT log message text, draft prompts, tool payloads, attachment contents, session headers, or authenticated event URLs. Client instrumentation SHALL avoid duplicating events already recorded by the server.

#### Scenario: A stream or tool fails
- **WHEN** mobile reports the failure to monitoring
- **THEN** it records useful error and platform information without conversation content or authentication material
