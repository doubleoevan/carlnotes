# ui-tests/

The visual UI checks. They capture every story of the web component browser and compare each image capture with an
approved baseline. They report after a push to main, every night, and on demand, and they never gate a push, the CI
gate, a Northflank deploy, or an EAS release. The `UI tests` workflow, `.github/workflows/ui-tests.yml`, runs them. Like
`evals/`, this is a root folder with no `package.json`. Its dependencies are the root's development dependencies.

An image capture is one image of one story, in one palette at one size, with its record. Capturing is the act that
takes one, so the act keeps the shorter word: the capture step, page, server, container, queue, and environment, and
a story capture, which captures one story at one size. A name or a sentence about the image says image capture.

## Status

A check is operational only after a workflow run on GitHub-hosted runners has proved it. An operational row links that
run.

| Check | Platform | Status | Proved by |
|---|---|---|---|
| Selection | all | being proven: unit tests pass, and three real commit ranges selected as expected, listed below | not yet run in CI |
| Story image captures and comparison | web | being proven: in the host's Chrome, two runs gave identical bytes, and a
full run of all 1,820 image captures had no error, no unstable image capture, and no accessibility violation | not yet
run in CI | | Capture container | web | not yet run: its image has not been built anywhere yet | not yet run in CI | |
Report, annotations, and approval | web | being proven: unit tests pass, and the report step ran on local image captures
| not yet run in CI | | Card image captures and card flows | mcp | not yet built | none | | Story image captures |
android, ios | not yet built | none | | Functional flows | web, android, ios | not yet built | none |

Selection was checked by hand with `bun run visual:select -- --base <commit>^ --head <commit>` on three commits:

| Commit | Change | Selection |
|---|---|---|
| `03271dbc` | the one MCP server on every page, a web component change | 5 of 456 web stories: AddToAiDialog, and Layout through PageActionMenu |
| `15a4fd1a` | the Apple sign-in origin, a server-only change | nothing |
| `843fa459` | field fills in light mode, a token and stylesheet change | every story on every platform |

## Layout

- `selection/` — the selection step, `bun run visual:select`. `diffBase.ts` picks the commit to diff against: the last
  green run of the workflow on main, then the push's previous commit, then nothing, which selects everything.
  `imageCaptureSelection.ts` selects the stories whose import graph reaches a changed file. `sharedInputs.ts` lists the
  files that select everything, such as the Nightshift tokens, a stylesheet, the lockfile, and this folder, and finds
  the files that a build config or the tooling imports. `selectionSummary.ts` builds the selection's part of the run
  summary.
- `capture/` — the web capture step, `bun run visual:web`. `webImageCaptures.ts` builds the component browser and
  captures the selected stories on four capture pages at once, or `UI_TESTS_CAPTURE_CONCURRENCY` pages, for at most 30
  minutes or `UI_TESTS_CAPTURE_MINUTES`, recording any image capture left after that as an error. `webImageCaptures.ts`
  then writes the image capture manifest and the platform's report that `compareImageCaptures.ts` builds.
  `capturePage.ts` opens one story at a size and a theme, waits for Storybook to finish it, and takes images until two
  match. `capturePageScripts.ts` runs in each page: the seeded randomness, the story events gathered into a render
  result, the render check, and the clip measure. `captureServer.ts` serves the built component browser at
  `/nightshift/` and the web app's public folder at `/`, on loopback only. `captureContainer.ts` builds the capture
  container's image and runs a step in the container.
- `compare/` — `compareImageCaptures.ts` compares each image capture with its baseline through `pngjs` and `pixelmatch`,
  writes each diff image, and builds the platform's report.
- `report/` — the report step. `writeRunReport.ts`, `bun run visual:report`, writes the run summary and the annotations
  that `runReport.ts` builds, the `report.html` that `reportPage.ts` builds with `reportPage.css`, and the merged
  `report.json`.
- `approval/` — `approveBaselines.ts`, `bun run visual:approve`, with its logic in `baselineApproval.ts`, and
  `openReport.ts`, `bun run visual:open`. Both commands read their run through `workflowRun.ts`, which checks that the
  run is a UI tests run that no pull request started.
- `baselines/<platform>/` — the approved images, at `<story id>/<palette>-<size>.png`, and the platform's
  `manifest.json`, which names the environment that the baselines are approved in, and each image's workflow run,
  commit, capture environment, and hash. The root `.gitattributes` stores the images in Git LFS, so the history holds
  only their pointers. The first `bun run visual:approve` creates the folder.
- `fonts/` — Karla and Architects Daughter, with their Open Font License texts and the stylesheet that the capture page
  serves for the Google Fonts request.
- `Dockerfile` and `Dockerfile.dockerignore` — the capture container's image: the pinned Playwright base on amd64, the
  Bun that `.bun-version` pins, the locked dependencies, and the repo.
