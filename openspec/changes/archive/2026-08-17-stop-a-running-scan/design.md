## Context

A Scan is a Temporal workflow whose id is derived from the Topic (`scan-${topicId}`), running three activities that heartbeat every thirty seconds. Nothing today can stop one. The topic page shows a shimmering `Carl is reading…` where the Brew trigger sits and polls the page every three seconds until the Scan row leaves `running`.

Two accounting systems already read a Scan row, and they disagree on purpose. The daily brew count in `scansToday` counts rows and filters on status, so a failed Scan gives its slot back. The monthly spend sum in `monthlySpendDollars` sums `scans.cost` with no status filter at all, so a failed Scan's partial dollars still count. Stopping wants exactly that split, which means it needs no new accounting, only a new reason to leave the daily count.

## Goals / Non-Goals

**Goals:**
- A user can stop a running Scan from the topic page and see it stop within seconds.
- A stopped Scan stops spending: no further fetches, embeddings, or model calls.
- What the Scan already produced survives — Findings, recap, and the dollars it spent.
- The daily brew slot comes back.

**Non-Goals:**
- Resuming a stopped Scan. A stop is final; the user brews again.
- Stopping a scheduled Scan from anywhere but the topic page.
- Fractional brew slots. The daily count stays whole numbers, and partiality is accounted in dollars.
- Aborting the in-flight fetch or model call. The stop lands at the next Resource boundary.

## Decisions

### Temporal cancellation, not a stop flag in the database

`client.workflow.getHandle(\`scan-${topicId}\`).cancel()` needs no stored workflow id, because the id is already derived from the Topic. The alternative — a `stopRequested` column the review loop polls — adds a column, a read per Resource, and a second source of truth about whether a Scan is still running. Temporal's cancellation is the mechanism that already exists for this, and it reaches the activity as an `AbortSignal` we can hand to anything that takes one.

### The stages observe the signal at the gates that already exist

The activity default is `WAIT_CANCELLATION_COMPLETED`: an activity that never observes cancellation blocks the workflow until its thirty-minute stage timeout, so the stop would appear to do nothing. Observation is required, not polish.

The cheapest place to observe is where the code already decides whether to keep working: `fetchAndScoreResource` returns `{ status: "deferred" }` when the Scan is out of budget, and a stopped Scan takes that same exit, so the remaining Resources drain instantly with no new spend and review returns a normal summary holding what it did score. Passing the signal into the fetch itself was considered and left out: it shortens the stop by one Resource and touches every call site to do it.

Ingestion gets no signal at all. It runs every Source in one `Promise.all`, so by the time a stop can arrive there is nothing left to hold back. A Scan stopped during ingestion finishes ingesting and closes before review, which is the stage that spends.

### The closing write is non-cancellable, and the workflow returns normally

Inside a cancelled workflow every further activity is cancelled the moment it starts, so the existing `catch` that calls `failScan` would leave the Scan row `running` until the stale sweep found it an hour later. The close goes in `CancellationScope.nonCancellable`.

Swallowing the `CancelledFailure` and returning normally, rather than rethrowing, keeps the workflow's result promise resolving. `runManualScan` waits on that promise to bill the overage and reports a rejection to Sentry, so a rethrow would turn every user's stop into a reported error.

### `stoppedAt` on the Scan, not a fourth status

The daily count has to skip a stopped Scan. Marking it `failed` would do that with no schema change, but a Scan that kept eight Findings showing red `failed` in History, with the failure block where its recap belongs, is a lie. Deleting the row is worse: `findings.scanId` cascades, so the refund would take the Findings with it.

A fourth `cancelled` status is the more literal model, but a Postgres enum value fans out through `shared/enums.ts`, the contracts, and every `status === "failed"` branch in the UI. A nullable `stoppedAt` timestamp costs one column, one `isNull` clause in `scansToday`, and one branch in the History stat. The status stays `succeeded`, so the recap, the Findings, and the cost render through the paths they already use, and the column carries when the stop happened, which a status could not.

### The stop route authorizes on authority alone

`loadManualScanAuthorization` folds the daily quota into its answer, which is right for starting a Scan and wrong for stopping one — it would refuse a user out of quota the right to stop the very Scan that used their last slot. The stop route checks owner-or-admin authority and nothing else.

### No overage, no email

The overage is a metered price for exceeding the daily limit, and a stopped Scan un-exceeds it by giving the slot back. Billing it while refunding the slot would charge for a brew that no longer counts. The dollars still reach the monthly budget, so nothing goes uncharged.

The scan email reports a Scan to a user who was not watching. A user who just pressed stop is watching.

## Risks / Trade-offs

- **A stop lands up to a Resource late, so a Finding can appear after the click.** → The stop is honest about this: what Carl already brewed is kept, and the page's existing three-second poll shows the final counts.
- **A stop that arrives during ingestion waits for ingestion to finish.** → Ingestion is the cheap stage and the one that ends soonest, and the Scan still closes before review starts, so the stop saves everything it was meant to save.
- **The closing write lands before the cancelled stage has stopped.** → Temporal delivers cancellation on the stage's next heartbeat, so the stage runs on for up to a heartbeat interval after the row closes, scoring more Resources and spending more money than the row knew about. The stage writes its own spend and kept count as it ends, so the last write is the true one. Recording only from the workflow would have understated a stopped Scan's cost by everything review spent.
- **`TRY_CANCEL` would unblock the workflow instantly but leave the activity spending in the background.** → Rejected. The point of the stop is to stop spending, so the workflow waits for the stage to actually stop.
- **A stopped Scan reads as `succeeded` in any query that does not know about `stoppedAt`.** → That is the intent for spend, which should count it, and the two places where it is not — the daily count and the History stat — are changed together with the column.
- **The refunded slot makes a stop-and-rebrew loop free in brews.** → It is not free in dollars: every attempt's partial spend counts against the monthly budget, which is what gates the Brew trigger when it runs out.

## Migration Plan

One Drizzle migration adding a nullable `stopped_at` to `scans`. Nothing backfills: every existing Scan was never stopped, which is exactly what a null column says. The column is additive, so a rollback is dropping it, and the code that reads it treats null as "not stopped".
