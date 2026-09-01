## Context

A link unfurler is a small feature with two well-known ways to go wrong, and both of them are about who ends up making a request. The server fetches a url a user typed, which is server-side request forgery if the url points inward. Every reader's browser fetches an image a stranger's page named, which is a tracking pixel if the image url is handed to an `<img src>`. The design below is mostly about which existing part of the codebase already answers each of those.

## Goals

- A card with the page's title, description, and image, without a new dependency.
- No fetch of an internal address, on the first url or on any redirect hop.
- No reader's browser ever reaching the previewed page's host.
- One fetch for a link posted in many rooms.

## Non-goals

- Previewing more than the first url in a message.
- Previewing a url Carl writes. A model-written url never causes an outbound fetch.
- Relaxing `ReplyImage`, which downgrades a markdown image to a text link.
- Refreshing a cached preview when the page changes, beyond the cache window expiring.

## Decisions

### The fetch guard is reused, not rebuilt

`toFetchableUrl` rejects a malformed, non-http(s), or internal url, and `fetchPublicUrl` follows redirects by hand, re-checking every hop and giving up after `MAX_REDIRECTS`. That pair is the whole SSRF defense a link unfurler needs, it is already covered by tests, and it is already the path every owner-supplied url in the scan pipeline takes. Every preview fetch goes through it — the page and the image alike, since an image host that redirects inward is the same hazard as a page that does.

The billed path is deliberately avoided: `fetchContent(url, "read")` is the Firecrawl scrape and charges per call. A preview reads the page's head, which a plain bounded GET already gives.

### The parser is `HTMLRewriter`

Bun ships a streaming html parser. Reading four meta tags does not justify a dependency, and `HTMLRewriter` reads them in about forty lines. OpenGraph values and plain tags are collected separately, so an og value wins only where the page actually set one instead of where an empty string would.

### The image is proxied, and that is the point

An `og:image` url in an `<img src>` would have every user's browser request a stranger's host on every render, handing over an IP and a referer each time. So the image is fetched once through the same guard, stored in object storage, and served from this origin by preview id. Only image types a browser renders safely are stored, and svg is excluded because it is a document that can hold a script.

This is also why `ReplyImage` stays as it is. The two rules are consistent, not in tension: a remote image is never rendered inline, and the card's image is not remote by the time a browser sees it.

### The cache is keyed by url, and no column is added to a message

A preview is a property of a url, not of a message, so `link_previews` is keyed by the normalized url and the message stores nothing. The load path already decrypts the message text, so it finds the url again and looks the preview up by it. Two consequences worth naming: a link posted in twenty rooms is fetched once, and a message that predates its url's preview gains a card as soon as the url is cached.

A failure is stored as a row instead of as an absence, because an absence is indistinguishable from a url nobody has tried yet, and a dead host would be refetched on every post forever.

### The fetch is per-team rate limited, using the row it already writes

The hourly limit needs a per-team count of fetches, and the preview row already has to record something. Recording which team paid for the fetch turns the cache table into its own counter, so the limit needs no second table and no counter to keep in step.

### The post waits for the preview

The fetch runs at post time, never at render time: a render-time fetch would turn one popular room into an outbound request storm and would leak who is reading what. The remaining question is whether the post waits for it.

It waits. Backgrounding the fetch means a member pastes a link and sees no card until they reload, which reads as broken. Waiting costs up to two fetch timeouts on a cache miss and nothing at all on a hit, and the post already waits on attachment screening, which is slower. The call site has a `ponytail:` comment naming the limit and the change to make if posting starts to feel slow.

### The content security policy arrives with the feature

The app had no CSP. Once chat renders remote-derived images, `img-src 'self'` is what makes the proxy a guarantee instead of a convention — a preview image url that somehow escaped the proxy would be blocked by the browser instead of silently fetched.

The policy is deliberately narrow. It sets `img-src`, `object-src`, and `frame-ancestors` and says nothing about scripts or styles, because `ui/index.html` runs an inline theme script before first paint and a `script-src` would break it. `blob:` is included because the composer previews a chosen file before uploading it.

## Risks

- **A slow page delays a post.** Bounded by the timeout, only on a cache miss, and reversible by backgrounding the fetch.
- **A page's title and description are attacker-controlled text.** They render as text nodes in the card, never as markup, and they are clipped.
- **The preview text is derived from a user-pasted url**, so it gets the same encryption at rest the message does instead of being treated as public metadata.
