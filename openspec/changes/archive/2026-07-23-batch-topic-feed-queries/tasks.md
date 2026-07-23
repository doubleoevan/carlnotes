## 1. Batch the five datasets in buildTopicFeeds

- [x] 1.1 Collect all Topic ids from `ownersTopics` and `othersTopics` into one list for the batched fetch. (No empty-list guard is needed: Drizzle's `inArray(col, [])` degenerates to `sql\`false\``, so an empty DB returns empty maps and `loadTopicFeed` is never called.)
- [x] 1.2 Add the batched Findings query: inner-join Resources, left-join `consumptions` on `(findingId, userId)`, `inArray(findings.topicId, ids)`, ordered by relevance score desc; group rows by `topicId` with `Map.groupBy`.
- [x] 1.3 Add the batched Sources and Attachments queries with `inArray(topicId, ids)`; group each result by `topicId` with `Map.groupBy`.
- [x] 1.4 Add the batched latest-succeeded-Scan query with `selectDistinctOn([scans.topicId])`, `where status = 'succeeded'` and `inArray(topicId, ids)`, `orderBy(scans.topicId, desc(scans.startedAt))`; index the rows by `topicId` in a `Map`.
- [x] 1.5 Add the batched subscriber-count query: `inArray(topicId, ids)`, `groupBy(topicId)`, `count()`; index the counts by `topicId` in a `Map`.
- [x] 1.6 Run the five batched queries together with `Promise.all` after the two section queries.

## 2. Stitch each Topic's feed in memory

- [x] 2.1 Change `loadTopicFeed` to accept the pre-fetched maps (plus `topic`, `userId`, `includeConsumedResources`) and read from them instead of querying, defaulting to `[]` Sources/Attachments, `null` last-scan fields, and `0` subscriber count on a map miss.
- [x] 2.2 Keep the row → `TopicFinding` mapping, `isConsumed` from `consumedAt`, the relevance-desc ordering, the `canRate` await, `newTopicFindingCount`, and `filteredTopicFindings` exactly as they are. (Sources/Attachments drop their grouping-key `topicId` when shaped, so the wire rows stay `{id,kind}` / `{id,filename}`.)
- [x] 2.3 Confirm the returned `TopicFeed` object has the same fields in the same shape as before (no contract edit).

## 3. Keep the domain-model skill in sync

- [x] 3.1 Reviewed `.agents/skills/domain-model/SKILL.md`: the refactor introduces no rejected terms (`Map.groupBy` / Drizzle `.groupBy()` are stdlib/ORM methods, not domain nouns; new names are `findingRowsByTopic`, `sourcesByTopic`, etc.) and the Feed description still holds. No edit warranted, so no mirror needed.

## 4. Verify

- [x] 4.1 Ran the gate: `bunx biome check .` (exit 0; 53 pre-existing nursery warnings only), `bunx tsc -b` (exit 0), `bun test` (46 pass / 0 fail). The existing `api/topicFeed.test.ts` helpers still pass.
- [x] 4.2 Verified against seeded dev data with a differential check (stronger than a screenshot for a backend-only refactor): ran the pre-change and batched `buildTopicFeeds` for the dev user under `doppler run`, canonicalized, and deep-compared. Both the default and All views matched byte-for-byte (9 Topics; 217 findings unread-view, 238 all-view), and a leak check confirmed no `topicId` reaches the wire. Round trips are now `2 + 5` fixed instead of `2 + 5·N`.
