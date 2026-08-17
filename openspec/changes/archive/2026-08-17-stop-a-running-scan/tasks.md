## 1. The stopped Scan's column

- [x] 1.1 Add a nullable `stoppedAt` timestamp to `scans` in `db/schema.ts`, commented as what takes a Scan out of the daily brew count without taking it out of the monthly spend
- [x] 1.2 Generate the migration with `bun run db:generate` and apply it with `bun run db:migrate`
- [x] 1.3 Exclude stopped Scans from `scansToday` in `db/quotas.ts` with an `isNull(scans.stoppedAt)` clause, and update the comment that explains what gives a slot back
- [ ] 1.4 Cover the refund in `api/topic/quotas.test.ts` (or `db`'s own tests): a stopped Scan does not draw down the day's count, while a succeeded one does

## 2. Cancelling the workflow

- [x] 2.1 Add `cancelTopicScanWorkflow(topicId)` to `worker/temporal-client.ts`: get the handle for `scan-${topicId}`, cancel it, and answer `stopped` or `idle` when the handle has nothing running rather than throwing
- [x] 2.2 Add `stopTopicScan(topicId)` to `worker/scan.ts` as the seam the api calls
- [x] 2.3 In `worker/workflows/run-topic-scan.ts`, catch the cancellation apart from a real error, close the Scan inside `CancellationScope.nonCancellable`, and return normally so the workflow completes rather than failing
- [x] 2.4 Close the cancelled path with its own write that only stamps `stoppedAt`, `finishedAt`, and the status, and have each stage record its own spend and kept count as it ends, since the workflow drops a cancelled stage's return value. A stopped Scan writes no recap
- [x] 2.5 Skip the scan email in `finishScan` for a Scan that closed stopped

## 3. Stopping the work in flight

- [x] 3.1 Read the activity's cancellation signal in `worker/workflows/run-topic-scan-activities.ts` and pass it to the stages, alongside the Budget they already carry
- [x] 3.2 Defer every remaining Resource in `worker/review/score.ts` once the signal aborts, at the same gate that defers on an exhausted budget
- [x] 3.3 Leave ingestion unsignalled: it runs every Source at once, so a stop has nothing left to hold back once it is under way. A Scan stopped there finishes ingesting and closes before review, which is where the money goes
- [x] 3.4 Cover both gates in their existing test files: an aborted signal defers the rest and returns what was already done, with no throw

## 4. The stop route

- [x] 4.1 Add `POST /topics/:id/scan/stop` to `api/topic/scans.ts`, authorized on owner-or-admin authority alone and never on remaining quota, answering `stopped`, `idle`, or a rejection
- [x] 4.2 Skip `reportManualScanOverage` when the finished Scan carries a `stoppedAt`
- [x] 4.3 Add `stoppedAt` to the Scan shape in `shared/contracts.ts` and to whatever the topic page payload selects in `api/topic/topics.ts`
- [ ] 4.4 Cover the route's authorization and its idle answer in `api/topic/scans` tests

## 5. The topic page

- [x] 5.1 Rename the running line to `Carl is Brewing…` in `ui/src/components/topic/TopicScanButton.tsx`, with the comment above it and the `.shimmer-text` comment in `ui/src/animations.css` following the wording
- [x] 5.2 Add the stop control beside the running line, inside the same held row height so nothing jumps: the `CircleStop` icon alone through the shared `IconButton`, muted until hovered, tooltip "Cancel this Brew"
- [x] 5.3 Add the stopping state to `ui/src/hooks/useTopicScan.ts` so the control reads as stopping until the row leaves running, reusing the existing poll rather than adding one
- [x] 5.4 Wire the control to the stop route wherever the topic page holds its scan actions
- [x] 5.5 Leave stopped Scans out of the topic page payload in `api/topic/topics.ts`, so the Brew diary skips them and the last-succeeded Scan the schedule line and note read from skips them too. Their spend still shows on the Activity page
- [ ] 5.6 Cover the running copy and the cancel control in the existing topic component tests

## 6. Verification

- [x] 6.1 `bunx biome check .`, `bunx tsc -b`, and `bun test` all clean
- [x] 6.2 Ran real scans on "Cute raccoon videos" and stopped them mid-review: the row closed in under a second as succeeded with a stoppedAt, its Findings survived into the feed, the stage recorded the full partial spend of $0.068 across every stage with a kept count matching its 13 Findings, no recap and no email were written, the daily count read 1 of 4 scans, and the diary showed no row for any stopped brew
