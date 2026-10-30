# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
