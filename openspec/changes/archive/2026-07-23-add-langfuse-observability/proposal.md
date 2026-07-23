# Langfuse: LLM tracing + prompt registry

## Why

The worker's model calls run blind: costs are hardcoded per-million estimates in `worker/review.ts`, and there is no way to see what a scan actually sent or received. The owner wants Langfuse in place now — real per-scan traces ahead of the evals work, and the prompt registry serving the just-versioned prompts so wording versions link to real outputs.

## What Changes

- OpenTelemetry tracing on every model call: a `worker/telemetry.ts` lifecycle (`startTelemetry`/`shutdownTelemetry`) wires `NodeSDK` + `LangfuseSpanProcessor` + `registerTelemetry(new LangfuseVercelAiSdkIntegration())`. A Scan's calls group under one `topic-scan` trace carrying `topicId`/`scanId`; generations and embeds nest inside it with real token counts. Zero-config: with `LANGFUSE_*` unset nothing activates and behavior is byte-identical to today.
- Prompt registry serving, git-canonical: `worker/prompts/fetch.ts` fetches each prompt's `production` version from Langfuse (5-minute cache, 2.5s timeout) and falls back to the bundled markdown on any failure or when keys are absent — a Scan can never fail or hang on Langfuse. Builders become async and return the registry prompt object so traced generations link to the prompt version that produced them.
- **BREAKING (internal)** The four prompt builders change from sync `string` to async `{ prompt, registryPrompt? }`, superseding the previous change's sync-builders decision (rationale recorded in the design).
- Sync-up: `worker/prompts/sync.ts` (`bun run prompts:sync`) pushes `worker/prompts/*.md` bodies to Langfuse as `production`-labeled versions, idempotently (byte-identical bodies create no new version). Git stays the source of truth; Langfuse UI edits are experiments the next sync stomps.
- Env: `.env.example` documents `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`/`LANGFUSE_BASE_URL` (already landed with the predecessor change); real keys live in Doppler.
- Accepted decision: prompt text and scraped content leave our infra to Langfuse Cloud (US). `mask`/`shouldExportSpan` are the documented redaction knobs, deliberately not built now.

## Capabilities

### New Capabilities

- `observability`: model calls are traced to Langfuse, grouped per Scan, flushed before process exit, and never able to fail the pipeline; everything no-ops without keys.

### Modified Capabilities

- `prompt-authoring`: the loader requirement changes — prompts are served registry-first (async) with the bundled markdown as fallback — and a new requirement adds the git-canonical sync-up. (The base spec lands when `add-versioned-prompts-scan-report` archives; this change is sequenced after it.)

## Impact

- New: `worker/telemetry.ts`, `worker/prompts/fetch.ts` (+ `fetch.test.ts`), `worker/prompts/sync.ts`.
- Modified: `worker/review.ts`, `worker/adapters/search.ts`, `worker/attach.ts` (async builders + telemetry linking at call sites), `worker/scan.ts` (`propagateAttributes` wrap), all three smokes (flush before a single exit), `worker/prompts/write.ts` (export `stripFrontmatter`), `package.json` (5 deps + `prompts:sync` script), `README.md` Development section, `.agents/skills/prompt-authoring/SKILL.md`.
- No DB, API, or UI changes. LiteLLM proxy config untouched (app-side tracing only, to avoid double-counted generations).
