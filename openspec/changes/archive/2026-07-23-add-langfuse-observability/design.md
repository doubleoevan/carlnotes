# Design: Langfuse tracing + prompt registry

## Context

All model calls route through the LiteLLM proxy via `worker/models.ts`; the Vercel AI SDK is `ai@^7`. Prompts live as versioned markdown under `worker/prompts/` with sync builders and the `writePrompt`/`filterPremiumPrompt` pipeline (`worker/prompts/write.ts`). There is no long-lived worker process: `runTopicScan` is invoked per process and the smokes call `process.exit()`. Langfuse Cloud (US) keys sit in Doppler; `.env.example` documents them. The worker must keep working byte-identically when the keys are absent.

## Goals / Non-Goals

**Goals:**

- Every generation and embedding traced to Langfuse, grouped one-trace-per-Scan with `topicId`/`scanId`, with real token counts.
- Prompts served registry-first from Langfuse with the bundled markdown as fallback, and traced generations linked to the serving prompt version.
- Git stays canonical for prompt wording; an idempotent sync pushes versions up.
- Zero-config: no keys → no tracing, no registry, no behavior change.

**Non-Goals:**

- No evals yet — this change produces the traces evals will score later.
- No LiteLLM-side Langfuse callback (would double-count generations against app-side traces).
- No span masking/filtering — `mask`/`shouldExportSpan` are the documented knobs when needed.
- No per-environment Langfuse projects or labels beyond `production`.

## Decisions

### 1. Spike outcome: NodeSDK under Bun works as-is (verified 2026-07-21)

A scratchpad spike under Bun 1.3.14 ran `NodeSDK` + `LangfuseSpanProcessor`, confirmed `registerTelemetry` is exported by the installed `ai@7` and accepts `LangfuseVercelAiSdkIntegration`, traced one `generateText` and one `embed` through LiteLLM, flushed, and saw both traces via the public traces API (~12s ingestion). No fallback ladder needed. `embed()` is traced by default — kept, since real embed latency/volume per scan is signal at this scale. Packages: `@langfuse/client`, `@langfuse/otel`, `@langfuse/tracing`, `@langfuse/vercel-ai-sdk` (all 5.9.x), `@opentelemetry/sdk-node`.

### 2. Supersedes the sync-builders decision

The predecessor change recorded "async builders — rejected: no benefit". The registry is the benefit: builders now fetch the serving version at call time, so they become async and return `{ prompt, name, registryPrompt? }` (the shared `BuiltPrompt` type, exported from `fetch.ts` alongside `fetchPromptTemplate`). Carrying the prompt's own `name` means a call site never re-types it to build telemetry — `promptTelemetry(builtPrompt)` reads both `name` and `registryPrompt` off the one object. Call sites are all inside async functions already; the ripple is four builders, four call-site files, and their tests.

### 3. The never-compile rule

Langfuse's `prompt.compile()` uses the same `{{variable}}` syntax as our templates. It is never called: `filterPremiumPrompt` must run before interpolation, and two interpolators would double-handle values. Registry text (stored without frontmatter, with the premium-tier markers) flows through the existing `filterPremiumPrompt` + `writePrompt` pipeline unchanged — `writePrompt`'s `^`-anchored frontmatter regex simply doesn't match registry text, and its comment strip removes the markers. `writePrompt` stays the sole interpolator.

### 4. Registry fetch: cache, fallback, timeout, catch

`worker/prompts/fetch.ts` owns serving: a `PromptName` union over the four names, the fallback template map (the four `with { type: "text" }` imports move here from the builders, and the sync script reuses the same map so runtime and sync cannot drift), a lazy `LangfuseClient` singleton (the `proxy()` pattern from `worker/models.ts`), and `fetchPromptTemplate(name)` returning `{ template, name, registryPrompt? }`. Guards, in order: keys absent → fallback template immediately, no SDK touched; `prompt.get(name, { cacheTtlSeconds: 300, fallback, fetchTimeoutMs: 2500 })`; plain try/catch → fallback template. A Scan can never fail or hang on Langfuse.

