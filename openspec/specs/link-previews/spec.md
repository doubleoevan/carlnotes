# link-previews Specification

## Purpose
TBD - created by archiving change add-link-previews. Update Purpose after archive.
## Requirements
### Requirement: Cards for a message's first links

A message SHALL be scanned at post time for the `http` and `https` urls in its text, and its first three distinct urls SHALL each get a preview, in the order they appear. A message with no url SHALL store nothing and stay plain text.

The url SHALL be taken without the sentence punctuation around it: a trailing period, comma, semicolon, colon, exclamation mark, or question mark is not part of the url, and a trailing bracket is not part of it either unless the url opened one — which is what keeps a link ending in a parenthesized suffix whole.

Detection SHALL run for a member's messages and for Carl's own, in rooms and in the private chat's questions and answers alike. Every fetch, whoever wrote the url, SHALL pass the public-url guard that refuses internal addresses on every redirect hop, and a room fetch SHALL spend from the team's hourly budget.

#### Scenario: The first links each get a card

- **WHEN** a member posts a message holding two urls
- **THEN** both are fetched and both cards render in the order the links appear

#### Scenario: The links past the limit stay plain

- **WHEN** a member posts a message holding five urls
- **THEN** only the first three distinct ones are fetched and card

#### Scenario: A sentence's punctuation is not part of the url

- **WHEN** a member posts "read https://example.com/piece." and "see https://example.com/a_(b)"
- **THEN** the first url is fetched without the trailing period and the second keeps its closing bracket

#### Scenario: A message with no link gets no card

- **WHEN** a member posts a message with no url in it
- **THEN** no fetch is made, no preview row is written, and the message renders as plain text

#### Scenario: Carl's url cards like a member's

- **WHEN** Carl's reply includes a url that has never been previewed
- **THEN** it fetches through the public-url guard and its card renders with the reply

### Requirement: Every preview fetch goes through the public-url guard

The page and its image SHALL both be fetched through `fetchPublicUrl` (`worker/scrape.ts`), never through a bare `fetch` and never through the billed Firecrawl path `fetchContent(url, "read")`. A malformed url, a non-http(s) url, an internal address, and a redirect chain arriving at an internal address SHALL each fail closed, leaving the message as plain text.

An image host is held to the same rule as a page host, since an image url redirecting inward is the same hazard as a page doing it.

Authorization SHALL be resolved before the fetch, not after: a message whose poster may not post to the room never reaches the preview path at all.

#### Scenario: An internal address is refused

- **WHEN** a member posts a link to a loopback, private-range, or cloud metadata address
- **THEN** no request is made to it, a failure is recorded, and the message renders as plain text

#### Scenario: A hostname that resolves inward is refused

- **WHEN** a member posts a link whose hostname resolves to an internal address, in any ip-literal encoding or through DNS
- **THEN** the resolved address is checked before connecting and the fetch fails closed, leaving the message as plain text

#### Scenario: A redirect chain ending inward is refused

- **WHEN** a member posts a public url that redirects to an internal address
- **THEN** the chain stops at the internal hop, that address is never requested, and no card renders

#### Scenario: A dead host leaves the message alone

- **WHEN** a member posts a link to a host that does not answer
- **THEN** the post succeeds, a failure is recorded, and the message renders as plain text

#### Scenario: A broken preview path never breaks posting

- **WHEN** the preview path itself fails, including a database error reading or writing the cache
- **THEN** the message still posts, the room is still notified, and the message renders as plain text

#### Scenario: The preview never bills a scrape

- **WHEN** any link preview is fetched
- **THEN** the free path is used and no Firecrawl call is charged

### Requirement: The page's own tags are the preview

The preview SHALL be read from the page's meta tags with Bun's `HTMLRewriter`, adding no html-parsing dependency. `og:title`, `og:description`, and `og:image` SHALL be preferred where the page published them, with `<title>` and `<meta name="description">` standing in where it did not. A meta tag naming no content SHALL be ignored.

Title and description SHALL have their html entities read as the characters they stand for, since neither path the parser offers decodes them: a `<title>`'s text arrives as the page's own bytes, and an attribute is handed back as written. A title holding an apostrophe would otherwise be stored and rendered as `a topic&#39;s findings`. Both the numeric forms and the named entities a page is likely to write SHALL be decoded, and a sequence that names no entity SHALL be left as the page wrote it.

Title and description SHALL have their whitespace collapsed and their length limited, so one page cannot store an essay against every room that links it. A page offering neither a title nor a description SHALL be recorded as a failure instead of stored as an empty card.

An `og:image` written relative to its page SHALL be resolved against the page it was named on.

#### Scenario: OpenGraph tags win where the page set them

- **WHEN** a page publishes both `og:title` and a plain `<title>`
- **THEN** the card shows the OpenGraph value

#### Scenario: A page with no OpenGraph tags still gets a card

- **WHEN** a page publishes only `<title>` and `<meta name="description">`
- **THEN** the card shows those, with no image

#### Scenario: An entity is read as the character it names

- **WHEN** a page's title or description holds an html entity, in either the OpenGraph attribute or the plain `<title>`
- **THEN** the stored value holds the character it names rather than its markup

#### Scenario: A page offering nothing is a failure, not an empty card

- **WHEN** a page has neither a title nor a description
- **THEN** a failure is recorded and no card renders

#### Scenario: A page that is not html has nothing to read

- **WHEN** a previewed url answers with a content type other than html
- **THEN** the fetch fails closed and no card renders

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

