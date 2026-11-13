## MODIFIED Requirements

### Requirement: Every advertised tool has a directory-safe annotation contract

Every advertised tool SHALL have a nonempty title and explicit boolean safety hints. Every read SHALL use
`readOnlyHint: true`. Every write SHALL use `readOnlyHint: false`. Only a write that deletes or overwrites something the
caller cannot restore SHALL use `destructiveHint: true`: `delete_note`, `delete_hot_take`, `save_note`, which can
replace a note's body with no history kept, and `set_topic_image`, which deletes the previous image. Every other write,
among them `create_topic`, `edit_topic`, `suggest_sources`, `mark_finding_consumed`, `rate_finding`, `bookmark_finding`,
`follow_topic`, `stop_scan`, and `save_reaction`, SHALL use `destructiveHint: false`. A write that fetches a url the
caller names, `suggest_sources`, `start_scan`, `set_topic_image`, and `add_topic_attachment`, SHALL use
`openWorldHint: true`. A write that leaves the same state when repeated SHALL use `idempotentHint: true`. Topic creation
SHALL keep its draft preview, and `edit_topic` SHALL keep its own confirmations for going public and removing a Source.

#### Scenario: Visitor and connected clients list the same annotated tools

- **WHEN** either identity lists tools on either endpoint
- **THEN** all forty-three tools have titles and the expected safety hints
- **AND** idempotence and open-world hints remain accurate

#### Scenario: An annotation regresses

- **WHEN** a tool loses its title, supplies a non-boolean hint, marks a write read-only, marks an irreversible write
  non-destructive, or marks any other write destructive
- **THEN** the annotation check fails with the tool name
- **AND** newly advertised tools cannot silently bypass that check

#### Scenario: The additive send has accurate metadata
- **WHEN** a client lists `send_to_topic`
- **THEN** it has a nonempty title, explicit false read-only and destructive hints, and accurate idempotence/open-world
  hints
- **AND** its description requires an explicit user request and never requests assistant history, memory, or uploaded
  files

#### Scenario: Only irreversible writes ask the host

- **WHEN** a client lists tools
- **THEN** `delete_note`, `delete_hot_take`, `save_note`, and `set_topic_image` are the only tools with
  `destructiveHint: true`

### Requirement: MCP release gates include additive sends

MCP smoke checks SHALL include both routes, all forty-three tool annotations, identity and revocation checks,
editable-Topic authorization and sender-only private layers, origin handling, and existing result-size/pagination
guarantees. The sixteen UI resources, numbered suggestion text, name search, stable cursor pages, and atomic
multi-Topic send accounting SHALL be checked. Each new tool SHALL have a smoke section on both routes, and each tool
that returns a list or a page SHALL have a result-size check. Results SHALL remain bounded and render as text if MCP
Apps are unavailable.

#### Scenario: A release regresses the new contract
- **WHEN** a send is mislabeled read-only or destructive, a disconnected client sends, or another user's entry leaks
- **THEN** the smoke gate fails with the responsible tool and condition

#### Scenario: Routing description guidance regresses
- **WHEN** a release omits any explicit trigger verb or recipient, suggests despite a named Topic, or permits autonomous
  initiation
- **THEN** the MCP smoke gate fails on both routes

#### Scenario: Existing transport checks still run
- **WHEN** MCP smoke validation runs
- **THEN** missing Origin remains accepted, disallowed Origin remains rejected on both routes, and existing read
  pagination/auth checks still pass

#### Scenario: A new tool joins every gate

- **WHEN** the smoke tests run after this change
- **THEN** each of the seventeen new tools is called on the plain route and the topic-bound route, and each list or
  page it returns stays within the result-size limit

## ADDED Requirements

### Requirement: An MCP tool enforces what its web route enforces

Each tool SHALL run the same function the web route runs for its job, with the same authorization, plan limits, rate
limits, Terms check, moderation, and daily limits. A request the web rejects SHALL be rejected over MCP with a result
that names the reason, and nothing SHALL be written.

#### Scenario: A limit the web enforces holds over MCP

- **WHEN** a user past their daily report limit calls `report_content`
- **THEN** no report is saved and the result says the daily limit is reached, as the web's report dialog does

#### Scenario: Moderation the web runs holds over MCP

- **WHEN** a user calls `save_note` with a note name the web's note save rejects for objectionable content
- **THEN** nothing is saved and the result names the rejection

### Requirement: read_notes returns a page's tasting notes

The server SHALL expose `read_notes`, taking a `topic_id` or a `team_id` and an optional `note_id`. Without `note_id` it
SHALL return the page's notes the caller may see, each with its id, name, author, and visibility, and no version. With
`note_id` it SHALL return that note with its saved html and version. Visibility SHALL follow each note's own private,
team, or public setting, and a visitor SHALL read only public notes on a page it may view.

