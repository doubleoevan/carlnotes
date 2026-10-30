## Context

See proposal.md for why. This section records what exists today, which shapes every decision below.

**Gates and delivery.**
- **Preflight:** the pre-push hook runs `scripts/preflight.sh`, and the CI gate job runs the same script.
- **CI:** `ci.yml` also has the `mobile-export` job. Its concurrency group is per ref, with `cancel-in-progress: true`,
  so a newer push to main cancels the run in progress.
- **Smoke:** the suite runs against the shared dev database with Doppler secrets, in one queue that never cancels.
- **Evals:** report-only, with warnings instead of failures.
- **Delivery:** Northflank deploys main on its own git trigger, and EAS builds and updates start by hand.
- **The repo:** public, and main has no branch protection or required check.

**The web component browser.**
- **Stories:** Storybook 10.6.4 on `@storybook/tanstack-react`, with 456 stories in 111 files. 79 stories run a play
  function, and the three docs pages are MDX.
- **The preview:**
  - adds the `dark` class from the `theme` global
  - rejects `/api` fetches on its own origin, and keeps storage in memory
  - mocks every api client
  - sets the accessibility addon to error level on the WCAG A and AA tags
- **What runs it:** nothing in CI builds or runs a story today. The accessibility check runs only in the browser's
  panel.
- **The build:** `build:storybook` writes `apps/web/dist/nightshift/` with an `index.json`. Each entry has an id, a type
  (story or docs), an import path, and tags, but no parameters or globals. The build leaves out the app's public
  folder, so root paths such as `/carl-hero.png` resolve against whatever serves it.

**What makes a web story change between runs.**
- **The clock:** relative ages read `Date.now()` in `packages/core/lib/labels.ts`, and InfoPanel's story computes a date
  from it.
- **Locale and time zone:** date labels use the browser's locale and time zone.
- **Randomness:** the thinking line shuffles with `Math.random`.
- **Animations:** infinite CSS animations run unless reduced motion stops them. The spinner and the accordion ignore
  reduced motion.
- **Fonts:** they load from Google Fonts through an `@import` in `globals.css`.
- **The network:** one story loads an outside image.

**The native component browser.**
- **Stories:** `@storybook/react-native` 10.7.0, with 349 stories in 110 files and explicit titles that mirror the
  web's. 53 titles exist in both apps, and 142 story names match under them.
- **Who sees it:** the `storybook` route shows only while `__DEV__` is true, and Metro turns Storybook on outside
  production.
- **Opening one story:** the installed release reads a `STORYBOOK_STORY_ID` query from the launch url and from later url
  events. The app's link rewriting leaves `/storybook` alone.
- **Theme and frame:** the theme follows the `backgrounds` global, and stories render inside Storybook's on-device
  frame.
- **Maestro:** archived notes found that Maestro's accessibility snapshot cannot see the story tree. Selecting a story
  by tapping is therefore not an option.
- **Fonts and startup:** fonts come from the `@expo-google-fonts` packages, so they need no network. The root layout
  waits for a session read from the api on the Metro host's port 3000.
- **Native builds:** `ios/` and `android/` come from prebuild. EAS has development and development-simulator profiles.
  No repo file mentions Maestro.

**The MCP cards.**
- **Connection:** `McpCardApp.tsx` connects through `useApp` with a `PostMessageTransport` to `window.parent`. It reads
  `structuredContent`, `_meta["carlnotes/card"]`, and the host theme.
- **Without a result:** it shows the loading mug until the result arrives. It never reads `isError`.
- **Existing tests:** seven card stories render from `setCardData`. Their tool clicks throw, since no host is connected.
- **The host bridge:** `@modelcontextprotocol/ext-apps` 2.0.3 exports a host-side `AppBridge`. It has `sendToolInput`,
  `sendToolResult`, `setHostContext`, `oncalltool`, and `onopenlink`.
- **Card html:** the api builds it with `toCardHtmlFromBundle` from `apps/web/dist/mcp-cards/`.

**The backend a flow needs.**
- **Database driver:** `packages/db` uses the Neon serverless `Pool`, which connects only over a secure WebSocket.
  The migrations need pgvector 0.8 or later and pg_trgm.
- **Settings:** the api boots with no settings. A request needs `DATABASE_URL`, `BETTER_AUTH_SECRET`, and
  `BETTER_AUTH_URL`.
- **Optional services:**
  - Without LiteLLM, text moderation is skipped and a save goes through.
  - Without Temporal, a new Topic's first Scan stays running.
  - Without Redis, sessions and rate limits fall back to Postgres and memory.
