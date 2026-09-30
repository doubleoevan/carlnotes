## Context

Every email the app sends goes through `worker/email.ts`, a raw `fetch` to Resend: `sendEmail` posts one email, and `sendEmailBatches` posts up to a hundred per `/emails/batch` call. Both return false for a missing key, a non-2xx response, or a thrown error, after logging it and reporting the rejection to Sentry. A 429 is handled like any other rejection.

The worker sends a Scan's email from inside `finishScan`, the last activity of `runTopicScanWorkflow`, after it writes the Scan row, fires `first_scan_completed`, and tells IndexNow about a public Topic:

- A scheduled Scan that succeeded emails the Topic's active, email-enabled subscribers through `sendTopicScanEmail`. It skips anyone with a `topic-scan` row for the Topic sent since the Scan started, sends every batch, and then inserts the accepted rows in one statement.
- A manual or creation Scan emails the Topic's owner through `sendManualScanEmail`, whether it succeeded or failed. It checks nothing before sending, and writes a `manual-scan` row if Resend accepted it.

`finishScan` gets three attempts of two minutes each. A rejected send never throws, so it is never retried. A thrown error or a timeout retries the whole activity, which writes the Scan row again, can fire `first_scan_completed` again, and tells IndexNow again. After the third attempt the workflow calls `failScan`, which overwrites the succeeded Scan as failed.

A Scan's workflow id is `scan-${topicId}`. A second start for the Topic is rejected while that workflow is open, which is how a caller learns a Scan is running, and stopping a Scan cancels that id.

The api sends on the same Resend account and key: verification, password-reset, and email-change mail in `api/auth.ts`, topic and team invites in `api/invite/emails.ts`, and flag notices in `api/flagContent.ts`. Topic invites write `topic-invite` rows through the same `createTopicEmailSend`.

The Redis and scale-out change runs more than one app and more than one Temporal worker, makes the worker's scan concurrency configurable instead of a fixed eight, and moves the rate limiters into Redis. With more than one process sending, a limit held in one process's memory no longer limits the account. The worker never used Redis before this change.

Resend's documented limits, read on 2026-09-30:

- Ten requests a second per team, across every API key. This team's limit is that default, checked on 2026-09-30. A request past it gets a 429 `rate_limit_exceeded` with a `retry-after` in seconds.
- The team's plan allows 50,000 emails a month with no daily limit, and 204 had gone out this cycle. A 429 `monthly_quota_exceeded` means the month's quota is spent.
- `Idempotency-Key` works on `/emails` and `/emails/batch` and is kept for 24 hours. The same key and body returns the first response without sending again. The same key with a different body gets a 409 `invalid_idempotent_request`, and a key whose first request is still running gets a 409 `concurrent_idempotent_requests`.

## Goals / Non-Goals

**Goals:**

- A rejected or rate-limited scan email is retried until it goes out or is reported, and it never changes the Scan's recorded status.
- A retry never repeats the Scan's closing write, its analytics event, or its IndexNow ping.
- No recipient is mailed twice for one Scan, across retries, restarts, and a crash between Resend's acceptance and the row that records it.
- `topic_email_sends` keeps recording accepted sends only.
- Every provider call, from any api or worker process, stays under Resend's ten a second through one limit shared in Redis.
- Missing configuration, dropped addresses, and undelivered sends reach Sentry.

**Non-Goals:**

- Retrying the api's sends. Account mail, invites, and flag notices keep their single attempt, now under the shared limit.
- A second provider or a new queue service.
- Changing who receives a digest, what it says, how it batches, or how unsubscribing works.
- A gauge for the `scan-emails` queue. A backed-up queue shows as sends that arrive late, and the reports cover the ones that never arrive.
- Correcting the topic-scan-email spec's claim that a Scan with no new Findings sends nothing. The digest still sends a nothing-new email, and that stays out of this change.

## Decisions

### The email runs in its own workflow, started once the Scan completes

`runTopicScanWorkflow` starts `sendScanEmailWorkflow` as a child after `finishScan` returns, with the workflow id `scan-email-${scanId}`, on the `scan-emails` task queue, and with `ParentClosePolicy.ABANDON`. The Scan workflow waits only for the child to start and then completes, so the Topic's workflow id frees at once: the next Scan can start, and a stop reaches only a running Scan. A child that already exists for the Scan is left alone. Any other failure to start is reported through a small activity, never through `failScan`.

The Scan workflow starts the child only if an email is due: always for a manual or creation Scan that `finishScan` closed, whether it succeeded or every Source failed, and for a scheduled Scan only if it succeeded. A stopped Scan, and a Scan that ends in an error before `finishScan`, return before this point, as they do today. The email's activities still read the Scan and the Topic when they run, so a Topic deleted in between sends nothing.

The `scan-emails` queue has its own Worker, which runs a few activities at a time in each process. An email that waits for a slot in the shared limit or backs off after a rejection therefore never holds one of the scan activity slots that the scale-out change makes configurable, and a backlog of emails waits in the Temporal queue instead of in running activities.

