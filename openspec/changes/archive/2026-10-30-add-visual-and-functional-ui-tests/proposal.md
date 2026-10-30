## Why

Every push goes straight to main. The blocking gate already proves types, units, boundaries, and parity. Nothing checks
what a component looks like, or whether a click still saves.

- **Web stories:** the web component browser has 456 stories in 111 files, and 79 of them run a play function. No CI
  job builds or runs them, so their accessibility check at error level only runs when someone opens the browser.
- **Native stories:** the mobile app's component browser on the device is never captured.
- **MCP cards:** the three cards have no test host. Their only tests render static markup.

A broken component or flow is found by a user today. This change adds checks that report after a push, every night,
and on demand. They never sit in the way of the gate, a deploy, or a release.

## What Changes

- **A report-only UI tests workflow.** A new GitHub Actions workflow runs on a push to main, nightly, and by manual
  dispatch.
  - Its jobs are separate from `ci.yml`, and none of them is a required check.
  - It runs on GitHub-hosted runners with open-source tools and holds no repository secret.
  - Preflight, the CI gate, Smoke, Evals, Northflank deploys, and EAS releases do not change. The pre-push hook gains
    only the Git LFS upload of approved images.
  - A failing job ends red, with annotations and a summary. It never stops a push or a deploy.
- **Affected selection on a push.** A push compares its commit with the last commit this workflow checked green. It
  captures the stories, and the MCP cards, whose import graph reaches a changed file.
  - A token, a global stylesheet, the component browser's setup, a dependency, the build config, or the test tooling
    selects everything.
  - So does any file whose effect the graph cannot place.
  - Nightly runs capture everything. A dispatched run captures everything by default, or only the affected image
    captures.
- **Web image captures.** Playwright opens each story of the built component browser in a pinned Playwright container.
  - Each story is captured in Latte and Dark roast, at the 375-pixel phone width and a fixed desktop width.
  - The clock is fixed, randomness is seeded, motion is reduced, the fonts are vendored, and outside requests are
    blocked.
  - One comparator checks each image capture against its approved baseline. The report has the baseline, current, and
    diff images and a JSON summary.
  - A missing baseline is reported as new, never as a pass and never as a failure. The accessibility addon's per-story
    result is reported beside each image capture.
- **Approved baselines.** Each platform has its own baselines in the repo, versioned with the code they show.
  - The images are stored in Git LFS, so the history holds only their pointers. Only the web job downloads them,
    through a cache that misses only after an approval.
  - The only way to change a baseline is an approval command that copies images from a named workflow run's artifact.
  - It rejects an image capture that errored, was unstable, or came from a different capture environment.
  - CI never writes a baseline.
- **Native image captures.** The development build's component browser opens one story by link, in capture mode. Maestro
  captures it on a pinned Android emulator and a pinned iOS simulator, each against its own baselines.
  - A parity report puts each Nightshift story on web, iOS, and Android side by side. It reports differences and never
    fails on them.
  - Android ships first and iOS second. Each native job names its environment and fails visibly if it cannot provision
    the device.
- **MCP card host.** A test host built on the ext-apps `AppBridge` loads the real card html from the built bundle. It
  drives each card with fixture tool input, `structuredContent`, `_meta`, host theme, and tool call results.
  - It captures the empty, loading, error, signed-out, long-text, and dark states.
  - It asserts the Save, Follow, rating, bookmark, done, sort, and paging calls and what each one leaves on screen.
  - The MCP protocol and authorization tests stay in the api's own test files.
- **Functional flows.** Playwright flows run against a disposable stack on the runner: a local database, Redis, and the
  api, with seeded test users and never a production secret. None of these flows calls a model, so the stack needs no
  model server.
  - **Topics:** create, edit, save, and reopen a Topic.
  - **Finding state:** Follow, rating, bookmark, and mark read, with their resulting state.
  - **Search:** search, filters, sort, and paging.
  - **Sessions:** sign-in and sign-out, guarded routes, deep links, session restore, and offline behavior.
  - **MCP cards:** tool input and results render, and the cards' tool calls work.
  - Maestro runs the native counterparts. A smoke subset runs on each push, and every flow runs nightly.
  - A failure keeps its Playwright trace, video, and logs.
- **Docs.** The new folder gets its own AGENTS.md with the steps to read a failure, approve a baseline, and run a check
  locally. The root module map and routing table, the web and mobile AGENTS.md files, and the README Development section
  name the new scripts and the workflow. They also say that CI cancels a superseded run, and what that means for
  selection.

## Capabilities

### New Capabilities

- `visual-regression`: deterministic capture of web stories, MCP cards, and native stories, and comparison against
  per-platform approved baselines. Also covers the report's statuses and images, baseline approval, and the
  cross-platform parity report.
- `image-capture-selection`: which image captures a push checks. Covers the diff base, the import graph from stories and
  cards to changed files, the changes that select everything, and the fallback to everything if the mapping is
  uncertain.
- `ui-test-workflow`: the report-only GitHub Actions workflow. Covers its triggers and jobs, its separation from the
  gate and from deploys, its concurrency, timeouts, and artifact retention, and its summary and annotations. Also
  covers how it states a native environment that could not run.
- `functional-ui-tests`: the end-to-end flows on web, native, and MCP cards. Covers the disposable backend they run
  against, the push subset and the nightly set, and the evidence a failure keeps.

### Modified Capabilities

- `mcp-cards`: adds a test host that renders each card from fixture tool results and records its tool calls. The cards'
  own behavior is unchanged.
- `component-contracts`: the development build's component browser opens one story by id and theme from a link, in a
  capture mode that fixes the clock, seeds randomness, and marks when the story has rendered. Release builds are
  unchanged.

## Impact

- **New files:**
  - a root `ui-tests/` folder with the selection, capture, comparison, report, approval, MCP host, and flow code,
    and the baselines
  - `.github/workflows/ui-tests.yml`
  - Maestro flows
- **Changed files:**
  - `apps/mobile/app/storybook.tsx` and `apps/mobile/.rnstorybook/` gain capture mode, for development builds only.
  - The import resolver in `scripts/clientParity.ts` moves to a shared module that selection reuses.
  - `packages/db/index.ts` reads a test-only variable that points its driver at a local WebSocket proxy. Production
    never sets it.
  - `docker-compose.yml` gains a `ui-tests` profile, and Dependabot covers the capture container's image.
  - `.dockerignore` keeps `ui-tests/baselines/` and `ui-tests/output/` out of the image.
  - A root `.gitattributes` stores the baseline images in Git LFS. The pre-push hook uploads a push's Git LFS files,
    and `scripts/carl-up.sh` installs git-lfs.
  - The root AGENTS.md, the web, mobile, and db AGENTS.md files, and the README name the new folder, scripts, and
    variable.
- **Dependencies:** root development dependencies for `playwright-core` at the version already in the lockfile,
  `storybook` at the web app's version for its CSF loader, `pixelmatch`, `pngjs`, and the core workspace.
  `@playwright/test`, at the same Playwright version, arrives with the functional flows. Maestro's CLI and the Android
  emulator action are installed in CI at pinned versions.
- **CI:** GitHub-hosted Linux runners for web, MCP, Android, and the functional flows, and a macOS runner for iOS. They
  are free for this public repository, limited by timeouts and selection. No workflow gains a secret, and no existing
  workflow changes.
- **Not affected:** production code paths, the api's routes, the database schema, Northflank, and EAS.
