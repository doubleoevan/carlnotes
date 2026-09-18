## Why

A note saves continuously. Edits pool for 400 milliseconds, post as one merged update, and the words are on the
server before the sentence is finished. The editor says none of that. It is silent when a save lands and speaks only
when one fails, so a writer who wonders whether their work is safe has nothing to look at and no way to find out
except closing the note and reopening it.

There is no Save button because there is nothing to save: the document is collaborative, so there is no local draft to
commit and no single version to commit it to. A button would imply that not clicking it loses work, which is false,
and would make people hesitate to close the dialog. What is missing is not a control. It is a statement of fact.

## What Changes

The note dialog shows where the note stands, at the foot of the dialog beside the delete: saving while a batch is in flight, saved once it lands,
and not saved when the provider could not post. The wording is the plain fact and nothing more, since an error already
explains itself in a toast.

The provider already knows all three states. It pools edits, posts them, and reports a failure. This change gives that
knowledge somewhere to go.

## Capabilities

### Modified Capabilities

- `tasting-notes`: the note dialog states where the note stands, which the editor previously kept to itself

## Impact

- `ui/src/components/note/noteProvider.ts` — reports each change of save status, beside the save error it already reports
- `ui/src/components/note/useNoteSync.ts` — holds the status the provider reports
- `ui/src/components/note/NoteEditor.tsx` — passes the status up, the way it already passes a save error up
- `ui/src/components/note/NoteDialog.tsx` — shows it at the foot of the dialog, beside the delete
- no server change, no schema change, and no change to how or when a note saves
