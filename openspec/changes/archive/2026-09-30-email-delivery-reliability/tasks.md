## 1. The send log names its Scan

- [x] 1.1 In `db/schema.ts`, add `scanId` to `topicEmailSends`: `scan_id`, a nullable reference to `scans.id` that is set null on delete, and a unique index on `(scan_id, recipient_user_id)`. Run `bun run db:generate`, and update `db/schema.test.ts` for the new column and index

## 2. The sender says what happened

- [x] 2.1 In `worker/email.ts`, add the lower-level send that the scan emails use: one `/emails` or `/emails/batch` call with an `Idempotency-Key` of `<emailKind>/<scanId>/<hash of the request body>`, returning either an acceptance or a failure that says whether to retry and after how long, per the design's table. Test each row of the table with a stubbed fetch, including the `retry-after` delay for a `rate_limit_exceeded` and no retry for a quota 429, and test that the header is sent
- [x] 2.2 Report a missing `RESEND_API_KEY` or `RESEND_FROM_EMAIL` from every send path, and the addresses that `sendEmailBatches` drops, with the email kind and the count and never an address. Test both reports

## 3. The scan email activities

- [x] 3.1 In `worker/notify.ts`, split `sendTopicScanEmail` into `planScanDigest` and `sendScanDigestBatch`. `planScanDigest` reads the Topic's current email subscribers, drops each one with a row for the Scan and each unsendable address, reporting the dropped count, and returns user id batches of up to a hundred. `sendScanDigestBatch` rechecks its recipients at send time, renders what is left, sends one batch through 2.1, and inserts the accepted rows with `scan_id` and `on conflict do nothing`. Remove the `sent_at` check. Test with a stubbed connection pool that recorded and unsubscribed recipients are left out, that accepted rows name the Scan, and that a rejected batch writes no rows
- [x] 3.2 Rework `sendManualScanEmail` into `sendScanReport`, which skips the send if its recipient already has a row for the Scan, sends through 2.1, and records its row with `scan_id`. Test that a second run for the same Scan sends nothing
- [x] 3.3 Add `worker/workflows/sendScanEmailActivities.ts`, which runs 3.1 and 3.2 as activities that throw the design's retryable and non-retryable failures, and `reportUndeliveredScanEmail`, which reports a failed send with its Scan, Topic, email kind, batch, status, and Resend error name. Test the failure that each outcome throws

## 4. The email workflow

- [x] 4.1 Add `worker/workflows/sendScanEmail.ts` with `sendScanEmailWorkflow` and the name of its `scan-emails` queue, which the scan workflow and the worker both import from there, since workflow code cannot import the Temporal client. For a scheduled Scan it plans the digest and sends each batch, and for a manual or creation Scan it sends the report, with the design's retry policy. It reports each failed send through `reportUndeliveredScanEmail` and moves on to the next batch
- [x] 4.2 In `worker/workflows/runTopicScan.ts`, after `finishScan` returns for a Scan that is due an email, start `sendScanEmailWorkflow` as a child with the id `scan-email-${scanId}` and `ParentClosePolicy.ABANDON`, behind `patched("scan-email-workflow")`. Leave a child that already exists alone, and report any other start failure through an activity, never through `failScan`
- [x] 4.3 In `finishScan`, remove the email calls and the `trigger` argument, and update its callers, `worker/scan.smoke.ts` included
- [x] 4.4 Run `bun scripts/check-workflow-bundles.ts`, which picks up the new workflow file on its own

## 5. The shared limit, after the rebase

- [x] 5.1 Rebase onto main once the Redis and scale-out change lands. If main gained a migration after `0092`, regenerate this change's migration on top of it
- [x] 5.2 In `worker/email.ts`, add the shared limit on the Redis client and limiter building blocks from the scale-out change: every provider call takes a slot, one in any 200 milliseconds across every process, waits for one if none is free, and goes out without one if Redis cannot be reached, as the other limits do. Test the slot, the wait, and the unreachable case
- [x] 5.3 In `worker/temporal.ts`, add a Worker for the `scan-emails` queue with the email workflow, its activities, and a small activity concurrency per process, beside the scan concurrency setting that the scale-out change adds. Add the Redis gauges to the worker's minute line, so the worker sends the Redis-down warning too

## 6. Docs

- [x] 6.1 `worker/AGENTS.md`: the `scan-emails` queue, its Worker, the email workflow and its activities, and the shared limit. `db/AGENTS.md`: the rate limit slot. `README.md`: the `temporal-worker` row's count of Workers, now including scan emails, and the email limit beside the other limits Redis holds
- [x] 6.2 Add `sendTopicScanEmail` (now `planScanDigest` and `sendScanDigestBatch`, in `worker/notify.ts`) and `sendManualScanEmail` (now `sendScanReport`) to the stale-drift list in `.agents/commands/audit-structure.md`

## 7. Verification

- [x] 7.1 Run `bash scripts/preflight.sh`
- [x] 7.2 Extend `worker/scan.smoke.ts`: once the Scan completes, send its report twice to Resend's `delivered@resend.dev` test address, and check that exactly one row names the Scan and that the second run sends nothing. Run it under doppler
- [x] 7.3 With local Redis, the local worker, and the dev database, run a scheduled Scan for a Topic whose subscriber uses `delivered@resend.dev`, and check in the Temporal UI that the Scan's workflow completed as soon as `scan-email-<scanId>` started, that the digest ran one activity per batch, and that its rows name the Scan. Then send a burst of test emails from two processes and check that Resend's logs show no 429
