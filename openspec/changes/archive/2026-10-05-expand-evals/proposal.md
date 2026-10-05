## Why

Only the podcast episode script writer had promptfoo cases. The prompts that reach the most people, the scan report on
every topic page and email, Coffee Talk, the new-topic chat, and the source suggester, could change with nothing to
measure the change against. The one podcast eval also carried its own run, grader, and report, which every new eval
would have copied.

## What Changes

- One shared harness, `evals/evalHarness.ts`, runs every promptfoo eval: it runs the cases, grades the rubrics on a model
  other than the one under test, prints the report, saves the full results to `logs/`, and takes `--repeat <n>` to run
  each case several times and print a pass rate for each case. Every run saves its pass count to `evals/results/`, and
  the README shows a badge built from those counts. The evals run locally, never in CI.
- New promptfoo evals, each with made-up cases, a provider that calls the same function the app calls, checks that need
  no model, and rubrics graded by a model:
  - the scan report writer
  - the topic chat reply
  - the new-topic chat, with the real draftTopic tool and recording stand-ins for createTopic and suggestSources
  - the source suggester, end to end through Exa and the readability checks, with the share of new suggestions that read
  - the topic chat's edit tools, in the solo chat and the team room
- The podcast episode script eval moves onto the harness and gains three checks: the description opens with "Carl and
  Vienna talk about", the writer never writes the goodbye's opening exchange itself, and an instruction inside a
  Finding's stored content is never followed.
- Every eval whose prompt reads outside material that a case can hold has a case with an instruction planted in that
  material. The source suggester reads live search results, which a case cannot hold.
- The review pipeline eval moves from `scripts/eval-pipeline.ts` to `evals/review-pipeline/`, and its fixtures sit beside
  it. **BREAKING** for anyone running it by its old name: `bun run eval` is now `bun run eval:review-pipeline`.
- The review pipeline eval gets its first real fixtures, from two public topics. The export reads only public topics
  without attachments, labels rows from the topic's ratings and bookmarks, and keeps page text out of git in a gitignored
  page cache. The rows no signal covers are labeled by a reading against the topic's prompt, each label naming its
  source, and the README publishes the baseline.

## Capabilities

### New Capabilities

### Modified Capabilities

- `eval-harness`: the podcast eval's cases add three checks, a shared harness runs every promptfoo eval and saves the
  badge's results, and five new evals cover the scan report, the topic chat, the topic chat's tool calls, the new-topic
  chat, and the source suggester

## Impact

- New: `evals/evalHarness.ts`, `evals/results/` with the README badge, and `evals/scan-report/`, `evals/topic-chat/`,
  `evals/topic-chat-tools/`, `evals/new-topic-chat/`, and `evals/source-suggestions/`, each with its cases, its
  provider, and its eval.
- `api/chat/roomTurns.ts` exports `toModelRoomQuestion`, `worker/chat/index.ts` exports `toEditTopicBlock`, and
  `worker/suggest.ts` exports `toSourceSuggestions`, so the evals call the app's own builders.
- Moved: `scripts/eval-pipeline.ts`, its smoke, and its test to `evals/review-pipeline/`. The LLM Guard update workflow,
  `scripts/smoke-coverage.sh`, and the `smoke:eval` script point at the new path.
- `worker/podcast/podcastEpisodeScript.ts` exports the goodbye's opening turns for the podcast eval to check against.
- `evals/tsconfig.json` references `api` and `db`, for the new-topic chat's tools and the review pipeline eval.
- package.json gains `eval:new-topic-chat`, `eval:review-pipeline`, `eval:scan-report`, `eval:source-suggestions`,
  `eval:topic-chat`, and `eval:topic-chat-tools`, and loses `eval`.
- No schema change and no prompt change, which the fix-eval-findings change makes. Every eval spends real money and stays
  out of `bun test` and the push gate.
