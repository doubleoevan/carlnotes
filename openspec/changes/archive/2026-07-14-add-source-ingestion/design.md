## Context

`worker/` is a placeholder (`export {}`); `db/` already ships the domain schema. Every column this change needs exists: `sources.config` (jsonb — holds the RSS url), `sources.integration_id` (nullable — RSS is keyless), `resources.url` (unique — the global dedupe key), `resources.content_hash`/`title`/`kind`, `scans.status`/`found_count`/`cost`/`finished_at`/`error`. So this is code-only: no migration.

The `adapter-authoring` skill mandates the conventions (`worker/adapters/<kind>.ts`, `<kind>Adapter`, Resources-only, keyless-first, idempotent on canonical URL, one Source's failure never aborts a batch) and forward-references *this* change for the shared interface. Six resourceKinds are coming (`rss`, `reddit`, `youtube`, `search`, `composio`, `plugin` — keys already provisioned in `.env.example`), so the interface is a real seam, not speculation. Runtime is Bun; `worker` may import `db`. There is no Temporal yet, and tests are structural (no live DB — see `db/schema.test.ts`).

## Goals / Non-Goals

**Goals:**
- One `SourceAdapter` interface the whole adapter family implements: `Source → { resources, cost }`.
- A keyless `rssAdapter` that turns an RSS/Atom feed into canonical, deduped Resources.
- `runTopicScan(topicId)` that dispatches Sources through a kind→adapter registry, upserts Resources deduped on `url`, records `found_count` + summed `cost`, and isolates per-Source failures.

**Non-Goals:**
- Embedding, scoring, Findings, `kept`/`filtered` counts, `ai_summary` — the later curation change.
- Temporal activity wrapping and cadence scheduling — the worker-process change.
- Integration-backed (keyed) adapters and a shared credential resolver — land with the first keyed adapter.
- URL canonicalization beyond trimming (tracking-param stripping), and Resource `kind` detection beyond `read`.

## Decisions

**Adapter interface: a function type, not a class.**
```ts
type SourceAdapter = (source: Source) => Promise<AdapterResult>
type AdapterResult = { resources: NewResource[]; cost: number }
```
`NewResource` is Drizzle's insert type for `resources`; the adapter fills `url`, `title`, `kind`, `content_hash` and leaves `embedding` null. One stateless method → a plain async function is the whole seam. Over a class with `.kind` + `.scan()` (ceremony for no state) or a richer `(source, ctx)` with a credential context (RSS needs none — add the param when the first keyed adapter does). `cost` rides in the result because `scans.cost` is a first-class column and paid adapters (search, LLM scoring) will report real spend; RSS reports `0`.

**Registry: a plain `Record<SourceKind, SourceAdapter>` in `worker/adapters/index.ts`.**
`{ rss: rssAdapter }` today; new resourceKinds add a line. `runTopicScan` looks up `sourceAdapters[source.kind]` and skips a miss. Over a plugin/discovery mechanism — a static map is the dispatch, nothing more.

**Feed parser: add `rss-parser`.**
It parses RSS 2.0 **and** Atom, decodes entities/CDATA, and normalizes dates — the least of *our* code. Hand-rolling with the zero-dep `fast-xml-parser` means owning the RSS-vs-Atom field mapping and date formats, exactly the flimsy-parser trap. `rss-parser` pulls `xml2js` (pure JS, fine on Bun; no external-entity/DTD resolution, so no XXE). Trade-off is footprint, isolated to one file — swapping parsers later touches only `rss.ts`.

**Canonical URL = `entry.link` (trimmed), falling back to `entry.guid` when it is an absolute URL.**
Exact-string match against the `resources.url` unique index. `ponytail:` no tracking-param stripping or host normalization — two URLs differing only by `?utm_*` create two Resources for now; add normalization when duplicate Resources actually show up.

**`content_hash` = sha256 of `title + content`, one line via `Bun.CryptoHasher`.**
Fills the column's stated purpose (catch content-level dupes) at negligible cost. Nothing queries it yet; the dedupe path is `url`. `ponytail:` present but unused until a content-dup query needs it.

**Resource `kind` = `read` constant for RSS.**
`ponytail:` podcast/video feeds carry enclosures that would map to `listen`/`watch`; detecting them is deferred — plain articles are `read`.

**Upsert: one batch insert with `onConflictDoNothing({ target: resources.url })`.**
A Resource is global and, at ingestion, immutable — its `embedding` is filled later by curation, so a re-scan must not clobber it. `DoNothing` over `DoUpdate` (which would only churn `updated_at`). `found_count` counts Resources **discovered and deduped this scan**, not rows newly inserted — a re-scan that finds the same 40 URLs reports `found_count = 40`.

**`runTopicScan(topicId)` owns the whole Scan lifecycle for now.**
It creates the Scan (`running`), runs adapters, upserts, then writes `found_count`/`cost`/`finished_at` and marks `succeeded`. Input is `topicId` (it creates the Scan) rather than a pre-made `scanId`. `ponytail:` when curation lands, completion moves downstream and `runTopicScan` becomes an ingestion stage; when Temporal lands it wraps this as an activity. Both are cheap refactors — don't build the staging/activity seams now.

**Error handling: `try/catch` per Source, `Promise.allSettled`-style.**
Each Source runs independently; a throw logs and contributes nothing. Registry miss = skip. The Scan is `failed` only if it had ≥1 Source and every one threw; zero Sources → `succeeded` with `found_count = 0`. Rate-limit/retry policy lives in the adapter as top-of-file constants — RSS declares `FETCH_TIMEOUT_MS` and a response-size cap; `ponytail:` no retry/backoff yet, a failed fetch just degrades that Source.

**Testing: pure checks, no live DB (matches `db/schema.test.ts`).**
Split the parse out as `parseFeed(xml): NewResource[]`; `rss.test.ts` drives it with fixture RSS **and** Atom strings and asserts canonical URL, `kind: read`, and within-feed dedupe — no network. Split the aggregation out as a pure tally over adapter results; `scan.test.ts` feeds it fake results (including a thrown Source) and asserts `found_count`, summed `cost`, and the succeeded/failed rule. The DB upsert and Scan-row writes stay thin typed wrappers `tsc -b` covers.

## Risks / Trade-offs

- **Malformed or hostile feeds (huge payloads, entity expansion)** → `xml2js` does not process DTDs/external entities (no XXE); a response-size cap constant guards against oversized bodies. Truly adversarial feeds are out of MVP scope.
- **`rss-parser` footprint via `xml2js`** → isolated to `rss.ts`; the parser swap is a one-file change.
- **Exact-string URL dedupe lets tracking-param variants duplicate** → accepted for MVP; normalization is a contained follow-up on the canonicalization step.
- **`runTopicScan` marks `succeeded` before curation exists** → intended; when curation lands it takes over completion. Flagged so the handoff is deliberate, not a surprise.
- **`found_count` = discovered-deduped, not newly-inserted** → documented in the spec so a later reader does not "fix" it into an insert count.

## Migration Plan

No database migration — the schema already has every column. Deploy is shipping the `worker/` code plus the `rss-parser` dependency (`bun install`). Rollback is a code revert; no data to unwind. Verification: `bunx biome check . && bunx tsc -b && bun test` (the `parseFeed` and tally checks run offline).

## Open Questions

- Confirm `rss-parser` over `fast-xml-parser` at apply time (recommendation: `rss-parser`). If bundle size becomes a concern in the worker image, revisit — the seam makes it a one-file swap.