- **Sign-in:** a password sign-in works with no email verification. Smoke tests insert a user and a password account,
  then call `signInEmail`.
- **Pages:** the server render fetches from `http://localhost:3000`.
- **Seed data:** `packages/db/seed.ts` builds users, Topics, Sources, Scans, and Findings. Its caller,
  `apps/api/seed.ts`, will not run outside the dev config.
- **A browser test precedent:** `apps/api/signup.smoke.ts` already drives Chrome with `playwright-core` 1.64.1 under
  Bun.

**Helpers to reuse.**
- **Import graph:** `toNamedImports` and `resolveImportPath` in `scripts/clientParity.ts`, and `readSourceFiles` in
  `scripts/sourceFiles.ts`, already resolve relative, `@/`, and workspace imports.
- **Seed data:** the seed builders in `packages/db/seed.ts`.
- **Access tokens:** the MCP smoke test's OAuth helpers.
- **Images:** `sharp`, which is already a dependency.
- **Native fingerprint:** `@expo/fingerprint`, installed with expo.

## Goals / Non-Goals

**Goals:**

- **One pipeline:** four platforms, `web`, `mcp`, `android`, and `ios`, share one capture-then-compare pipeline, one
  report format, and one approval path.
- **Deterministic by construction:** pinned images, pinned devices, a fixed clock, vendored fonts, and a closed network.
  Determinism never comes from a loose tolerance.
- **Selection errs one way:** it can only select too much, never too little.
- **Proven before trusted:** a check counts as operational only after it has run on GitHub-hosted runners.

**Non-Goals:**

- **Cross-renderer equality:** pixel equality across web, iOS, and Android. The parity report informs, and never fails.
- **Automatic approval:** no auto-approval, no bot commit, and no pull request flow.
- **Replacing existing tests:** the unit tests, the smoke suite, and the MCP protocol and authorization tests stay as
  they are.
- **Other browsers:** capturing and the web flows run in Chromium only.
- **Model-driven flows:** the new-topic chat and Carl's replies need a scripted model server, so they are left out.
  Topics are created through the editor.
- **Card behavior:** this change does not change how the MCP cards behave. The two issues found while inspecting them
  are listed under Open Questions.

## Decisions

### 1. One report-only workflow, `.github/workflows/ui-tests.yml`

The workflow triggers on a push to main, nightly at 09:00 UTC, and `workflow_dispatch`. Dispatch takes the selection
input, `all` or `affected`. The native and flow stages add an input for the platforms and one that runs every flow.
Its jobs:

| Job | Runner | Runs when | Timeout |
|---|---|---|---|
| `select` | ubuntu-latest | always | 10 min |
| `web` (web image captures) | ubuntu-latest, in the capture container | web stories selected | 45 min |
| `mcp` (card image captures and card flows) | ubuntu-latest, in the capture container | cards selected, or any push for
the smoke flow | 20 min | | `flows` (web functional flows) | ubuntu-latest with service containers | every run: the
smoke subset on a push, every flow otherwise | 30 min | | `android` (image captures, and flows when nightly) |
ubuntu-latest with KVM and an emulator | native stories selected, or nightly | 90 min | | `ios` (image captures, and
flows when nightly) | macos-15 (arm64) | native stories selected, or nightly | 120 min | | `report` | ubuntu-latest |
always, after the others | 10 min |

- **Permissions:** `contents: read` and `actions: read`. The selection reads past runs.
- **No secrets:** every checkout sets `persist-credentials: false`, and no step reads a secret.
- **Pinning:** actions are pinned by commit SHA, and images by digest, as `supply-chain` already requires of the
  existing workflows.
- **Notifications:** GitHub's own failed-run emails and web notifications, nothing else.
- **Alternative considered:** jobs inside `ci.yml`. They would share its cancel rules, and one edit there could make a
  visual check part of the gate. A separate file keeps the gate unchanged by construction.

### 2. Selection: the last green commit, an import graph, and three reasons to select everything

The `select` job writes `selection.json` (see `image-capture-selection`).

- **The base:** `gh run list --workflow ui-tests.yml --branch main --status success --limit 20`, skipping pull request
  runs, gives the last green commit, used if `git merge-base --is-ancestor` accepts it. Otherwise the push's `before`
  commit is used, if it is a non-zero ancestor. Otherwise everything is selected. A commit that git cannot find, as
  after a force push, is no ancestor.
  - Basing on the last green commit, not `before`, keeps cancelled runs and failed runs inside the next diff. A failure
    stays visible on every push until it is approved or fixed.
