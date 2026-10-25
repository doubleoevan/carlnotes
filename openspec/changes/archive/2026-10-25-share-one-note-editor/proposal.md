## Why

The Notion Mobile page decided on one editor for web, iOS, and Android. The tasting note editor is BlockNote over Yjs,
which no native editor speaks, so the mobile app could never open a note. `react-native-enriched-html` renders natively
on mobile and runs on the web as a Tiptap editor behind the same component, props, events, and HTML. Adopting it means
moving notes from live co-editing to save-and-sync. A spike in `apps/web` (recorded in the design) proved the web side:
the editor renders in the TanStack Start app, every construct round-trips through its HTML byte for byte, the server
render stays clean, and the built client loses about a megabyte of JavaScript.

## What Changes

- The web note editor becomes `react-native-enriched-html`'s `EnrichedTextInput`, loaded in the browser only, with a
  formatting toolbar built from the Nightshift `Button` and the icon button classes, lit from the editor's
  `onChangeState`. The read-only open renders the package's `EnrichedText` in place of raw inner HTML. Both take their
  colors and sizes from Nightshift through the package's `htmlStyle`, so light and dark follow the theme.
- A note's body is its sanitized HTML, the only copy, beside a version. The editor saves on a short debounce after
  typing stops, sending the HTML and the version it opened at. The api sanitizes to the editor's own tag set, writes
  only if the stored version still matches, bumps it, and otherwise answers a conflict naming who saved last. The dialog
  keeps the words, says somebody else saved the note since it was opened, and offers a reload. Images stay out: the
  sanitizer drops them and the editor offers no way to add one.
- Each note has one plain-text comment thread, shown beside the note in a margin column on a wide screen and in a sheet
  that slides up over the note on a phone. A comment shows its author and time, and its author can delete it. The
  unread counts keep working: edits since the person last opened the note, and comments by anybody else.
- **BREAKING**: live co-editing, comment threads anchored to a passage, resolving, reactions, and the `@` mention menu
  go, with the ydoc snapshot and sync routes, the SSE note stream and its Redis channel, the thread routes, and the
  comment author lookup. One migration deletes every existing note and comment, drops the `ydoc` column and the
  `note_comment_threads` table, adds the version, and gives `note_comments` a note id and a text body. CarlNotes is
  prelaunch, so nothing in them needs keeping.
- `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`, `yjs`, `y-prosemirror`, and `y-protocols` leave
  `apps/web`; `@blocknote/core`, `@blocknote/server-util`, and `yjs` leave `apps/api`. `apps/web` gains
  `react-native-enriched-html` and a types-only shim for the React Native types its declarations import, so React
  Native's own global declarations stay out of the web's type space and its code stays out of the browser bundle.
- The save and comment request and response shapes live in `packages/contracts`, the calls in `packages/client`, and
  the debounced save in a `packages/core` hook, so the mobile note change reuses all three.
- Visibility, ownership, and every rule in `permissions.ts` stay as they are. The note table, the create flow, the
  badges, and their copy stay as they are.
- The scan recap's "Source notes" heading becomes "Source footnotes", set in the display font through a shared recap
  heading class.

## Capabilities

### New Capabilities

None. Save-and-sync takes over the `tasting-note-sync` capability and the plain thread takes over
`tasting-note-comments`.

### Modified Capabilities

- `tasting-notes`: a note's body is versioned sanitized HTML; the dialog opens the editor or the reader on the stored
  body; the editor offers rich text, lists, and a formatting toolbar in place of BlockNote's slash menu; the save status
  gains the conflict state; deleting a page or a note takes its comments with it.
- `tasting-note-sync`: every Yjs and SSE requirement goes. A note read returns the body with its version, a save writes
  the sanitized body only at the version it opened at and answers a conflict otherwise, the editor saves on a debounce
  and flushes on close, and the api sanitizes a saved body to the editor's tag set with images dropped.
- `tasting-note-comments`: anchoring, the threads panel, the `@` menu, resolving, reactions, the SQL mirror, and the SSE
  broadcast go. A note has one plain-text thread, shown beside the note on a wide screen and over it on a phone, whose
  routes enforce edit access for a post, author-only deletes, and zod payloads. Authors still resolve from the users
  table.
- `source-results` and `scan-history`: the chart's heading reads "Source footnotes" in place of "Source notes".
- `monitoring-analytics`: `note_thread_resolved` leaves the notes events, since nothing resolves a thread.

`note-badges` is untouched: an unread edit is still the body changing since the read time by somebody else, and an
unread comment is still a comment by somebody else since then.

## Impact

- `packages/db/schema/notes.ts` and one generated migration with a hand-added `delete from notes` first.
- `packages/contracts/notes.ts`, `payloads.ts`, `analyticsEvents.ts`; `packages/client/noteClient.ts`; a new
  `packages/core/hooks/useNoteBodySave.ts` with its test, holding the save schedule and the hook that reads it, and a
  new `packages/core/hooks/useNoteComments.ts`; a new `packages/nightshift/noteHtmlStyle.ts`.
- `apps/api/note/`: `notes.ts` rewritten around the save and comment routes, a new `noteHtml.ts` sanitizer and
  `noteComments.ts`, `noteBadges.ts` and `notePayloads.ts` trimmed, `noteYdoc.ts`, `noteStream.ts`, and
  `noteCommentThreads.ts` deleted with their tests; `apps/api/api.ts` and `api.test.ts` for the mount and the body
  limit.
- `apps/web/src/components/note/`: `NoteEditor.tsx` and `NoteStatic.tsx` rewritten, new `NoteToolbar.tsx`,
  `NoteComments.tsx`, and `NoteConflictNotice.tsx` with stories, `NoteDialog.tsx` and `NotesSection.tsx` changed,
  `useNoteSync.ts`, `noteProvider.ts`, `CommentMentions.tsx`, and `noteEditor.css` deleted; `globals.css`,
  `renderSafety.test.ts`, `noteStates.test.tsx`, `NotesSection.test.tsx`; `apps/web/package.json`, `tsconfig.json`,
  and the new `src/reactNativeTypes.d.ts`.
- Docs: `apps/docs/src/content/docs/feed/tasting-notes.md`, `README.md`, the root, `apps/api`, `apps/web`, and
  `packages/core` AGENTS.md files, the domain-model skill, the audit-structure drift list, the Nightshift inventory
  table, and six living specs through their deltas: `tasting-notes`, `tasting-note-sync`, `tasting-note-comments`,
  `source-results`, `scan-history`, and `monitoring-analytics`.
- The Source footnotes heading: `apps/web/src/components/common/SourceResultsChart.tsx` and its test,
  `RECAP_HEADING_CLASS` in `apps/web/src/lib/styleClasses.ts`, which `TopicScanRecap.tsx` shares, and the
  `source-footnotes.png` screenshot that `apps/docs/src/content/docs/topics/adding-sources.md` shows.
- The mobile app gets no note code. `react-native-enriched-html` 1.1.1 supports React Native 0.81 to 0.86, and
  `apps/mobile` runs 0.88, so the mobile note change pins the 1.2 line, which supports 0.88, and moves both apps to it
  together. The change does set the mobile app's icons (`apps/mobile/assets/icon.png` and `adaptive-icon.png`, with a
  matching `adaptiveIcon` `backgroundColor` in `app.config.ts`) and makes the sign-in screens' logo a link home with a
  44-point touch target in `apps/mobile/src/components/session/SessionScreen.tsx`.
