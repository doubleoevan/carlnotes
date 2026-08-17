## Context

`/docs` is served today by `api/content.ts`, which renders markdown from `content/docs/` through the same `loadPages` → `markdown-to-jsx` → `renderToStaticMarkup` path as the blog. Both surfaces share one inline stylesheet and one header link. There is no sidebar, no navigation between pages, no search, and no mobile treatment beyond a max-width column.

That is adequate for three standalone essays and inadequate for the manual the product needs: four sections, roughly eight pages, screenshots, and readers who arrive mid-tree from a search result. The blog is genuinely a list of dated posts and keeps its renderer; the docs are a tree and want a documentation framework.

The constraint that shapes everything below is that CarlNotes is one origin. The app, the API, the blog, and the docs all answer from `carlnotes.com` behind one Hono server in one container. A docs framework here has to produce static files this server can hand out, not a second deployment.

## Goals / Non-Goals

**Goals:**

- Starlight owns `/docs` end to end: routing, sidebar, mobile nav, dark mode, and search.
- Every url the previous docs surface published still answers, so no inbound link reaches a dead end.
- The page tree, sidebar order, and screenshot convention are settled now, so writing the pages later is writing, not deciding.
- The docs ship inside the existing image on the existing deploy, with no second service and no second host.
- The blog is untouched.

**Non-Goals:**

- Writing the eight documentation pages or capturing screenshots.
- Blog RSS, the theme-aware content shell, and the Privacy and Terms migration.
- A site-wide search box spanning docs and blog.
- Visual parity between the Starlight theme and the app's own design system. Starlight's default theme ships as-is; matching the app's palette is a later pass if it earns one.

## Decisions

### Starlight, built statically, mounted by the app server

Starlight generates a static site at build time and the app server hands out the files. No Node adapter, no second process, no reverse proxy.

The alternative was keeping docs in `api/content.ts` and hand-building a sidebar, a mobile nav, and a search index. That is the work Starlight has already done, and the search half of it is the part nobody wants to own. **GitBook** was rejected in review: its CLI is abandoned and the SaaS lives off-domain, which forfeits the `carlnotes.com/docs` URLs that make the docs an SEO asset. **VitePress** was rejected for pulling Vue into a React codebase for one surface.

Astro and `@astrojs/starlight` enter as dev dependencies. They run only at build time; the runtime image gains the static output and no new runtime package.

### The build output does not nest under `base`, so the mount rewrites the path

`base: '/docs'` tells Astro to prefix every generated link and asset URL with `/docs`. It does **not** nest the build output — `docs/dist/index.html` is the file that must answer `/docs/`, and `docs/dist/_astro/*` answers `/docs/_astro/*`.

So the Hono mount strips the prefix on the way in:

```text
/docs/topics/creating  →  rewrite  →  /topics/creating  →  docs/dist/topics/creating/…
```

Hono's Bun `serveStatic` takes a `rewriteRequestPath` for exactly this, and `root: "./docs/dist"` for the rest.

### Directory URLs are resolved by appending `index.html` in the rewrite

Astro's default `build.format: 'directory'` writes each page as `<slug>/index.html`, and `trailingSlash: 'always'` makes every generated internal link end in a slash. Both are kept, because directory URLs are what a docs site should have.

The gap is the request that arrives without the trailing slash — a hand-typed URL, an old link, a search result. `serveStatic` appends `index.html` only for a path already ending in `/`, so `/docs/topics/creating` would miss, fall through to the SPA fallback, and render the app shell where a docs page belongs. That failure is silent and looks like a broken docs page rather than a routing bug, which is what makes it worth handling in the rewrite rather than discovering later.

The rewrite therefore appends `index.html` to any stripped path that carries no file extension. One expression covers `/docs`, `/docs/`, `/docs/topics/creating`, and `/docs/topics/creating/`; paths that do carry an extension (`_astro/*.js`, `pagefind/*.pf_index`, images) pass through untouched.

A docs path matching no file answers Starlight's own `404.html`, not the app shell. A reader who mistypes a docs URL should land in the docs.

### Screenshots live in `src/assets/`, never in `public/`

Astro prefixes `base` onto image paths it processes, and does not prefix it onto absolute paths written by hand. A screenshot at `public/screenshots/feed.png` referenced as `/screenshots/feed.png` resolves in dev — where the dev server serves from the site root — and 404s in production, where the file actually sits at `/docs/screenshots/feed.png`.

That asymmetry is a trap: it passes every local check and breaks only once deployed. So screenshots live at `docs/src/assets/screenshots/` and are referenced relatively (`../../assets/screenshots/feed.png`). Astro then processes them, applies the base prefix itself, and optimizes them on the way through.

