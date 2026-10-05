## MODIFIED Requirements

### Requirement: A gated topic's page offers a way in instead of a dead end

When a reader may not view a Topic, the topic page SHALL keep its own loading skeleton behind a notice naming how the Topic is gated (invite-only or private), so a pasted link never looks broken. The notice SHALL NOT dismiss into an empty page: closing it SHALL navigate to the homepage instead.

An invite Topic's name SHALL show in the page's own title position behind the notice, dimmed like a page almost there, while the notice itself stays generic — the gate reads like the invitation that linked there, and its owner hands the link out knowingly. A private Topic's name SHALL NOT appear in the gated page's content, and the gated api answer SHALL NOT include it, since a private Topic's name alone can tell a stranger what its owner watches. The page's head is the exception: like every Topic's page and every published Podcast Episode's page, a private Topic's page has its link-preview card, so a shared link previews, and the card and the page's title name the Topic.

The invite gate's Sign up action SHALL carry a signup attribution tag: the `src` marker stamped on the invitation email's link when the reader arrived through one, and the gate's own tag otherwise, so `signup_completed` counts what converted.

A signed-out reader SHALL be offered a way in as the notice's action buttons, each carrying a return path back to the Topic, so completing one lands the reader back where they started. On an invite Topic the lead says to sign up and Sign up is the primary action, since the invitation email probably reached somebody new — with Log in beside it as the quiet secondary, because the invited address may already belong to an account the reader is not signed into. On a private Topic the only action SHALL be Log in, since only its owner and its teams can see it and a fresh account offers no way in. The notice SHALL NOT carry a close button or any action that merely leaves, beyond closing it.

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

#### Scenario: A private Topic's gate never names the Topic

- **WHEN** a visitor opens a private Topic's page or one of its podcast episode pages
- **THEN** the notice and the page's content show no name and the gated api answer has none, while the page's head
  still has the Topic's card
