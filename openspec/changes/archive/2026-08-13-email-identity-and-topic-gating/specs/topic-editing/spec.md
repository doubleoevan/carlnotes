## ADDED Requirements

### Requirement: A new invitation emails the invitee

Saving a public or invite Topic SHALL send one invitation email to each newly added address — on creation and on any edit that adds an address — and SHALL NOT email an address that was already on the list, so re-saving a Topic never re-emails it. An address invited again after being withdrawn is newly added and SHALL be emailed again. A private Topic has no invitees: only the owner can see it, so there is nobody to invite.

The email SHALL name the inviter by the Topic owner's Username (an admin's edit invites on the owner's behalf), name the Topic, and link to the topic page, where an invite Topic's gated notice carries a signed-out invitee through login or signup and back, and a public Topic simply opens. The link SHALL carry a `src` marker naming the invitation email, which the gate forwards as the signup's cta tag, so `signup_completed` counts invitations that converted. It SHALL say the invitation is tied to the invited address, since an invite Topic's access is keyed to it, and SHALL close by saying that ignoring the email changes nothing. It SHALL NOT subscribe anyone: the invitee subscribes for themselves from the topic page, as the invitee requirement already states.

Sending SHALL be fire-and-forget after the save commits: a failed send is logged and reported, never failing the save, and with no configured app url the email is skipped rather than sent without a link.

#### Scenario: A newly added invitee is emailed

- **WHEN** the owner saves a Topic with a newly added invitee address
- **THEN** that address receives an invitation naming the owner's Username and the Topic, linking to the topic page

#### Scenario: Re-saving does not re-email

- **WHEN** the owner re-saves a Topic whose invitee list is unchanged
- **THEN** no invitation email is sent

#### Scenario: The invitee subscribes for themselves

- **WHEN** an invitee follows the email link and signs up with the invited address
- **THEN** they land on the topic page with view access, and no Subscription exists until they subscribe there

#### Scenario: A public topic invites too

- **WHEN** the owner saves a public Topic with a newly added invitee address
- **THEN** that address receives the same invitation email, and the topic page opens for them without a gate

## MODIFIED Requirements

### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, invite visibility and weekly schedule defaults, and the default web source switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (whenever visibility is public or invite — a private Topic has nobody to invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — Carl's built-in web search, labeled `web`, removable when on and offered as a turn-on control when off — and a custom group listing the other sources with ✕, an add picker limited to rss, reddit, and youtube, and a Suggest sources control. The `/topics/:id/edit` route SHALL NOT exist.

#### Scenario: The modal opens from the pencil
- **WHEN** the owner activates ✎
- **THEN** the modal opens over the dimmed page pre-filled with the Topic's current fields, with the Title input focused and its text not selected

#### Scenario: Cancel discards everything
- **WHEN** the owner edits fields, stages an upload, and then cancels
- **THEN** nothing is persisted and the page payload is unchanged

#### Scenario: A new topic starts on invite

- **WHEN** the owner opens the Add topic modal
- **THEN** visibility starts on invite with the invitee editor showing, and the owner may switch to private or public before saving
