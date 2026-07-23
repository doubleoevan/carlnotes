---
name: prompt-authoring
description: Conventions for CarlNotes model-facing prompts. Use when adding or changing any LLM prompt in the worker, including prompts for new Source adapters.
---

# Prompt authoring

Every model-facing prompt lives as one versioned markdown file under `worker/prompts/`, never as an inline string literal. Git history is the audit trail.

## File layout
- One `.md` per prompt, named verb-first for what it does: `summarize-resource.md`, `summarize-topic-scan.md`, `search-topic.md`, `attach-context.md`.
- YAML frontmatter with exactly five keys: `title`, `version`, `model tier`, `description`, `updated`.
- The body is the prompt, with runtime inputs as `{{variable}}` placeholders. No conditionals, loops, or partials — compose list blocks and derived strings in TS before filling.

## Loaders
- Each prompt gets a thin, async TS builder that keeps a stable exported name and call site. It calls `fetchPromptTemplate("<name>")` from `worker/prompts/fetch.ts` (registry-first, bundled markdown as fallback), then returns `writePrompt(template, variables)` from `worker/prompts/write.ts` — writing itself stays synchronous.
- A builder returns `{ prompt, registryPrompt? }`. Pass `registryPrompt` through to the generation call as `runtimeContext: { langfusePrompt: registryPrompt }` plus `telemetry: { functionId: "<name>", includeRuntimeContext: { langfusePrompt: true } }`, so the trace links to the prompt version that produced it.
- `writePrompt` strips the frontmatter and every template comment (`<!-- … -->`), then replaces each `{{variable}}`. It never parses YAML at runtime — frontmatter and comments are documentation for humans and git review, and never reach the model. **Never call Langfuse's own `prompt.compile()`** — it uses the same `{{variable}}` syntax and would double-interpolate; `writePrompt` is the only interpolator.
- Cap user-controlled inputs (content, context, documents) in the builder before writing so a huge input cannot inflate token spend.
- A tier-gated span sits between `<!-- premium-tier -->` and `<!-- /premium-tier -->` markers; the cheap tier's builder drops it with `filterPremiumPrompt` before writing. Only `summarize-resource.md` uses this today. The marker name leaves room for more tiers later without another rename.

## Registry
- Prompts are served registry-first from Langfuse (5-minute cache, ~2.5s timeout) and fall back to the bundled markdown on any failure or when `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` are unset — a Scan can never fail or hang on the registry.
- **Git is canonical.** `bun run prompts:sync` (`worker/prompts/sync.ts`) pushes each bundled body up as a `production`-labeled version, idempotently — an unchanged body creates no new version. A prompt edited in the Langfuse UI is an experiment: the next sync overwrites it with the git body. Never treat the UI as a place to leave a permanent change.
- One live file per prompt: never version via filename suffixes or version folders. Git history serves every old version (`git log -p worker/prompts/<name>.md`); Langfuse's own version history mirrors it once synced.

## Versioning
- Bump the integer `version` (and set `updated`) only on a meaningful wording change — one that can change model output. Formatting fixes and variable plumbing do not bump it.
- The `model tier` key records which tier the prompt targets; actual routing stays in `worker/models.ts`. Both `version` and `model tier` ride along as Langfuse prompt config on sync, for cross-referencing a trace back to its wording.

## Testing
- Unit tests assert the written prompt contains its interpolated inputs and no leftover `{{` placeholders. They run with Langfuse keys unset, so they always exercise the bundled fallback.
- `worker/scan.smoke.ts` runs every prompt builder with sample inputs and fails if any comes back empty, and reports whether the registry served them. Add new prompts to that check.

## Carl's voice, for reader-facing notes
Prompts that produce text a reader sees as a note from Carl — `summarize-resource.md`'s relevance explanation, `summarize-topic-scan.md`'s scan report — follow one shape: an overall summary up top, then stats if applicable, then supporting details if applicable. First person, short declarative sentences, casual and human, like Carl is talking to a friend — never a dashboard, never a report. No top-level heading when the surface already provides one (the topic card's "Carl's notes" label, for the scan report). Short over exhaustive: if a beat has nothing to say, skip it silently rather than padding. The fuller persona and voice guide lives in the team's Notion (Persona & Voice page), not in this repo.

## New adapters
A new Source adapter that needs a model prompt ships it under `worker/prompts/` with a thin loader from the start, following this skill and `adapter-authoring`.
