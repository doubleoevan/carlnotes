## Why

An admin running a manual Scan on someone else's Topic spends that owner's plan limits.

`runManualScan` hands the run to the worker as `runTopicScan(topicId, topic.ownerId, true)`, so the Scan row is stamped with the **owner** rather than the admin who fired it. Both consumers of that stamp then charge the owner:

- `scansToday` counts by `scans.owner_id`, so the admin's Scan lands in the owner's daily pool. The gate never noticed, because it checks the admin's own count and an admin bypasses the limit anyway.
- `isMonthlySpendExhausted` sums `scans.cost` by `scans.owner_id`, and the pipeline bills the model calls to the owner's LiteLLM virtual key, so the spend counts against the owner's monthly budget instead of the admin's.

The knock-on is worse than a spent slot. The scheduled sweep skips a Topic whose owner is out of quota, so an admin firing a few Scans on a free user's Topics silently suppresses that user's own scheduled brews for the rest of the UTC day.

`owner_id` was doing double duty: durable attribution for a deleted Topic, and whose ledger the run lands on. For a scheduled Scan and an owner's own manual Scan those are the same person, so the conflation stayed invisible until admins could scan other people's Topics.

## What Changes

- Charge a manual Scan to whoever fired it. The Scan row is stamped with the acting user, not the Topic's owner.
- **No change for an owner scanning their own Topic**, where the actor and the owner are the same person.
- **No change to who may scan.** The gate's authority and quota decisions are untouched.
- **No schema change.** `scans.owner_id` keeps its meaning of "whose ledger this Scan is on"; only what gets written to it changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `authorization`: the daily-scan-limit requirement gains the rule that a Scan is charged to the user who started it, so an admin's Scan never draws down the Topic owner's quota or budget.

## Impact

- `api/topic/scans.ts`: one argument. `runTopicScan` receives the acting `userId` in place of `topic.ownerId`.
- Both readers of the stamp follow automatically: `scansToday` in `db/quotas.ts` and `isMonthlySpendExhausted` in `api/authorization.ts`.
- The model spend moves to the admin's LiteLLM virtual key, which is provisioned against the admin budget rather than a plan's.
- The owner still sees the Scan and its cost in their Activity table, which groups by topic rather than by `owner_id`. That is the cost of scanning their Topic, and it is informational, not a limit. Their spend meter reads their own LiteLLM key, so it excludes the admin's run.
- Scheduled Scans are untouched: the sweep already passes the Topic's owner, who is the right payer for a run nobody triggered.
