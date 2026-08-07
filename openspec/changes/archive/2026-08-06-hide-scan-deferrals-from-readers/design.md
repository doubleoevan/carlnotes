## Context

`toFilteredResourcesReport` in `worker/review/summarize.ts` built the report's drop block, and included `- deferred by the spend cap: N` alongside the per-cause filter counts and the failure count. The prompt then labelled that block `Filtered, deferred, and failed:`.

Carl is told to ground every word in the data he is given, so the line was enough to put deferrals in the reader's note.

## Goals / Non-Goals

**Goals:**

- The reader's note stops explaining ceilings they cannot change.
- The signal stays available to whoever is debugging a Scan that kept nothing.

**Non-Goals:**

- Changing when a Resource is deferred, or either ceiling's value.
- Adding a `deferred` column to `scans`. That is a real option for surfacing the count to an owner later, but this change is about what the reader is told, not about new storage.
- Removing the cost line from the prompt. Carl has never written dollars into a note, and the cost data is what grounds the numbers beat.

## Decisions

### Remove the data, not the instruction

The prompt does not name deferrals anywhere in its instructions — it says to report "what got dropped and why", and the deferral line was simply part of what it was handed. Removing the line is therefore enough to remove the behavior, and it leaves the prompt free to keep reporting genuine drops.

*Alternative considered*: keeping the count and rewording it to "held back to stay within our budget". Rejected — plainer language would still be a mechanism the reader has no lever for, and would keep the claim that a later Scan will get to the held-back items.

### The heading had to change too

`Filtered, deferred, and failed:` outlived its content. A heading naming a category the block no longer carries is an invitation to write about it from nothing, which is exactly what the grounding rule is meant to prevent. It becomes `Filtered and failed:`, and the prompt's version goes 4 → 5.

This is the part a test caught rather than review: asserting the rendered prompt contains no `deferred` failed on the heading after the data line was already gone.

### The counter stays

A candidate is deferred in two places: past the ceiling before it is embedded, and past it before it is scored. The `score` stage's span already carries `admittedCount` and `scoredCount`, whose difference is the second kind — but nothing covers the first. Deleting `deferredCount` as now-unread would therefore lose a signal rather than remove dead weight.

It is left tracked with no consumer. That is a small amount of dead weight, taken deliberately over losing the gate-stage count.

## Risks / Trade-offs

- **A Scan that keeps nothing now explains less** → It still reports its drop causes, which are the reasons the reader can actually read something into. "Nothing worth keeping" was always a legitimate note; the prompt says so.
- **A tracked value with no reader** → It will not drift, since nothing reads it, but it also will not be noticed if the two deferral sites diverge. Named here so it is a known state rather than a discovery.
- **Existing reports keep the old wording** → `scan_summary` is written once per Scan and never rewritten. Reports from before this change still mention the spend cap.

## Open Questions

None.
