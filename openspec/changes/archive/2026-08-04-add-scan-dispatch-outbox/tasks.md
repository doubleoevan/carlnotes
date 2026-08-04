## 1. Record dispatch on the Scan

- [x] 1.1 `db/schema.ts`: add a nullable `dispatchedAt` timestamp to `scans`. Nullable rather than defaulted, since a default would make every row read as dispatched.
- [x] 1.2 Generate the migration, and backfill terminal rows so Scans that finished before the column existed are never mistaken for Scans awaiting dispatch. Leave rows still `running` null, since those are the ones the relay has to consider.
- [x] 1.3 `worker/scan.ts`: `startScanFor` records the marker after `startTopicScanWorkflow` returns, so a row is undispatched until dispatch is proven.
- [x] 1.4 A dispatch that succeeds and whose marker write fails leaves the row undispatched. Decide and implement what happens on the retry, so the relay cannot re-attempt the same row on every sweep forever.

## 2. Claim on the marker, not the status

- [x] 2.1 `worker/scan.ts`: `startTopicScan` claims an open row on the absent marker rather than on `status = 'running'`, which is the condition claiming actually means.
- [x] 2.2 Confirm the claimed-row path still leaves a claimed row in place when the workflow start is refused, and only removes a row the same call opened.

## 3. The relay

- [x] 3.1 `worker/schedule.ts`: before selecting Topics, start the workflow for every Scan that is still open and carries no marker.
- [x] 3.2 Treat a refused start as "already running": record the marker and keep the row, rather than deleting it the way a caller opening a fresh row does.
- [x] 3.3 Scope the relay so Scans that reached a terminal status are never dispatched, whatever their marker says.
- [x] 3.4 Keep the inline start as the ordinary path. The relay only picks up what it failed to dispatch, so a Brew and a Topic's first Scan still begin immediately.

## 4. Narrow and re-tune the reclaim

- [x] 4.1 `worker/schedule.ts`: scope `failStaleScans` to Scans that carry a marker, so an undispatched row is left for the relay rather than closed out.
- [x] 4.2 Derive the reclaim window from the workflow's stage timeouts rather than as an independent number, so it always exceeds the longest legal Scan and cannot drift from the timeouts. Keep the workflow bundle free of anything it may not import.
- [x] 4.3 Decide whether the narrowed reclaim still reports, given that its alert now means a dispatched workflow disappeared. State the decision where the reporting happens.

## 5. Settle what the design left open

- [x] 5.1 Confirm, against the running system, that a Scan whose worker never returns is closed by the activity's start-to-close timeout and the workflow's catch calling `failScan`, rather than presuming it. Record what was observed.
- [x] 5.2 State whether a reclaimed Scan should keep spending its Topic's frequency window. Moving when the reclaim fires moves when a Topic becomes due again, and an infrastructure failure is not the Topic's fault.
- [x] 5.3 Keep the `domain-model` skill in sync if any vocabulary changes.

## 6. Tests

- [ ] 6.1 An undispatched row is dispatched by the relay and not closed out. A dispatched row past the window is closed out. Declined for now: this needs DB-backed tests, which the suite does not do, and the logic is a filter condition rather than branching. Verified live instead.
- [ ] 6.2 A dispatched row within the longest legal Scan duration is left alone and reported on by nothing. Declined with 6.1, and verified live.
- [x] 6.3 The reclaim window is greater than the sum of the stage timeouts, so a stage timeout raised later cannot silently make the window too short.
- [ ] 6.4 Claiming picks an undispatched row and passes over a dispatched one. Declined with 6.1.

## 7. Verify

- [x] 7.1 Kill a caller between the row write and the workflow start, and confirm the next sweep dispatches it rather than the reclaim closing it out thirty minutes later.
- [x] 7.2 Let a Scan run past the old thirty-minute window and confirm nothing closes it out or reports it.
- [x] 7.3 `bash scripts/preflight.sh`, then `bun run smoke:scan` against a real Topic.
