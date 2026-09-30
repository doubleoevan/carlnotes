## Why

A scan email that Resend rejects is lost for good. `sendEmail` and `sendEmailBatches` in `worker/email.ts` log a non-2xx response, report it to Sentry, and return false, and they treat a 429 like any other rejection. `finishScan` carries on as if the mail went out: the Scan row is already written, and `topic_email_sends` records only the accepted sends, in one insert after every batch has returned. Nothing records which recipients missed out, and nothing retries them, because Temporal retries `finishScan` only on a thrown error or a timeout. If `finishScan` does exhaust its three two-minute attempts, the workflow calls `failScan` and marks a Scan that had already succeeded as failed.

The sends also find the provider's limit only by running into it. A scheduled Scan makes one `/emails/batch` call per hundred subscribers, and a manual or creation Scan makes one single send, so ten thousand daily Topics is about ten thousand provider calls a day, bunched at the times the Topics are scheduled for. Resend allows ten requests a second across the whole team. The worker bounds its sends only by how many scan activities each of its processes runs at once, and the api sends on the same account with no bound at all: the account email in `api/auth.ts`, invites in `api/invite/emails.ts`, and flag notices in `api/flagContent.ts`. The Redis and scale-out change runs more than one of each, so no bound kept in one process's memory can hold the account under its limit.

## What Changes

- A Scan's email is sent by its own workflow, which the Scan workflow starts as an abandoned child once `finishScan` has completed the Scan. The email retries on its own, so a send retry never reruns the Scan's closing write, the `first_scan_completed` event, or IndexNow, and never marks the Scan failed. The Scan workflow completes as soon as the email workflow starts, so a retrying email never holds up the Topic's next Scan, and stopping that Scan never cancels the email.
- `finishScan` no longer sends email. The scheduled digest keeps its batches of up to a hundred subscribers, now one activity per batch, and the manual and creation report keeps its single send to the Topic's owner.
- A send that Resend rate limits waits for its `retry-after` and tries again, and a 5xx response or a network failure backs off exponentially for about 45 minutes. Any other rejection, such as a validation error, a key problem, or an exhausted daily quota, stops that batch at once. Every stopped or exhausted send is reported to Sentry with its Scan, email kind, and batch, and the email's other batches still go out.
- Each accepted batch writes its `topic_email_sends` rows as soon as Resend accepts it, and every row that a Scan's email writes includes a new `scan_id`. A send skips each recipient who already has a row for that Scan, which covers the manual and creation report too, so a retry never mails anyone twice. Each call also sends an `Idempotency-Key` built from the email kind, the Scan, and a hash of the request body, which covers a crash between Resend accepting a batch and the rows being written. `topic_email_sends` still records accepted sends only, as the activity-page spec requires and the Emailed column counts.
- The digest still reads the Topic's subscribers when it starts, and each batch rechecks its recipients just before it is sent, so a retry respects an unsubscribe made in between.
- Missing Resend configuration and addresses dropped as unsendable are reported to Sentry instead of only logged, for every sender. A report names the email kind and the count, never an address.
- Every provider call, from the api's senders and from the worker's scan emails, first takes a slot from one limit held in Redis: one call in any 200 milliseconds, counted across every api and worker process, so calls leave evenly spaced at five a second, half of Resend's ten. A call that finds no slot waits for the next one. If Redis cannot be reached, a call goes out without a slot, as the scale-out change's limiters allow a request, and each process's Redis-down warning reports the outage.
- Scan emails run on their own task queue, `scan-emails`, with their own Worker, so an email that waits for a slot or backs off never holds one of the Worker's scan activity slots.
- The durable-scans spec says a Topic's first Scan announces nothing, but the workflow has emailed the Topic's creator since durable Scans shipped in 172a3ed. The restated requirement says what the code does, and the code keeps doing it.

## Capabilities

### New Capabilities

- `email-delivery`: one limit in Redis under Resend's, shared by every api and worker process, and reports for the delivery failures that are only logged today.

### Modified Capabilities

- `topic-scan-email`: the best-effort delivery requirement is replaced. The digest is retried by its own workflow, records each accepted batch with its Scan, and never mails a recipient twice.
- `durable-scans`: a Scan's announcement runs in its own workflow once the Scan completes, outlives the Scan's workflow, and never changes the Scan's status, and a Topic's first Scan reports to its creator.

## Impact

- `worker/email.ts`: the shared limit in front of every provider call, and a lower-level send for scan emails that sends the `Idempotency-Key` and says whether a failure is worth retrying and when. Every path reports missing configuration, and the batch paths report dropped addresses.
- `worker/notify.ts`: the digest split into planning its batches and sending one batch, the report's scan-id check, and per-batch recording with `scan_id`.
- `db/redis.ts`: a rate limit slot script beside the scale-out change's fixed window limiter, which takes the slot or returns how long until it frees.
- A new workflow, `worker/workflows/sendScanEmail.ts`, which also names the `scan-emails` queue, with its activities in `sendScanEmailActivities.ts` and its own Worker in `worker/temporal.ts`. The worker's minute line adds the Redis gauges, since the email limit is the worker's first use of Redis.
- `worker/workflows/runTopicScan.ts` starts the email workflow behind a `patched` marker, and `finishScan` in `runTopicScanActivities.ts` drops its email calls and its `trigger` argument.
- `db/schema.ts`: `topic_email_sends.scan_id`, set null if its Scan is deleted, with a unique index on `(scan_id, recipient_user_id)`, and a generated migration.
- The scan smoke, which calls `finishScan` directly, and `worker/AGENTS.md`, for the new workflow and queue.
- The api's senders in `api/auth.ts`, `api/invite/emails.ts`, and `api/flagContent.ts` keep their calls. No dependency is added: Temporal runs the retries, and the limit uses the Redis that the scale-out change brought.