- **The graph:**
  - The resolver in `scripts/clientParity.ts` moves into a shared `scripts/importPaths.ts` that both checks import.
  - It is extended to resolve style, image, and JSON imports, and to tell an in-repo import it cannot resolve apart
    from an npm package.
  - Each story's graph is its file's graph plus its app's preview graph. The card bundle's graph starts from every file
    in `apps/web/src/mcpCards/` except tests and stories. Mobile story files are read with Storybook's CSF tools to get
    their ids and tags, with no device.
- **The shared inputs:** a fixed list of paths and globs selects everything (see the spec). Changes to the image capture
  image, the workflow, and `ui-tests/` itself are on it, so a tooling change re-proves every image capture.
  - A file that a build config or the capture tooling imports belongs to that shared input, as a plugin the Vite config
    loads. The component browser's folder does not take in its imports, since its fixtures reach the stories that use
    them through those stories' own graphs.
- **Uncertainty:** any throw, unresolved in-repo import, or unparseable story file turns the mode to `all` with the
  reason. Mode `none` is reachable only from a clean diff whose files reach no image capture.
- **Tailwind's output:** it changes when a new utility appears. Tailwind's generated rules for existing utilities do
  not move, so a component's class edit stays local to the stories that render it.
- **Alternative considered:** Storybook's `--stats-json` module graph, which Chromatic's TurboSnap uses. It covers the
  web build only, and it needs a build before selection can run. The repo's own resolver covers web, mobile, and cards
  in seconds, and is already tested.

### 3. Capture and compare are separate steps, and one comparator serves every platform

- **Capture:** each capture job only captures. It writes PNGs under `current/<platform>/` and an image capture manifest
  that records each image capture as stable, error, or unstable, with any message.
  - **Bounded:** the capture pages stop taking image captures after 30 minutes, or `UI_TESTS_CAPTURE_MINUTES`, and
    record the rest as errors, so the job writes its report inside its own time limit. A story that stalls once has its
    other image captures recorded as errors without another wait, and a preview that fails to load is an error at once.
- **Compare:** one Bun module decodes with `pngjs`, compares with `pixelmatch`, and writes the diff images and the
  platform's report. It runs with a 0.1 color threshold and anti-aliased pixels excluded.
  - **Changed:** an image capture is changed if any pixel differs beyond that threshold, or if its size differs.
  - **No per-story tolerance in this change:** a story that cannot be made stable is fixed, or tagged `no-screenshot`
    with a comment.
- **Why one comparator:** Playwright's `toHaveScreenshot` would cover web and MCP, but native images need a comparator
  anyway. `toHaveScreenshot` also reports a missing baseline only as a failure message string. One comparator gives one
  set of statuses, one report, and one approval path for all four platforms.
- **New dependencies:** `pixelmatch` and `pngjs` are small, pure JavaScript, and need no native build inside the
  capture container. `pngjs` is already in the lockfile through `eas-cli`.

### 4. The capture container, and Playwright Test inside it

- **The image:** `ui-tests/Dockerfile` builds it. Its base is the Playwright image whose version matches
  `playwright-core` in the lockfile, pinned by digest. Bun is copied in from the `oven/bun` image at the version
  `.bun-version` pins, by digest, so the image runs the same Bun as every other CI job. A unit test checks that the two
  versions agree.
  - The `web`, `mcp`, and `flows` jobs run their Playwright steps in it, and so do the local commands, through
    `docker run`.
  - The same image means the same Chromium and the same font rasterizer. An image capture made on a laptop then matches
    CI, and can be approved under the same environment id.
  - Dependabot's Docker updates cover `ui-tests/Dockerfile`.
- **The capture runner:** a Bun script, `ui-tests/capture/webImageCaptures.ts`, drives Chromium through
  `playwright-core`, as the signup smoke test already does. Capturing needs no test runner. It takes images, and the
  comparator decides their status. A Bun script keeps capturing off Node entirely, and several capture pages take image
  captures at once.
- **The flow runner:** `@playwright/test` runs the functional flows, which arrive in stage 3, for their auto-waiting
  assertions, retries, traces, and HTML report.
  - Playwright Test runs on Node, which the Playwright image ships. The root scripts start it with
    `bunx playwright test` inside the container, so Node never runs on the host.
  - Expo's CLI and Metro already run on Node. Playwright Test joins them, inside the container only.
