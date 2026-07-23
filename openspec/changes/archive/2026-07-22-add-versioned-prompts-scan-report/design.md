# Design: versioned prompts + scan report

## Context

Four inline prompt builders produce every model-facing string in the worker: `buildScorePrompt` and `buildSummaryPrompt` in `worker/review.ts`, `buildSearchPrompt` in `worker/adapters/search.ts`, `buildContextPrompt` in `worker/attach.ts`. The two user-facing outputs they drive are underwhelming: the premium tier writes a "one-sentence why-summary" and the scan recap is a "brief recap" over at most five of them. `findings.relevance_explanation` and `scans.scan_summary` already exist; the topic card already renders the summary ("Carl's notes") and each feed item its explanation. The worker runs under Bun directly (no bundling); `tsc -b` uses `module: "Preserve"`, which supports import attributes.

The scan report's voice and shape target lives in Notion ([Versioned prompts + scan report](https://app.notion.com/p/3a062400378d8162ba9ced9344c4f63a)): a dated first-person note with a headline, reasoning for adds/skips, list status against a cap, an explicit no-notification call, and a cited-sources line. Persona rules apply: confident, specific, short declaratives, honest metrics, never nags, never "you missed" — and the persona stays out of code identifiers.

## Goals / Non-Goals

**Goals:**

- Prompt wording lives in `worker/prompts/*.md`, versioned by git, reviewable as content; TS loaders stay thin and keep their call sites.
- The premium relevance explanation becomes the product's note: what the content says plus why it matters to the topic — substantive, several sentences.
- The scan summary becomes a structured dated report grounded in real scan data, persisted in `scans.scan_summary` unchanged.
- The convention is documented as a `prompt-authoring` skill so the next adapter starts from it.

**Non-Goals:**

- No notification delivery — the report records a send/suppress recommendation as text; wiring it to email/digest is the later Temporal + digest work.
- No UI markdown rendering — the topic card keeps rendering plain text for now.
- No template engine — `{{variable}}` replacement only; no conditionals, loops, or partials.
- No change to which tier writes explanations: unpromoted findings still get an empty explanation (see Open Questions).
- No DB migration — both target columns exist.

## Decisions

### 1. Loading: Bun text imports, one write helper

Each builder statically imports its template — `import summarizeResourceTemplate from "./prompts/summarize-resource.md" with { type: "text" }` — and calls a shared `writePrompt(template, variables)` in `worker/prompts/write.ts` that strips the YAML frontmatter block and every template comment, then replaces each `{{name}}`. A `worker/prompts/markdown.d.ts` declares `module "*.md"` for `tsc`. Builders keep their exported names and call sites; loading is synchronous and bundle-safe.

- Alternative — `readFileSync(new URL(...))`: works, but path-relative at runtime and dead weight if the worker is ever bundled. Rejected.
- Alternative — async `Bun.file().text()`: changes builder signatures to async for no benefit. Rejected.

### 2. Frontmatter is documentation, not runtime config

The fixed keys (`title`, `version`, `model tier`, `description`, `updated`) exist for humans and git review. `writePrompt` strips the block; nothing parses YAML at runtime, so no YAML dependency. `version` is an integer bumped only on meaningful wording changes; `updated` moves with it. Model routing stays where it is today (`worker/models.ts`) — the frontmatter `model tier` records intent.

### 3. The premium-only block in summarize-resource.md

One `summarize-resource.md` serves both scoring tiers, but only the premium tier asks for the relevance explanation. The explanation instruction sits between `<!-- premium-only -->` and `<!-- /premium-only -->` markers; `buildScorePrompt(resourceContent, topicContext, shouldWriteRelevanceExplanation)` keeps its signature and strips the span for the cheap tier. All wording stays versioned in the file and the cheap tier's prompt is byte-identical to intent (score only), preserving current behavior.

- Alternative — gate by output schema only (always include the instruction, omit the field from the cheap schema): drifts the cheap prompt and instructs the model to write a field it cannot emit. Rejected.
- Alternative — keep the conditional sentence in TS: the exact wording we want versioned would live outside the file. Rejected.

### 4. Renames: why-summary → relevance-explanation