`finishScan` keeps its closing write, the analytics event, and IndexNow, and loses its email calls and the `trigger` argument that chose them. Its three attempts now guard only those writes.

The start sits behind `patched("scan-email-workflow")`. A Scan whose `finishScan` ran under the old code, and whose workflow task was cut off before the workflow completed, replays on the new worker without the marker, so it skips the start and cannot email twice. `deprecatePatch` replaces the marker once no Scan started before the deploy is still open, which the Scan's stage timeouts bound to about three hours.

Alternatives considered:

- Sending from a new activity inside the Scan workflow. The Scan's workflow would stay open for the whole retry window, so the Topic's next Scan would be rejected as already running, and a stop would cancel the email.
- Starting the email workflow from `finishScan` with the Temporal client. It needs no workflow change, but a failed start would retry `finishScan`, rerunning the analytics event and IndexNow, and three failed starts would still mark the Scan failed.

### One activity sends one batch

`sendScanEmailWorkflow` runs its activities on the `scan-emails` queue:

- For a scheduled Scan, `planScanDigest` reads the Topic's current email subscribers, drops each one who already has a row for the Scan, drops and reports unsendable addresses, and returns the remaining user ids in batches of up to a hundred. The workflow then runs `sendScanDigestBatch` once per batch. That activity rechecks its recipients just before it sends, dropping anyone who unsubscribed, turned email off, or already has a row for the Scan. It renders what is left, makes one `/emails/batch` call, and records the accepted rows.
- For a manual or creation Scan, `sendScanReport` skips the send if the owner already has a row for the Scan. Otherwise it makes one `/emails` call and records the row.

A batch that fails is reported, and the workflow moves on to the next one. Each activity makes at most one provider call, so it waits for at most one slot in the shared limit, and a retry covers only its own batch.

Alternatives considered:

- One activity for the whole digest. A Topic with a thousand subscribers would wait for ten slots inside one activity, past a one-minute limit per attempt, and a retry would redo the batches that already went out.
- A loop that sends whichever batch is next until nothing remains. It rereads everything each time, but a recipient who can never be sent to would keep the loop going, and a dropped address would be reported once per batch.

### A failure is retried only if waiting can fix it

The send activities share one retry policy: a first retry after 15 seconds, doubling up to a 10-minute interval, for at most 10 attempts, about 45 minutes in all, with a one-minute limit per attempt. The lower-level send in `worker/email.ts` returns what happened, and the activity turns it into a throw only if another attempt can help:

| Outcome | What the activity does |
|---|---|
| 2xx | records the accepted rows and returns |
| 429 `rate_limit_exceeded` | throws a retryable failure whose `nextRetryDelay` is the response's `retry-after` |
| 409 `concurrent_idempotent_requests` | throws a retryable failure, since the first request with its key is still running |
| 5xx, a network error, or a timeout | throws a retryable failure on the policy's backoff |
| Any other 4xx, a quota 429, or missing configuration | throws a non-retryable failure |

With no daily limit on this plan, a quota 429 means the month's 50,000 emails are spent, which no retry within the hour can fix.

When an activity's failure reaches the workflow, retried out or non-retryable, the workflow calls `reportUndeliveredScanEmail`, which reports it to Sentry with the Scan, the Topic, the email kind, the batch, and the status and Resend error name. It never names an address.

Alternatives considered:

- Retrying every rejection. A validation error, a bad key, or a spent quota fails the same way for 45 minutes, and the report arrives late.
- Temporal's default policy. It retries without end at up to 100 seconds apart, so a permanent rejection would never be reported.

### Every row names its Scan, and each batch records itself

`topic_email_sends` gains `scan_id`, a nullable foreign key to `scans` that is set null if the Scan is deleted, and a unique index on `(scan_id, recipient_user_id)`. Rows without a Scan, the invites and every row from before this change, never collide, because Postgres treats nulls as distinct in a unique index.

- `sendScanDigestBatch` inserts its batch's accepted rows right after Resend accepts the batch, with `on conflict do nothing`. A retry after a partial failure then sends only to the recipients whose batches were not accepted.
- `planScanDigest`, `sendScanDigestBatch`, and `sendScanReport` all skip recipients by `scan_id`, in place of the `sent_at >= startedAt` check. Now that an email can still be retrying when the Topic's next Scan starts, a `sent_at` check could skip a recipient of the second Scan because the first Scan's retry reached them after it began.
- Rows are still written only for accepted sends, so the activity page's log and its Emailed column read exactly as before.

Each provider call also sends `Idempotency-Key: <emailKind>/<scanId>/<hash of the request body>`. If a worker dies after Resend accepts a batch and before the rows are written, the retry renders the same body for the same recipients, sends the same key, and gets the first response back without a second email. A body that changed in between, because the Topic was renamed, gained Findings, or lost a recipient who unsubscribed, gets a new key and sends again. That takes both a crash in that window and a change within the retry window, and the recorded rows cover every other case.

Alternatives considered:

