## 1. Scaffold the Starlight project

- [x] 1.1 Add `astro` and `@astrojs/starlight` as dev dependencies with `bun add -d`, and confirm nothing new lands in `dependencies`
- [x] 1.2 Create `docs/` as a Starlight project: `astro.config.mjs`, `tsconfig.json`, and `src/content.config.ts` wiring the Starlight docs loader. No `package.json` of its own: the repo keeps one at the root, as `ui/` already does
- [x] 1.3 Configure `astro.config.mjs` with `site: "https://carlnotes.com"`, `base: "/docs"`, `outDir: "./dist"`, and `trailingSlash: "always"`, leaving `build.format` at its `directory` default
- [x] 1.4 Add `"build:docs": "cd docs && astro build"` and a `dev:docs` script to the root `package.json`. `docs/dist` needs no `.gitignore` entry: the existing bare `dist` rule already matches it at any depth
- [x] 1.5 Update the README Development section with `build:docs` and `dev:docs`, as the per-process script rule requires

## 2. Lay out the page tree and sidebar

- [x] 2.1 Create the four section directories under `docs/src/content/docs/` for Start here, Topics, Your topic feed, and Account
- [x] 2.2 Configure the Starlight `sidebar` as those four sections in that order. Each group wraps its `autogenerate` in `items`: the `label` shorthand was removed in Starlight v0.39. Start here names its two pages instead, since they sit at the content root and no directory would pick them up
- [x] 2.3 Create `docs/src/assets/screenshots/` with a README recording that screenshots are referenced relatively and never from `public/`
- [x] 2.4 Create the docs home page at `src/content/docs/index.md` so `/docs` has a landing page
- [x] 2.5 Create the remaining unwritten pages as stubs carrying `draft: true` and a `sidebar.order`, and confirm a production build emits none of them while `astro dev` shows them all
- [x] 2.6 Copy the app's `favicon.svg` into `docs/public/`, since Starlight prefixes the base path onto its favicon link and would otherwise request a file the build does not carry

## 3. Write the docs and retire the previous pages

- [x] 3.1 Write the eight pages across the four sections, from the live app rather than from the three essays the previous surface published
- [x] 3.2 Capture the screenshots each page references, and wire them as relative image references with descriptive alt text
- [x] 3.3 Redirect `how-carlnotes-works`, `carlnotes-glossary`, and `who-is-carl` to the docs landing page, so their inbound links keep working
- [x] 3.4 Build the docs and confirm every page renders, every image resolves, and each retired url redirects

## 4. Serve the docs from the app

- [x] 4.1 Mount `docs/dist` in `api/index.ts` under `/docs` with `serveStatic`, ahead of the UI bundle handler and the SPA fallback
- [x] 4.2 Write the `rewriteRequestPath` that strips the `/docs` prefix and appends `index.html` to any stripped path carrying no file extension, leaving extensioned paths untouched
- [x] 4.3 Answer a `/docs` path matching no built file with the docs site's `404.html` rather than falling through to the app shell
- [x] 4.4 Apply the cache policy: immutable for content-hashed docs assets, `no-cache` for page HTML and the search index
- [x] 4.5 Confirm the server still starts and serves every other route with `docs/dist` absent, answering 404 for `/docs`

## 5. Retire the markdown docs surface

- [x] 5.1 Remove the `docs` entry from `SURFACES` in `api/content.ts`, drop the `/docs` and `/docs/:slug` routes, and narrow the `Surface` type to the blog
- [x] 5.2 Delete `content/docs/`
- [x] 5.3 Drop `/docs` and its pages from the sitemap in `api/pages.ts`, leaving the app routes and the blog
- [x] 5.4 Update the comments in `api/content.ts`, `api/index.ts`, and `api/seo.ts` that still describe two surfaces or a docs sitemap entry

## 6. Ship the docs in the image

- [x] 6.1 Add `RUN bun run build:docs` to the Dockerfile build stage alongside `build:ui`
- [x] 6.2 Add `COPY --from=build /app/docs/dist ./docs/dist` to the runtime stage, and confirm neither Astro nor Starlight installs there
- [x] 6.3 Confirm `COPY content ./content` still carries the blog now that `content/docs/` is gone

## 7. Verify

- [x] 7.1 Build the UI and docs, run the server, and check each URL form resolves: `/docs`, `/docs/`, `/docs/how-carlnotes-works`, and `/docs/how-carlnotes-works/`
- [x] 7.2 Check that docs assets and the search index load under `/docs`, and that search returns a docs page
- [x] 7.3 Check that an unknown docs path answers the docs 404 and never the app shell
- [x] 7.4 Fetch `/sitemap.xml` and confirm no `/docs` URL appears while the blog index and posts still do, then confirm the docs sitemap Starlight emits carries absolute URLs
- [x] 7.5 Confirm `/blog`, a blog post, and the SPA routes are unchanged
- [x] 7.6 Run the gate: `bunx biome check .`, `bunx tsc -b`, and `bun test`
