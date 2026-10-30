# mobile-chat Specification

## Purpose
Let people use chat on mobile for private Topic conversations and Team rooms, with the web's behavior, shared chat logic, safe answers, and confirmed Topic edits.

## Requirements

### Requirement: Shared chat behavior preserves web compatibility

Web and mobile SHALL share portable chat behavior and reusable presentation composition. Native adaptations SHALL
preserve web terminology, permissions, actions, icons, formatting, and Nightshift appearance except for the explicit
mobile differences in this capability. Existing web chat behavior SHALL remain unchanged.

#### Scenario: A conversation is opened on either client
- **WHEN** the same person opens the same conversation on web and mobile
- **THEN** both clients read the same server history and permissions
- **AND** history selection, tool outcomes, proposed edits, and rejection wording follow the same rules
- **AND** mobile-specific layout and transport do not create a second chat backend

#### Scenario: Web-only workflows remain available
- **WHEN** this capability ships
- **THEN** web voice, attachments, new-topic chat, podcast chat, and pricing links retain their existing behavior
- **AND** the web's attachment limits, toasts, and payloads are unchanged by the shared attachment rules mobile uses

### Requirement: chat opens the appropriate native conversation

Mobile SHALL offer a shared bottom-right chat pill on every signed-in page, above the safe area. It SHALL open a
full-screen conversation using the web's context rules. A person with no available room and no page Topic or Team SHALL
get the new-topic chat. The selector SHALL preserve web labels, avatars, and selection states, and SHALL offer the web's
"Give Carl a topic. You know the one." row.

#### Scenario: The launcher would overlap another control
- **WHEN** chat or the keyboard is open
- **THEN** the launcher is hidden
- **AND** when visible, its reserved space keeps footer and note controls reachable

#### Scenario: A page has no Topic or Team context
- **WHEN** a person opens the global pill on Home, Profile, Teams, Activity, Account, or Plans
- **THEN** the web's default available room opens
- **AND** a person without rooms gets the new-topic chat, as on web
- **AND** the selector's "Give Carl a topic. You know the one." row opens the new-topic chat from any page

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

Typing an eligible @ mention SHALL offer Carl and the room's members using the web's matching rules. Selecting a suggestion SHALL insert the mention without losing surrounding text. Mobile SHALL support replying to a message, showing its quoted context, selecting the web's reply targets, and clearing a reply target through the selector without an extra × control.

#### Scenario: A mention is selected in the middle of text
- **WHEN** the person chooses a member suggestion
- **THEN** the selected mention replaces only the active mention query
- **AND** the remaining composer text is preserved

#### Scenario: A message is a reply
- **WHEN** a person selects Reply on a room message
- **THEN** the composer shows the selected target and can cancel it
- **AND** the posted message retains the parent reference and readable quoted context

#### Scenario: A person returns to everyone
- **WHEN** the person chooses “Replying to @all” after selecting a message to reply to
- **THEN** the message reply is cleared and the draft body is preserved
- **AND** sending addresses everyone without a parent-message reference

#### Scenario: The reply target disappears
- **WHEN** a selected parent message is deleted or the person switches rooms
- **THEN** a stale reply selection cannot be sent to the new room

### Requirement: Room deletion and clearing preserve permissions

Mobile SHALL permit people to delete their own room messages and preserve the web's existing leader/admin moderation controls. Individual-message deletion and clearing the room SHALL require confirmation. Local state SHALL change only after the server accepts the operation; rejected actions SHALL leave history intact.

#### Scenario: A person deletes their own message
- **WHEN** the person chooses Delete on a message they are allowed to delete
- **THEN** a confirmation explains that the message and its attachments will be removed for everyone in the chat
- **AND** only confirming calls the existing delete API and accepted deletion refreshes the room

#### Scenario: Deletion is cancelled
- **WHEN** the person cancels or dismisses the confirmation
- **THEN** no deletion request is sent and the message remains

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

Carl's mobile answers SHALL render Markdown during streaming and after completion. Raw HTML SHALL remain visible as
literal text. Only HTTP(S) links SHALL be actionable. Unsafe destinations SHALL keep readable labels without navigation.
Web and mobile SHALL share this link policy. The new-topic chat invitation SHALL be a recognized internal action on both
clients that opens the new-topic chat.

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
- **THEN** mobile renders it as an action that opens the new-topic chat, labeled with the phrase
- **AND** web retains its existing new-topic button
- **AND** no other non-HTTP(S) destination becomes actionable through the internal-action rule

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

Every tool outcome the web exposes within supported chat SHALL have equivalent mobile feedback. Save notices and save
rejections SHALL remain notices. Proposed edits SHALL remain draft cards. Tool history SHALL retain the same meaning. A
tool that opens the new-topic chat SHALL open it natively once the reply ends, as on web.

