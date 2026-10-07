## Context

The promptfoo evals share `evals/evalHarness.ts` and save a pass count per eval to `evals/results/`, which the README
badge reads. They ran only on a developer's machine. The smoke workflow already boots LiteLLM under Doppler with the
model and Exa keys, so the evals can run on a runner with the same setup.

## Goals / Non-Goals

**Goals:**

- Run the evals in CI without blocking a merge, and tie every result to a commit and its models.
- Measure each eval's gate, so a gate can fail the build with one change.
- Cover the five prompts and the app paths that had no case, and check the graders themselves.

**Non-Goals:**

- Failing the build.
- Running the full review pipeline eval in CI. It reads the gitignored page cache of third-party text, which a runner
  must not hold. Its guard-only measurement runs when the weekly check finds a new LLM Guard release.
- Making the source suggester's eval repeatable. It reads live search results and live sites by design.

## Decisions

- **Report only.** The eval step runs every eval in a loop that collects the ones that failed or fell below their
  gates and names them in a warning, and the build still passes.
- **When it runs.** On a push to `main` whose paths include `worker/prompts/**`, `worker/chat/**`, `worker/podcast/**`,
  `worker/review/**`, `worker/suggest.ts`, `worker/attach.ts`, `worker/ingest/search.ts`, `worker/models.ts`,
  `api/tool/chatTools.ts`, `api/chat/roomTurns.ts`, `shared/enums.ts`, `shared/sources.ts`, `litellm-config.yaml`,
  `evals/**`, or the workflow itself, each case once. Weekly and by hand, each case three times. One run at a time. The
  runs share the model providers' rate limits.
- **No saved result in CI.** The harness skips `evals/results/` if the `CI` variable is set, so the badge keeps
  showing the committed local runs and the runner never commits.
- **Provenance.** Each saved result records the short commit, whether the tree had changes, and the writer models' and
  the grader's ids, which name the LiteLLM model aliases.
- **The interval.** The report prints a 95% Wilson interval for each eval's pass rate. With three runs a case, a swing of
  20 points or more can be noise, and the interval says how much.
- **The gate.** Each eval names its gate, a pass rate. New-topic chat, topic chat tools, and grader calibration need
  every run to pass, the source suggester's gate is report-only, and the others need 90%. The report says whether
  the run would pass.
- **Grader calibration.** A provider returns a fixed output from the case, and the case asserts the rubric with
  `llm-rubric` for an output that keeps it and `not-llm-rubric` for one that breaks it, graded by the same grader that
  the eval uses. A failed case is a grader to fix before trusting that eval.
- **The image eval draws its images.** Each case's image is an SVG drawn to a PNG with `@resvg/resvg-js` when the eval
  runs, so no binary is committed and every visible word is in the case.
- **Written rows.** A `watch` or `listen` row written for the eval holds its own title, snippet, and body in the fixture,
  and its label source is `written`.

## Risks / Trade-offs

- **Cost.** A push run costs about a dollar or two, and a weekly run a few dollars. The path filter keeps a push that
  touches no prompt from running.
- **Timeouts.** A model timeout counts as a broken run. The workflow runs one eval at a time to keep them rare.
