## Why

A full-site audit found the app nearly invisible to search. There is no `robots.txt` and no `sitemap.xml`. The shell hardcodes `<link rel="canonical" href="https://carlnotes.com">` on every page, so `/topics/:id` and `/profiles/:userId` tell Google they are duplicates of the homepage. One static `<title>` covers every route. A profile page serves no server-rendered meta at all, and no page carries structured data. The shell tag-injection seam that fixes most of this already exists: `api/share/preview.ts` rewrites the shell's OG tags for topic pages.

## What Changes

- Serve `robots.txt` allowing all crawlers and pointing at `/sitemap.xml`.
- Generate `sitemap.xml` server-side in Hono from a live DB query: the static routes (`/`, `/pricing`, `/terms`, `/privacy`), the content pages, and every public shown Topic — never a committed static file. Profile pages stay out: they keep their canonical url and preview tags but are too thin to promote.
- Extend the shell tag injection three ways: each route's own canonical URL replaces the hardcoded homepage one, each route gets its own `<title>` (`{topic name} — CarlNotes`, `{username} — CarlNotes`), and a new `GET /profiles/:userId` shell route with `toProfilePreview` gives profiles the title/description/canonical/OG treatment topics already have.
- Render a profile preview card the way topic links get one: the avatar and username in the title slot, the public topic count bottom left and the follower count bottom right, served at `GET /api/profiles/:userId/preview.png` and named by the profile's OG image tags.
- Give the SPA-drawn pages (plans, terms, privacy) their own shell routes too, so each serves its own title and canonical url. A title set client-side on mount is invisible to a crawler and leaves the homepage canonical url in place, which is the duplicate-content bug this change exists to fix.
- Add JSON-LD: `Organization` and `SoftwareApplication` (offers from the pricing tiers) on the homepage shell, and a `CreativeWork` (name, description, url, dateModified from the last scan) alongside the OG injection on public topic pages, carrying the last Scan's Findings as a ranked `hasPart` ItemList — each entry the finding's title, link, and relevance explanation, the same content the scan email shows.
- Add a server-rendered blog: `/blog` and `/blog/:slug` render markdown posts to HTML in Hono, visible without JS, each carrying its own title, description, canonical url, and JSON-LD. Posts are static markdown files under `content/` with a small frontmatter parser — no CMS.

## Capabilities

### New Capabilities

- `seo`: robots, the sitemap, per-route canonical urls and titles, and structured data
- `blog`: the server-rendered markdown blog surface

### Modified Capabilities

- `social-sharing`: a public profile page carries its own server-rendered preview tags and rendered preview card, the treatment topic pages already get

## Impact

- `ui/public/robots.txt` (new), `api/index.ts`: the robots and sitemap routes, the profile shell route, and the blog routes ahead of the static catch-all
- `api/share/preview.ts`, `api/share/previewImage.ts`: canonical url and title injection, `toProfilePreview`, and the profile card render
- `api/seo.ts` (new): the sitemap and the JSON-LD builders, including the findings ItemList
- `ui/index.html`: unchanged as the default; its canonical url and title become the replaced fallbacks
- `api/pages.ts`: the shell routes, including the plans, terms, and privacy titles and canonical urls
- `content/` (new): the first posts as markdown with frontmatter
- No schema migration.