#### Scenario: A tool saves or rejects a Topic change
- **WHEN** a tool outcome reports success or failure
- **THEN** the person sees the same outcome text and appropriate success or error styling
- **AND** a tool-only turn is not discarded merely because it has no answer text

#### Scenario: Carl requests the deferred new-topic flow
- **WHEN** a tool requests opening new-topic chat
- **THEN** mobile switches to the new-topic chat after the reply ends, as web does
- **AND** it does not display a pricing link or fabricate a newly created Topic

### Requirement: Rejections retain Carl's wording without pricing links

Mobile SHALL reuse the web's budget, rate-limit, access, failure, and applicable Topic-limit wording in Carl's voice. It
SHALL omit the plans link and any dependent pricing call to action. A Topic creation quota SHALL NOT prevent an
otherwise permitted conversation about an existing Topic or in the new-topic chat.

#### Scenario: Budget or rate limit rejects a reply
- **WHEN** the server reports budget exhaustion or rate limiting
- **THEN** mobile shows the corresponding shared rejection text without “Pick up more coffee” or a plans link

#### Scenario: Topic quota is reached
- **WHEN** the account has used its Topic allowance
- **THEN** the shared Topic-limit notice can explain the limit without a pricing link
- **AND** an existing Topic conversation remains available when its chat permissions and budget allow it
- **AND** the new-topic chat shows that notice in place of the draft card and Carl still answers

### Requirement: Deferred media stays outside native text chat

This capability SHALL expose no voice input, spoken answers, or podcast chat controls. Existing attachments in history
SHALL render as named chips. Unsupported media SHALL NOT prevent reading or continuing a supported conversation.

#### Scenario: History includes attachments or spoken content
- **WHEN** that conversation opens on mobile
- **THEN** available message text remains readable and attachment names appear as chips
- **AND** mobile does not offer recording or spoken playback controls

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

### Requirement: Waiting for Carl uses the shared thinking lines

Mobile SHALL show the web's random “Carl is …” lines inside Carl's waiting bubble. One line SHALL remain stable while that bubble is mounted. A subtle shimmer SHALL run through native animation, stop when inactive or unmounted, and remain static with Reduce Motion enabled. Text SHALL wrap and scale without clipping or duplicate accessibility announcements.

#### Scenario: Carl begins answering
- **WHEN** a reply is pending before its first answer text
- **THEN** the bubble shows a line drawn from the same phrases and selection rules as web
- **AND** rerenders do not replace the line
- **AND** the waiting bubble leaves when the answer arrives or the request stops

#### Scenario: Motion is unwanted or invisible
- **WHEN** Reduce Motion is enabled or the app becomes inactive
- **THEN** no shimmer animation runs
- **AND** the line remains readable if the bubble is still visible

### Requirement: Mention counts show where the web shows them

The app SHALL show unread chat mention counts on the web's placements: the chat launcher pill, the room menu trigger,
each room in the room list, the Topic and Team headers, the Feed's Topic cards, the Team membership rows, the menu
button, and the Profile and Teams menu items, each as one summed badge in the web's style. A page badge's press SHALL
open that page's chat room while a mention waits, else the page.

#### Scenario: A mention arrives in a team room

- **WHEN** a teammate mentions the user in a Topic's team room while the user reads another screen
- **THEN** the launcher pill, the menu button, and the Teams item count it after the next poll, and the Topic's header
  badge opens that room

#### Scenario: Opening the room clears its count

- **WHEN** the user opens the room
- **THEN** its mentions are acknowledged and every badge that counted them drops

### Requirement: The app icon counts the waiting updates

The app SHALL badge its icon with the sum the web's tab title shows, the unread chat mentions, note changes, and topic
invitations the badge poll last read. The badge SHALL clear for a visitor and on sign-out. The app SHALL NOT ask for a
permission to badge the icon. On iOS the badge permission SHALL be requested with the notification permission, and
until it is granted the icon SHALL stay bare. A push notification SHALL NOT set the count, so the count SHALL change
only while the app is open.

#### Scenario: Updates wait when the app closes

- **WHEN** a user with two unread chat mentions sends the app to the background
- **THEN** the app icon shows 2 until the app opens again and the next poll reads the count

#### Scenario: The user signs out

- **WHEN** a user with a badged icon signs out
- **THEN** the icon's badge clears

#### Scenario: The badge asks nothing at launch

- **WHEN** a signed-in user with a count opens the app on an iOS phone whose notification permission is undetermined
- **THEN** no permission prompt shows, and the icon stays bare until the user grants the notification permission

#### Scenario: A push leaves the count alone