- **Alternative considered:** `bun test` with `playwright-core` for the flows too. That keeps everything on Bun, but
  auto-waiting assertions, retries, the trace on failure, and the HTML report would all be rebuilt by hand.
  **This is the main runtime tradeoff in the change.**

### 5. Determinism in a web image capture

- **The server:** a static server mirrors production. It serves the built component browser at `/nightshift/` and
  `apps/web/public/` at `/`, so `/carl-hero.png` loads as it does on the site.
- **The page:** each image capture navigates to `iframe.html?id=<id>&viewMode=story&globals=theme:<light|dark>`. A full
  load per image capture gives isolation over speed: storage and the query cache never carry over. Each capture page has
  its own browser context, set up with:
  - the viewport, 375 by 812 or 1280 by 800, at `deviceScaleFactor` 1
  - `locale: "en-US"` and `timezoneId: "UTC"`
  - `reducedMotion: "reduce"`
  - `page.clock.install({ time: FIXTURE_DATE })` once, and `setSystemTime(FIXTURE_DATE)` before each image capture, so
    time starts at the fixture date and then flows. `FIXTURE_DATE` moves to `packages/core/lib/storyFixtures.ts`, and
    the web component browser's fixtures re-export it, so the stories and the clock share one instant
  - an init script that seeds `Math.random`
- **A story's own globals:** Storybook sends a story's own globals before it renders. A story that pins a viewport or a
  theme skips the other image captures, which are reported as skipped. The image capture sizes share names with the
  component browser's viewports, `phone` and Storybook's `desktop`. The HeaderMenu stories pin the phone viewport, and
  the UserMenu stories pin the desktop one through a new `DESKTOP_VIEWPORT_GLOBALS`. Each one's play function fails at
  the width it does not pin.
- **Fonts:** the Google Fonts stylesheet and font requests are served from `ui-tests/fonts/`. It holds the Karla and
  Architects Daughter files under their Open Font License, copied from the `@expo-google-fonts` packages the mobile app
  installs, with a stylesheet that names the same families and weights. Every other outside request is aborted and
  recorded.
- **When to capture:** after Storybook reports the story rendered, with its play function finished, then
  `document.fonts.ready` and network idle.
  - The image takes the page's full width, down to the lowest edge of the root or an open portal, padded by 16 pixels,
    so dialogs and menus are included.
  - `animations: "disabled"` and a hidden caret are set.
  - Images are taken 250 ms apart, up to five more times, until two in a row match under the comparison's own
    tolerance. A byte comparison would flag a story whose last pixels flicker below the tolerance, as the note
    editor's toolbar does, though its comparison with a baseline would always pass. Images that never match are marked
    `unstable`.
- **Story errors:** Storybook's render, play, and exception events mark an image capture `error`. So does an empty root,
  or the error display.

### 6. Baselines in the repo, versioned with the code

- **Layout:** baselines live in `ui-tests/baselines/<platform>/`:
  - `web/<story-id>/<latte|dark-roast>-<phone|desktop>.png`
  - `mcp/<card>-<state>/<palette>-<phone|chat>.png`
  - `<android|ios>/<story-id>/<palette>-phone.png`
- **The manifest:** each platform has a `manifest.json` with the environment its baselines are approved in and, per
  image, the workflow run, commit, environment id, and sha256. An approval that accepts a new environment replaces
  every captured image of the chosen stories, so none is left from the old one.
  - Web and MCP: the environment id is the Playwright version, the base image digest, and a hash of the fonts.
  - Native: the device profile, the OS runtime or system image, and the Xcode or emulator version.
- **Where they never go:** the root `.dockerignore` keeps `ui-tests/baselines/` and `ui-tests/output/` out of the
  image, and the root AGENTS.md's Never-read list gains `ui-tests/baselines/`. The rest of `ui-tests/` stays in the
  build context, since the root `tsconfig.json` references it and the docs build type-checks with it.
- **Size:** clipped image captures at scale 1 are mostly small component images. A full set is estimated at 40 to 100 MB
  across about 3,500 images:
  - web: 456 stories × 4
  - native: 349 stories × 2 palettes × 2 platforms
  - the card states
  - Every run's summary reports the folder's image count and size, so growth is visible.
