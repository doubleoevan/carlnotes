## Why

A Topic owner reviewing a Journal could endorse 30 topic memories before further thumbs-up ratings stopped saving. Each rating supplies editorial feedback. Carl already selects a bounded amount of context when he writes.

## What Changes

- Let authorized raters submit feedback on every active topic memory and remove the saved-count warning.
- Keep each rater’s note with their vote. Use the existing ranking and byte budget at prompt time.

## Capabilities

### Modified Capabilities

- `topic-memories` permits feedback independently of the number of existing endorsements.

## Impact

The shared Journal, feedback write and result schema change. Existing ratings and notes use the same database rows. The success response continues to return `saved`.
