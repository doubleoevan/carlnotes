# Tasks: versioned prompts + scan report

## 1. Prompt files and write helper

- [x] 1.1 Create `worker/prompts/write.ts` with `writePrompt(template, variables)` — strip the frontmatter block and template comments, then replace each `{{variable}}` — plus `filterPremiumPrompt` dropping the `<!-- premium-only -->` span for the cheap tier, and `worker/prompts/markdown.d.ts` declaring `module "*.md"` for `tsc`
- [x] 1.2 Land the four prompt files from the design's drafts: `worker/prompts/summarize-resource.md`, `summarize-topic-scan.md`, `search-topic.md`, `attach-context.md`

## 2. Builders become loaders

- [x] 2.1 `worker/review.ts`: `buildScorePrompt` imports `summarize-resource.md` via `with { type: "text" }` and writes the prompt from it, keeping the `MAX_SCORE_CHARS` cap and its `(resourceContent, topicContext, shouldWriteRelevanceExplanation)` signature
- [x] 2.2 `worker/adapters/search.ts`: `buildSearchPrompt` writes the prompt from `search-topic.md` with `{{maxQueries}}` and `{{topicContext}}`, keeping the topic-name fallback and context cap
- [x] 2.3 `worker/attach.ts`: `buildContextPrompt` writes the prompt from `attach-context.md` with `{{document}}`, keeping the `MAX_EXTRACT_CHARS` cap

## 3. Rename why-summary to relevance-explanation

- [x] 3.1 `worker/review.ts`: `scoreSchema.why` → `relevanceExplanation`; `shouldWriteWhy` → `shouldWriteRelevanceExplanation`; `whySummaries` → `relevanceExplanations`; `ResourceOutcome.why` → `relevanceExplanation`; `upsertFinding` parameter and comments follow; update the `worker/models.ts` why-summary comment
- [x] 3.2 Update prompt assertions in `worker/review.test.ts`, `worker/adapters/search.test.ts`, and `worker/attach.test.ts` for the written prompts and renamed wording
- [x] 3.3 `worker/scan.smoke.ts`: rename the why-summary labels and variables (`withWhy` → findings with relevance explanations)

## 4. Scan report

- [x] 4.1 `worker/review.ts`: tally what the loop drops today — filtered outcomes carry a reason (duplicate content, near-duplicate, below relevance threshold) and deferred/failed are counted — and collect kept details `{ title, url, relevanceScore, relevanceExplanation }`
- [x] 4.2 `worker/scan.ts`: give every `SourceOutcome` variant its Source `kind` (plus `fallbackMode` where present) and pass the outcomes into `reviewScan(scan, resources, sourceOutcomes)`
- [x] 4.3 `worker/review.ts`: replace `summarizeScan`/`buildSummaryPrompt` with `authorScanReport`/`buildScanReportPrompt` writing the prompt from `summarize-topic-scan.md` — compose `{{date}}`, `{{topicName}}`, `{{topicContext}}`, `{{keptResourcesBlock}}` (capped at 20 with an explicit "…and N more" line), `{{filteredBreakdown}}`, `{{sourcesBlock}}`, `{{costLine}}`; keep the cheap-tier model, the `scoringCheap` cost charge, and the empty-scan early return
- [x] 4.4 Update `worker/scan.test.ts` for the outcome shape and add report-prompt unit coverage in `worker/review.test.ts` (variables land in the written prompt, report beats present)

## 5. Smoke coverage

- [x] 5.1 `worker/scan.smoke.ts`: assert `scanSummary` is non-empty, a kept finding's `relevanceExplanation` exceeds 200 characters, and each of the four prompt builders returns a non-empty string for sample inputs
- [x] 5.2 Owner-run `bun run smoke:scan` against the live proxy; read the produced report and a sample relevance explanation for quality, revisiting the report model tier if the prose disappoints

## 6. Skill and verification

- [x] 6.1 Write `.agents/skills/prompt-authoring/SKILL.md` (file layout, frontmatter keys, `{{variable}}` bodies, thin loaders through `writePrompt`, premium-only marker, version-bump rules, adapters follow from the start), symlink it from `.claude/skills/prompt-authoring`, and add the skill line to `AGENTS.md`
- [x] 6.2 Gate: `bunx biome check .`, `bunx tsc -b`, `bun test` all pass