- **Storage: Git LFS.** The root `.gitattributes` stores `ui-tests/baselines/**/*.png` in Git LFS, so the history
  holds a pointer of about 130 bytes per image, and the manifests stay in git. A revert restores the pointers, so the
  baselines still revert with the code they show.
  - **Bandwidth:** GitHub's free tier is 10 GiB of storage and 10 GiB of downloads a month. Only the `web` job
    downloads the images, through a cache keyed by their pointers, so CI downloads a set once per approval. The cache
    saves right after the download, so a failed comparison never makes the next run download again. The other jobs'
    checkouts leave the pointers, and the size line reads each image's size from its pointer.
  - **Uploads:** the pre-push hook runs `git lfs pre-push` after preflight if git-lfs is installed. `carl-up` installs
    it with `git lfs install --skip-repo`, which writes no hook into the repo's `.githooks/`.
  - **Approval:** `visual:approve` stops before reading the run if git-lfs or its filter is missing, since git would
    then commit each image whole.
- **Alternatives considered:**
  - **Images in git:** each full re-approval adds 40 to 100 MB that stays in the history, so every clone and every CI
    checkout downloads it.
  - **An orphan `ui-tests-baselines` branch:** main's history stays small. But a default clone still fetches the branch,
    and baselines no longer revert with the code they show.
  - **Release assets:** they would show up on the releases page, which the app mirrors.

### 7. Approval is a local command that reads a run's artifact

`bun run visual:approve -- --run <id> [--platform ...] [--story ...] [--status changed|new|passed] [--delete-removed]
[--new-environment]`. It works in five steps:

1. Downloads the run's artifacts with `gh run download`.
2. Checks the run's commit against `git rev-parse HEAD`.
3. Rejects an error or unstable image capture of a story or a status it names, and any environment change it was not
   told to accept.
4. Copies the images and rewrites the manifest.
5. Prints the changed paths for the developer to commit.

CI holds no write permission, so the rules in `visual-regression` hold by construction. `bun run visual:open -- <run
id>` downloads a run's HTML report and opens it.

### 8. The accessibility result is read, not run again

The addon already runs axe after each story renders, with the preview's WCAG tags and each story's own config. In
Storybook 10 that result reaches the preview's story-finished event as a report. The capture page listens for it and
copies each violation into the report: the rule, its help text, how many elements break it, and the first three of them.

- **If the event is missing:** for example after a Storybook upgrade, the report says that the accessibility result
  was not available for that story. It never says that the story passed.
- **Alternative considered:** running `@axe-core/playwright` separately. That would be a second copy of the rule config,
  which could drift from the preview's.

### 9. The MCP card test host

- **The host:** `ui-tests/mcp/` holds a host page, bundled with `Bun.build`, and a small `Bun.serve` server.
  - The server builds each card's html with the api's own `toCardHtmlFromBundle` from `apps/web/dist/mcp-cards/`.
  - The host page puts it in a sandboxed `srcdoc` frame under the resource's CSP, and drives it with `AppBridge`.
- **Fixtures:** `ui-tests/mcp/cardFixtures.ts` holds tool input, `structuredContent`, and `_meta` for each state,
  typed with the existing `McpSearchPage`, `McpCardData`, and result types. The type check catches drift, since no zod
  output contract exists.
- **Visual tests:** these render each state in both themes at 375 and 720 pixels and capture it.
- **Interaction tests:** in fixture mode, `oncalltool` returns scripted results and records each call. In live mode it
  forwards each call through an MCP SDK client to the local api's `/mcp`, with a seeded user's token from the smoke
  test's OAuth helpers. The smoke flow on a push uses live mode for one action.
- **What stays apart:** the api's protocol and authorization tests stay where they are, so image captures never mix with
  them.

### 10. Native image capture: a development build, Metro, a capture link, and Maestro

- **Build:**
  - Each native job runs `expo prebuild` and builds a debug app: `xcodebuild` for the iOS simulator, and `gradlew
    assembleDebug` for the emulator.
  - It caches the result under the hash `@expo/fingerprint` computes. A change to JavaScript alone reuses the cached
    app, and only Metro bundles again.
  - EAS Build is not used, so the workflow needs no Expo token and spends no EAS quota.
- **Metro:** `expo start` serves the development bundle on the runner. The app opens it through the development
  client's url, then the capture link. Android reaches Metro through `adb reverse`.
