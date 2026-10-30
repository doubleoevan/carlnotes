## 1. Shared groundwork

- [x] 1.1 Move the import resolver, `resolveImportPath` and `toImportBasePath`, from `scripts/clientParity.ts` into a
  shared `scripts/importPaths.ts` as `toImportResolution`, with its test. `toNamedImports` stays, since only the parity
  check reads import names. Verify that `bun test scripts` passes and that `bun scripts/check-client-parity.ts` prints
  the same line before and after the move.
- [x] 1.2 Extend the resolver to follow style, image, font, and JSON imports, and to return an unresolved in-repo
  import apart from an npm package. Verify with unit tests for each import kind and for an `@/` path that resolves to
  no file.
- [x] 1.3 Create `ui-tests/AGENTS.md` with the layout from design decision 15, and a status table with every check and
  platform marked not yet run. Then:
  - add `ui-tests/` to the root module map and routing table
  - add `ui-tests/baselines/` to the root Never-read list
  - add `ui-tests/baselines/` and `ui-tests/output/` to `.dockerignore`. `ui-tests/` itself stays in, since the root
    tsconfig points at it the way it points at `scripts/`

  Verify that preflight is green and that each entry is present.
- [x] 1.4 Add `playwright-core` at the lockfile's version, `storybook` at the web app's version, `pixelmatch`, `pngjs`,
  and the core workspace as root development dependencies. Verify that `bun install --frozen-lockfile` passes, and that
  a unit test fails if the capture container's Playwright differs from the installed `playwright-core`.
- [ ] 1.5 Write `ui-tests/Dockerfile`, with the Playwright base pinned by digest and Bun copied from `oven/bun` at the
  `.bun-version` version, pinned by digest. Add its folder to Dependabot's Docker updates. Verify that
  `docker build ui-tests` succeeds and that a unit test checks both pins and the Bun version.

## 2. Image capture selection

- [x] 2.1 Resolve the diff base: the last successful UI tests run on main if it is an ancestor, then the push's previous
  commit if it is a non-zero ancestor, then everything. A dispatch on another ref uses its merge base with main. Verify
  with unit tests over stubbed repo lookups, one per scenario in the spec's base requirement.
- [x] 2.2 Read the web and mobile story files with Storybook's CSF tools into story ids and the `no-screenshot` tag,
  with no build. An unparseable file selects everything. Verify with unit tests on fixture story files, including a
  one-line meta like `DataTable.stories.tsx`.
- [x] 2.3 Select stories by graph: each story's graph plus its app's preview graph, and the card entry's graph for every
  card image capture. Type-only imports do not count. Verify with one unit test per scenario in the spec's graph
  requirement: IconButton, the shared core component, the toast host, and the worker-only change.
- [x] 2.4 Add the shared inputs list and the uncertainty fallbacks, each with its reason. A changed baseline selects its
  own story. Verify with unit tests: a token change, a lockfile change, an unresolved import, a failed diff, and an
  approved baseline.
- [x] 2.5 Add the `visual:select` root script. It writes `selection.json` and the summary block, with the mode, reasons,
  base, head, changed files, and the selected count out of the total per platform. Verify that running it over three
  recent commit ranges on main prints selections that match their diffs, and record the ranges and results in the
  ui-tests guide.

## 3. Web capture and comparison

- [x] 3.1 Vendor every family and weight that `FONT_STYLESHEET_URL` names into `ui-tests/fonts/`, with a stylesheet
  and the Open Font License texts. Verify with a unit test that fails if a family or weight in `FONT_STYLESHEET_URL`
  has no file.
- [x] 3.2 Write the static capture server, which serves the built component browser at `/nightshift/` and
  `apps/web/public/` at `/`. Verify with a unit test that requests a story iframe and `/carl-hero.png`.
- [x] 3.3 Write the image capture tests: one image capture per selected story, palette, and size.
  - **Context:** the viewport, scale 1, en-US, UTC, reduced motion, the clock at `FIXTURE_DATE`, seeded randomness, and
    the font and network routes.
  - **Timing:** wait for the rendered event, the fonts, and network idle.
  - **The image:** a clip to the root and its portals, the stability check, and error detection.
  - **Output:** the image capture manifest.

  Verify that `bun run visual:web -- --story primitives-button--default` writes four PNGs and a manifest, and that two
  runs write identical bytes. Proved on the host with `--on-host`. The first CI run proves it inside the image capture
  container.