- A key made of the Scan and the recipients alone. A changed body under the same key gets a 409 `invalid_idempotent_request`, which says nothing about whether the first request went out.
- Storing each call's body and key before sending, and resending that stored body on a retry. It closes the changed-body gap, but it adds a write and a stored copy of every email for a case that needs both a crash within milliseconds of Resend's acceptance and a change within the retry window.
- Keeping the `sent_at` check. Besides the overlap above, the manual report has nothing to compare against until it has already sent.

### One limit in Redis covers every sender

Every provider call first takes a slot from one limit held in Redis: `sendEmail` and `sendEmailBatches` for the api's mail, and the lower-level send for the scan emails. Every api and worker process counts against the same key, so the limit holds however many of each run.

- The limit is one call in any 200 milliseconds, so calls leave evenly spaced at five a second, half of Resend's ten. The limiter counts a call when it leaves, and Resend counts it when it arrives, so calls that leave together can arrive bunched. A first version allowed nine calls in any rolling second, and a burst of forty calls from two processes drew seven 429s: a fresh connection's first calls travelled slower than the next second's, and Resend rejected calls with only nine accepted in the second before them. The same burst, spaced 200 milliseconds apart, drew none. A 429 that gets through anyway still retries the scan emails after its `retry-after`.
- A call that finds no slot waits for the next one. The api's mail waits in its request, and a burst of signups goes out five a second instead of drawing 429s. A scan email waits inside its activity, and the email Worker's four activities per process keep that wait to a second or two, with the rest of the backlog left in the Temporal queue.
- One slot that each call holds for 200 milliseconds, not a counter per clock second. A counter would let a second's calls leave together at its start.
- The limit is a one-line Lua script in `db/redis.ts`, beside the scale-out change's fixed window limiter. `SET NX` with a 200-millisecond expiry takes the slot, and a slot another call holds returns its `PTTL` as the wait. The slot expires on the Redis server's clock, so every process counts against the same time.
- If Redis cannot be reached, the call goes out without a slot, as the scale-out change's limiters allow a request. An unsent verification email is worse than a 429, which the scan emails retry anyway. The api's minute line already sends a Redis-down warning, and the worker's minute line adds the same gauges, since the email limit is the worker's first use of Redis.

Alternatives considered:

- The Temporal server's rate on the `scan-emails` queue for the worker, with a per-process pacer for the api. The scale-out change runs more than one api process, so the api's share would multiply with every process, and the account would have two limits to keep in step instead of one.
- Sending the api's mail through the `scan-emails` queue. Verification and password-reset mail would then depend on Temporal, which runs as a single server, and would wait behind a digest burst.
- A counter row in Postgres. It works across processes, but it puts a write per send on the database when Redis already holds the app's other limits.

### Failures that are only logged today are reported

- A missing `RESEND_API_KEY` or `RESEND_FROM_EMAIL` is reported to Sentry by every send path, with the email kind.
- An address dropped as unsendable is reported with the email kind and the number dropped, from `sendEmailBatches` and from `planScanDigest`.
- An outage that sends mail without slots is reported by the Redis-down warning that the api and the worker each send once a minute.
- A send whose retries run out, or that fails for good, is reported by the email workflow as above.

A report never includes an address. A single send's report keeps the recipient's domain, as it does today.

## Risks / Trade-offs

- [Redis cannot be reached, so the limit stops counting] → Each send goes out without a slot, and each process's Redis-down warning reports the outage once a minute. A 429 still retries the scan emails, and the api's mail fails the way it does today.
- [A burst of digests waits for slots, so its last batches go out late] → At five a second, a thousand batches clear in under four minutes, and the backlog waits in the Temporal queue, not in running activities.
- [A digest can still be retrying when the Topic's next Scan starts, so two Scans' emails can overlap] → Each email's rows and keys name its own Scan, so the overlap never skips or repeats a recipient.
- [Reports can flood Sentry if the Resend key or from-address goes missing] → Sentry groups them into one issue, and a flood is the right signal for mail that is not going out at all.
- [A rollback leaves open email workflows with no worker to run them] → They send nothing and wait. The Temporal UI can terminate them, and their Scans are already complete.
- [A recipient of a batch that failed for good misses that digest] → The report names the Scan and the batch, and the next digest reaches them as usual.
- [A changed body within the retry window sends under a new key] → It also takes a crash between Resend's acceptance and the row insert, and at worst it mails that batch's recipients twice.

## Migration Plan

1. Before the deploy, confirm that the `temporal-worker` service reads `REDIS_URL`. Without it the worker's sends skip the limit, and its Redis-down warning fires every minute.
2. Merge and push. The release runs the migration, which adds the nullable `scan_id` and its index, before the new app and worker deploy.
3. The worker deploys with the `scan-emails` Worker, so the first new Scan's email workflow has a poller.
4. Watch Sentry for the new email reports, and the worker log for `scan-emails` activity.
5. Once no Scan started before the deploy is still open, about three hours later, a later change replaces `patched` with `deprecatePatch`, and a change after that removes it.

Rollback: revert the commit. The column and the index can stay, since the old code never writes `scan_id`. Terminate any open `scan-email-*` workflows from the Temporal UI, or leave them waiting, since their Scans are already complete.

## Open Questions

None.