- **The capture link:** `carlnotes:///storybook?STORYBOOK_STORY_ID=<id>&theme=<light|dark>&capture=1`.
  - Storybook already reads the id. The storybook route and `.rnstorybook` read `theme` and `capture`.
  - Capture mode renders the selected story without the on-device frame, and shifts `Date` to start at the fixture date.
  - It also seeds `Math.random`, calls `LogBox.ignoreAllLogs()`, and draws a transparent `story-rendered` marker.
  - An error boundary draws a `story-failed` marker whose label is the message. All of this sits behind `__DEV__`,
    which the existing export check already proves never reaches a release.
  - If the session read blocks the root layout with no api, capture mode skips that read. The first spike confirms
    which.
- **Maestro:** one generated flow per image capture opens the link, waits for either marker, and takes the screenshot.
  The JUnit output gives each image capture its status. The Maestro CLI is installed at a pinned version, with its
  checksum checked.
- **Devices:**
  - Android: an AVD at 750 by 1624 at 320 dpi, which is 375 by 812 dp, matching the web's phone viewport. Its system
    image and API level are pinned.
  - iOS: a pinned Xcode, an iOS runtime, and a 375-point-wide device. That is the iPhone 13 mini at 375 by 812 if the
    runtime offers it, and otherwise the iPhone SE (3rd generation).
- **Device settings:** en-US and UTC, the default text size, reduced motion on, and animations off. On iOS, `xcrun
  simctl status_bar` holds the bar at a fixed time. Android uses demo mode.
- **Scaling:** `sharp` crops the status bar's inset and scales each image to points, so iOS @3x and Android @2x images
  compare at the size the parity report needs.

### 11. Native rollout and runner limits

- **Android first.** It runs on ubuntu-latest with KVM turned on, through `reactivecircus/android-emulator-runner`
  pinned by SHA.
- **iOS second.** It runs on `macos-15`.
- **Runner limits:** for a public repository, GitHub documents standard runners as free. It also documents limits on
  concurrent jobs, including a lower one for macOS. The workflow runs at most one macOS job, and only when native
  stories are selected or at night.
- **Visible failures:** every native step that installs, boots, builds, or opens prints what it was doing and fails the
  job. The summary's environment block lets a red job be told apart from a regression.

### 12. The parity report

- **The rows:** the `report` job pairs image captures by story id across `web` (phone), `ios`, and `android`, for ids on
  at least two platforms.
- **The page:** one HTML page per palette, with each row's images scaled to the same width.
- **The score:** a `pixelmatch` similarity at that width, labeled as informational. Ids found on only one platform are
  listed.
- **When it is written:** only if the run captured more than one platform. Otherwise it is built from the approved
  baselines.

### 13. The disposable stack for the flows

- **Services:** pinned by digest.
  - `pgvector/pgvector:pg17`, which has pgvector 0.8 and the pg_trgm contrib module
  - `ghcr.io/neondatabase/wsproxy`, Neon's open-source WebSocket-to-TCP proxy
  - `redis:7.4-alpine`
- **The driver:** `packages/db/index.ts` reads a new `DATABASE_WS_PROXY` variable. Only if the variable is set does it
  set `neonConfig.wsProxy` to it and turn off `useSecureWebSocket`, `pipelineTLS`, and `pipelineConnect`. No Doppler
  config sets the variable. A unit test proves the driver's settings are untouched without it.
- **Settings:** `ui-tests/stack/stack.env` is committed with non-secret values:
  - a fixed `BETTER_AUTH_SECRET` labeled as test-only
  - `BETTER_AUTH_URL=http://localhost:3000`
  - Cloudflare's always-pass Turnstile site key for the build
  - no LiteLLM, Temporal, R2, Stripe, Resend, or analytics settings
- **The guard:** `ui-tests/stack/` checks that the database host is `localhost` or `127.0.0.1` before migrating,
  seeding, or starting.
- **Startup:** it migrates with `packages/db/migrate.ts`, seeds with the `packages/db/seed.ts` builders and the run's
  id, builds the web app, and starts the api on port 3000.
- **Local runs:** `docker-compose.yml` gains `postgres` and `wsproxy` services under a `ui-tests` profile, so a plain
  `docker compose up` is unchanged.
- **Users:** each flow signs in as its own seeded user, made the way the MCP smoke fixtures make one. No flow signs up,
  so no flow reaches Turnstile.
- **What the stack leaves out:**
  - Moderation is skipped, which the moderation tests already cover.
  - A new Topic's first Scan stays running. The topic flow asserts the Topic's fields, and never the Scan.
- **Alternatives considered:**
  - **A Neon branch per run:** this needs an API key that could reach the production project.
  - **The shared dev database through Doppler:** this puts a secret in a public workflow, and its state is shared.

