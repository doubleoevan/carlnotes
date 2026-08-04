## 1. Spec deltas

- [x] 1.1 `curation`: the embed-filter's relevance threshold is held per Resource kind, with a scenario for a video judged against its own bar.
- [x] 1.2 `feed-homepage`: relevant sort defines its tiebreak and states that the ordering is total, with a scenario pinning the homepage and topic page to the same order.
- [x] 1.3 `source-ingestion`: canonical URL is defined as a normal form, including which host paths fold case and which carry exact ids that must not.
- [x] 1.4 `source-ingestion`: deriving a title for a Resource that arrives without one.
- [x] 1.5 `finding-bookmarks`: the bookmark control's placement in the note popover, with the row keeping only the mark.

## 2. Verify the code already matches

- [x] 2.1 `worker/review/filter.ts` holds a threshold per kind and every kind is covered. `RELEVANCE_THRESHOLDS` is a `Record<Resource["kind"], number>`, so a missing kind is a type error rather than a silent default.
- [x] 2.2 `ui/src/lib/utils.ts` breaks relevance ties by recency then finding id, covered by a test that sorts the same findings from two different incoming orders and expects one result.
- [x] 2.3 `worker/ingest/normalize.ts` implements the normal form, with tests for the handle-folding and exact-id cases in both directions.
- [x] 2.4 `worker/ingest/index.ts` canonicalizes in `toScanSummary` before the upsert and fills a missing title through `toFallbackTitle`.
- [x] 2.5 `ui/src/components/topic/TopicResource.tsx` renders the bookmark control in the popover beside the read toggle, and the row's mark only when bookmarked.
- [x] 2.6 `bunx openspec validate align-specs-with-shipped-behavior --strict` passes, alongside `bunx biome check .`, `bunx tsc -b`, and `bun test`.
