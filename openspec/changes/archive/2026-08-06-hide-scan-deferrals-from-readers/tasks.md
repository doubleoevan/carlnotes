## 1. Stop reporting deferrals

- [x] 1.1 Drop the `- deferred by the spend cap: N` line from `toFilteredResourcesReport` in `worker/review/summarize.ts`, and record on the function why the count is deliberately withheld rather than missing.
- [x] 1.2 Change the prompt's data heading in `worker/prompts/summarize-topic-scan.md` from `Filtered, deferred, and failed:` to `Filtered and failed:`, and bump its version 4 → 5 with today's date.
- [x] 1.3 Leave `deferredCount` tracked on the review outcome. A candidate is deferred both before embedding and before scoring, and only the second is derivable from the `score` span, so deleting it would lose the gate-stage signal rather than remove dead code.

## 2. Guard the decision

- [x] 2.1 Assert in `worker/review/summarize.test.ts` that the rendered prompt contains neither `spend cap` nor `deferred`, and note beside the fixture why its `deferredCount` is set but never reported.
- [x] 2.2 `bunx biome check .`, `bunx tsc -b`, `bun test`.