### 14. Native flows

- **The flows:** Maestro flows live in `ui-tests/native/flows/` and run nightly against the same stack.
- **Android:** the job uses the same service containers, and reaches ports 3000 and 8081 through `adb reverse`.
- **iOS:** the runner has no Docker, so the iOS job installs `postgresql@17`, `pgvector`, and `redis` with Homebrew. It
  builds `wsproxy` from a pinned commit with the runner's Go. This is the last milestone, because it is the costliest to
  provision.
- **Offline:** Android goes offline with Maestro's airplane mode command. The iOS simulator has none, so that check is
  listed as not automated.

### 15. Code layout and scripts

`ui-tests/` is a root folder, like `evals/`, with its own AGENTS.md. Its subfolders:

| Folder | Holds |
|---|---|
| `selection/` | the diff base, the graph selection, the shared inputs, the summary, and the `visual:select` command |
| `capture/` | the web capture command, the capture page and its in-page scripts, the static server, and the capture container |
| `compare/` | the comparator, which writes each platform's report |
| `report/` | the run summary, the annotations, the report page, and the `visual:report` command; the parity report later |
| `approval/` | the approval logic, and the approve and open commands |
| `mcp/` | the card host, fixtures, card visual and interaction tests |
| `flows/` | the web functional flows |
| `native/` | flow generation, device setup, Maestro flows |
| `stack/` | the stack's env file, guard, seeding, and start |
| `fonts/` | the vendored fonts |
| `baselines/` | the approved images and manifests |

Beside the folders sit the modules more than one step reads: `imageCaptures.ts` with the shared shapes and paths,
`storyFiles.ts` with the CSF loader, `importGraph.ts` with the import walk, and `commands.ts` with the command runner.
`importGraph.ts` and `storyFiles.ts` sit at the root so they reach `scripts/` through one `../`, since a root folder has
no import alias.

The root scripts follow the repo's prefix pattern, `smoke:*` and `eval:*`, and every workflow step calls one of them:

- **Image captures:** `visual:select`, `visual:web`, `visual:mcp`, `visual:android`, `visual:ios`, `visual:report`,
  `visual:approve`, and `visual:open`.
- **Flows:** `e2e:stack`, `e2e:web`, `e2e:mcp`, `e2e:android`, and `e2e:ios`.

`visual:web` and `e2e:web` start the capture container themselves if run on a laptop.

`ui-tests/` code imports app modules, as `evals/` does, such as `toCardHtmlFromBundle` and the seed builders. The
package boundary check scans `apps/` and `packages/` only, and no app or package imports `ui-tests/`.

### 16. Reports and annotations

- **Per job:** each job writes `report-<platform>.json` and uploads its images.
- **The report job:**
  - merges the reports into `report.json` and a self-contained `report.html` with relative image paths
  - writes the summary tables
  - emits up to 10 error annotations and 10 warning annotations per platform, because GitHub shows only a few per step.
    The summary's failure and waiting tables list the first 50 entries each and count the rest, and `report.html`
    lists every entry.
- **Retention:** every artifact uses `retention-days: 7`.

### 17. The UI test tooling's unit tests run in preflight, and nothing else does

The selection, comparator, report, approval, stack guard, and workflow file checks have `bun test` files. Like every
module's tests, they run in preflight. They read files and fixture PNGs, and open no browser, device, or server.

- **The workflow file test:** it fails if the workflow file references `secrets.`, names a Doppler step, uses an
  action without a commit SHA, holds more than read permissions, lacks a job timeout, or continues on error. It also
  fails if preflight, the pre-push hook, or another workflow runs a UI check, if the Git LFS rule misses an approved
  image, or if a job other than `web` downloads the images.
- **The capture container test:** it fails if a base image lacks a digest, the Playwright base differs from the
  installed `playwright-core`, Bun differs from `.bun-version`, or the environment id's base differs from the FROM line.
- **Why preflight:** this keeps the secret-free promise from regressing silently. It is the same kind of static check
  the gate already runs.

## Risks / Trade-offs

- **[Git LFS storage and bandwidth]** → Clipped scale-1 images, a cache that downloads each approved set once, and a
  size line in every run's summary. A clone with git-lfs also downloads the current set from the free 10 GiB a month,
  which covers about 100 clones of a 100 MB set.
- **[A Playwright or base image bump changes every pixel]** → The capture container is a shared input, so the bump
  selects everything. The new environment id blocks approval until `--new-environment` is given. A bump is then one
  deliberate re-approval commit.
