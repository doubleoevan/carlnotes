## Why

`db/` has the domain schema but nothing writes Resources or records Scans — `worker/` is still a placeholder (`export {}`). The `adapter-authoring` skill forward-references "the source-ingestion OpenSpec change" for the shared adapter interface; this is that change. It lands the ingestion seam every later adapter and the curation pipeline build on, plus RSS as the first, keyless adapter — the smallest end-to-end slice that turns a configured Source into deduped Resources and a recorded Scan.

## What Changes

- Define the **shared adapter interface** in `worker/adapters/adapter.ts` — the seam `adapter-authoring` defers to: a `SourceAdapter` takes a Source and returns the Resources it emitted plus the cost it incurred. Resources only; never Findings.
- Implement **`rssAdapter`** (`worker/adapters/rss.ts`) — keyless (no Integration), parses RSS/Atom into canonical Resources (`kind: read`), deduped by canonical URL, cost `0`.
- Add a **kind→adapter registry** (`worker/adapters/index.ts`) mapping `source_kind` to its adapter; only `rss` is wired now, the rest resolve when their adapters land.
- Add **`runTopicScan(topicId)`** (`worker/scan.ts`): create a Scan (`running`), dispatch each of the topic's Sources through the registry, upsert deduped Resources (`ON CONFLICT (url) DO NOTHING`), record `found_count` and summed `cost`, mark `succeeded`/`failed` with `finished_at`. One Source's failure degrades only that Source — never aborts the batch.
- Add **one feed-parser dependency** (RSS + Atom) rather than hand-rolling XML/Atom/date parsing.

## Capabilities

### New Capabilities
- `source-ingestion`: the shared `SourceAdapter` interface (Source → Resources + cost), the keyless RSS adapter, global Resource upsert deduped on canonical URL, and Scan `found_count` + `cost` recording with per-Source error isolation. Scoring, embedding, Findings, and `kept`/`filtered` counts are explicitly out of scope — they belong to the later curation change.

### Modified Capabilities
<!-- none: domain-schema already provides sources.config, resources.url unique, and scans.found_count/cost; no requirement changes -->

## Impact

- **New dependency:** one feed parser (`rss-parser` or the leaner `fast-xml-parser` — decided in design).
- **Code:** `worker/adapters/adapter.ts` (interface), `worker/adapters/rss.ts` + `.test.ts`, `worker/adapters/index.ts` (registry), `worker/scan.ts` + `.test.ts`, `worker/index.ts` (exports `runTopicScan`). `worker` imports `db` (allowed by the boundary rules).
- **Contract:** `SourceAdapter` becomes the shape every future adapter (`reddit`, `youtube`, `search`, `composio`, `plugin`) implements, resolving the `adapter-authoring` skill's forward reference. The registry is the single dispatch point new kinds register in.
- **Deferred:** embedding, scoring, Findings, `kept`/`filtered` counts, `ai_summary` (curation change); Temporal activity wrapping and cadence scheduling (worker-process change); Integration-backed keyed adapters; Resource `kind` detection beyond `read` (podcast/video enclosures); per-Source rate-limit tuning.