- **WHEN** a mention push arrives while the app is closed
- **THEN** the icon keeps the count the last poll read, and the next poll after the app opens updates it

### Requirement: Badge polling runs only in the foreground and online

The chat mention count and the waiting topic invitations SHALL be read by one shared poll every 45 seconds while the
app is in the foreground and online, at once on return to the foreground or on reconnect, one request per source in
flight, and never from the background. The room list SHALL reload when the mention count changes. A response from a
previous account SHALL be dropped, and sign-out SHALL clear the counts.

#### Scenario: The app goes to the background

- **WHEN** the app is backgrounded for ten minutes
- **THEN** no badge request is sent until it returns, then the counts are read at once

#### Scenario: The account changes mid-request

- **WHEN** a badge read is in flight and the user signs out
- **THEN** its response is dropped and no count shows for the visitor

#### Scenario: A focused topic screen's requests are documented

- **WHEN** a reader opens the mobile module guide
- **THEN** it states how many requests a signed-in, focused Topic screen sends per minute and which polls send them

### Requirement: Composers take attachments under the web's limits

The private and Team composers SHALL offer an attach button that opens the picker menu. They SHALL show each waiting
file as a chip with its name, kind icon, and a remove control. They SHALL apply the web's kinds, per-kind size limits,
four-per-question limit, and rejection words. The files SHALL be sent with the next turn or post. A rejected send SHALL
behave as on the web.

#### Scenario: Two files go with a question
- **WHEN** a user attaches a PDF and a photo and sends a question in private chat
- **THEN** the turn sends both, the chips clear, and the sent turn shows both names as history chips

#### Scenario: A waiting file is removed
- **WHEN** a user presses remove on a chip before sending
- **THEN** the file leaves the composer and its cached copy is deleted

#### Scenario: A private turn is rejected
- **WHEN** the server rejects a private turn because an attachment cannot be read
- **THEN** the web's rejection words show on the turn, and Retry resends the question as it does on the web

#### Scenario: A room post is rejected
- **WHEN** the server rejects a room post because an attachment cannot be read
- **THEN** the web's rejection words show and the message text and chips stay in the composer

#### Scenario: Chips overflow a narrow composer
- **WHEN** four chips with long names wait at the largest text size
- **THEN** names truncate, every remove control stays reachable, and the input stays above the keyboard

### Requirement: Private Topic chat keeps files the web's way

In a private conversation about a Topic, a new attachment SHALL be kept while the user's kept files for that Topic
stay under the shared keep limit. Past the limit it SHALL be read for that turn only, with the web's notice. The
composer SHALL list kept files with download and delete as on web. Delete SHALL take effect only after the server
accepts it. Kept files SHALL belong to the user and the Topic. They SHALL never appear in a Team room or in another
user's chat.

#### Scenario: The keep limit is reached
- **WHEN** a user with twenty kept files on a Topic attaches another
- **THEN** the web's notice says it is read but not stored, and the turn still sends it

#### Scenario: A kept file is deleted
- **WHEN** the user deletes a kept file and the server accepts
- **THEN** it leaves the kept list, and a rejected delete leaves it listed

#### Scenario: A Team room is opened on the same Topic
- **WHEN** the user switches from private chat to the Topic's Team room
- **THEN** the room shows no kept files from the private conversation

### Requirement: Rooms post and delete their own attachments

A Team room post SHALL send its attachments the way the web's room composer does, never kept privately. The room's
per-member attachment limit and moderation SHALL apply. A member SHALL be able to open and delete their own message
attachments. The room's leader and admin moderation SHALL follow the web. A delete SHALL change the room only after
the server accepts it.

#### Scenario: A photo is posted to a room
- **WHEN** a member posts a message with a photo
- **THEN** every member sees the message with the file's chip, and opening it downloads the room copy

#### Scenario: A rejected attachment post
- **WHEN** moderation or the member's room limit rejects the post
- **THEN** the web's rejection words show and the text, reply selection, and chips stay in the composer

### Requirement: The new-topic chat runs natively

Mobile SHALL open the web's private conversation with no Topic and no Team, with the web's placeholders for a first
and a later Topic. It SHALL load the stored draft, the remaining Topic count, and the limit. It SHALL send the draft
with every turn and replace it with the draft a reply's tool calls return. Pasted text and attached files SHALL reach
Carl for that turn, and files SHALL stay in the draft until the save.

#### Scenario: A user with no Topic opens it
- **WHEN** a user who owns no Topic opens the new-topic chat
- **THEN** the composer reads "Let's make your first topic. You know the one."

#### Scenario: Carl fills the draft
- **WHEN** Carl calls `draftTopic` with a name and a prompt
- **THEN** the draft card shows them once the reply ends, and reopening the app shows the stored draft again without
  its files

