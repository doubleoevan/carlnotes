## Context

A note is a Yjs document synced by `NoteProvider`. Local edits pool, a timer merges them after 400ms, and one update
posts. The provider already reports a failure through an `onSaveError` callback that `NoteDialog` turns into a toast.
It reports nothing when a save succeeds, which is why the editor is silent in the case that happens almost every time.

## Decisions

### A status, not a button

The reader asked for a Save button for clarity. A button would not give clarity, it would take it away. The document
is collaborative and already saved, so a button has nothing to commit and no version to commit it to, and its presence
would tell every writer that closing without pressing it loses work. The honest fix is to say what is true, which
needs no click and is right continuously rather than at the moment someone presses something.

### The provider reports the status it already knows

Three states exist in `NoteProvider` today without names: edits are pooled and a post is pending, the pool is empty
and nothing failed, or a post failed and left the pool full. This change names them and hands them out through a
callback beside the `onSaveError` one, which is the path the dialog already reads from.

Nothing about when or how a note saves changes. The provider gains a way to say what it is doing.

### The status shows beside the delete, and only for an editor

The foot of the dialog is where the note's own controls already are, so it is where a reader looks when they are
thinking about the note rather than about its words. The status reads at the same size and weight as the delete beside
it, because it is a statement about the note and not a footnote to it.

A read-only open has no provider and nothing that can change, so it shows nothing rather than showing "saved", which
would imply a save could have happened. Edit rights and delete rights are separate, so the two sit on that row
independently and an editor who may not delete still sees where the note stands.

### A failure keeps saying so

A failed post leaves the edits pooled and retries on the next flush, which only comes when the writer types again. The
status therefore stays at not saved until an update actually lands, rather than clearing itself on a timer. A status
that healed on its own would be the one thing worse than silence.

## Risks / Trade-offs

- **A status that is almost always "saved" becomes furniture** and stops being read. Accepted: the case it exists for
  is the one where it says something else, and a reader who has learned to expect "saved" is exactly the reader who
  notices "not saved".
- **The status and the toast both report a failure.** Accepted as deliberate: the toast passes and the status persists,
  so a writer who missed the toast still has something to see.

## Migration Plan

Additive and UI only. No schema change, no server change, and no change to when a note saves.

## Open Questions

None.