`output.why` → `output.relevanceExplanation` in `scoreSchema`; `whySummaries` → `relevanceExplanations`; `shouldWriteWhy` → `shouldWriteRelevanceExplanation`; `ResourceOutcome`'s `why` → `relevanceExplanation`; prompt wording says "relevance explanation". `buildSummaryPrompt`/`summarizeScan` become `buildScanReportPrompt`/`authorScanReport` to match `summarize-topic-scan.md`. Comments and the smoke report labels follow. No abbreviations.

### 5. The report gets real inputs

Today's recap sees only kept/filtered counts and five explanation strings. The report needs the scan's actual story, so:

- The review loop tallies outcomes it currently drops on the floor: `filtered` carries a reason (`"duplicate content" | "near-duplicate" | "below relevance threshold"`) and `deferred`/`failed` are counted, giving the drops-with-reasoning and data-hygiene sections real numbers.
- Kept findings collect `{ title, url, relevanceScore, relevanceExplanation }` so the report can cite and link them.
- `scan.ts` passes ingestion context into review: per-Source outcomes gain `kind` (and `fallbackMode` where present) on every variant — today `failed`/`skipped` outcomes are anonymous — and `reviewScan(scan, resources, sourceOutcomes)` hands them to the report author. Formatting into prompt blocks happens in `review.ts`, next to the prompt.
- TS composes flat string variables (`{{keptResourcesBlock}}`, `{{filteredBreakdown}}`, `{{sourcesBlock}}`, `{{costLine}}`, `{{date}}`, `{{topicName}}`, `{{topicContext}}`); the template stays logic-free. The kept block is capped at 20 items to bound tokens; the cap is logged into the block itself ("…and N more") so the model never sees a silent truncation.
- The fresh-item minimum and list caps are not schema concepts; the prompt tells the model to report list/threshold status only when the topic context itself states a target, mirroring the Notion example where the 50-cap comes from the topic.
- The empty-scan early return stays: a scan with nothing to review keeps `scanSummary` empty and spends nothing.

### 6. Report model tier: cheap

The report synthesizes premium-written explanations; the cheap tier is enough for assembly prose and keeps the per-scan cost honest. The knob is one line (swap `cheapModel()` for `scoreModel()` in `authorScanReport`) plus the frontmatter `model tier` note if quality disappoints.

### 7. Smoke and unit coverage

`worker/scan.smoke.ts` adds three assertions: `scanSummary` is non-empty, some kept finding's `relevanceExplanation` is longer than 200 characters (well beyond one line), and each of the four builders returns a non-empty string for dummy inputs (which proves the markdown loaded and interpolated). Unit tests in `review.test.ts`, `search.test.ts`, and `attach.test.ts` keep asserting that variables land in the filled prompt, with wording expectations updated ("relevance explanation", report sections).

### 8. Skill: prompt-authoring

Canonical at `.agents/skills/prompt-authoring/SKILL.md`, symlinked from `.claude/skills/prompt-authoring` (matching every other shared skill), listed in `AGENTS.md`'s skills section. It documents: one `.md` per prompt under `worker/prompts/`, the frontmatter keys, `{{variable}}` bodies, thin loaders through `writePrompt`, the premium-only marker, version-bump rules, and that new adapters ship their prompts this way from the start.

## Prompt drafts

The four files below are the deliverable wording, ready to land at `worker/prompts/` during apply.

### worker/prompts/summarize-resource.md

```markdown
---
title: Resource relevance score
version: 1
model tier: cheap first pass, premium re-score
description: Scores a fetched resource against the topic context; the premium tier also writes the relevance explanation shown in the feed.
updated: 2026-07-21
---

Score how relevant the content below is to the reader's topic context, from 0 (irrelevant) to 1 (highly relevant).

<!-- premium-only -->
Also write relevanceExplanation: the note the reader will see in their feed instead of opening the source, so it must carry the substance itself.

- Start with what the content actually says: the specific claims, findings, numbers, names, events, or arguments. Naming the genre is a failure ("discusses AI trends" tells the reader nothing).
- Then connect it to the reader's topic context: which part of the context it advances, confirms, contradicts, or updates, and why that matters now.
- Three to six sentences of plain prose. No headings, no bullet points, no filler openers like "This article discusses".

Write it so the reader gets the substance without clicking through.
<!-- /premium-only -->

Topic context:
{{topicContext}}

Content:
{{resourceContent}}
```

### worker/prompts/summarize-topic-scan.md

