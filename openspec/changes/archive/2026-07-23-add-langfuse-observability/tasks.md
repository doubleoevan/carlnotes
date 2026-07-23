# Tasks: Langfuse tracing + prompt registry

## 1. Spike and dependencies

- [x] 1.1 Install `@langfuse/client`, `@langfuse/otel`, `@langfuse/tracing`, `@langfuse/vercel-ai-sdk`, `@opentelemetry/sdk-node`
- [x] 1.2 Scratchpad spike: NodeSDK + LangfuseSpanProcessor under Bun, `registerTelemetry` probe, one traced `generateText` + `embed` through LiteLLM, flush, trace verified via the public traces API (outcome recorded in the design)

## 2. Tracing

- [x] 2.1 New `worker/telemetry.ts`: `startTelemetry()` (no-op unless both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set; NodeSDK + `LangfuseSpanProcessor` + `registerTelemetry(new LangfuseVercelAiSdkIntegration())`) and `shutdownTelemetry()` (null-safe, try/caught flush)
- [x] 2.2 `worker/scan.ts`: wrap `runTopicScan`'s body after the scan insert in `propagateAttributes({ traceName: "topic-scan", metadata: { topicId, scanId } }, …)`
- [x] 2.3 All three smokes (`worker/scan.smoke.ts`, `worker/attach.smoke.ts`, `worker/search.smoke.ts`): `startTelemetry()` at top; tail restructured to compute the exit code, `await shutdownTelemetry()`, then a single `process.exit(exitCode)` covering success and failure

## 3. Registry serving

- [x] 3.1 New `worker/prompts/fetch.ts`: `PromptName` union; the four `with { type: "text" }` md imports move here as the bundled map; lazy `LangfuseClient` singleton (the `proxy()` pattern from `worker/models.ts`); `fetchPromptTemplate(name)` → `{ template, registryPrompt? }` with no-key early return, `client.prompt.get(name, { cacheTtlSeconds: 300, fallback, fetchTimeoutMs: 2500 })`, and catch → bundled
- [x] 3.2 `worker/attach.ts`: `buildContextPrompt` async via `fetchPromptTemplate`, call site awaits and adds `telemetry`/`runtimeContext` prompt linking; `worker/attach.test.ts` updated; gate green
- [x] 3.3 `worker/adapters/search.ts`: same conversion for `buildSearchPrompt`; `worker/adapters/search.test.ts` updated; gate green
- [x] 3.4 `worker/review.ts`: `buildScorePrompt` and `buildScanReportPrompt` async returning `{ prompt, registryPrompt? }` (shared `BuiltPrompt` type, exported from `fetch.ts`); the scoring and report `generateText` call sites add prompt linking; `worker/review.test.ts` updated; gate green
- [x] 3.5 New `worker/prompts/fetch.test.ts`: with `LANGFUSE_*` explicitly cleared, `fetchPromptTemplate` returns the bundled text byte-identical with `registryPrompt` undefined
- [x] 3.6 `worker/scan.smoke.ts`: `writeSamplePrompts` goes async; reports whether the registry served this run's prompts

## 4. Sync-up and docs

- [x] 4.1 `worker/prompts/write.ts`: export `stripFrontmatter` (reuse the existing regex)
- [x] 4.2 New `worker/prompts/sync.ts` (colocated with what it syncs, matching the `db/seed.ts` precedent — `scripts/*.sh` is bash-only enforcement per the audit-structure skill): iterate the bundled map, strip frontmatter (keep premium markers), read `version`/`model tier` by regex, fetch current `production` body (any failure → treat as never-synced), skip when byte-identical, else `client.prompt.create({ …, labels: ["production"], config: { version, modelTier } })`; loud failure on missing keys
- [x] 4.3 `package.json`: `"prompts:sync": "doppler run -- bun worker/prompts/sync.ts"`; README Development section documents it
- [x] 4.4 `.agents/skills/prompt-authoring/SKILL.md`: rewrite the loader section for registry-first serving with bundled fallback; add the Registry section with the sync-always-wins conflict rule and the never-compile rule

## 5. Verification

- [x] 5.1 Gate: `bunx biome check .`, `bunx tsc -b`, `bun test` all green (46/46); zero-config check confirmed — no `.env` file exists, so plain `bun test` always takes the no-keys fallback path
- [x] 5.2 Owner-run: `bun run prompts:sync` twice (four prompts appear with the `production` label, second run created 0/updated 0/unchanged 4), then `bun run smoke:scan` twice — 13/13 PASS both times, "prompts served from Langfuse" confirmed. First run surfaced a real gap: `propagateAttributes` alone produced 3 independent traces sharing metadata, not one grouped trace. Fixed with `startActiveObservation` (see design.md); re-ran and confirmed via the Langfuse API — one trace, 20 nested observations across both scoring tiers
