## Why

A Finding's review is written once and never revisited. The selector that feeds curation excludes every
Resource that already has a Finding for the Topic, so its `relevance_score` and
`relevance_explanation` are frozen at the Scan that first scored it.

That review was made against the Topic's effective context at that moment. The owner can edit the
Topic's prompt, add an attachment, or remove one, and every existing explanation still answers the
question they no longer asked. Nothing tells them which Findings were reviewed under which prompt, and
nothing makes the page catch up.

This is observable in production today. A Topic held six Findings kept under one context. Later Scans
of the same ten Resources scored every one of them below the relevance bar and kept nothing, reporting
"every piece landed below my bar for keeping". Two contradictory reviews of the same content, and
the page showed the stale one. The only way to refresh them was deleting the Finding rows by hand.

## What Changes

A Scan reviews again a Finding when the question it was reviewed against has changed, and leaves it alone
when nothing has.

- A Finding records a hash of the Topic's effective context at the moment it was scored.
  `buildTopicScanContext` already merges the Topic's prompt with every attachment's context, so one
  hash covers a prompt edit, an attachment added, and an attachment removed.
- Curation processes a Resource when it has no Finding, when its Finding's hash differs from the
  current context, or when the Resource's own stored content changed since it was reviewed.
  `resources.content_hash` already records the latter for dedupe. The Topic's own Findings are reviewed
  whether or not the Scan rediscovered them, since a bookmarked or rated Finding outlives its feed.
- A re-score updates the Finding in place. The Scan's recap is written from the Findings the Scan
  kept, so a Topic whose prompt changed gets a recap describing the current reading.
- A re-scored Finding keeps what the user put there: its rating, who cast it, the role they held,
  and its view count. The row is updated in place, so its bookmarks, read state, views, and
  feedback, which all cascade from it, are left alone.
- A Finding that drops below the relevance bar on a re-score is not deleted by the re-score. The
  existing max-results pruning stays the one place a Finding leaves a Topic, and it spares every
  Finding a user bookmarked or rated, so a re-score never silently discards a rating.

Re-scoring on every Scan is rejected. Scoring is a model call per Resource, so a Topic scanning daily
with 150 Findings would spend 150 calls a day re-deriving answers that mostly have not changed. The
hash makes the cost proportional to how often the owner actually changes the question: an
untouched prompt costs nothing, and an edited one refreshes once and then goes quiet.

## Capabilities

### New Capabilities

None. This changes when existing curation reviews again what it has already reviewed.

### Modified Capabilities

- `curation`: curation currently skips every already-scored Resource outright. It SHALL instead
  re-score one whose Topic context hash or stored content has changed, upsert the Finding in
  place preserving the reader's rating and view count, and record the hash it reviewed against.
- `domain-schema`: `findings` SHALL record the Topic context hash each Finding was reviewed
  against, and the content hash of the Resource as reviewed.

## Impact

- `worker/review/filter.ts`: `loadResourcesToReview`, renamed from `loadUnscoredResources`, decides what
  curation processes. It grows from
  "has no Finding" to "has no Finding, was reviewed against a different context, or was reviewed against
  different content".
- `worker/review/index.ts`, `worker/review/score.ts`: `upsertFinding` writes the hash and the
  reviewed content hash, and preserves the reader's columns on update.
- `db/schema.ts` and a migration: two nullable columns on `findings`. Existing rows carry null, which
  reads as "reviewed against an unknown context" and is settled in design.md.
- `worker/attach.ts`: `buildTopicScanContext` is the hash's input; it is read, not changed.
- Cost: a Topic whose prompt is edited pays one scoring pass over its existing Findings on the next
  Scan, bounded by the Scan's existing spend limit and its concurrency limit, which already defer the
  rest of a run that reaches them.