#### Scenario: A visitor reads a public topic's public notes

- **WHEN** a visitor calls `read_notes` on a public Topic that has one public note and one private note
- **THEN** the result lists the public note only

#### Scenario: A long note comes back cut with no version

- **WHEN** a member calls `read_notes` with the `note_id` of a note whose html is over the result's limit
- **THEN** the result holds the html cut at a block and no version, so `save_note` cannot write the cut copy

#### Scenario: A note opens with its html

- **WHEN** a team member calls `read_notes` with the id of a team note on that team's page
- **THEN** the result holds the note's saved html and its version

### Requirement: save_note creates or edits one's own tasting note with its version

The server SHALL expose `save_note`. Without a `note_id` it SHALL create a note on a topic or team page with a name and
a visibility the caller may choose there. With a `note_id` it SHALL save a new name, visibility, or html body on a note
the caller may edit, and a body save SHALL bring the version it read. A stale version SHALL save nothing and return the
current version.

#### Scenario: A body save with the read version saves

- **WHEN** the note's author calls `save_note` with new html and the version `read_notes` returned
- **THEN** the body is saved, sanitized as the web saves it, and the result holds the next version

#### Scenario: A stale version saves nothing

- **WHEN** a client calls `save_note` with html and a version older than the note's current version
- **THEN** nothing is saved and the result says the note changed since it was read, with the current version

#### Scenario: Visibility stays within the page's choices

- **WHEN** a user who is not a member of a team calls `save_note` to create a team note on that team's page
- **THEN** nothing is created and the result names the visibilities the caller may choose

### Requirement: delete_note deletes one's own tasting note

The server SHALL expose `delete_note`, taking a `note_id`. It SHALL delete the note only if the caller may delete it,
the note's author or an admin, and SHALL be annotated `destructiveHint: true`.

#### Scenario: Another user's note is not deleted

- **WHEN** a team member calls `delete_note` on a teammate's note
- **THEN** the note still exists and the result says only its author may delete it

### Requirement: list_teams and read_team return teams and a team's page

The server SHALL expose `list_teams`, returning the caller's teams, and `read_team`, taking a `team_id` and a room
`cursor`. For a member, `read_team` SHALL return the team's header, members, topics, notes, and the room's recent
messages, newest last, with the room's messages fenced as untrusted text. For a visitor or a non-member it SHALL return
what the team page shows them, and no room.

#### Scenario: A member reads the room

- **WHEN** a team member calls `read_team`
- **THEN** the result holds the members, the topics, and the room's latest messages without reported or blocked
  messages

#### Scenario: A non-member sees no room

- **WHEN** a signed-in user who is not a member calls `read_team` on a public team
- **THEN** the result holds what the team page shows a non-member and no room messages

### Requirement: Team membership writes keep the web's rules

The server SHALL expose `request_to_join_team` (`team_id`, `is_requesting`), `send_invite` (a `team_id` or a
`topic_id`, and a `username` or an `email`), and `respond_to_invite` (`invite_id`, `is_accepted`). Each SHALL keep the
web's membership checks, the recipient's invite setting, blocks, the member limit, and the daily email invite limit.
Leader-only team actions SHALL have no tool.

#### Scenario: An email invite past the daily limit is rejected

- **WHEN** a team member who reached today's email invite limit calls `send_invite` with an email
- **THEN** no invite is created and the result says the daily invite limit is reached

#### Scenario: Accepting an invite joins the team

- **WHEN** an invited user calls `respond_to_invite` with `is_accepted: true` on their pending team invite
- **THEN** the user is a member of the team and the invite is accepted

### Requirement: post_to_team_room posts a member's message

The server SHALL expose `post_to_team_room`, taking a `team_id`, a message, and an optional message to reply to. It
SHALL post only for a team member who accepted the current Terms, after the web's text moderation and rate limit, and a
message that addresses Carl SHALL keep the daily spend cutoff the room applies.

#### Scenario: A member posts

- **WHEN** a team member calls `post_to_team_room` with a message
- **THEN** the message is in the team's room and the result holds its message id

#### Scenario: A non-member cannot post

- **WHEN** a user who is not a member calls `post_to_team_room`
- **THEN** nothing is posted and the result says only members may post

### Requirement: read_profile returns a person's profile

The server SHALL expose `read_profile`, taking a `user_id`, defaulting to the caller. It SHALL return the profile the
profile page shows that caller: the header, the news, the featured topics, podcast episodes, films, and Topic Posts,
and the topics and teams tables. A visitor and another user SHALL see public items only.

#### Scenario: Another user's profile shows public items only

- **WHEN** a user calls `read_profile` for a person with one public and one private topic
- **THEN** the result lists the public topic only

