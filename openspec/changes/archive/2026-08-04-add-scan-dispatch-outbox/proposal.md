## Why

A Scan row is written, and then its Temporal workflow is started as a separate call. That is a dual write: a caller that dies between the two leaves a row no workflow owns. The row records only `status = running`, so nothing can tell a healthy mid-scan row apart from an orphaned one, and `failStaleScans` has to guess from elapsed time.

That guess is doing two jobs badly. Recovering an orphaned row wants to be immediate, and it waits thirty minutes. Noticing a workflow that vanished wants a window longer than the longest legal Scan, and thirty minutes is shorter — the stage timeouts allow a healthy Scan about sixty-two minutes — so the reclaim also fires on Scans that were merely slow, and its alert reads as noise.

Recording dispatch as a fact separates the two, and lets each be handled by something suited to it.

## What Changes

- Add a nullable `dispatched_at` to `scans`, set once `startTopicScanWorkflow` returns, so dispatch is a recorded fact rather than an inference.
- The scheduled sweep gains a relay pass: rows with `dispatched_at IS NULL` are undispatched by definition, and it starts their workflows with no time heuristic.
- The inline start stays the common path. The relay is a backstop that only picks up what the inline path failed to dispatch, rather than a poll-only outbox that would add latency to every Scan.
- `startTopicScan`'s row claiming keys on `dispatched_at IS NULL` instead of `status = 'running'`, which is the condition it actually means.
- The stale-Scan reclaim is kept but narrowed to `dispatched_at IS NOT NULL` — the one failure an outbox cannot see, where a workflow was started and then vanished.
- Its window is derived from the workflow's stage timeouts rather than set as an independent number, so a Scan that is merely slow is never closed out and the two values cannot drift apart.
- **BREAKING** for operators reading alerts: the reclaim's report changes meaning. It stops firing on slow Scans, so an alert now indicates a dispatched workflow genuinely disappeared.

## Capabilities

### New Capabilities
<!-- none: this changes how existing durability requirements are met, not what the app can do -->

### Modified Capabilities
- `durable-scans`: the row-with-no-workflow requirement is met by a recorded dispatch marker and a relay rather than by a timed reclaim, and the reclaim narrows to dispatched rows only. Introduced by `run-scans-on-temporal`, which must archive before this change applies.
- `scheduled-scans`: the sweep gains its relay pass, its claim condition changes from a running status to an absent dispatch marker, and the hung-Scan reclaim's scope and window change.
- `domain-schema`: `scans` gains `dispatched_at`.

## Impact

- `db/schema.ts` and a migration adding `scans.dispatched_at`.
- `worker/scan.ts`: `startTopicScan` claiming, and `startScanFor` recording dispatch after the workflow starts.
- `worker/schedule.ts`: the relay pass, and `failStaleScans` scope and window.
- `worker/workflows/run-topic-scan.ts`: its stage timeouts become the source the reclaim window is derived from.
- No API or UI surface changes. A Scan's observable lifecycle is unchanged apart from orphaned rows recovering in one sweep interval instead of thirty minutes.
