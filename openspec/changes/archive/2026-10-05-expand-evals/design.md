## Context

Evals live in `evals/`, outside `bun test` and the push gate, because each run makes real model calls. The review
pipeline eval measures precision and recall over labeled fixtures. The podcast episode script eval ran promptfoo cases
through its `evaluate` function under Bun, since the promptfoo CLI does not start under Bun.

## Goals / Non-Goals

**Goals:**
- Cover every model-facing prompt whose output a user reads or acts on, and whose mistakes code does not already catch.
- Make a new eval a cases file, a provider, and an eval file, with the run, the grader, and the report shared.

**Non-Goals:**
- No CI run of the promptfoo evals. The evals run locally against the local model proxy, and the README badge reads
  the results committed from those runs.
- No eval for a prompt that another eval already covers: the search queries feed the review pipeline eval, and the
  team chat about all of a team's topics shares the topic chat's conduct block.

## Decisions

- **One folder per eval, three files each.** `<name>Cases.ts` holds the made-up cases, `<name>Providers.ts` calls the
  same function the app calls, and `<name>Eval.ts` holds the checks and the rubrics. The cases and the rubrics are the
  eval's content, so only the plumbing is shared.
- **The provider calls the app's own function**, such as `summarizeTopicScan`, `buildTopicChatPrompt`, or
  `suggestSources`, so an eval measures the prompt as the app sends it. The alternative, a copy of the prompt in the
  eval, drifts the first time the prompt changes.
- **Checks that need no model come first.** Links, lengths, ids, headings, and the tool calls a turn made are checked in
  code. A rubric grades only a judgment that code cannot make, and each rubric names its failure conditions and grades
  the prompt's own rules, never a style the prompt does not ask for.
- **The grader runs on a different model from the model under test**, so a model never grades its own output.
- **The new-topic chat records its tool calls.** Each tool is wrapped to record its name and input. draftTopic is the real
  tool, since it writes only into the draft in memory. createTopic and suggestSources keep their real descriptions and
  schemas, and stand-ins replace their database and search calls. The checks read the recorded calls and the draft
  after the turn, never the reply's claims about them.
- **The topic chat tools eval records the same way**, with the real preview tools and stand-ins for the saving tools'
  database writes. A team room case is one question written from a made-up transcript by the room turn's own template,
  as the room sends it.
- **Web search is off in the chat evals.** The search tool returns that it is not configured, so a reply's links can be
  checked against the case's own material.
- **The source suggester runs end to end**, live search and readability checks included, since what the topic editor
  shows is what survives them.
- **Saved results and a badge.** Each run saves its pass count to `evals/results/<name>.json` and rebuilds a shields.io
  endpoint badge from every eval's saved count. The files are committed, so the badge shows the last runs someone chose
  to publish, the same way a coverage badge shows the last upload.
- **The grader sees what the writer saw.** A rubric's material is the writer's input as the writer's prompt has it, so
  a fact the writer was given, such as a zero count, is never graded as invented.
- **`--repeat <n>`** runs each case n times and prints a pass rate per case, since one run cannot tell a flaky check
  from a broken one.
- **The review pipeline eval moves into `evals/review-pipeline/`**, so every eval lives under `evals/`, and its script
  becomes `eval:review-pipeline` beside the others.

## Risks / Trade-offs

- [The evals found real prompt problems] → The fix-eval-findings change in this changelist fixes them: the podcast
  outline's finding ids and chapter lengths, the source suggester's off-topic and malformed suggestions, the scan
  report's status codes and invented details, and the new-topic chat's praise for the reader's idea.
- [A model step can outlive the 120-second model timeout] → A case that breaks on a timeout is reported apart from a
  failed check, and the timeout matches the app's own.
- [The source suggester's results change as the web does] → Its checks grade fit and readability, never a named source.
