## Context

The feed row's metadata line shows `resource.source`, which the api sets to the url's host, and the link preview card
names its host the same way. Neither shows an icon. Firecrawl's scrape metadata includes a `favicon` url for the
page, which `fetchFirecrawlMarkdown` reads past. Link previews already fetch an image at scan time through
`fetchPublicUrl`, keep it in object storage under a key, and serve it from this origin with a cache header, so the
shape of "fetch a small image once, keep it, serve it ourselves" exists and is proven.

## Goals / Non-Goals

**Goals:**

- A source is recognizable at a glance wherever its host is named: the feed row and the link preview card
- One fetch per host, then nothing: a browser asks once and keeps the icon for a month
- No third-party request at render time

**Non-Goals:**

- Icons in the scan email, which is deliberately image-free
- Icons for hosts no scan has fetched a page from. A host earns its icon when a page on it is read
- Refreshing an icon on a schedule

## Decisions

### The icon is fetched and served by us, never by a third-party icon service

An icon service is one `<img>` tag and no code. It also sends the list of hosts a user follows to that service on
every page view, which is exactly what the cookieless analytics change was made to avoid, and it is a hotlink that
can rate-limit or disappear. The worker fetches the icon Firecrawl names through the same public-url guard every page
fetch takes, and the api serves it from this origin. The browser only ever talks to us.

### One row per host, written when review reads a page on the host

Thousands of resources share a few hundred hosts, so the icon belongs to the host. When review stores a page's
content it also fetches and stores the host's favicon, best effort: a failure is logged and never fails or slows
the scan. The host is the same one the feed row already shows, so the two agree.

A host that has no row, or one fetched more than thirty days ago, is fetched. A fetch that fails, or a page that names
no icon, still writes the row, with no object, so the host is not tried again until the month passes. That is what
stops a host with no icon costing a fetch on every scan.

### Which icon is kept

Up to seven urls are tried in order, and the first that fetches is kept: `/favicon.ico` at the host's root, which the host's
operator controls and not the author of one page on it, so a page on a shared host such as an archive or a storage
bucket cannot set the icon every user sees for that host; then the icon the page named, made absolute; then
`/favicon.svg` and `/apple-touch-icon.png` at the root; then those three at the host's www or bare spelling, since
the two are one site and one may serve the icon for the other, as linkedin.com serves a page where www.linkedin.com serves
the icon. Firecrawl names one icon per page, the first the page lists, so the root svg covers a site that lists a png
that is gone ahead of the svg it serves. The fetch keeps an icon the way a link preview
image is kept, plus ico and svg. A favicon over 256 KB is not one worth serving on every row and is dropped. The
stored-file headers' inline image allowlist gains the two ico types, so an ico is shown in place like a png.

An svg can hold a script, so it is never shown as a page: the route sends every icon with a content security policy
that allows nothing and sandboxes the document, an svg is sent as a download since it is outside the inline allowlist,
and nosniff stays. An `<img>` ignores all three and draws it.

### A failed refetch keeps the icon

The row is read with its object key and type, and a failed refetch moves the fetch time alone, so a host that
served an icon once keeps it through a transient failure or a page fetched by a path that names no icon. Pages
reviewed side by side on one host share one fetch, kept in a map of fetches under way.

### Served with a month-long cache and a stable path

`GET /api/favicons/:host` streams the stored object with the stored-file headers a link preview image gets and a
`Cache-Control` of a month. The path never changes, so the feed and every link preview card share one browser cache
entry per host. An icon that changes on its site shows up within a month.

### The icon sits in a round chip, and the globe glyph is the fallback

The icon shows in the round chip a search result shows one in, faint on the light theme and white on the dark one,
so a dark glyph reads on both. A host with no icon shows a muted `Globe` in the chip, the fallback every browser tab
uses, and the glyph also shows until the image is drawn, so a row never has an empty slot. The `<img>` swaps
to the glyph on its error event too, since a stored icon can still be a file the browser cannot draw. The glyph is
muted so it never competes with a real icon, and so it reads apart from the "public" globe the visibility badge uses
in a different place at a different size.

## Risks / Trade-offs

- **A relative favicon url.** Firecrawl may name the icon relative to the page. It is resolved against the page url
  before the fetch, and only an http(s) url reaches the guard.
- **An icon up to a month stale.** Accepted. Browsers do the same, and a wrong icon for a few weeks costs nothing.
- **A host's first scan fetches one more thing.** One guarded fetch of a few KB, once, on a scan that already fetched
  the page. It runs beside the page's scoring, not ahead of it, and the review batch waits for the last of them at its
  end, so a slow icon host delays no score. An icon whose upload fails counts as a failed fetch, so the host waits out
  the month like any other.
- **Storage.** Under 256 KB per host, a few hundred hosts. Negligible.
- **The icon url is page-author-controlled.** It goes through the public-url guard like every fetched url. Reviewing
  this change found the guard read an ipv6-mapped ipv4 in its dotted spelling only, so `[::ffff:7f00:1]` reached
  loopback. The guard now expands the hex spelling too, for every caller.