### The sidebar is four autogenerated sections, ordered by frontmatter

Four sections in fixed order — **Start here**, **Topics**, **Your topic feed**, **Account** — each `autogenerate`d from its own subdirectory under `docs/src/content/docs/`. Within a section, page order comes from `sidebar.order` in each page's frontmatter.

The alternative is listing every page explicitly in `astro.config.mjs`, which means every new page is a two-file change and a merge conflict in a config file. Autogeneration puts a page's position in the page.

### Unwritten pages are stubs excluded from the production build

The page tree exists as files from day one so the structure is reviewable, but a sidebar padded with eight empty entries is worse than a sidebar with three real ones — a reader clicking "Creating a topic" and finding an empty page learns the docs are unfinished.

Stub pages therefore carry `draft: true` in frontmatter, which Astro excludes from production builds while keeping them visible in `astro dev`. The sidebar in production lists only pages with content, and grows as pages are written, with no config edit per page.

### The docs sitemap is Starlight's, ours keeps app routes and the blog

`toSitemapXml` builds our sitemap from live data. It stops listing `/docs` paths, since it can no longer see them: the pages are files in another project, not rows or markdown it reads. Starlight emits its own sitemap for its own pages, which is why `site: 'https://carlnotes.com'` must be set — without it the emitted URLs are relative and useless to a crawler.

Two sitemaps at one origin is normal and both are reachable; `robots.txt` continues to point at ours.

### The image builds docs in the build stage

There is no `release-main` workflow to change. `.github/workflows/ci.yml` is an offline quality gate that never deploys, and Northflank builds `Dockerfile` on its own git trigger. So "build docs before releasing the app" is a `bun run build:docs` in the Dockerfile's build stage, next to the existing `build:ui`, and a `COPY --from=build /app/docs/dist ./docs/dist` into the runtime stage.

`COPY content ./content` narrows to the blog once `content/docs/` is gone.

### Docs search is Starlight's Pagefind; the blog gets its own later

Starlight runs Pagefind over its own build output and ships the index as static files under `/docs/pagefind/`. Docs search costs one config decision and no infrastructure.

The blog is not in that index and does not need to be yet. When post volume justifies it, a standalone Pagefind pass over prerendered blog HTML produces a second index scoped to `/blog`, independent of the one Starlight owns. A combined site-wide index would be a third pass over both output directories, leaving the per-surface indexes intact. Both are out of scope here and neither constrains anything in this change.

## Risks / Trade-offs

- **Astro's toolchain is a second build system in a Bun/Vite repo** → It is confined to `docs/` and invoked by one script. Nothing outside `docs/` imports from it, and the runtime image gains only static files.
- **A `/docs` request that misses falls through to the SPA shell instead of 404ing** → The extensionless-path rewrite plus the `404.html` fallback close this. It is the failure this design is most exposed to, so the tasks verify the no-trailing-slash URL explicitly rather than assuming the config is right.
- **Screenshots referenced absolutely will pass review and break in production** → Documented as the convention here, and there are no screenshots yet to get it wrong; the first one to land sets the pattern.
- **`content/docs/` deletion and the Starlight mount must land together** → Between them, `/docs` is served by nobody. They are one change and one commit, not a sequence.
- **The image grows by the docs build output** → Static HTML, CSS, and a Pagefind index. Screenshots will dominate it later, and image optimization at build time is the lever if it ever matters.
- **Starlight's default theme will not look like CarlNotes** → Accepted. Shipping the structure beats blocking it on a theme, and the docs reading as a docs site is not a defect.

## Migration Plan

1. Scaffold `docs/`, port the three pages, and land the mount and the `api/content.ts` removal in one change, so `/docs` never has a gap.
2. The three urls the previous surface published — `/docs/how-carlnotes-works`, `/docs/carlnotes-glossary`, `/docs/who-is-carl` — redirect to the docs landing page, each carrying a canonical url and a noindex directive. The pages themselves were replaced: they were three standalone essays, and the docs written here are a four-section manual that covers the same ground in its own structure. Their JSON-LD `Article` tags are gone too, since Starlight emits its own head tags.
3. Rollback is reverting the change. The markdown that `content/docs/` held is in git and in `docs/src/content/docs/`, so nothing is lost either direction.

## Open Questions

- Whether the retired urls should be true `301` responses rather than the meta-refresh pages Astro emits for a static build. A refresh page with a canonical url is enough for a crawler to pass the signal along, and a real `301` would mean teaching the Hono mount three slugs that live nowhere else. Revisit if the docs ever retire urls in bulk.
