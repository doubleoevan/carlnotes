# Add Note Badges

## Why

A team can now write tasting notes together and comment on them, but nothing tells anyone that
something happened. A member has to open every note on every topic to find the one a teammate edited
or replied in. Chat already solved this: `room_mentions` has a `read_at`, and a filled badge sits
on the topic title, the team title, the teams index, and the user menu until the room is opened.
Notes have the SQL mirrors that were built for exactly this — `note_comment_threads` and `note_comments`
already exist "for counts and notifications" — and no badge reads them.

## What Changes

- New **Note Read**: one row per note per user holding when that user last read the note, saved on
  every open. A note also records who last edited it, so a writer is never badged for their own work.
- A note shows **two separate numbers**: unread edits and unread comments. An unread edit counts once
  per note, not once per keystroke or once per editor: a note whose body changed since the user last
  read it counts one. Unread comments count the comments written since then by somebody else.
- The two numbers **sum into one badge** on the topic title, the profile, the team title, and the
  teams menu and index, so a user sees at a glance that a page holds something new.
- The note badge is **outline** where the chat mention badge is **filled**, and the two are the same
  size and shape so they sit side by side in a menu without disturbing its layout. Filled means
  somebody named you; outline means something changed that you have not read.
- Both badges render through one shared count pill, so they can never drift apart.
- Counts obey note visibility: a user counts only the notes they may see, so a private note badges nobody
  but its owner.
- No backfill. A note a user has never opened and did not write counts as unread, which is what is
  true of it.

## Capabilities

### New Capabilities

- `note-badges` — unread edit and comment counts on notes, their roll-up to a page, and the badges
  that show them.

## Impact

- New `note_reads` table, one migration, no data migration.
- `api/note/` gains a read-marking route and the count reads; `shared/contracts.ts` gains the count
  shapes; the note payload gains per-note counts.
- `ui/src/components/topic/TopicMentionBadge.tsx` gives up its private count pill to a shared one.
- The topic title, profile, team title, teams menu, teams index, and note table each gain a badge.
- No change to how a note syncs, what it stores, or who may read it.