### 5. Trace grouping travels with the unit of work

`propagateAttributes({ traceName: "topic-scan", metadata: { topicId, scanId } }, …)` wraps `runTopicScan`'s body right after the scan insert — the earliest point where `scan.id` exists, and the placement a future Temporal activity inherits for free. It is OTel-context-only, so it is harmless when telemetry never started. `generateContext` in `worker/attach.ts` runs at upload time outside any Scan; its `functionId` makes it a self-describing standalone trace, no wrapper.

**`propagateAttributes` alone does not nest spans** — verified against a live 30-resource smoke run. It decorates whatever spans occur inside its callback with shared metadata and a trace name, but it does not itself create a parent span, so each `generateText` call still started as its own independent trace root (three separate "topic-scan"-named traces, correctly sharing `topicId`/`scanId` metadata, but not one trace with nested children). The fix: wrap the same body in `startActiveObservation("topic-scan", async () => { … })` from `@langfuse/tracing`, nested inside `propagateAttributes`. `startActiveObservation` creates and activates a real parent span for its duration; the ai-sdk integration's own spans, created with no other active span in context, would otherwise each become their own root — nesting under this one instead. Both calls are needed — `propagateAttributes` for the metadata/name, `startActiveObservation` for the actual grouping. Re-verified against a live scan: one trace, 20 nested observations spanning both the cheap and premium scoring tiers, all sharing the scan's `topicId`/`scanId` — contrasted directly against the four pre-fix traces (3 observations each, independent roots) from the run before.

### 6. Flush before every exit

`worker/telemetry.ts`: `startTelemetry()` no-ops unless both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set (the SDK reads env itself — no config plumbing); `shutdownTelemetry()` is null-safe and try/caught so a flush failure can never flip a passing smoke to exit 1. All three smokes (`scan`, `attach`, `search` — the latter two also make model calls) restructure their tails to compute an exit code, `await shutdownTelemetry()`, then a single `process.exit(exitCode)` covering success and failure paths.

### 7. Sync is idempotent and git always wins

`worker/prompts/sync.ts` iterates the bundled map, strips frontmatter via a newly exported `stripFrontmatter` from `write.ts` (keeping the premium markers — see decision 3), reads `version`/`model tier` by regex, fetches the current `production` body (any failure treated as never-synced — a distinguishable 404 isn't re-exported from `@langfuse/client`, and a real auth/network problem still surfaces loudly at the `create()` call below), skips when byte-identical, else `client.prompt.create({ name, type: "text", prompt, labels: ["production"], config: { version, modelTier } })`. Missing keys fail loudly — the script is owner-run under Doppler; a silent no-op is worse than an error. It lives in `worker/prompts/` rather than `scripts/`, colocated with what it syncs and matching the `db/seed.ts` precedent — `scripts/*.sh` is bash-only enforcement per the audit-structure skill. Conflict rule, documented in the skill: sync always wins; git is canonical; Langfuse UI edits are experiments the next sync stomps.

### 8. Data egress is an accepted decision

Prompt text, topic context, and scraped content leave our infra to Langfuse Cloud (US) inside spans. Accepted for a single-owner product in development; the redaction knobs exist and are named in the skill, not built.

## Risks / Trade-offs

- [ai v7 `registerTelemetry` surface is beta] → verified working at the installed version by the spike; per-call params are isolated to four call sites, mechanical to adjust on upgrade.
- [Spans lost at exit] → single-exit + flush restructure in all three smokes; `shutdownTelemetry` covers the failure path too.
- [Registry serving adds a network hop to prompt access] → 5-minute in-memory cache amortizes it to ~one fetch per prompt per process; timeout + fallback bound the worst case.
- [Version spam from repeated syncs] → byte-identical skip.
- [Langfuse UI edits silently overwritten] → by design; the conflict rule is documented where prompt authors look.

## Open Questions

- None blocking. Trace retention/eval dataset shape is deliberately deferred to the evals change.
