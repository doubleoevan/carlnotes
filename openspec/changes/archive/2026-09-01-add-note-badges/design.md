# Design

## An unread edit is dated by the HTML, not by `updated_at`

`notes.updated_at` cannot stand for "the body changed". The `timestamps()` helper touches it on every
row write, which includes a comment write and the HTML's own save, so an edit badge keyed to
it would fire for things that are not edits.

`body_edited_at` is saved instead, and it is saved in `regenerateNoteHtml`, where the HTML is
already being computed and written. That moment is the right one twice over: the content has settled
past the 1.5s merge debounce, and the newly rendered HTML is sitting there to compare against the
stored one.

## A comment mark is not an edit

Adding a comment applies a mark to the note body, so a comment produces a ydoc update like any edit
does. Left alone, one comment would raise both an edit badge and a comment badge.

A comment mark is a `<span data-bn-thread-id="…">` wrapping the text it annotates, and nothing else in
the HTML has that attribute. So the two HTML bodies are compared with every comment mark
unwrapped, keeping the words inside it. The comparison loops until it reaches a fixed point, which
handles one mark nested inside another.

The alternative considered was a time window: save a `commented_at` and ignore any body change landing
within a few seconds of it. Rejected because it is a guess about timing that a slow flush or a fast
typist can defeat, and it needs a third column to hold the guess.

## The writer is recorded, so nobody is badged for their own work

`POST /notes/:id/updates` already knows who is writing, so it saves `last_editor_user_id` with the
merge. An unread edit needs both `body_edited_at > read_at` and a last editor who is somebody else.

Saving the writer's own `read_at` instead would have avoided the column, but the edit is dated later
than the write, after the HTML debounce, so the writer's own read time would already be behind it.

## No count endpoint

Chat polls a cheap `COUNT(*)` and only reloads the heavy room list when that number moves. Notes do not,
because the badge payload holds only the notes with something waiting in them, which is a short list in
the normal case and empty in the common one. A count query would repeat the same two reads to save
sending an empty array.

`GET /api/note-badges` runs on the existing 45-second tick in `AppChatPanel`, so the note badges and the
chat badges refresh together and can never disagree about how current they are.

## One pill, two variants

`CountPill` in `ui/src/components/common/` owns the shape, and `ChatMentionCount` became a wrapper
around it. Filled and outline are the same geometry with different paint, so the pair lines up wherever
they sit together, and neither can drift as the other is restyled.

The filled mention pill leads the pair and the outline note pill follows it, in every place the two
appear together.

## Reach

The badge set covers the user's teams and the topics those teams own or hold, which is the same page
set the chat rooms poll already computes. Private notes are filtered to their owner. A public note on a
topic no team of the user's holds is not badged: reaching it would cost a per-note permission call, and
it is not a note the user has any relationship to.

## No backfill

A note the user has never opened and did not write counts as unread, and there is no migration writing
`note_reads` rows to pretend otherwise. Edits are quiet on old notes either way, since `body_edited_at`
starts null and only a real edit sets it. Comments are not: the first load after this ships counts every
existing comment by somebody else. Opening each note once clears it.
