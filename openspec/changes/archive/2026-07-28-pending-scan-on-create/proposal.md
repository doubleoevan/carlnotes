# Pending scan state on topic creation

## Why

Creating a topic already opens its first Scan in running status, so the topic page lands on the in-progress treatment instead of an empty feed. But the pieces around that row don't yet match the design (Prompt queue item 20): the row is inserted outside the topic's transaction, the scheduler would open a second Scan rather than claim the pending one, sweep due-ness counts the pending row as a spent window, and a manual scan isn't refused server-side while one is running.

## What changes

- `createTopic` writes the topic and everything hanging off it, including the first Scan, in one transaction, so a mid-create failure leaves no partial topic.
- `createTopic` no longer runs the first Scan in-process. The scheduler owns it: the sweep claims a topic's existing running Scan when one is present and only opens a new one when none is.
- Sweep due-ness reads completed Scans only, so a topic whose only Scan is the pending running row is due immediately, exactly like an unscanned topic.
- `runManualScan` refuses while the topic already has a running Scan, closing the race where a manual fire burns a quota slot on work the sweep is about to do.

## Impact

- `api/topic/topics.ts` (createTopic transaction, manual-scan refusal), `api/index.ts` (409 mapping)
- `worker/scan.ts` (claim-or-open), `worker/schedule.ts` (completed-only due-ness)
- `worker/schedule.test.ts` (due-ness and claim decision tests)
