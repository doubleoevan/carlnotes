## 1. Storage and access

- [x] 1.1 Add the domain vocabulary, tables, indexed reads, feedback write, and migration.
- [x] 1.2 Add guarded HTTP routes, a shared client, and the MCP read.

## 2. Takeaway updates and prompts

- [x] 2.1 Add validated takeaway updates, embeddings, spend accounting, and idempotent writes.
- [x] 2.2 Add the scan child and historical backfill with workflow and activity tests.
- [x] 2.3 Wire ranked fenced takeaways into review, Coffee Break scripts, and Topic Post Discussions.
- [x] 2.4 Implement and test similarity dedup, reactivation, cleanup, and protected recency eviction.

## 3. Journal

- [x] 3.1 Reuse Nightshift controls for the web dialog and native sheet and share their behavior.
- [x] 3.2 Verify reader and rater states on web and Expo, including small screens, paging, and empty results.

## 4. Verification

- [x] 4.1 Test operation bounds, ranking, fencing, permissions, and review hash stability.
- [x] 4.2 Run the repository gate and document migration and backfill steps.
- [x] 4.3 Replay a snapshot of dev Topics through the production write path. Report independent pair precision, recall, and duplicate rates before and after cleanup.
