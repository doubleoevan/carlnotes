# apps/docs/

The Starlight docs site on Astro, the `@carlnotes/docs` app. It builds to static files that the api serves at `/docs`
from `apps/docs/dist`, so it runs no process of its own, and nothing imports it.

- `astro.config.mjs` — the site. `base` is `/docs`, which every generated link and asset url includes while the build
  output is not nested under it, so `apps/api/index.ts` strips the prefix again to find a file. `site` is the
  production origin, for absolute canonical urls and the sitemap. Every page builds as `<slug>/index.html` with a
  trailing slash. The Markdown processor is Sätteri with the video plugin, the first docs pages' paths redirect to
  `/docs/`, and the Starlight sidebar lists the sections in reading order: Start here names its three pages, and Topics,
  Your topic feed, Teams, and Account fill from their folders, where a new page joins by being added to the folder and
  orders itself with `sidebar.order`.
- `src/content/docs/` — the pages: `index.md`, `quickstart.md`, and `get-the-app.md` at the root, so their urls stay one
  segment, and `topics/`, `feed/`, `teams/`, and `account/`. `get-the-app.md` is the page the App Store url in
  `@carlnotes/contracts/mobileApp` opens before `APP_STORE_ID` is set. `src/content.config.ts` loads them with
  Starlight's own loader and frontmatter schema. `apps/api/seo.ts` reads the same Markdown for the llms files, and `bun
  run docs:embed` (`apps/worker/docsSync.ts`) embeds the pages' sections into `docs_chunks` for chat, so a page edit is
  followed by the build and the embed; the deploy runs the embed as a job.
- `src/components/Footer.astro` — the footer override, which adds the copyright line under Starlight's own rows.
  `src/routeData.ts` — the route middleware that points the header logo at the app instead of the docs home.
  `src/topicTutorialVideoPlugin.ts` — the Sätteri plugin that fills a page's video marker with the video on making a
  topic, built from `TOPIC_TUTORIAL_VIDEO` in `@carlnotes/contracts/youtube`, the constant the app reads too.
- `src/assets/screenshots/` — the screenshots the docs pages reference by relative path, and the ones release notes
  reference by raw url (`release-notes.md`), with a README on taking them.
  `public/favicon.svg` is the site's icon.
- `design/` — design references outside the site: `homepage.html`, and `podcast/` with the player mockups and
  `cover-base.png`, the illustration `apps/api/share/podcastCover.ts` draws the podcast covers over.
  `release-notes.md` is the convention for writing a release's notes, and `ai-scaffolding.md` describes how the repo
  constrains generated code.
- Imports: `@carlnotes/contracts` only, plus Astro, Starlight, Sätteri, `simple-icons`, and the `hast` types for the
  video plugin, with `sharp` declared for Astro's image service at build. No other package or app.
- Dev: `bun run dev:docs`. Build: `bun run build:docs`, which writes `apps/docs/dist/`. Tests: none of its own; the
  build is the check.
