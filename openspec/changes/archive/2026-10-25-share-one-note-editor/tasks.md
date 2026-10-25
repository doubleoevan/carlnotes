## 1. Dependencies and types

- [x] 1.1 In `apps/web/package.json` add `react-native-enriched-html` at exactly `1.1.1` and remove `@blocknote/core`,
      `@blocknote/mantine`, `@blocknote/react`, `yjs`, `y-prosemirror`, and `y-protocols`; in `apps/api/package.json`
      remove `@blocknote/core`, `@blocknote/server-util`, and `yjs`; run `bun install` and confirm no other workspace
      still names them.
- [x] 1.2 Add `apps/web/src/reactNativeTypes.d.ts` with the eight types the package's declarations import, map
      `react-native` to it under `paths` in `apps/web/tsconfig.json`, and confirm `bunx tsc -b apps/web` passes.

## 2. Contracts, client, and core

- [x] 2.1 In `packages/contracts/notes.ts` add `NOTE_HTML_MAX_CHARS`, `NOTE_COMMENT_MAX_CHARS`, `version` on
      `NoteResponse`, the `NoteComment` type, and the save result shapes; drop `NOTE_UPDATE_MAX_CHARS`,
      `NoteCommentUser`, and `mentionableUsernames`; rename `isTopicOwner` to `isNoteOwner` in the contract, the api,
      and the web.
- [x] 2.2 In `packages/contracts/payloads.ts` add `noteBodyPayload` and `noteCommentPayload` and drop
      `noteSyncPayload` and the four thread payloads; in `analyticsEvents.ts` drop `note_thread_resolved` and
      `isThreadStart`.
- [x] 2.3 In `packages/client/noteClient.ts` add `saveNoteBody`, `fetchNoteComments`, `postNoteComment`, and
      `deleteNoteComment`, return `version` from `fetchNote`, and drop `fetchNoteYdoc`, `sendNoteUpdate`,
      `toNoteEventsUrl`, `toNoteThreadsUrl`, `fetchNoteUsers`, and the base64 helpers.
- [x] 2.4 Add `packages/core/hooks/useNoteBodySave.ts` with the schedule, `toNoteBodySave` (the debounce, the
      one-in-flight-one-queued rule, the equal-body skip, the `img` strip, the failure retry, the conflict stop and
      reload, and `flushSave`), and the hook that reads it, with `useNoteBodySave.test.ts` beside it covering each
      rule.
- [x] 2.5 Revise `packages/core/AGENTS.md` for the new hook and the stream reconnect line that named the note stream.

## 3. Nightshift

- [x] 3.1 Add `packages/nightshift/noteHtmlStyle.ts` with the `NoteHtmlStyle` type and `toNoteHtmlStyle(palette)`
      from the type roles and radius, `toColorCssVariable` in `theme.ts`, tests for both, and the AGENTS.md entry.

## 4. Data

- [x] 4.1 In `packages/db/schema/notes.ts` drop `ydoc` and `noteCommentThreads`, add `version`, and reshape
      `noteComments` to `id`, `noteId`, `authorUserId`, `body` text, and the timestamps with the
      `(note_id, created_at)` index; revise `packages/db/AGENTS.md` if it lists the tables.
- [x] 4.2 Run `bun run db:generate`, put `delete from notes;` with its statement breakpoint first in the generated
      migration, and run `bun run db:migrate` locally.

## 5. API

- [x] 5.1 Add `apps/api/note/noteHtml.ts` with `sanitizeNoteHtml` on the editor's tag set, the `data-type`
      transform, and the empty-body rule, with tests for every editor tag, hostile markup, a pasted image, the empty
      document, and idempotence.
- [x] 5.2 In `apps/api/note/notes.ts` drop the ydoc, updates, events, and users routes and the stream helper, return
      `version` from the note read, and add `PUT /notes/:id/body` as `NOTE_BODY_PATH` with the visitor rejection
      before the body, its own body limit, the payload, `canEditNote`, the sanitizer, the unchanged-body short
      circuit, the conditional write, and the 409 naming the last editor; test the version match, the stale version,
      no edit access, an oversized body, and an unchanged body with the stubbed connection pool.
- [x] 5.3 Add `apps/api/note/noteComments.ts` with the list, post, and author-only delete routes, mount it in
      `apps/api/api.ts`, and test the 400 before any query, the 404 without edit access, the author-only delete, and
      the list shape under each visibility.
