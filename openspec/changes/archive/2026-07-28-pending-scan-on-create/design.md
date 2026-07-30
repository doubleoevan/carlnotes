# Design

## The pending row is a plain running Scan

No new status value or column. The pending Scan is an ordinary `running` row with `owner_id` stamped, so every consumer that already handles an in-progress Scan (the topic page shimmer, the Brew diary, `failStaleScans`, the daily quota count) handles this one unchanged.

## Who runs the first Scan

The scheduler, not the API. `createTopic` only opens the row; the sweep claims it. This keeps long scan work out of the API process and makes the sweep the single place scheduled work starts. The claim lives in `runTopicScan`: reuse the topic's newest running Scan when one exists, re-stamping `startedAt` to the moment work actually begins, and open a fresh row only when none is running. Re-stamping keeps the staleness window measuring processing time rather than queue time, and keeps the topic page's recency check showing the shimmer.

Check-then-claim is not atomic. One sweep process runs at a time (a platform cron, or the single dev loop), so two claimants racing for the same row is not a live topology. The same accepted race already exists in `runManualScan`'s check-then-start.

## Due-ness reads completed Scans only

`loadScheduledTopics` computes each topic's last-start over Scans whose status is not `running`. A failed Scan still spends the window (a failing topic must not rescan every sweep), but a running row no longer does — otherwise the pending row would hide a brand-new topic from the very sweep meant to claim it. This matches the scheduled-scans change's own stated rule that scheduling reads the last completed Scan.

## Manual scan while running

`runManualScan` returns a new `running` outcome when the topic already has a running Scan, and the route maps it to 409. The UI already replaces the button with the shimmer while running, so the refusal is a server-side race guard, not a new UI state.

## Create is atomic

`createTopic`'s inserts (topic, owner subscription, invitees, sources, first Scan) run in one `db.transaction`. The Neon serverless Pool driver supports interactive transactions over its WebSocket connection.
