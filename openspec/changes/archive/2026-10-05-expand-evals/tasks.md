## 1. The shared harness

- [x] 1.1 Write `evals/evalHarness.ts`: `runEval` with the report and the saved results, `toRubricGrader`,
  `toGradingResult`, `toLinkUrls`, and the `--repeat` flag with a pass rate for each case
- [x] 1.2 Move the podcast episode script eval onto the harness, with its grader on the chat model

## 2. The podcast episode script eval

- [x] 2.1 Export `GOODBYE_OPENING_TURNS` from `worker/podcast/podcastEpisodeScript.ts`
- [x] 2.2 Check that the description opens with "Carl and Vienna talk about", and that the writer's sign-off and goodbye
  never repeat a line of the goodbye's opening
- [x] 2.3 Add a case whose Finding's stored content has an instruction to the writer, with a rubric that fails a host who
  follows it

## 3. The new evals

- [x] 3.1 Add `evals/scan-report/`: cases for a scan that kept findings, a quiet scan, a failed source, and an instruction
  in a finding, run through `summarizeTopicScan`
- [x] 3.2 Add `evals/topic-chat/`: cases for a question the findings answer, one they do not cover, an instruction in a
  finding, and a topic with no findings, run through `buildTopicChatPrompt` with web search off
- [x] 3.3 Add `evals/new-topic-chat/`: cases for a first message, a source pick, a yes to the read-back, a rename, and an
  instruction in the draft, with the real draftTopic and recording stand-ins for createTopic and suggestSources
- [x] 3.4 Add `evals/source-suggestions/`: cases for a hobby topic, a technical topic, and a topic that already follows the
  obvious sources, run through `suggestSources`
- [x] 3.6 Add `evals/topic-chat-tools/`: cases for the editor's tool calls in the solo chat and the team room, with the
  real preview tools and recording stand-ins for the saving tools, and export `toModelRoomQuestion` and
  `toEditTopicBlock` for it
- [x] 3.7 Save each run's pass count to `evals/results/`, rebuild the shields.io badge from them, and show the badge in the
  README
- [x] 3.5 Add the `eval:new-topic-chat`, `eval:scan-report`, `eval:source-suggestions`, and `eval:topic-chat` scripts, and
  reference `api` and `db` from `evals/tsconfig.json`

## 4. The review pipeline eval

- [x] 4.1 Move `scripts/eval-pipeline.ts`, its smoke, and its test to `evals/review-pipeline/`, with its fixtures beside it
- [x] 4.2 Rename the `eval` script to `eval:review-pipeline`, and point `smoke:eval`, `scripts/smoke-coverage.sh`, and the
  LLM Guard update workflow at the new path

- [x] 4.3 Export only a public Topic without attachments, from its own Findings and the nearest Findings of other public
  topics, label rows from its ratings and bookmarks, write page text to a gitignored page cache, and keep earlier labels
- [x] 4.4 Add `--with-examples`, which scores with the rows labeled from a rating or a bookmark as the score prompt's
  example pages
- [x] 4.5 Export Dev Tools for Builders and AI Coding Tools, review every unlabeled row against the topic's prompt, add
  injection prose and attacks to each, and record the baseline and the examples run
- [x] 4.6 Count only screened texts in both scanner rates, report n/a for a scanner that is down, and give the weekly
  measurement a minute per screen

## 5. Docs

- [x] 5.1 Rewrite `evals/README.md` as the guide to running, reading, and writing an eval
- [x] 5.2 Move the README's evals block into its own "Evals" section with a diagram, and update the root AGENTS.md routing
  table and the audit-structure stale list
- [x] 5.3 Run every eval once and record what each one found