- [x] 3.4 Copy the accessibility addon's per-story result from the story-finished event into the image capture manifest.
  If the event is missing, write "not available". Verify that the Select Open story reports no `aria-hidden-focus`
  violation, and that a scratch low-contrast story reports `color-contrast`. Delete the scratch story afterwards.
- [x] 3.5 Write the comparator: `pngjs` and `pixelmatch` at a 0.1 threshold with anti-aliasing excluded, size changes,
  diff images, and `report-<platform>.json` with every status. Verify with unit tests on fixture PNGs, one per status.
- [ ] 3.6 Make `visual:web` start the capture container with `docker run` if it is not already inside it. Verify that a
  run on the laptop and a run in CI record the same environment id.
- [x] 3.7 Run a full capture, then fix each story it marks unstable or error. A story that cannot be fixed gets the
  `no-screenshot` tag with a comment saying why. Document the tag in `apps/web/AGENTS.md`. Verify that a full run has
  zero unstable and zero error image captures.

## 4. Reports and approval

- [x] 4.1 Write `visual:report`, which produces:
  - the merged `report.json`
  - the summary: the selection, counts by status per platform, failures, image captures waiting for approval,
    accessibility findings, failed flows, skipped jobs with their reasons, and artifact links
  - up to 10 error and 10 warning annotations per platform
  - a self-contained `report.html`

  Verify with unit tests on fixture reports, and by opening the HTML from a fixture artifact.
- [x] 4.2 Write `visual:approve`: it downloads with `gh run download`, checks HEAD, rejects error, unstable, and
  environment-changed image captures, copies the images, rewrites the manifest, and supports `--delete-removed` and
  `--new-environment`. Verify with unit tests for each rejection and an approval from a fixture artifact.
- [ ] 4.3 Write `visual:open`, which downloads a run's report and opens it. Verify against a real run id.
- [ ] 4.4 Write the ui-tests guide's sections on reading a failure in Actions, approving baselines, and running checks
  locally, and add the new scripts to the README Development section. Verify that every documented command runs as
  written.
- [x] 4.5 Store the baseline images in Git LFS: a root `.gitattributes` rule, a cached download in the `web` job, sizes
  read from pointers in the summary, the Git LFS upload in the pre-push hook, git-lfs in `carl-up`, and a stop in
  `visual:approve` without it. Verify with the workflow file test's rule check, and with an approval that stops on a
  machine without git-lfs.

## 5. The UI tests workflow

- [ ] 5.1 Write `.github/workflows/ui-tests.yml` with the `select`, `web`, and `report` jobs.
  - **Triggers and inputs:** push, nightly at 09:00 UTC, and dispatch with its inputs.
  - **Access:** `contents: read` and `actions: read`, and `persist-credentials: false`.
  - **Concurrency:** the group `ui-tests-${{ github.event_name }}-${{ github.ref }}`, with `cancel-in-progress` for
    pushes only.
  - **Limits:** a timeout per job.
  - **Artifacts:** uploaded with `if: always()` and kept for 7 days.

  Verify that the workflow file test passes and that a dispatched run on a branch completes.
- [ ] 5.2 Fail a job that captured nothing from a non-empty selection, or that is missing a selected image capture, and
  name the missing image captures. Verify with a unit test, and with a dispatch whose capture command exits early.
- [x] 5.3 Document how the CI gate and the UI tests workflow each cancel a superseded run, and why the selection still
  covers the cancelled run's commits. Put this in the ui-tests guide and the README. Verify that the text is in both.
- [ ] 5.4 Dispatch a full run on main, approve every web baseline from it, and commit. Mark web image captures
  operational in the status table, with the run link. Verify that a second dispatch marks every web image capture
  passed. This is demonstration C.

## 6. Stage 1 acceptance

- [ ] 6.1 Demonstration A: on a scratch branch, change the Button's padding and dispatch an affected run. Verify that
  the web job fails with Button diffs, then record the run link and delete the branch.
- [ ] 6.2 Demonstration D: record a push run's short selection and its reasons, and a nightly run's full selection.
  Verify that both links are in the status table.
- [ ] 6.3 Demonstration E: on a scratch branch, change a color in `packages/nightshift/colors.ts` and dispatch an
  affected run. Verify that the selection is `all` with the token as its reason, and record the link.
