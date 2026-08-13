## MODIFIED Requirements

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

## ADDED Requirements

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
