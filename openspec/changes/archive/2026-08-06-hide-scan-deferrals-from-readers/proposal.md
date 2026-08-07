## Why

A Scan defers a candidate when it hits one of its own ceilings: the per-Scan dollar cap or the scored-resource cap. That count was fed to the scan report, and Carl wrote it up for the reader — "Five candidates got deferred to keep us under the spend cap."

The reader cannot act on it. Both ceilings are environment configuration with no setting behind them, so the note explains a mechanism instead of telling the reader what Carl found. The label was also wrong: the resource ceiling defers too, while the line always blamed the spend cap. And it led Carl into a claim the data does not support — that a future Scan would surface the held-back items, when the next Scan re-runs the same gate against the same ceiling.

## What Changes

- The deferred count is no longer given to the scan report prompt, so it can no longer appear in the reader's note.
- The prompt's data heading for that block drops `deferred`, since the block no longer carries it and the stale heading would invite Carl to write about deferrals he has no numbers for.
- The deferred count stays tracked on the review outcome. It spans two stages — a candidate past the ceiling before embedding, and one past it before scoring — and only the second is derivable from the existing `score` span, so dropping the counter would lose a real signal.
- **BREAKING** for the scan report's content: reports written from now on no longer mention deferrals. Existing `scan_summary` values keep whatever they were written with.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `curation`: the scan report is grounded in drop and failure counts, no longer in deferral counts. What the reader is told narrows to what the reader can act on; what the Scan records does not change.

## Impact

- **Worker**: `worker/review/summarize.ts` stops emitting the deferred line; `worker/prompts/summarize-topic-scan.md` drops `deferred` from its data heading, version 4 → 5.
- **DB**: none. The deferred count was never a column, so nothing is lost from the `scans` row that was there before.
- **Tests**: `worker/review/summarize.test.ts` asserts the rendered prompt contains neither `spend cap` nor `deferred`, which is what would catch a revert.
- **Dependencies**: none.
