## Context

`startTopicScan` inserts a `scans` row, then calls `startTopicScanWorkflow`. Those are two writes to two systems with nothing tying them together, so a process that dies between them leaves a row Temporal has never heard of.

The row cannot describe that state. `status = 'running'` is written at insert and means both "a workflow is running this" and "nothing is running this." Everything downstream inherits the ambiguity:

- `failStaleScans` closes out rows running past `STALE_SCAN_MS` (thirty minutes). It cannot ask whether a workflow exists, so it waits long enough that an orphan is unlikely to still be legitimate — which is also long enough to be slow when the row really was orphaned in the first second.
- The workflow's stage timeouts are thirty minutes for ingest, thirty for review, and two for the closing write. A healthy Scan can therefore run about sixty-two minutes, more than double the reclaim window, so the reclaim fires on Scans that were merely slow and reports each one.
- `startTopicScan` claims an open row by looking for `status = 'running'`, which is a proxy for "opened but never dispatched" that also matches rows that are dispatched and fine.

Temporal already gives durability once a workflow starts: its history is the log, and `run-scans-on-temporal` verified that a worker killed mid-review resumes and completes. This change is only about the gap before the workflow exists.

## Goals / Non-Goals

**Goals:**
- An orphaned row is recoverable from a recorded fact rather than from elapsed time.
- The reclaim covers only the failure nothing else can see, with a window that never fires on a legal Scan.
- A Scan that dispatches successfully takes exactly the path it takes today, with no added latency.

**Non-Goals:**
- Transactional atomicity between the row and the workflow start. A true outbox would need the dispatch and the row in one transaction, which Temporal cannot join.
- Removing the reclaim. It covers a real failure the marker cannot.
- Changing what a Scan discovers, keeps, costs, or announces.
- Reworking how due-ness is computed, beyond noting where this change touches it.

## Decisions

### The marker records dispatch, not intent

`dispatched_at` is set **after** `startTopicScanWorkflow` returns, so it means "Temporal has accepted this Scan." The alternative — writing a `pending_dispatch` marker inside the insert transaction and clearing it on success — was rejected because it inverts the common case: every healthy Scan would write twice, and the relay would have to distinguish "still being dispatched right now" from "dispatch failed," which reintroduces a timing guess.

Setting it after means a row is undispatched until proven otherwise, which is the safe direction: the worst case is the relay re-attempting a Scan whose workflow already started, and the workflow id refuses that.

### Inline start stays, relay is the backstop

A poll-only outbox would be simpler to reason about — one dispatcher, one path — but it puts the sweep interval between asking for a Scan and starting it. A Brew is interactive, and a Topic's first Scan is meant to be under way by the time the Topic page renders. So the inline start remains the common path and the relay only picks up what it failed to dispatch.

The cost is two dispatch paths. It is bounded by the workflow id: both routes start `scan-<topicId>`, and Temporal refuses the second.

### The reclaim narrows rather than disappears

An outbox marker cannot see a row that was dispatched and whose workflow then vanished — Temporal losing the workflow, or a workflow that somehow never reaches a terminal state. Scoping the reclaim to `dispatched_at IS NOT NULL` leaves it covering exactly that, and takes away the orphan case it was handling badly.

### The window is derived, not chosen

The reclaim must not fire on a Scan that is still legally running. That bound is the sum of the workflow's stage timeouts plus margin, and it changes whenever a stage timeout changes. Hardcoding a second number invites the two to drift, which is how the current thirty-minute window came to be shorter than a legal Scan. The stage timeouts become the single source, and the window is computed from them.

Both the timeouts and the derived window are read by code in the workflow sandbox and code outside it, so where the constant lives has to keep the workflow bundle free of anything it may not import.

## Risks / Trade-offs

**A relay that re-dispatches a Scan already in flight** → The workflow id refuses it, and `startScanFor` already treats that refusal as "running." The relay must not delete the row on that refusal the way an inline caller does, since the row belongs to the Scan that is actually running.

**A dispatch that succeeds and whose marker write fails** → The row stays undispatched, and the relay tries again. Temporal refuses the duplicate, the relay learns it is already running, and the marker can then be recorded. This has to be handled explicitly or the row is re-attempted on every sweep forever.

**A longer reclaim window delays recovery of a genuinely vanished workflow** → From thirty minutes to over an hour. Accepted: that failure is rare, and the orphan case that actually needed speed is now handled by the relay in one sweep interval.

**Due-ness shifts with the window** → `loadScheduledTopics` computes from the newest non-running Scan, and a reclaimed Scan counts as completed, so it spends its Topic's frequency window from its `startedAt`. Moving when the reclaim fires moves when a Topic becomes due after a vanished workflow. Whether that is intended has to be stated rather than absorbed.

**Existing rows have no marker** → Every `scans` row written before the migration has `dispatched_at IS NULL`, including long-finished ones. The relay must not re-dispatch history. Scoping it to rows that are still `running` alongside the null marker handles it, and the migration can backfill terminal rows.

## Migration Plan

1. Add the nullable column. No backfill is required for correctness, but terminal rows should be backfilled so the relay never considers them.
2. Deploy with the marker written and the relay reading it. The reclaim keeps its current behaviour for one deploy so nothing is left uncovered while rows still lack markers.
3. Narrow the reclaim and switch its window once every live row carries a marker.

Rollback is the column staying unread: the reclaim's original scope and window recover the old behaviour without a schema change.

## Open Questions

- **What closes a Scan whose worker never returns?** Resolved by observation, with a correction. A worker was killed 82 seconds into review and left dead. Review's start-to-close timeout fired at the 30-minute mark, but the row stayed `running`: the workflow's catch calls `failScan`, and `failScan` is itself an activity, so it cannot run without a worker. The moment a worker returned, the workflow completed and the row went to `failed` with "Activity task timed out", carrying only ingestion's spend.

  So the catch path does close the Scan — but only once some worker exists. While no worker runs at all, nothing terminates the row, which makes the reclaim broader than this design assumed: it covers a worker that never comes back, not only Temporal losing a workflow. That is an argument for keeping it and for the alert being meaningful, and it means a fleet that is entirely down leaves rows open until the reclaim window rather than failing them promptly.
- **Should the narrowed reclaim still report?** After this change its alert means a dispatched workflow disappeared, which is an incident rather than noise. That argues for keeping the report and treating it as pageable — but only once it has been confirmed it no longer fires on healthy Scans.
- **Is the shift in due-ness after a vanished workflow intended?** Resolved: due-ness is left exactly as it was. A reclaimed Scan still spends its Topic's frequency window, so a Topic whose workflow vanished now waits from a later reclaim than it would have. Reworking due-ness was a stated non-goal, and a Scan reaching the reclaim at all is rare enough after this change that the delay is not worth coupling the two. Whether an infrastructure failure should spend a Topic's window is a real question, and belongs to a change that owns scheduling.
