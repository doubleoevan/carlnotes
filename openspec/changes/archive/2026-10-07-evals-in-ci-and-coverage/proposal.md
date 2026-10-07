## Why

The evals ran only on a developer's machine, so a saved result named no commit and a regression showed up only when
someone thought to run them. Five prompts had no eval: the search queries, the two attachment summaries, the team chat,
and the docs guide that every chat splices in. Several cases left out paths the app takes: removing a source, rewriting
the prompt, a decline, the visibility choice, and an episode of more than one segment. Nothing checked that a rubric
grader returns the verdict a rubric asks for, the scanner corpus held 10 texts, and no fixture measured the `watch` or
`listen` relevance bar.

## What Changes

- A report-only GitHub Actions workflow runs the promptfoo evals on a push to `main` that touches a prompt, the code
  that builds one, the model config, or an eval, each case once, and weekly and by hand with each case three times. It
  never fails the build. It writes each eval's pass rate, its 95% interval, and whether it clears the eval's gate to the
  job summary, and uploads the full results. A CI run never rewrites `evals/results/`.
- Each eval names a gate, the pass rate it has to clear, and the report says whether the run would pass it.
- Every saved result records the commit, whether the tree had changes, and the models that wrote and graded the
  output. The report prints each eval's pass rate with a 95% interval.
- A grader calibration eval checks every rubric grader against outputs whose verdicts are known: an output that breaks
  its rubric has to fail, and an output that keeps it has to pass.
- New evals for the search queries, the summary of an attached document, the description of an attached image, and the
  team chat. The topic chat eval gains a question answered from the docs.
- The topic chat tools eval gains removing a source, rewriting the prompt, and a decline. The new-topic chat eval gains
  the visibility choice. The podcast eval gains an episode of two segments.
- The scanner corpus grows to more benign articles and more known attacks, and each review pipeline fixture gains
  `watch` and `listen` rows written for the eval, each with the label source `written`.
- `generateSearchQueries` and `MAX_SEARCH_QUERIES` are exported, and the function takes an options object, so its eval
  calls the function that a Scan calls.

## Capabilities

### New Capabilities

### Modified Capabilities

- `eval-harness`: the evals run report-only in CI, every result records its commit and models, each eval names a gate,
  a grader calibration eval checks the graders, four new evals and new cases cover the prompts and paths that had none,
  and the corpora grow

## Impact

- `.github/workflows/evals.yml`: the report-only workflow.
- `evals/evalHarness.ts`: the commit, the models, the interval, the gate, the job summary, and no saved result in CI.
- `evals/grader-calibration/`, `evals/search-queries/`, `evals/attachment-summaries/`, `evals/team-chat/`: the new
  evals, with their `eval:*` scripts in `package.json`.
- `evals/topic-chat/`, `evals/topic-chat-tools/`, `evals/new-topic-chat/`, `evals/podcast-episode-script/`: the new cases.
- `evals/review-pipeline/*.json`: the larger scanner corpus and the written `watch` and `listen` rows.
- `worker/ingest/search.ts`: `generateSearchQueries` and `MAX_SEARCH_QUERIES` are exported, and the function takes
  `{ topicName, topicContext }`.
- `worker/chat/retrieve.ts`: `toDocsBlock` is exported for the topic chat's docs case.
- `worker/prompts/chat-edit-topic.md`: version 14, a proposal comes with its preview and in words.
- `biome.json`: Biome skips `evals/results/`, which the harness writes.
- every eval folder: its rubrics move out of the eval into its own `*Rubrics.ts`.
- `evals/evalLabels.ts`: the percentage and word count helpers, which the review pipeline eval shares without the harness's setup.
- `evals/evalReplies.ts`: the helpers that read a reply's links, prose paragraphs, and steps' text, split out of the
  harness with their tests.
- `shared/seo.ts`: the docs site's address, which the chat's docs block and the evals' link check both read.
- `README.md`, `evals/README.md`, and `AGENTS.md`: where the evals run, the new evals, and the gates.
