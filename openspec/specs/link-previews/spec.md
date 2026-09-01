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

Title and description SHALL have their whitespace collapsed and their length limited, so one page cannot store an essay against every room that links it. A page offering neither a title nor a description SHALL be recorded as a failure instead of stored as an empty card.

An `og:image` written relative to its page SHALL be resolved against the page it was named on.

#### Scenario: OpenGraph tags win where the page set them

- **WHEN** a page publishes both `og:title` and a plain `<title>`
- **THEN** the card shows the OpenGraph value

#### Scenario: A page with no OpenGraph tags still gets a card

- **WHEN** a page publishes only `<title>` and `<meta name="description">`
- **THEN** the card shows those, with no image

#### Scenario: A page offering nothing is a failure, not an empty card

- **WHEN** a page has neither a title nor a description
- **THEN** a failure is recorded and no card renders

#### Scenario: A page that is not html has nothing to read

- **WHEN** a previewed url answers with a content type other than html
- **THEN** the fetch fails closed and no card renders

### Requirement: The image is served from this origin, never the page's host

A page's image SHALL be fetched once, stored in object storage, and served from this application's own route. A third-party image url SHALL NOT be placed in an `<img src>`, so no reader's browser is ever handed to the previewed page's host.

Only image types a browser renders safely SHALL be stored and served inline. SVG SHALL NOT be served inline, because it is a document that can hold a script. An image that is missing, too large, or of a type not served inline SHALL leave the card with its text alone instead of failing the whole preview.

The image route SHALL require a signed-in reader, so which urls have been previewed cannot be probed by a stranger.

#### Scenario: The card's image comes from this origin

- **WHEN** a card with an image renders
- **THEN** its `src` is a path on this application, and the page's own image host is never requested by the reader's browser

#### Scenario: An SVG is not served inline

- **WHEN** a page names an SVG as its image
- **THEN** it is not stored and served as an inline image

#### Scenario: An oversized image drops out, the card stays

- **WHEN** a page's image is larger than the byte limit
- **THEN** the card renders with its title and description and no image

#### Scenario: A signed-out visitor cannot read preview images

- **WHEN** a signed-out visitor requests a preview image url
- **THEN** the route answers 404

### Requirement: Previews are cached by url and bounded per team

Previews SHALL be stored in a `link_previews` table keyed by the normalized url — the fragment removed — so the same link posted in many rooms is fetched once. A message SHALL NOT store a reference to its preview: the url is found again in the message text on read and the preview is looked up by it.

A url that could not be previewed SHALL be recorded as a failed row with a fetched time, so a dead link is not refetched on every post. A failed row SHALL be retried after a shorter window than a fetched one, so a host that recovers is picked up.

Every fetch SHALL be bounded: a request timeout, a limit on the html read, a limit on the image bytes, and a per-team hourly limit on how many previews a team may fetch. A team past its hourly limit SHALL still show cards for urls already cached, and its new urls SHALL render as plain text instead of failing the post.

Title and description SHALL be encrypted at rest with `encryptChatText`, the same treatment the message the url was pasted into receives.

#### Scenario: The same link in many rooms is fetched once

- **WHEN** a url already previewed is posted in another team's room
- **THEN** the stored preview is reused and no fetch is made

#### Scenario: A failed url is not retried on every post

- **WHEN** a url recorded as failed is posted again within its failure window
- **THEN** no fetch is made

#### Scenario: A team past its hourly limit posts a new link

- **WHEN** a team has reached its hourly fetch limit and a member posts an uncached url
- **THEN** the post succeeds, no fetch is made, and the message renders as plain text

#### Scenario: Preview text is encrypted at rest

- **WHEN** a preview is stored
- **THEN** its title and description are written encrypted, like a room message's content

