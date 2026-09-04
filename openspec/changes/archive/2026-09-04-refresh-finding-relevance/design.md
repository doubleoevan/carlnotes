## Context

Curation processes the Resources a Scan discovered that have no Finding for the Topic.
`loadUnscoredResources` builds that list by excluding every `resource_id` already in `findings` for
the Topic, so a Finding is reviewed once and never again.

The review is relative to something that moves. `scoreResource` scores against the Topic's effective
context, which `buildTopicScanContext` assembles from the Topic's prompt plus every attachment's
generated context. Edit the prompt, add an attachment, remove one, and the context changes while every
existing explanation keeps answering the old question.

Two mechanisms already exist that this change builds on rather than replaces. `upsertFinding` writes
through the `(topic_id, resource_id)` unique constraint, and its update set is exactly
`{ scanId, relevanceScore, relevanceExplanation }` — the reader's `rating`, `ratedByUserId`,
`ratedTeamId`, `ratedRole`, and `view_count` are already untouched by a re-write. And `resources`
already carries `content_hash`, written at admission for dedupe, which records what the Resource said
when it was last read.

Production today: 462 Findings across 32 Topics. Five carry a rating, sixteen have been viewed.

## Goals / Non-Goals

**Goals:**

- A Finding is reviewed again when the question it was reviewed against has changed, and left alone when it
  has not.
- The recap a Scan writes reflects the current reading of the Topic, not a mix of old and new
  reviews.
- A re-score itself never costs the reader what they put on a Finding: its rating, its read state, its
  bookmark, and its feedback all survive being reviewed again.

**Non-Goals:**

- Re-scoring on every Scan. Scoring is a model call per Resource; a daily Topic with 150 Findings
  would spend 150 calls a day re-deriving answers that have not changed.
- Changing the relevance bar, the promotion threshold, or how a score is computed. This changes *when*
  a Resource is reviewed, not *how*.
- Versioning reviews. A Finding carries its current review, not a history of them.
- Re-fetching content. A re-score reads the Resource's stored body by the path curation already uses.

## Decisions

### The trigger is a hash of the Topic's effective context

A Finding records the context it was reviewed against as a hash, not the context itself. One hash
covers a prompt edit, an attachment added, an attachment removed, and an attachment whose own
generated context changed, because `buildTopicScanContext` already folds all of them into one string.

Rejected: watching `topics.updated_at`. It moves for a rename, a schedule change, or a visibility
change — none of which change what the Topic is asking — so it would re-score for free on edits that
mean nothing to relevance. Rejected: storing the context text on every Finding. 462 rows carrying a
copy of a multi-kilobyte string to answer one equality question.

### Content that changed is reviewed again too

`resources.content_hash` already records what the Resource said when it was last admitted. A Finding
records the hash it reviewed, and curation re-scores when the two differ. A page that was rewritten
deserves to be reviewed again for the same reason an edited prompt does, and the detection is a column
comparison rather than a model call.

### A null hash means "reviewed against an unknown context", and re-scores once

Existing Findings predate the column. Reading null as current would leave 462 Findings permanently
frozen until their Topic's prompt happens to change. Reading it as stale re-scores each one on its
Topic's next Scan: a one-time pass, spread across 32 Topics rather than landing at once, and bounded
per Scan by the spend limit and concurrency limit that already defer the rest of a run.

The alternative — backfilling the current hash into existing rows so nothing re-scores — is
rejected because it would assert a review that was never made. Those rows were scored against
whatever the context was then, which is exactly what nobody recorded.

### Pruning spares a Finding the reader deliberately marked

This is the decision the change turns on. `filterTopicFindings` deletes Findings ranked beyond the
Topic's `max_results` by relevance score, sparing only bookmarked ones. Today that is nearly
harmless, because a Finding's score never moves. Once a re-score can lower a score, the same pruning
can delete a Finding the reader rated, read, or gave feedback on — and the delete cascades to
`consumptions`, `bookmarks`, and `finding_feedback`.

A Finding the reader deliberately marked SHALL be spared by pruning the way a bookmarked one is.
Deliberately marked means it carries a rating. The principle is that the app does not delete what a
person chose, and a bookmark is one way of choosing rather than the only one.

Two candidates were tried and dropped. A view does not spare a Finding: opening one is incidental
rather than deliberate, and `view_count > 0` would make most of an actively read topic unprunable,
which is the limit's whole job. Reader feedback does not spare one either, because `db/schema.test.ts`
enforces that feedback and the rater's team and role are record-only and never read into the ranking
path; reading `finding_feedback` inside curation breaks that boundary, and the guard test says so.
A rating is already a column on the Finding, so sparing it costs no extra read and crosses no line.

Rejected: sparing every re-scored Finding. That would let a Topic grow past its `max_results` on a
prompt edit, which is the limit's whole job. Rejected: leaving pruning alone. It makes a prompt edit
silently destroy ratings and read state, which is worse than a stale explanation.

### A Scan that runs out of budget refreshes what it can and leaves the rest

Re-reviewing a Topic's Findings after a prompt edit can cost more than one Scan's spend limit allows. The
paid pass already defers what it cannot afford, so such a Scan closes with some Findings reviewed against
the new context and some still against the old, and its recap describes only what it kept.

That mix is accepted rather than prevented. The alternative — holding the Scan open until every Finding
is refreshed — would let one prompt edit run a Scan far past its limit, which is what the limit exists
to stop. The deferred Findings still carry the old hash, so the next Scan picks them up exactly
where this one stopped, and the Topic converges over a few Scans instead of one long one.

Nothing marks the Scan as partial. A reader cannot tell from the page that some explanations are older
than others, which is the cost of this choice and the reason to revisit it if a Topic is ever large
enough that convergence takes more than a day.

## Risks / Trade-offs

- **A prompt edit now costs a scoring pass.** Measured on the review smoke's live topic, which holds ten
  Findings: an unchanged prompt reviewed 9 Resources for $0.0038, and the same Scan after a prompt edit
  reviewed 19 for $0.0103. The edit cost about two thirds of a cent more, and it scales with how many
  Findings a Topic holds. Bounded by the per-Scan spend limit, which defers the remainder to the
  following Scan rather than overspending, and visible in the Scan's recorded stage costs like any other.
- **An unchanged prompt is not free, and never was.** Those 9 Resources are the ones whose Findings the
  prune deleted, so they have no Finding to be settled by and every Scan reviews them again. That cycle
  predates this change; the hash only stops the surviving Findings from joining it.
- **The one-time null pass lands on every Topic's next Scan.** 462 Findings across 32 Topics, so the
  largest single Scan pays for that Topic's share, not all of it.
- **Sparing rated Findings weakens `max_results` as a hard limit.** A Topic can sit above its limit by
  the number of Findings its readers rated. Today's bookmark exemption already has this shape; this
  widens it by one deliberate act. The alternative is deleting things people reviewed.
- **A view and feedback still do not protect a Finding.** A Finding someone read or gave feedback on,
  and never rated or bookmarked, can still be pruned after a re-score lowers it, taking that read state
  and feedback with it. Widening further would either gut the limit or read reader signal into the
  ranking path, which `db/schema.test.ts` forbids.
- **A re-score can contradict what the reader already read.** A Finding they saw explained one way now
  reads another. That is the point of the feature, but it means the explanation under a rating can
  stop matching why they rated it.
- **The hash is only as good as the context it hashes.** If a future change makes scoring read
  something `buildTopicScanContext` does not include, the hash stops covering it and Findings
  go stale again without anything noticing.
