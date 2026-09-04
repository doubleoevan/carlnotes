## 1. Record what a Finding was reviewed against

- [x] 1.1 Add `reviewedContextHash` and `reviewedContentHash` to `findings` in `db/schema.ts`, both
      nullable text, with a comment saying a null hash reads as an unknown context
- [x] 1.2 Generate the migration with `bun run db:generate` and read the SQL before committing it
- [x] 1.3 Add `toTopicContextHash` beside `buildTopicScanContext` in `worker/attach.ts`, hashing the
      merged context string the scan already builds, and a unit test that a prompt edit, an
      attachment added, and an attachment removed each change the hash while a rename does not

## 2. Re-review only what changed

- [x] 2.1 Widen `loadUnscoredResources` in `worker/review/filter.ts` to return a Resource whose
      Finding has no hash, a hash different from the current context, or a reviewed
      content hash different from the Resource's current `content_hash`
- [x] 2.2 Rename it for what it now answers, since "unscored" stops being true. `loadResourcesToJudge`
      or the reviewer's preference, updating its callers in `worker/review/index.ts`
- [x] 2.3 Prove the selection. It is one SQL query against live rows, so it is covered by the smoke
      tests in group 6 rather than a unit test that would have to fake the database to say anything
- [x] 2.4 Pass the current context hash into the review so scoring has it without rebuilding it

## 3. Write the hash and keep the reader's marks

- [x] 3.1 Extend `upsertFinding` in `worker/review/score.ts` to write `reviewedContextHash` and
      `reviewedContentHash`, on insert and in the conflict update
- [x] 3.2 Confirm the update set still names only the scoring columns, so `rating`, `ratedByUserId`,
      `ratedTeamId`, `ratedRole`, and `viewCount` are untouched, and test that a re-score preserves them
- [x] 3.3 The single-row invariant is the `(topic_id, resource_id)` unique constraint plus
      `onConflictDoUpdate`, which the database enforces. The smoke test in group 6 exercises it live

## 4. Stop pruning what a reader marked

- [x] 4.1 Widen the spared set in `filterTopicFindings` in `worker/review/index.ts` from bookmarked
      Findings to bookmarked or rated ones, the two deliberate marks a reader leaves
- [x] 4.2 Extend `findingIdsToFilter` and its tests for the widened exemption, including a Finding
      re-scored below the cut that is spared because it was rated
- [x] 4.3 A view and feedback were tried and dropped. `db/schema.test.ts` holds feedback to record-only
      and forbids the ranking path reading it, and a view is incidental, so sparing every opened Finding
      would leave an actively read topic unable to prune. A rating is a column on the Finding already,
      so sparing it needs no extra read and crosses no boundary

## 5. Prove it end to end

- [x] 5.1 Extend `worker/review.smoke.ts` to scan once, edit the topic's prompt, scan again, and
      assert the same Resources are re-scored with rewritten explanations while their ratings stand
- [x] 5.2 Assert the reverse in the same smoke: a second scan with the prompt untouched re-scores
      nothing and spends nothing on scoring
- [x] 5.3 Run `bun run smoke:review` and record what a prompt edit actually costs on a real topic,
      so the design's cost claim is measured rather than asserted

## 6. Documentation

- [x] 6.1 No change needed. `worker/AGENTS.md` describes `review/` as "filtering and scoring", which a
      renamed function inside it does not change
- [x] 6.2 No change needed. The README's Development section lists scripts, not topic actions, and this
      change adds neither a script nor a folder