### Requirement: The new-topic draft card shows every setting and file

The new-topic draft card SHALL use the shared draft card with the edit form's field order. The fields are Name, Carl's
Prompt, Tags, Frequency, Max findings, Podcast, Visibility, Team, Invites, and Sources, plus each waiting file with a
remove control until the save. The card SHALL show loading while Carl owes a reply. A visibility or Team change made
through chat SHALL show on the card as the same proposal the web shows. A draft that holds only a Team SHALL hide the
card.

#### Scenario: Visibility changes through chat
- **WHEN** the user tells Carl to make the Topic public on their Team
- **THEN** the card reads Public with that Team, as the web card does for the same draft

#### Scenario: A waiting file is removed from the draft
- **WHEN** the user removes a file from the card before agreeing
- **THEN** the file is not uploaded when the Topic is created

### Requirement: A new Topic is created only after agreement

The app SHALL create nothing locally. The Topic SHALL be created only by the server's explicit-agreement rule. After a
reported creation the app SHALL show the save notice and open the new Topic natively. It SHALL then upload each waiting
file to that Topic as a Topic attachment and refresh the Topic when they land. A rejected upload SHALL show its reason
without undoing the Topic. A rejected create SHALL keep the draft and stay in chat.

#### Scenario: The user agrees
- **WHEN** the user agrees to Carl's proposed Topic and the server creates it
- **THEN** a notice names the Topic, the Topic screen opens, and its two waiting files appear as its attachments once
  uploaded

#### Scenario: Another message is not agreement
- **WHEN** the user asks a question instead of agreeing
- **THEN** no Topic is created and the draft card stays

#### Scenario: The create is rejected by quota
- **WHEN** the plan holds all the Topics it allows at the save
- **THEN** the web's quota notice shows without a plans link, nothing is created, and the draft and files stay

### Requirement: A created Topic ends the new-topic conversation

After a creation and the finished reply, the app SHALL clear the new-topic conversation and its stored draft the way
the web does. Carl's reply naming the Topic SHALL stay on screen until the next question. A user who stops the
creating reply SHALL keep the conversation.

#### Scenario: The next topic starts from nothing
- **WHEN** the user returns to the new-topic chat and asks for another Topic
- **THEN** Carl reads none of the previous conversation and the card is empty

### Requirement: Clearing the new-topic chat asks first

Clear in the new-topic chat SHALL ask for confirmation with the web's words. It SHALL delete the conversation and the
stored draft only after the server accepts. It SHALL drop the waiting files and their cached copies. A cancelled or
rejected clear SHALL change nothing.

#### Scenario: Clear is confirmed
- **WHEN** the user confirms Clear
- **THEN** the conversation, draft card, and waiting files are gone

#### Scenario: Clear is cancelled
- **WHEN** the user cancels the confirmation
- **THEN** the conversation, draft, and files stay

### Requirement: New topic and Edit topic offer chat or form

Every mobile New topic action SHALL open the web's choice between "Do it myself" and "Build with Carl" outside the Team
edit sheet, whose New topic row opens the form as on the web. The form choice SHALL open the existing form, with a Team
preset where the web presets one. "Build with Carl" SHALL open the new-topic chat with that Team on the draft. Edit
topic SHALL offer "Do it myself" and "Edit with Carl" to a person who may edit the Topic.

#### Scenario: Build with Carl from a Team
- **WHEN** a leader picks New topic from the Team screen and then Build with Carl
- **THEN** the new-topic chat opens with that Team on the draft card

#### Scenario: Edit with Carl
- **WHEN** an owner picks Edit topic and then Edit with Carl
- **THEN** the private chat about that Topic opens, and its edit previews work as before

#### Scenario: Do it myself
- **WHEN** a user picks New topic and then Do it myself
- **THEN** the existing create form opens unchanged

#### Scenario: New topic from the Team edit sheet
- **WHEN** a leader picks the New topic row in the Team edit sheet's topic picker
- **THEN** the create form opens with that Team, as on the web, and the saved Topic joins the picker

### Requirement: An empty Feed welcomes a first Topic

A signed-in person whose Feed is empty SHALL be offered the new-topic chat on Home. The full-screen chat SHALL open by
itself at most once per app launch. A person who closes it SHALL find it closed until the next launch. A person whose
Feed holds anything SHALL find chat closed until they open it.

#### Scenario: A fresh sign-up lands in the chat
- **WHEN** a person who just signed up reaches Home with an empty Feed
- **THEN** the new-topic chat opens once with the first-topic placeholder, and stays closed after they close it

#### Scenario: An invited user is not welcomed
- **WHEN** a person who joined through a Topic invite reaches Home
- **THEN** chat stays closed, since their Feed holds that Topic