- [ ] 6.4 Show the non-blocking guarantee. Verify three things and record the evidence in the ui-tests guide:
  - `git diff origin/main -- scripts/preflight.sh .github/workflows/ci.yml .github/workflows/smoke.yml
    .github/workflows/evals.yml` is empty, and the pre-push hook's diff adds only the Git LFS upload.
  - `gh api repos/doubleoevan/carlnotes/branches/main/protection` reports no protection.
  - The first push with a red UI tests run shows a green CI gate and a Northflank deploy.

## 7. Android image captures

- [ ] 7.1 Add capture mode to `apps/mobile/app/storybook.tsx` and `.rnstorybook/`. It reads `theme` and `capture`,
  hides the on-device frame, shifts `Date` to the fixture date, seeds randomness, quiets LogBox, and draws the rendered
  and failed markers through an error boundary. All of it is behind `__DEV__`. Verify that unit tests for the parsing
  and the date shift pass, that the CI export job still finds no Storybook in release bundles, and that a local
  simulator opens a story by link. Document the link in `apps/mobile/AGENTS.md`.
- [ ] 7.2 Check whether the root layout gets past the session read with the api stopped. If it does not, capture mode
  skips that read. Verify on a local emulator with the api stopped.
- [ ] 7.3 Build the Android debug app in CI. Prebuild and `assembleDebug` are cached by the `@expo/fingerprint` hash,
  and Metro is started on the runner. Verify that a dispatched spike job installs the app and opens the Button Default
  story by link, with its image capture in the artifacts.
- [ ] 7.4 Generate one Maestro flow per image capture, and parse the JUnit output into the image capture manifest.
  Install the Maestro CLI at a pinned version and check its checksum. Verify with unit tests on generated flows and a
  JUnit fixture.
- [ ] 7.5 Set up the device: the AVD at 750 by 1624 at 320 dpi, en-US, UTC, the default font scale, animations off,
  and demo mode. Crop the status bar and scale to dp with `sharp`. Verify that two consecutive spike runs write
  identical normalized PNGs.
- [ ] 7.6 Add `visual:android` and the `android` job, with its environment block and steps that fail visibly. Verify a
  dispatched run, approve the Android baselines, and update the status table.

## 8. iOS image captures

- [ ] 8.1 Build the iOS simulator debug app in CI: prebuild and `xcodebuild`, cached by the fingerprint hash, with a
  pinned Xcode. Choose the iPhone 13 mini first and the iPhone SE (3rd generation) second, and add the environment
  block. Verify that a dispatched spike opens the Button Default story by link.
- [ ] 8.2 Set up the simulator: the status bar override, en-US, UTC, the default content size, reduced motion, and the
  appearance for each palette. Crop and scale to points. Verify that two runs write identical normalized PNGs.
- [ ] 8.3 Add `visual:ios` and the `ios` job. Verify a dispatched run, approve the iOS baselines, and update the status
  table.

## 9. Parity report

- [ ] 9.1 Write the parity report:
  - pair image captures by story id across web phone, iOS, and Android
  - scale each row to one width per palette
  - add an informational similarity score
  - list the ids found on one platform only
  - fall back to the baselines for any platform the run did not capture

  Verify with unit tests on fixture images, and with the parity report from a nightly run.

## 10. MCP card host

- [ ] 10.1 Write the card host server and page. They use `AppBridge`, a sandboxed `srcdoc` frame under the resource's
  CSP, and recorded tool calls and links. Verify with a unit test that the host serves each card's html identical to
  the api's resource html.
- [ ] 10.2 Write card fixtures typed from the card contracts, for each card and state: visitor, user, empty, long text,
  error result, and loading. Verify that `bunx tsc -b` passes, and that a stale field fails it.
- [ ] 10.3 Write the card visual tests: both themes, 375 and 720 pixels, compared under `mcp`, with `visual:mcp`. Verify
  a run, then approve the `mcp` baselines.
- [ ] 10.4 Write the card interaction tests in fixture mode: Save, Follow, rating, bookmark, done, sort, paging, See
  all, and a Topic link, each on success and on error. Add the two issues found while inspecting the cards as `fixme`
  tests that link design.md. Verify that `bun run e2e:mcp` passes and lists two `fixme` tests.
- [ ] 10.5 Add the `mcp` job to the workflow and the card host to the ui-tests guide. Verify a dispatched run, and
  update the status table.

## 11. Disposable stack

