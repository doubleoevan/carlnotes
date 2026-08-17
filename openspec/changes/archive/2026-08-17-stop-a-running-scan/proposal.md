## Why

A Scan runs for minutes and, once started, cannot be called off. A user who fires a brew on the wrong Topic, with a prompt they meant to fix first, or who simply does not want to wait, can only watch it finish and pay a brew for it. The daily brew count is what paces a user, not what pays for a Scan — the dollar budgets do that — so a brew the user stopped should cost them dollars for the work already done and no brew at all.

## What Changes

- The topic page's running-scan line reads `Carl is brewing…` instead of `Carl is reading…`, matching the Brew trigger it replaces.
- A stop control sits beside that line. It cancels the Scan's Temporal workflow, which reaches the running stage through the activity's cancellation signal, so the Scan stops without waiting out its stage timeout.
- A stopped Scan keeps the Findings it already wrote and records the dollars it already spent. Those dollars still count against the monthly budget, exactly as a failed Scan's do today.
- A stopped Scan gives its daily brew slot back, through a new nullable `scans.stoppedAt` that the daily count excludes. Its status stays `succeeded`, so its recap, Findings, and cost render through the paths they already use, and History reads it as stopped rather than failed.
- A stopped Scan bills no metered overage and sends no scan email.

## Capabilities

### New Capabilities
- `scan-stopping`: stopping a running Scan from the topic page, what the stop reaches, what it keeps, and what it costs.

### Modified Capabilities
- `scan-history`: the running row and trigger say brewing rather than reading, and a stopped Scan gives its daily slot back the way a failed one does.
- `durable-scans`: a cancelled workflow closes its Scan row itself instead of leaving it running for the stale sweep.
- `subscription-billing`: a manual Scan the user stopped reports no overage usage record.

## Impact

- `db/schema.ts`: nullable `stoppedAt` on `scans`, with a Drizzle migration.
- `db/quotas.ts`: `scansToday` excludes stopped Scans.
- `worker/temporal-client.ts`: cancel a Topic's scan workflow by its derived id.
- `worker/scan.ts`: `stopTopicScan`.
- `worker/workflows/run-topic-scan.ts`: catch the cancellation, close the Scan in a non-cancellable scope, return normally.
- `worker/workflows/run-topic-scan-activities.ts`: `finishScan` stamps `stoppedAt` and skips the email for a stopped Scan.
- `worker/review/score.ts` and `worker/ingest`: observe the activity's cancellation signal at the gates that already exist.
- `api/topic/scans.ts`: the stop route, and no overage report for a stopped Scan.
- `shared/contracts.ts`: `stoppedAt` on the Scan payload.
- `ui/src/components/topic/TopicScanButton.tsx`, `TopicScanHistory.tsx`, `ui/src/hooks/useTopicScan.ts`: the copy, the stop control, and its optimistic state.