- `imageCaptures.ts` holds the shapes and paths that every step shares. `storyFiles.ts` reads a story file's ids and
  tags with Storybook's CSF loader. `importGraph.ts` walks imports with the resolver in `scripts/importPaths.ts`.
  `commands.ts` runs other programs, `errorText.ts` turns a thrown value into the text that a summary or a record names,
  and `jsonFiles.ts` writes and reads the JSON files that the steps share.
- `output/` — what a run writes. Git ignores it.

## What capturing holds still

Every web capture runs in the capture container, so the browser build and its fonts never change between machines. An
`--on-host` check is the one exception. It captures in the host's Chrome, and no approval accepts its image captures. In
each image capture:

- the clock starts at `FIXTURE_DATE` from `@carlnotes/core/lib/storyFixtures`, in UTC, with the en-US locale
- `Math.random` is seeded
- reduced motion is on, and animations are settled before an image is taken
- the fonts come from `fonts/`
- every request off the capture server's origin is blocked and named in the report

An image capture is taken after Storybook's story-finished event, so a play function has run. It is clipped to the
page's width and down to the lowest edge of the story or an open portal. It is stable when two images taken 250 ms apart
match under the comparison's own tolerance. A story that pins a viewport or a theme in its own globals is captured
only at that size or in that theme, and its other image captures are reported as skipped. The image capture sizes share
their names with the component browser's viewports: `phone` through `PHONE_VIEWPORT_GLOBALS`, and Storybook's `desktop`
through `DESKTOP_VIEWPORT_GLOBALS`.

A story that cannot hold still gets the `no-screenshot` tag, with a comment beside the tag saying why. ChatMarkdown's
Streaming story is the one so far.

## Reading a failure in Actions

1. Open the failed `UI tests` run. The `report` job's summary shows the selection and counts each platform's image
   captures by status. Its tables list the first 50 failures and the first 50 image captures waiting for approval, and
   count the rest. The summary also names each job that was skipped, cancelled, or failed before its report, with the
   reason, and gives the baselines' size. The annotations name the first ten failures and the first ten waiting image
   captures per platform.
2. Run `bun run visual:open -- <run id>`. It downloads the `visual-report` artifact into `output/runs/<run id>/` and
   opens `report.html`, with each failure's baseline, current, and diff images side by side. Artifacts last 7 days.
3. Decide for each failure:
   - **An unintended change.** Fix the code and push. The next run selects the story again, because its base is the
     last green run.
   - **An intended change.** Approve it, below.
   - **An error.** Read the error text. A play function that fails, or a story that renders nothing, is a broken
     story.
   - **Unstable.** The two images never matched. Fix what moves, or tag the story `no-screenshot` with the reason.

## Approving baselines

```bash
bun run visual:approve -- --run <run id>
```

The run must be of the local HEAD. By default, the command approves the run's changed and new image captures.
`--story <id>`, `--platform <name>`, and `--status changed|new|passed` narrow the choice. `--delete-removed` also
deletes the baselines that the run marked removed. It rejects a run of another commit, an error or unstable image
capture of a story or a status that it is asked for, and image captures from a new capture environment unless it is
given `--new-environment`. A new environment is accepted only from a run that captured every story, and the approval
then replaces every captured image of the chosen stories. The command changes the working tree, prints the first 30
files that it changed and counts the rest, and never commits. Commit those files with the change that they show.

The first run has no baselines, so every image capture is new. Approve that run's image captures to set the baselines.

The command stops before reading the run if git-lfs is missing or its filter is not set up, since git would then commit
each image whole. `bun run carl-up` sets both up, or run `brew install git-lfs`, then `git lfs install --skip-repo`.
`--skip-repo` writes no hook into `.githooks/`, whose pre-push hook already uploads the Git LFS files of a push.

In CI, only the `web` job downloads the images. Its cache is keyed by their pointers, so a run downloads them again only
after an approval changes them. The other jobs' checkouts leave the pointers in place, and the summary's size line reads
each image's size from its pointer.

## Running checks locally

```bash
bun run visual:select -- --base origin/main
```

```bash
bun run visual:web
```

`visual:select` writes `output/selection.json`. On a laptop it diffs the working tree, untracked files included, against
`--base`. `--all` selects everything, and `--head <commit>` compares two commits. `visual:web` starts the image capture
container and captures the selection inside it, so its pixels match CI's. Its image is amd64 and runs under emulation
on Apple silicon. `--story <id>` captures named stories, and `--skip-build` reuses the last component browser build.
`--on-host` captures in the host's Chrome without the container. That is fast for checking a story, but no baseline is
ever approved from it. `bun run visual:report` writes `output/report.html` from the latest image captures. A comparison
reads the images that git-lfs downloads into `baselines/`. Without git-lfs they stay pointers, and every compared image
capture is an error.

## Cancelled runs

CI's gate cancels a run in progress when a newer push to main arrives, so only the newest push's gate result appears.
The UI tests workflow cancels a superseded push run the same way, but never a scheduled or dispatched run. Nothing that
a cancelled run selected is lost: the next run diffs against the last green run's commit, which a cancelled or failed
run never moves.
