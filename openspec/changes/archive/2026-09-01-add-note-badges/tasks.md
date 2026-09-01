# Tasks

## 1. The read state

- [x] 1.1 Add `note_reads` (`note_id`, `user_id`, `read_at`) keyed on the pair, with the by-user index the counts read.
- [x] 1.2 Add `notes.last_editor_user_id` and `notes.body_edited_at`.
- [x] 1.3 Generate and apply migration `0078`. No backfill.

## 2. The counts

- [x] 2.1 Add the `noteBadge` contract: the note, its page, and its two numbers.
- [x] 2.2 Add `api/note/noteBadges.ts`: `loadNoteBadges`, `saveNoteRead`, `toUnreadEdits`, `isNoteBodyChanged`.
- [x] 2.3 Restrict the badge set to the user's teams and the topics they own or hold, private notes to their owner.
- [x] 2.4 Count comments newer than the read time, excluding the user's own and the soft-deleted ones.

## 3. The saved times

- [x] 3.1 Record the writer on `POST /notes/:id/updates`.
- [x] 3.2 Date a body edit in `regenerateNoteHtml`, only when the HTML changed with comment marks unwrapped.
- [x] 3.3 Stamp a new note as edited by its creator, so it badges the team and not its author.
- [x] 3.4 Add `POST /notes/:id/read` and `GET /note-badges`.

## 4. The badges

- [x] 4.1 Add `CountPill` with filled and outline variants, and point `ChatMentionCount` at it.
- [x] 4.2 Add `noteBadgeStore` with the roll-up reads and the opened-this-session clear.
- [x] 4.3 Poll `GET /note-badges` on the existing chat tick in `AppChatPanel`.
- [x] 4.4 Render the pair in `TopicMentionBadge`, which lights the topic title, the team title, and the topic tables.
- [x] 4.5 Show the two numbers separately on the note's own row in `NotesTable`.
- [x] 4.6 Clear on open in `NoteDialog`, locally at once and on the server for the next poll.
- [x] 4.7 Add the outline pill to the profile, the user menu's rows and avatar, the header, and the teams index.

## 5. Verification

- [x] 5.1 Unit-test the edit rule and the comment-mark comparison.
- [x] 5.2 Unit-test the store's roll-up and its clear-on-open.
- [x] 5.3 `bun run check` green.