- [x] 5.4 In `noteBadges.ts` count `note_comments` by `note_id` and drop `isNoteBodyChanged` with its mark pattern; in
      `notePayloads.ts` insert `html ""` and `version 1` on create and drop the mentionable usernames loaders; trim
      `noteBadges.test.ts` and add the unread counts after an edit and after a comment by another user.
- [x] 5.5 Delete `noteYdoc.ts`, `noteStream.ts`, `noteCommentThreads.ts`, and their tests; replace `NOTE_SYNC_PATH`
      with `NOTE_BODY_PATH` in `OWN_BODY_LIMIT_PATHS`; retarget `apps/api/api.test.ts` at the save route.
- [x] 5.6 Rewrite the note paragraphs of `apps/api/AGENTS.md`, the body limit sentence included.

## 6. Web

- [x] 6.1 Rewrite `NoteEditor.tsx` around `EnrichedTextInput`: the stored HTML as `defaultValue`, the placeholder, the
      shared `htmlStyle` through CSS variables, `onChangeHtml` into the save hook, `onChangeState` and
      `onChangeSelection` into the toolbar, the click-to-focus on the page card, the flush on unmount, and today's
      layout with the comments column and sheet.
- [x] 6.2 Add `NoteToolbar.tsx` with the control list, the lit and disabled states, tooltips, the link popover limited
      to one paragraph, and the sideways scroll on a phone.
- [x] 6.3 Add `NoteComments.tsx` with the list, the composer for edit access, and the author's delete, over
      `packages/core/hooks/useNoteComments.ts`, which loads the thread on open, appends the posted comment, and removes
      a deleted one.
- [x] 6.4 Add `NoteConflictNotice.tsx`; in `NoteDialog.tsx` fetch the note's HTML and version for every open, hold the
      conflict state and the reload, drop `mentionableUsernames`, lazy-load `NoteStatic`, and reword the save toasts.
- [x] 6.5 Rewrite `NoteStatic.tsx` around `EnrichedText` with `onLinkPress`; drop the pass-through in
      `NotesSection.tsx`.
- [x] 6.6 Delete `useNoteSync.ts`, `noteProvider.ts` and its test, `CommentMentions.tsx`, and `noteEditor.css`; drop
      the import in `globals.css` and keep `scrollbar-none` for the toolbar.
- [x] 6.7 Revise `noteStates.test.tsx` (the lazy import, no static import of the package, the footer),
      `NotesSection.test.tsx` (the static body), and `renderSafety.test.ts` (the sanitizer in `noteHtml.ts`, the save
      route's call, and zero `dangerouslySetInnerHTML` in the ui).
- [x] 6.8 Add `NoteEditor.stories.tsx`, `NoteToolbar.stories.tsx`, `NoteComments.stories.tsx`, and
      `NoteConflictNotice.stories.tsx`, each in light and dark, and run `bun run build:storybook`.
- [x] 6.9 Rewrite the `components/note/` bullet of `apps/web/AGENTS.md` and the `noteEditor.css` clause of
      `apps/web/src/nightshift/inventoryTable.md`.

## 7. Docs and drift

- [x] 7.1 Rewrite `apps/docs/src/content/docs/feed/tasting-notes.md`: the description, the intro, Writing together as
      saving with a conflict, Comments as one thread, the "commenting in place" bullet, and a new
      `notes-note-open.png`.
- [x] 7.2 Rewrite the note half of `README.md`'s Live updates, the class rule example and the routing table rows in the
      root `AGENTS.md`, the Note rows of the domain-model skill in both copies (the body, the version, the comment),
      the audit-structure drift list with every removed name, and the stream phrase in
      `openspec/changes/split-web-from-api/design.md`.

## 8. Verify

- [x] 8.1 `bun run check` passes.
- [x] 8.2 `bun run build:ui`; record the client JavaScript and CSS totals and the note chunk sizes against the baseline
      in `design.md`, and confirm no client chunk holds `processColor` or `TurboModuleRegistry`.
- [x] 8.3 In the browser on the dev server and on the api's built ui: open a note as an editor and as a reader in
      light and dark and at phone width; type and apply every control; save and reopen; force a conflict from a second
      session and reload; post and delete a comment; paste an image and reopen; confirm a public topic page's server
      render holds no editor markup; load the dialog repeatedly on the dev server for the StrictMode crash and apply
      the patch decision from the design if it recurs.
- [x] 8.4 Build the Docker image once to prove the install resolves without `apps/mobile`.
