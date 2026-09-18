## 1. The provider reports its save status

- [x] 1.1 Name the three states the provider already has, and report each change through a callback beside `onSaveError`
- [x] 1.2 Report saving when an edit pools, saved when a post lands and the pool is empty, and not saved when a post fails or is rejected
- [x] 1.3 Assert in a test that a pooled edit reports saving, a landed post reports saved, and a failed post reports not saved

## 2. The status reaches the dialog

- [x] 2.1 Hold the reported status in `useNoteSync`, starting at saved
- [x] 2.2 Pass it up from `NoteEditor` the way `onSaveError` already goes up
- [x] 2.3 Show it at the foot of the dialog beside the delete, for an editor only, sized to match the delete

## 3. Copy

- [x] 3.1 Word the three states as the plain fact, with no reason repeated from the toast
- [x] 3.2 Check the wording against the note copy requirement in `tasting-notes`

## 4. Verify

- [x] 4.1 Type in a note in the browser and watch it go from saving to saved
- [x] 4.2 Assert that the status sits behind the same edit gate the editor does, so a read-only open shows none
- [x] 4.3 `bun run check`, the repo gate: Biome, `tsc -b`, the Temporal workflow bundle check, and the test suite
- [x] 4.4 `openspec validate add-note-save-status`