- [ ] 11.1 Have `packages/db/index.ts` read `DATABASE_WS_PROXY`, and only if it is set, point the driver at the local
  proxy. Document the variable in `packages/db/AGENTS.md`. Verify that a unit test proves the default path is unchanged,
  and that `doppler run -- bash -c 'test -z "$DATABASE_WS_PROXY"'` succeeds for the dev and prd configs.
- [ ] 11.2 Write the stack in `ui-tests/stack/`:
  - the committed env file of non-secret values
  - the local-host guard
  - migration with `packages/db/migrate.ts`
  - seeding with the `packages/db/seed.ts` builders and a run id
  - the api start on port 3000
  - the `e2e:stack` script and the `ui-tests` compose profile

  Verify that `bun run e2e:stack` brings the api up locally with the seeded users, and that a unit test shows the guard
  rejecting a Neon url.
- [ ] 11.3 Add the pinned Postgres, wsproxy, and Redis service containers to the `flows` job. Verify that a dispatched
  run boots the stack and the api's liveness route returns a success status.

## 12. Web functional flows

- [ ] 12.1 Add `@playwright/test` at the installed Playwright version, and write the Playwright config's web and MCP
  projects, with per-flow seeded users and a trace, video, and screenshot kept on failure. Capture the browser console
  and the api log. Verify that a deliberately failing scratch test leaves all five in the artifacts.
- [ ] 12.2 Write the topic flow: create through the editor, then save, reopen, edit, save, and reload, with a database
  read. Verify that it passes locally and in a dispatched run.
- [ ] 12.3 Write the finding state flow: Follow, rating up, bookmark, mark read, a rating down that leaves the feed,
  then undo, with reloads and database reads. Verify that it passes locally and in a dispatched run.
- [ ] 12.4 Write the search flow: the term, each filter and sort on the search page and on a Topic feed, and paging with
  url state. Verify that it passes locally and in a dispatched run.
- [ ] 12.5 Write the session flow:
  - sign-in and sign-out
  - the `/activity` round trip through log in
  - a Topic deep link
  - restore across a reload and a new context
  - the offline bookmark

  Verify that it passes locally and in a dispatched run.
- [ ] 12.6 Tag the smoke subset, wire it to pushes, and run every flow at night through `e2e:web`. Verify that a push
  run lists only the smoke flows and the nightly run lists them all.
- [ ] 12.7 Demonstration B: on a scratch branch, break the Follow button's handler and dispatch. Verify that the finding
  state flow fails with its trace, video, and api log in the artifacts, then record the link and delete the branch.
- [ ] 12.8 Demonstration F: verify that the workflow file test passes, the stack guard rejects a Neon url, and the run
  log shows no secret and no Doppler step. Record the evidence in the ui-tests guide.

## 13. MCP live flows

- [ ] 13.1 Add live mode to the card host. It forwards each tool call through an MCP SDK client to the stack's `/mcp`,
  with a seeded user's token from the MCP smoke test's OAuth helpers. Verify that Follow from the findings card
  creates the subscription row.
- [ ] 13.2 Add one live card action to the push smoke subset. Verify that a push run includes it.

## 14. Native flows

- [ ] 14.1 Write Maestro flows for each area the mobile app offers: topics, finding state, search, and sessions. List
  in the ui-tests guide any flow the app lacks, as `apps/mobile/parity.md` records it, with its reason. Run them on
  Android against the stack's service containers through `adb reverse`, at night. Verify a dispatched run.
- [ ] 14.2 Start the iOS stack: Homebrew `postgresql@17`, `pgvector`, and `redis`, and `wsproxy` built from a pinned
  commit. Run the same flows on iOS, and list offline as not automated. Verify a dispatched run.
- [ ] 14.3 Update the status table for every native flow, with run links and any check that is still not automated.
  Verify that no row claims a check that has not run.

## 15. Integration checks

- [ ] 15.1 Dispatch a full run on main with every platform and flow. Verify these, and record the run link:
  - each job is green, or red with an explained failure
  - the summary shows every section
  - every artifact is present
  - the parity report covers web, iOS, and Android
- [ ] 15.2 Verify that this change leaves preflight's steps, `ci.yml`, `smoke.yml`, and `evals.yml` as they were, apart
  from the new unit test files, and that the pre-push hook gains only the Git LFS upload. Verify also that preflight's
  wall time is within a few seconds of its time on `origin/main`.

## Workflow follow-up

- Ship through `/ship`, then archive with `openspec archive add-visual-and-functional-ui-tests --yes` in the same push.
