## REMOVED Requirements

### Requirement: The image is served from this origin, never the page's host

**Reason**: It carried a signed-in requirement on the image route, and a scenario asserting that a signed-out visitor cannot read a preview image. Lifting that cannot be written as an amendment: the scenario's own heading states the opposite of what the route now does, so editing its body would leave the spec contradicting its headings. Every other rule it held is unchanged.

**Migration**: Replaced by "A preview image is served from this origin to anyone holding its id" below, which restates the same-origin rule, the SVG rule, and the oversized-image rule word for word.

## MODIFIED Requirements

### Requirement: Previews are cached by url and bounded per team

Previews SHALL be stored in a `link_previews` table keyed by the normalized url — the fragment removed — so the same link posted in many rooms is fetched once. A message SHALL NOT store a reference to its preview: the url is found again in the message text on read and the preview is looked up by it.

A url that could not be previewed SHALL be recorded as a failed row with a fetched time, so a dead link is not refetched on every post. A failed row SHALL be retried after a shorter window than a fetched one, so a host that recovers is picked up.

Every fetch SHALL be bounded: a request timeout, a limit on the html read, a limit on the image bytes, and a per-team hourly limit on how many previews a team may fetch. A team past its hourly limit SHALL still show cards for urls already cached, and its new urls SHALL render as plain text instead of failing the post.

The finding path SHALL NOT carry an hourly fetch limit of its own. The url always comes from an existing Resource row, so a caller cannot name a page, and a stored preview short-circuits the fetch for a week, so the same url cannot be fetched again however many times it is asked for. There is no amplification for a limit to bound, and one low enough to stop a burst of ordinary visitors would blank the cards on the pages visitors arrive on.

Title and description SHALL be encrypted at rest with `encryptChatText`, the same treatment the message the url was pasted into receives. The key is one application key, so a stored preview reads the same for every viewer.

#### Scenario: The same link in many rooms is fetched once

- **WHEN** a url already previewed is posted in another team's room
- **THEN** the stored preview is reused and no fetch is made

#### Scenario: A failed url is not retried on every post

- **WHEN** a url recorded as failed is posted again within its failure window
- **THEN** no fetch is made

#### Scenario: A team past its hourly limit posts a new link

- **WHEN** a team has reached its hourly fetch limit and a member posts an uncached url
- **THEN** the post succeeds, no fetch is made, and the message renders as plain text

#### Scenario: A finding url is fetched once, however many visitors ask

- **WHEN** many visitors open popups for the same uncached finding url
- **THEN** one fetch is made and every later request reads the stored card

#### Scenario: A visitor's popup is never blanked by a fetch limit

- **WHEN** visitors open popups across many uncached finding urls in one hour
- **THEN** each is fetched and each popup shows its card

#### Scenario: Preview text is encrypted at rest

- **WHEN** a preview is stored
- **THEN** its title and description are written encrypted, like a room message's content

## ADDED Requirements

### Requirement: A preview image is served from this origin to anyone holding its id

A page's image SHALL be fetched once, stored in object storage, and served from this application's own route. A third-party image url SHALL NOT be placed in an `<img src>`, so no reader's browser is ever handed to the previewed page's host.

Only image types a browser renders safely SHALL be stored and served inline. SVG SHALL NOT be served inline, because it is a document that can hold a script. An image that is missing, too large, or of a type not served inline SHALL leave the card with its text alone instead of failing the whole preview.

The image route SHALL serve any visitor, signed in or not. A preview's id is a random uuid, so the ids cannot be walked, and the only way to hold one is to have been served a finding or a message that already passed its own visibility check. Its `Cache-Control` SHALL be `public`, since one stored image is the same bytes for every viewer.

#### Scenario: The card's image comes from this origin

- **WHEN** a card with an image renders
- **THEN** its `src` is a path on this application, and the page's own image host is never requested by the reader's browser

#### Scenario: An SVG is not served inline

- **WHEN** a page names an SVG as its image
- **THEN** it is not stored and served as an inline image

#### Scenario: An oversized image drops out, the card stays

- **WHEN** a page's image is larger than the byte limit
- **THEN** the card renders with its title and description and no image

#### Scenario: A signed-out visitor reads a preview image

- **WHEN** a signed-out visitor requests a preview image url
- **THEN** the image is served, with a `public` cache header

### Requirement: A finding's preview is visible to anyone who may see the finding

`GET /topic-findings/:id/link-preview` SHALL answer a signed-out visitor. Whether a preview is served SHALL be decided by the finding's own visibility alone, the same check that decides whether the visitor may see the finding at all: a public Topic's finding is previewable by anyone, a private Topic's finding by nobody outside it.

The finding popup SHALL request its preview for every visitor. Withholding it from a signed-out visitor hides the card on exactly the public Topic pages a visitor arrives on.

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
