## Why

Shipped work is invisible. There is no page that says what changed, so the only record is the commit
log, and a reader who wants to know what is new has nowhere to go. The obvious fix — a hand-written
changelog page — creates a second document that drifts from the releases it describes within a month.

GitHub Releases is already the natural authoring surface: it sits where the work lands, it generates
its own PR list, and it is where a tag is cut. Making carlnotes.com/releases a reading surface over
that data means one changelog, authored once, published in two places.

## What Changes

- **Release notes get a convention.** A release body is a hand-written summary, a `<!-- more -->`
sentinel, then the auto-generated PR list folded into a `<details>` block. `.github/release.yml`
sorts the generated list into features, fixes, and dependencies by PR label, with dependency-bot
authors excluded. The convention is documented in the repo so it survives the person who wrote it.
- **Releases are stored, not fetched.** A `releases` table holds the tag, name, body markdown,
published date, GitHub url, and prerelease flag. The app reads its own database, never GitHub, on a
pageview.
- **A GitHub webhook keeps the table current.** A signed `release` webhook upserts by tag. It acts
only on `action: "published"` and ignores every other action, so editing a typo in a published
release does not re-fire anything downstream.
- **`/releases` is a server-rendered page, and each release also has its own URL.** The index renders
the stored markdown through the app's own markdown pipeline and theme, showing only the summary above
`<!-- more -->`; `/releases/<tag>` renders one release whole. Neither lists drafts or prereleases.
Separate URLs are what let a single release be linked, shared, and indexed on its own terms.
- **A sync script backfills and repairs.** It reads the GitHub API and upserts the same rows the
webhook does, so it seeds releases that predate the webhook and reconciles any delivery that was
missed.
- **The discovery surfaces learn about releases.** `/releases` joins the sitemap, each published
release becomes an item in `/feed.xml`, and `/changelog` permanently redirects to `/releases`.

## Capabilities

### New Capabilities
- `release-notes`: how a release is authored on GitHub, stored in the app, and read at
`/releases` — the body convention, the webhook contract, the stored shape, the page's rendering and
filtering rules, and the sync script that backfills and repairs.

### Modified Capabilities
- `seo`: the sitemap gains `/releases` and every release's own page, the site feed gains an item per
published release alongside the blog posts it carries today, and `/changelog` becomes a permanent
redirect to `/releases`.

## Impact

- **New**: `.github/release.yml`, a `releases` table and its migration in `db/`, a webhook route and
a `/releases` page route in `api/`, a sync script, and the release-body convention in the repo docs.
- **Modified**: `api/seo.ts` for the sitemap entry, `api/pages.ts` for the feed items and the
`/changelog` redirect, `db/schema.ts` for the new table.
- **Reused**: the blog's markdown-to-HTML rendering in `api/content.ts`, and `toSiteFeedXml` in
`api/share/feed.ts`, which already takes a generic item list and whose channel description already
reads "the blog, and what ships".
- **Secrets**: one new Doppler value, the webhook signing secret. The sync script needs a GitHub
token only for a private repo; the repository is public, so it can read unauthenticated.
- **Deferred**: emailing a release to subscribers. The stored shape is designed so that broadcast
reads these rows without a schema change, but no send is built here.
