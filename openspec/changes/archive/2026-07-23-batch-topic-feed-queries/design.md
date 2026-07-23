## Context

`api/topicFeed.ts` builds the homepage. `buildTopicFeeds` runs two queries to split Topics into the user's own and other users' public Topics, then calls `loadTopicFeed` once per Topic via `Promise.all`. Each `loadTopicFeed` call issues five queries:

1. Findings inner-joined to Resources, left-joined to the user's `consumptions` row, `WHERE findings.topicId = ?`, ordered by relevance score desc.
2. Sources `WHERE topicId = ?`.
3. Attachments `WHERE topicId = ?`.
4. Most recent succeeded Scan `WHERE topicId = ? AND status = 'succeeded'` ordered by `startedAt` desc, limit 1.
5. Subscriber count `WHERE topicId = ?`.

So the homepage costs `2 + 5·N` round trips for `N` Topics. The response contract (`shared/contracts.ts`) and schema are fixed and must not change.

## Goals / Non-Goals

**Goals:**
- Assemble the Feed in a fixed number of round trips independent of Topic count.
- Byte-for-byte identical wire response: same fields, same ordering, same per-user `isConsumed`, same `canRate`.
- No contract, schema, or migration change.

**Non-Goals:**
- Optimizing `canRate`'s subscription lookup (preserved as-is; see Decisions).
- Any UI change or new caching layer.
- Changing the Feed's section composition or sort rules.

## Decisions

### Batch each of the five datasets by Topic id, stitch in memory
`buildTopicFeeds` collects all Topic ids from the two section queries, then runs the five datasets once each with `inArray(col, topicIds)`, in parallel via `Promise.all`. `loadTopicFeed` stops touching the database and becomes a pure stitch over the pre-fetched data (it stays `async` only because `canRate` does — see below). Round trips drop to `2 + 5` constant.

- Findings/Sources/Attachments (one-to-many): grouped with native **`Map.groupBy(rows, r => r.topicId)`** — `lib: ESNext` types it and Bun runs it, so no helper is needed.
- Subscriber count: `GROUP BY topicId` with `count()`, loaded into a `Map<topicId, number>`.
- Latest succeeded Scan: `SELECT DISTINCT ON (topic_id) ... ORDER BY topic_id, started_at DESC` (Drizzle `selectDistinctOn`), loaded into a `Map<topicId, {startedAt, scanSummary}>`.

### `DISTINCT ON` for the latest Scan, not `GROUP BY`
The Scan row must carry `scanSummary` from the *same* latest row, not just the max `startedAt`. A plain `GROUP BY topicId` cannot select a non-aggregated `scanSummary` without a self-join. Postgres `DISTINCT ON (topic_id)` with `ORDER BY topic_id, started_at DESC` returns the whole latest row per Topic in one query. Alternative considered: a `row_number()` window subquery — equivalent result, more SQL; rejected for verbosity.

### One giant join was rejected
Joining Findings, Sources, Attachments, Scans, and Subscriptions in a single query multiplies rows across independent one-to-many relations (a Topic with S Sources, A Attachments, F Findings yields up to S·A·F rows), shipping far more data and forcing de-duplication in memory. Five narrow batched queries are simpler and cheaper.

### Preserve `canRate` per-Topic
The task scopes the batching to the five listed queries and requires the `canRate` flag be preserved. `canRateTopic` stays as-is: it returns `true` for owned Topics with no query, and for non-owned public Topics it still awaits `hasSubscription`. The Featured/Popular sections thus keep a residual per-Topic subscription check. Batching those would change the access-rule call path and is deliberately out of scope; noted as a possible follow-up.

### No empty-list guard
An empty Topic-id list needs no special-casing: Drizzle's `inArray(col, [])` degenerates to `sql\`false\``, so each batched query returns no rows and the grouped maps come back empty. When both sections are empty, `loadTopicFeed` is never called, so the empty maps are never read. This keeps `loadTopicFeedData` a single clean code path with one inferred return type (which `loadTopicFeed` consumes via `Awaited<ReturnType<...>>`).

## Risks / Trade-offs

- **Ordering must survive grouping** → the batched Findings query keeps `ORDER BY relevance_score DESC`; `Map.groupBy` preserves encounter order, so each Topic's slice stays relevance-desc, matching today's output.
- **Residual `canRate` round trips** on Featured/Popular → preserved on purpose; the five heavy datasets are batched, and `canRate` remains a single lightweight existence check per non-owned public Topic.
- **`Map.groupBy` support** → covered by Bun's runtime and the `ESNext` lib types; a 3-line `reduce` is a trivial fallback if ever needed.
- **Large `IN` lists** → homepage Topic counts are small (Popular capped at 5 plus the user's own and Featured); `IN` over a few dozen ids is negligible.

## Migration Plan

Pure internal refactor of `api/topicFeed.ts`. No database migration, no contract change. Rollback is reverting the commit. Verified by the standard gate: `bunx biome check .`, `bunx tsc -b`, `bun test` (existing pure-helper tests still pass unchanged).
