## Context

The scan report is written by `worker/prompts/summarize-topic-scan.md` and stored in `scans.scan_summary`. It is reader-facing: it renders in the digest email through `worker/notify.ts`, under "Carl's notes" on the topic page, on the activity page, and as topic chat's context.

Its closing beat currently asks for `"send"` or `"suppress"` plus a rationale, which produces reader-visible text like `send — there's a clear answer to the original question`.

The verdict word has no consumer. `suppress` occurs once in the repo, in the prompt asking for it. `worker/notify.ts` dispatches when `loadTopicEmailSubscribers` returns recipients and never reads the report.

The rationale is a different matter. It tells the reader how well the Scan answered their Topic's question, which is the one judgment only Carl can make after seeing every candidate. That is worth keeping.

## Goals / Non-Goals

**Goals:**

- Keep the closing judgment and its reasoning.
- Stop it from being framed as a notification verdict.
- Keep the spec and the prompt agreeing, since the spec is what asked for the label.

**Non-Goals:**

- Building the digest gate the recommendation was written for. Nothing asks for one.
- Rewriting stored reports. Existing rows keep their text.

## Decisions

**Reword the beat rather than delete it.** The first attempt removed the closing line outright. That threw away the part worth reading: whether the Scan answered the question. The label is the defect, not the judgment.

**Forbid the shape, not just the words.** The instruction says to write a plain sentence and never a verdict word with a dash after it. Naming only `send` and `suppress` would leave the model free to invent `Worth reading —` in the same slot, which is the same reader-facing artifact under a new name.

**Fold the reasoning into the paragraph that already states this rule.** The curation spec already says the Scan's own limits must not reach the report, "because those limits are configuration the reader has no setting for, so naming them explains a mechanism rather than telling the reader what was found". A notification verdict is the same kind of mechanism, so it belongs in that paragraph. Its opening widens from "the Scan's own limits" to "the Scan's own machinery" to carry both.

**Bump the prompt version.** `summarize-topic-scan.md` goes from 6 to 7. The wording changes what the model writes, so the registry needs a new version rather than an edit in place.

## Risks / Trade-offs

**The model could reintroduce a label.** It was instructed into the old shape, so it may drift back toward one. Verified against the real model on a scan with a partial answer: the output was "This scan answered what you asked only halfway — there's no smoking-gun item, but the cap piece is the closest thing", with no verdict word. Worth re-checking if the report ever regains a label-shaped opener.

**A future digest gate would have to derive its own signal.** It cannot inherit this one. That is the right trade: a gate should not be parsing a model's prose for a decision.

**Old reports keep the label.** Any `scan_summary` already written still carries `send — …`, including the ones chat reads as context. No backfill: the stored text is a record of what that scan said, and rewriting history to match a new prompt is a larger and riskier action than the problem warrants.

**The registry wins until synced.** `fetchPromptTemplate` returns the registry's template when one is served, so the bundled edit changes nothing until `bun run prompts:sync` runs. The registry is on version 9, and its only difference from the bundled template is this closing beat, so a sync overwrites no hand-tuned wording. `hasSameVariables` does not flag it, because the variables are unchanged and only the wording differs.