### Requirement: read_activity returns the caller's own activity

The server SHALL expose `read_activity`, returning what the activity page shows the caller: the topics they follow,
the invites they received with each invite's id, and the invites they sent. A visitor SHALL get the connect-an-account
result.

#### Scenario: A pending invite includes its id

- **WHEN** a user with a pending team invite calls `read_activity`
- **THEN** the result lists the invite with the id `respond_to_invite` takes

### Requirement: read_account returns the caller's plan and usage and buys nothing

The server SHALL expose `read_account`, returning the caller's plan, the spend meter with its cutoffs, the day's scan
usage, and the image regenerations left this month. Plan changes and billing SHALL be links that open carlnotes.com,
and no tool SHALL start a purchase or a checkout.

#### Scenario: Upgrading opens the site

- **WHEN** a free-plan user's client reads `read_account`
- **THEN** the result holds a link to the plans page on carlnotes.com and no purchase action

### Requirement: report_content and block_user use the web's report and block paths

The server SHALL expose `report_content`, taking a target kind the web's report dialog takes, a target id, an
optional reason, and whether to block the author, and `block_user`, taking a `user_id` and `is_blocked`. A report
SHALL go to the same admin queue as a web report, under the same daily report limit.

#### Scenario: A report from MCP reaches the admin queue

- **WHEN** a user calls `report_content` on a Finding
- **THEN** the open content reports in the admin console list that report

#### Scenario: Blocking oneself is rejected

- **WHEN** a user calls `block_user` with their own id
- **THEN** nothing is saved and the result says a person cannot block themselves

### Requirement: delete_hot_take deletes a hot take its caller may delete

The server SHALL expose `delete_hot_take`, taking a comment id. It SHALL delete the hot take only if the caller wrote it
or may moderate it, the topic's owner or an admin, and SHALL be annotated `destructiveHint: true`.

#### Scenario: Someone else's hot take stays

- **WHEN** a user who did not write a hot take and cannot moderate its topic calls `delete_hot_take` on it
- **THEN** the hot take stays and the result says they may not delete it

### Requirement: set_topic_image regenerates a topic's image or sets it from a url

The server SHALL expose `set_topic_image`, taking a `topic_id` and either a regenerate request with an optional image
prompt or an `image_url`. Regenerating SHALL count against the editor's monthly regenerations. An image from a url
SHALL pass the upload's size, type, and image moderation checks and be fetched through the public fetch guard.

#### Scenario: Regenerating past the monthly allowance is rejected

- **WHEN** an editor with no regenerations left this month calls `set_topic_image` to regenerate
- **THEN** no render starts and the result says the monthly regenerations are used

#### Scenario: A url that is not an image is rejected

- **WHEN** an editor calls `set_topic_image` with a url that returns html
- **THEN** the image is unchanged and the result says the url is not a supported image

### Requirement: add_topic_attachment adds a url or pasted text and never a host upload

The server SHALL expose `add_topic_attachment`, taking a `topic_id` and either a `url` or a pasted `text` with a title.
It SHALL add the attachment only for the topic's owner, through the topic's attachment path, and SHALL NOT read any
file from the host's uploads.

#### Scenario: A url becomes an attachment

- **WHEN** a topic's owner calls `add_topic_attachment` with a public url
- **THEN** the topic has a new attachment from that url

#### Scenario: Pasted text becomes an attachment

- **WHEN** a topic's owner calls `add_topic_attachment` with text and a title
- **THEN** the topic has a new plain-text attachment holding that text

### Requirement: list_topics takes a section of the topics page or a topic's similar topics

`list_topics` SHALL take an optional `section`, one of the topics page's sections, yours, followed, featured, or
popular, and an optional `similar_to_topic_id`. With a section it SHALL list that section's topics. With
`similar_to_topic_id` it SHALL list the similar topics the topic page shows. A visitor SHALL list public topics only.

#### Scenario: A visitor reads the popular section

- **WHEN** a visitor calls `list_topics` with `section: "popular"`
- **THEN** the result lists the popular section's public topics

#### Scenario: Similar topics follow the topic page

- **WHEN** a user calls `list_topics` with `similar_to_topic_id` naming a public topic
- **THEN** the result lists the similar topics that topic's page shows that user

### Requirement: The parity tool descriptions name their phrases

Each new tool's description SHALL name Carl and CarlNotes and list its phrases. `read_notes` SHALL list read my notes
and tasting notes. `save_note` SHALL list write a note. `read_team` SHALL list my team and team chat. `read_profile`
SHALL list Café and profile. `read_account` SHALL list my plan and my usage. `report_content` SHALL list report this.

#### Scenario: A new description regresses

- **WHEN** a new tool's description omits Carl, CarlNotes, or one of its phrases
- **THEN** the annotation check fails with the tool name