- **[Flaky image captures]** → A stability check and the `unstable` status, with no silent retry into a pass. A story is
  tagged out only with a comment saying why.
- **[Native infrastructure flakiness]**
  - **The risks:** the emulator may not boot, the runner image may drop a simulator runtime, or Metro may be slow on
    3 vCPU.
  - **Mitigations:** a timeout per job, named environments, bounded boot retries, and the status table. A provisioning
    failure stays red and is never relabeled as passed.
- **[Storybook internals change]** The rendered and story-finished events are Storybook's own. A Storybook bump is a
  shared input, and a missing event makes the image capture an error or an "accessibility result not available" line,
  never a pass.
- **[The test-only database proxy setting reaching production]** → One variable read in one place, absent from every
  Doppler config, with a unit test of the default path.
- **[The flows' realism]** No LiteLLM and no Temporal on the stack. Flows avoid model-driven paths, and the new-topic
  chat stays uncovered, as listed in the non-goals.
- **[Node inside the capture container]** → It never runs on the host. Decision 4 records the bun-only alternative.
- **[Selection misses a non-import dependency]** → A font, an image, or a JSON file is followed as an import. Anything
  the graph cannot place selects everything. The nightly full run is the backstop for anything a push missed.
- **[GitHub's annotation limits]** → The first ten annotations of each kind per platform, summary tables that count
  the entries they leave out, and a report that lists every entry.

## Migration Plan

Each milestone ships on its own, proves itself with a workflow run linked in the status table, and changes no
production path.

1. **Web image captures (stage 1).**
   - **What ships:** selection, the capture container, web image capture, the comparator, reports, approval, and the
     workflow with `select`, `web`, and `report`.
   - **First run:** every image capture is `new`. The first approval commit sets the web baselines.
   - **Acceptance:** demonstrations A, C, D, E, and F below.
2. **Android image captures (stage 2a),** then **iOS image captures (stage 2b),** then **the parity report (stage 2c).**
   Each starts with a spike job dispatched on a branch. It is promoted only once it completes on GitHub-hosted runners.
3. **Card host and card flows (stage 3a),** **web flows and the stack (stage 3b),** then **native flows: Android (3c)
   and iOS (3d).** Acceptance: demonstrations B and F.

**The demonstrations.** Each runs from a scratch branch through `workflow_dispatch`, so production never receives a
deliberate break. Each run's link goes into the status table.

- **A. A visual change is detected.** A branch changes a Button class. The `web` job fails with a diff. The CI gate and
  Northflank never run for the branch.
- **B. A broken interaction fails.** A branch breaks the Follow handler. The flow fails, with the trace, the video, and
  the api log in the artifacts.
- **C. A clean baseline passes.** A dispatch on main after the first approval passes every image capture.
- **D. Selection works both ways.** A push that changes one component shows a short selection with its reasons, and the
  nightly run shows every image capture.
- **E. A token selects everything.** A branch changes a color in `packages/nightshift/colors.ts`, and the selection is
  `all` with the token as its reason.
- **F. No production credentials.** The workflow file test passes, the stack guard rejects a Neon url, and the run log
  shows no secret and no Doppler step.

**Non-blocking.** Three facts show it:

- The diff of this change leaves `scripts/preflight.sh`, `ci.yml`, `smoke.yml`, and `evals.yml` untouched, and the
  pre-push hook gains only the Git LFS upload after preflight.
- `gh api repos/doubleoevan/carlnotes/branches/main/protection` reports no protection.
- The first real push with a red UI tests run still shows a green CI gate and a Northflank deploy.

**Rollback:**

- `gh workflow disable ui-tests.yml`, or deleting the file, stops every check.
- Capture mode is development-only code.
- The database proxy variable is unset everywhere but the stack.
- Nothing in production depends on `ui-tests/`.

## Open Questions

- **Which 375-point simulator the iOS runner offers.** It depends on the runner image's runtimes when stage 2b starts.
  Decision 10's fallback order covers both answers, and the manifest records the one used.
- **Two MCP card issues found while inspecting them.** Each is a decision about card behavior outside this change. The
  card tests list each case with a `fixme` and a link to this section, so the report shows them as known gaps until
  they are decided.
  - **An error tool result renders an empty search or topic card,** because `McpCardApp` never reads `isError`.
  - **A write made after the user's access token expires comes back as a successful text result.** The text says to
    connect an account, with `isError` false. The Follow button and the Finding handlers flip as if the write saved.
