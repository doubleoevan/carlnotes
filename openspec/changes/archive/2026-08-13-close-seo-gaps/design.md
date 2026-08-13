## Context

The api already rewrites the shell for one route: `GET /topics/:id` loads the built `index.html`, strips the shell's default OG tags (`REPLACED_PREVIEW_PROPERTIES` in `api/share/preview.ts`), and appends the Topic's own before `</head>`. Everything else serves the raw shell through the static catch-all, whose head carries one title and a canonical url hardcoded to the homepage. Crawlers run no script, so whatever the shell says is what search engines index.

## Goals / Non-Goals

**Goals:**

- Every indexable page tells a crawler its own canonical URL and title.
- Crawlers can discover every public page from `/sitemap.xml`.
- Profiles get the same server-rendered preview treatment as topics.
- The homepage, topic pages, and blog posts carry structured data.
- Blog posts are readable without JS execution.

**Non-Goals:**

- No CMS, no authoring UI. Posts are markdown files in the repository.
- No server rendering of the SPA itself. The shell-injection pattern stays; only tags change, plus the blog as its own small HTML surface.
- No search-ranking work beyond correctness: no keyword tooling, no analytics changes.

## Decisions

**The sitemap is a live query, not a file.** Public pages come and go with visibility edits and the shown-findings gate, so a committed sitemap would drift the day it landed. The route queries public shown Topics, the same gate the featured and profile surfaces already apply, so the sitemap never advertises a page that answers with a gate or an empty table. Static routes are a literal list in the handler.

**Profiles stay out of the sitemap.** Every profile is reachable and keeps its canonical url, title, and preview card for anyone who shares a link, but the page itself is a username and two counts — thin content. Promoting thin near-duplicates invites exactly the mangled indexing this change exists to fix, so no profile is listed.

**Title and canonical join the replaced-tags seam.** `withoutReplacedTags` today strips only `<meta>` tags by property name. It grows two targeted removals — the `<title>` element and the `<link rel="canonical">` element — so each injecting route appends its own pair the same way it appends OG tags. The shell's hardcoded pair remains the fallback for every route that never hits an injecting handler.

**Profiles reuse the whole seam.** `toProfilePreview` loads the username, avatar, and public-topic figures, and the new `GET /profiles/:userId` handler mirrors the topic one: inject on success, fall through to the plain shell on a missing user or an unbuilt bundle. Description shape: the username, how many public topics, and how many followers. The OG image is the profile's own rendered card in the topic card's format — the avatar and username in the title slot, the public topic count bottom left, the follower count bottom right — cached and versioned through the same key scheme.

**JSON-LD renders as appended script tags.** Structured data is `<script type="application/ld+json">` appended beside the OG tags: `Organization` and `SoftwareApplication` (offers built from `PLANS` in `shared/plans.ts`) on the homepage shell — which needs the homepage to gain an injecting handler for `/` rather than falling to the catch-all — and `CreativeWork` on topic pages with `dateModified` from the last succeeded Scan. The Organization's `sameAs` list is a constant beside the builder, empty until official profiles exist.

**The CreativeWork carries the findings themselves.** The last Scan's Findings ride in `hasPart` as a ranked `ItemList` — position, title, link, and relevance explanation, the same fields the scan email renders — so a machine reader gets the page's substance instead of guessing at it from a title and two counts. The list points at external URLs, so no rich-result carousel is expected; the payload exists for comprehension, which is the failure this change set out to fix.

**The same list renders as a noscript body.** The SPA shell's body is empty until React mounts, so a crawler that runs no JavaScript — most AI crawlers — reads nothing but the head. The topic route injects a `noscript` section right inside the body: the name, the description, and the ranked linked findings, built from the same query rows as the ItemList so the two can never drift. Browsers always run the SPA, so no person ever renders it, and the content matches what the page shows, so it is progressive enhancement rather than cloaking. Both the CreativeWork and the noscript body are public-topic-only: a private or invite page serves its card tags alone, since a non-public Topic's page never discloses its work.

**The blog renders markdown with what is already installed.** Posts render server-side with `markdown-to-jsx` through `react-dom/server`'s `renderToStaticMarkup` — both already dependencies — inside a minimal HTML page the handler assembles, with the post's title, description, canonical url, and `BlogPosting` JSON-LD in its head. Posts are trusted repository content, so no sanitizer runs. Frontmatter is a leading `---` block parsed by a small splitter: `title`, `description`, `date`, and `slug` from the filename.

**Blog routes sit ahead of the static catch-all.** `/blog` and `/blog/:slug`, like the sitemap and the profile shell route, register before the `serveStatic` catch-all in `api/index.ts`, the same placement the topic shell route already uses. `robots.txt` ships from `ui/public/`, which the catch-all already serves.

## Risks / Trade-offs

**Two head-rewrite regexes instead of a parser.** The title and canonical url removals are string surgery like the existing meta strip. Fine while the shell's head is ours and simple; revisit if the shell ever carries conditional tags.

**The homepage handler takes over `/`.** Serving `/` through an injecting handler instead of the catch-all must preserve the shell's caching behavior for that path, and fall through cleanly when the bundle is missing, like the topic route does.

**Sitemap size is unbounded in principle.** Fine at current scale; the sitemap protocol caps a file at 50k URLs, and a paginated index is the standard next step if the site ever approaches it.
