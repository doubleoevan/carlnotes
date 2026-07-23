## Why

`buildTopicFeeds` calls `loadTopicFeed` once per Topic, and each call issues five separate database queries (findings-with-resources, sources, attachments, latest succeeded scan, subscriber count). The homepage therefore makes `5 × N` round trips for `N` Topics, and its latency grows linearly with the number of Topics a user sees across the Your / Featured / Popular sections.

## What Changes

- Replace the per-Topic fan-out in `loadTopicFeed` with five batched queries in `buildTopicFeeds`, each fetching across every Topic id at once (`IN (...)` plus `GROUP BY` / `DISTINCT ON`), then stitch the results back to each Topic in memory.
- Keep the number of feed-assembly round trips fixed regardless of Topic count.
- Preserve the wire response shape exactly, the per-user `consumptions` left join that sets `isConsumed`, and the `canRate` flag.
- No contract change (`shared/contracts.ts`), no schema change, no migration.
- Review the `domain-model` skill and keep it in sync (canonical vocabulary only; no rejected terms introduced by the refactor).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `feed-api`: add a requirement that the Feed is assembled in a bounded number of database round trips independent of Topic count, while the existing response shape, per-user consumed status, and rating-eligibility behavior are preserved.

## Impact

- **Code**: `api/topicFeed.ts` — `buildTopicFeeds` gains the batched fetches; `loadTopicFeed` becomes an in-memory stitch over pre-fetched data. Pure helpers (`filteredTopicFindings`, `newTopicFindingCount`, `toUrlHost`) are unchanged.
- **Skill**: `.agents/skills/domain-model` reviewed and kept in sync (canonical copy under `.claude/skills/` mirrored).
- **No change**: wire contracts, database schema, migrations, UI, or the `canRate` access rule.
