## MODIFIED Requirements

### Requirement: A finding's preview is visible to anyone who may see the finding

`GET /topic-findings/:id/link-preview` SHALL answer a signed-out visitor. Whether a preview is served SHALL be decided
by the finding's own visibility alone, the same check that decides whether the visitor may see the finding at all: a
public Topic's finding is previewable by anyone, a private Topic's finding by nobody outside it.

The finding popup SHALL request its preview for every visitor. Withholding it from a signed-out visitor hides the card
on exactly the public Topic pages a visitor arrives on. The popup SHALL request its preview when it opens, never when
its finding's row renders, so a page of findings sends no preview requests until a popup opens.

Public Topic chat history remains hidden from a signed-out visitor. This requirement covers findings only.

#### Scenario: A visitor sees a public finding's card

- **WHEN** a signed-out visitor opens a finding popup on a public Topic
- **THEN** the link preview card renders with its title, description, and image

#### Scenario: A visitor is refused a private finding's card

- **WHEN** a signed-out visitor requests the preview for a finding on a private Topic
- **THEN** the response is 404 and names no url

#### Scenario: Chat history stays hidden

- **WHEN** a signed-out visitor opens a public Topic that has chat turns
- **THEN** no chat turns are served

#### Scenario: A page of findings requests no previews until a popup opens

- **WHEN** a visitor opens a page listing findings and opens none of their popups
- **THEN** no link preview is requested, and opening one popup requests that finding's preview alone
