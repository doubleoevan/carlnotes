## Why

A url pasted into a team room renders as plain text. A member who shares a link gives the room a bare address and nothing else, so everyone either opens it to find out what it is or scrolls past it. The room's whole point is a conversation about what people are reading, and the reading itself arrives as an unlabelled string.

Link unfurling is a familiar feature with an unfamiliar hazard: it makes the server fetch a url a user typed, and it makes every reader's browser fetch an image a stranger's page named. The first is server-side request forgery, the second is a tracking pixel that fires once per user. Both are already solved here in pieces — `fetchPublicUrl` re-checks every redirect hop against the private-host rule, and `ChatMarkdown` already refuses to render a remote image inline — so the card can be built without inventing either defense.

## What Changes

A url in a room message renders as a card below the bubble, showing the page's title, description, and image. The raw url stays in the message text, so the card is an addition and never a replacement: a reader always sees where a link actually goes.

- Detection is at post time, on the first http(s) url in the message. One card per message keeps the bubble readable and the fetch budget bounded.
- The page is read through `fetchPublicUrl`, never a bare `fetch` and never the billed Firecrawl path, and parsed with Bun's `HTMLRewriter` — no new dependency. OpenGraph tags win where a page published them, and `<title>` with `<meta name="description">` stand in where it did not.
- The page's image is fetched once, stored, and served from this origin. A third-party image url never reaches an `<img src>`, so no reader's browser is ever handed to the page's host.
- A `link_previews` table keyed by normalized url caches the result, so the same link in twenty rooms is fetched once, and records a failure row so a dead link is not refetched on every post.
- Preview text is encrypted at rest with `encryptChatText`, the same treatment the message the url was pasted into gets.
- A `Content-Security-Policy` header is added, holding `img-src` to this origin. The app had none.

Bounds, all stated as numbers: a 3 second timeout per fetch, 256 KB of html read, a 2 MB image limit, 20 fetches per team per hour, a 7 day cache and a 24 hour failure window.

**Deliberately unchanged:** `ChatMarkdown` still downgrades every markdown image to a text link. That is what keeps a model-written or pasted `![](https://tracker/…)` from firing for every user, and proxying the card's image through this origin is what makes the card safe where an inline remote image would not be.

## Capabilities

### New Capabilities

- `link-previews`: the card — where a url is found, how the page is fetched and parsed, how its image is proxied and served, how the cache and its limits behave, and how the card renders.

### Modified Capabilities

- `injection-defense`: a content security policy requirement is added, holding images to this origin and naming the inline-image rule it backs up.
- `team-chat`: the message-rendering requirement gains the card, placed below the bubble and above the shared files, and states that the url stays in the message text.