```markdown
---
title: Scan report
version: 1
model tier: cheap
description: Writes the dated markdown scan report persisted as the Scan's scan summary and shown on the topic card.
updated: 2026-07-21
---

You just finished a content scan for the reader's topic. Write the report they will read in their feed.

Voice: first person — you did the reading. Confident, specific, plain. Short declarative sentences. Report like a well-informed friend, not a dashboard. Be honest about small numbers and quiet days; a scan that found nothing worth keeping is a fine report. Never nag, never guilt-trip, never say "you missed". No greeting, no sign-off.

Shape: a dated markdown note. Flowing paragraphs, not a form; every numbered item below is a beat to hit in order, not a heading to print.

1. Headline: open with the scan date and the single most important thing this scan found — or that it found nothing worth the reader's time.
2. Insights and trends: read across the kept items' notes and pull out what moved — recurring themes, contradictions, momentum, surprises. This is the heart of the report.
3. Adds and drops: what was kept and why it earned its place; what was filtered, deferred, or failed, with the reasoning.
4. Sources: which sources were consulted, which were skipped, failed, or degraded to a fallback, and why.
5. Data hygiene: dedupe and cleanup actions taken this scan, in a sentence.
6. List status: how the topic's list stands after this scan. If the topic context sets a target size, cap, or fresh-item minimum, report status against it; otherwise say nothing about thresholds.
7. Notification decision: end the body with whether this scan warrants notifying the reader — "send" only if something needs their attention, otherwise "suppress" — and the rationale.
8. Sources line: finish with a "Sources:" line of markdown links to the kept items.

Ground every claim in the data below. Never invent items, sources, numbers, or trends. Link kept items with markdown links using their urls. Skip any beat the data gives you nothing for, silently. Length follows the day's substance — typically two to four paragraphs plus the sources line. Dense, never rambling.

Topic: {{topicName}}

Topic context:
{{topicContext}}

Scan date: {{date}}

Kept items with their scores and notes:
{{keptResourcesBlock}}

Filtered, deferred, and failed:
{{filteredBreakdown}}

Sources consulted:
{{sourcesBlock}}

Cost:
{{costLine}}
```

### worker/prompts/search-topic.md

```markdown
---
title: Search query generation
version: 1
model tier: cheap
description: Turns the topic context into diverse web search queries for the search source adapter.
updated: 2026-07-21
---

You are a research scout. Given the topic below, write up to {{maxQueries}} diverse web search queries that would surface fresh, high-quality articles worth reading and YouTube playlists worth watching. Return only the queries.

Topic:
{{topicContext}}
```

### worker/prompts/attach-context.md

```markdown
---
title: Attachment context
version: 1
model tier: cheap
description: Extracts the notes stored as an attachment's context when it is uploaded to a topic.
updated: 2026-07-21
---

Extract concise notes capturing what the document below is about — its subject, key facts, and themes — as context for curating related media. Return only the notes.

Document:
{{document}}
```

`search-topic.md` and `attach-context.md` are extractions of today's wording, not rewrites — their behavior is proven and out of scope. (`maxQueries` becomes a variable so the constant stays in TS.)

## Risks / Trade-offs

- [Cheap-tier report prose may underwhelm] → the model knob is one line plus a frontmatter note; revisit after reading real output from the smoke run.
- [Richer premium explanations cost more output tokens] → roughly 200 extra tokens per promoted resource (~$0.0001 at the premium rate), inside the existing per-Scan budget cap, which already defers work at the ceiling.
- [Report prompt grows with kept count] → kept block capped at 20 items with an explicit "…and N more" line; explanations are already length-bounded by the score prompt.
- [`<!-- premium-only -->` is a bespoke convention] → used by exactly one file, implemented as one regex strip, documented in the skill.
- [Markdown report renders as plain text in today's UI] → accepted; links degrade to readable `[title](url)` text and the follow-up UI change is noted in the proposal.
- [Renames touch test expectations across three test files] → mechanical; the verification gate (`biome check`, `tsc -b`, `bun test`) catches misses.

## Open Questions

- Should the cheap tier also write (lower-quality) explanations so no feed item shows "No notes yet."? Deliberately unchanged here — it changes spend shape and belongs to its own decision.
- Should an empty scan still author a "quiet day" report? Kept the free early return; revisit if blank "Carl's notes" reads as broken once real topics run on a schedule.
