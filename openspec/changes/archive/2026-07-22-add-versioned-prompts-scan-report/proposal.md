# Versioned prompts + scan report

## Why

The four LLM prompts that define the product's output quality are inline string literals scattered across three worker files, invisible to review and unversioned as content. Meanwhile the two user-facing texts they produce — the per-finding relevance explanation (the value proposition) and the scan recap — are a single throwaway sentence and a "brief recap", far below what the product promises ("Carl read 41 things so you'd read 4").

## What Changes

- Extract the four inline prompt builders into versioned markdown under `worker/prompts/` — `summarize-resource.md`, `summarize-topic-scan.md`, `search-topic.md`, `attach-context.md` — each with YAML frontmatter (title, version, model tier, description, updated) and a `{{variable}}`-templated body. The TS builders (`buildScorePrompt`, `buildSummaryPrompt` in `worker/review.ts`; `buildSearchPrompt` in `worker/adapters/search.ts`; `buildContextPrompt` in `worker/attach.ts`) become thin loaders that read and interpolate, keeping their call sites. Git history is the audit trail; the frontmatter version bumps only on meaningful wording changes.
- `summarize-resource.md` asks the premium tier for a genuinely informative relevance explanation: what the content actually says plus how it relates to the topic context, enough substance that the reader gets the gist without opening the source. Not one line.
- **BREAKING (internal)** Rename why-summary to relevance-explanation everywhere: prompt wording, the score output field (`output.why` → `output.relevanceExplanation`), and `review.ts` identifiers (`why`, `whySummaries`, `shouldWriteWhy`, and similar), matching the existing `findings.relevance_explanation` column. No abbreviations. No schema change.
- `summarize-topic-scan.md` replaces the brief recap with a structured, dated markdown report persisted as `scans.scan_summary`: headline, insights and trends pulled across the kept resources' relevance explanations, adds and drops with reasoning, sources considered and skipped with reasoning, data-hygiene actions, list and threshold status versus a topic-defined fresh-item minimum when the topic context states one, a notification decision (send or suppress) with rationale, and a cited-sources list with links. Shown where the scan summary already appears on the topic card.
- `worker/scan.smoke.ts` additionally asserts `scanSummary` is non-empty, a kept finding's `relevanceExplanation` is substantive (well beyond one line), and each extracted prompt loads to a non-empty string.
- Document the convention as a `prompt-authoring` skill (canonical `.agents/skills/`, symlinked from `.claude/skills/`, listed in `AGENTS.md`) so new source adapters follow the versioned-prompt pattern from the start.

## Capabilities

### New Capabilities

- `prompt-authoring`: LLM prompts live as versioned markdown files under `worker/prompts/` with fixed frontmatter and `{{variable}}` bodies, loaded by thin TS functions; new prompts follow the pattern from day one.

### Modified Capabilities

- `curation`: the scoring requirement changes — the premium tier writes a substantive multi-sentence relevance explanation (renamed from why-summary) — and the scan-record requirement changes — `scan_summary` becomes the structured scan report instead of a brief recap. Stale column names in the spec (`why_summary`, `signal_score`, `ai_summary`) are corrected to the current schema (`relevance_explanation`, `relevance_score`, `scan_summary`).

## Impact

- `worker/review.ts`, `worker/adapters/search.ts`, `worker/attach.ts`: builders become loaders; renames land in `review.ts`.
- `worker/scan.ts`: the report needs scan-level inputs the review recap never had (per-source outcomes, found count, degraded sources), so the ingestion summary is passed into review's report authoring.
- New `worker/prompts/` directory (four `.md` files plus a small write helper and a `*.md` module declaration for `tsc`).
- Tests: `worker/review.test.ts`, `worker/adapters/search.test.ts`, `worker/attach.test.ts` prompt assertions; `worker/scan.smoke.ts` new assertions.
- Skills: new `.agents/skills/prompt-authoring/SKILL.md` + `.claude/skills/` symlink + `AGENTS.md` skills list entry.
- No DB, API, or UI changes: `scans.scan_summary` and `findings.relevance_explanation` already exist and the topic card already renders the summary. Known follow-up (out of scope): the UI renders the summary as plain text today; markdown rendering for the report is a later UI change.
