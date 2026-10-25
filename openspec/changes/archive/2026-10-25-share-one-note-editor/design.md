## Context

A tasting note today is a Yjs document. `apps/web/src/components/note/NoteEditor.tsx` mounts BlockNote with its
Mantine UI over a hand-written provider (`noteProvider.ts`, `useNoteSync.ts`) that posts Yjs updates to
`POST /api/notes/:id/updates`, listens on the SSE stream `GET /api/notes/:id/events`, and resyncs through
`GET /api/notes/:id/ydoc`. The api merges updates under a per-note advisory lock (`noteYdoc.ts`), fans them out over
an in-process emitter and the Redis channel `note_updates` (`noteStream.ts`), and regenerates the stored HTML 1.5 s
after the last merge through `@blocknote/server-util`, which pulls in JSDOM. Comments are BlockNote threads anchored
to marks in the document, written through nine REST routes in `noteCommentThreads.ts`, mirrored into
`note_comment_threads` and `note_comments`, with an `@` menu fed by `mentionableUsernames` on the page's notes
payload. The mobile app has no note code, and no native editor speaks Yjs.

`react-native-enriched-html` 1.1.1 (Software Mansion, MIT) exports `EnrichedTextInput` and `EnrichedText`. Its
`react-native` export condition is the Fabric component Metro resolves; its default export is a Tiptap 3.27.1 editor
plus DOMPurify that Vite resolves for the client and the server build alike. The web build makes no runtime import of
`react-native`: the one `processColor` import sits in a module only the native entry reaches. Its `.d.ts` files
import eight React Native types (`ColorValue`, `DimensionValue`, `NativeMethods`, `NativeSyntheticEvent`,
`ReturnKeyTypeOptions`, `TargetedEvent`, `TextStyle`, `ViewProps`), type-only. Both components call
`assertBrowserEnvironment` in their render body and throw without a DOM, so they are client-only by design. The
editor is uncontrolled: `defaultValue` once, then `ref.setValue()` and `ref.getHTML()`, with `onChangeHtml`,
`onChangeState`, and `onChangeSelection` events. Its HTML format, from the supported tags page: `<p>`, `<br>` for an
empty line, `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<a href>`, `<h1>` to `<h6>`, `<ul><li>`, `<ol><li>`,
`<ul data-type="checkbox"><li checked>`, `<blockquote><p>`, `<codeblock><p>`, plus `<img>` and `<mention>`, wrapped in
`<html>` on the way out. Lists are one level deep. Version 1.1.x supports React Native 0.81 to 0.86; the 1.2 line, on
GitHub main and the nightly tag, supports 0.82 to 0.88. `apps/mobile` runs 0.88 on Expo SDK 58.

## The spike

The web side was proved in `apps/web` on 2026-10-24 before this design was written. A throwaway route
`/_layout/spike-note-editor` rendered on the server with a placeholder and loaded a spike component through
`lazy(() => import(...))` behind a flag set in `useEffect`, the way the note dialog will. The component mounted
`EnrichedTextInput` with every construct in `defaultValue`, a toolbar read from `onChangeState`, `EnrichedText`
beside it, and a round trip: `getHTML()`, then `setValue()` of that result, then `getHTML()` again. The results:

- **Server render**: `curl` of the route without a session from the Vite dev server and from the api's production
  server build on port 3000 both returned 200 with the title and the placeholder and no editor markup. The server
  never imported the editor module. The editor needs no `ssr: false` route: the note dialog opens on a click, after
  hydration, and the lazy import keeps the package out of the server's module graph until then.
- **Round trip**: headings, bold, italic, underline, strikethrough, inline code, a link, bulleted, numbered, and
  checked and unchecked checkbox lists, a block quote, a code block, and an empty line all came back byte for byte
  (`round trip equal: true`). A `<script>`, an `onclick` handler, a `<span>`, and a `<font>` tag in the input were
  dropped by the package's own DOMPurify pass, with their text kept. The empty document's HTML is `<html><br></html>`.
- **Toolbar state**: placing the caret in bold text reported `bold.isActive: true`; every other key came as the
  documented `{ isActive, isConflicting, isBlocking }` object plus `alignment`.
- **Theme**: `htmlStyle` colors given as `var(--color-link)` and the other Nightshift variables passed straight
  through to the package's CSS custom properties, so the app's theme toggle restyled the editor and the display with
  no re-render. Both themes were checked in the browser pane.
- **Types**: `bunx tsc -b apps/web` failed with the package installed as is: React Native's global declarations
  (`react-native/src/types/globals.d.ts`, referenced from its types entry) merged into the DOM's `URL` and
  `URLSearchParams` and broke `.storybook/main.ts`. A 40-line shim at `apps/web/src/reactNativeTypes.d.ts` mapped to
  `react-native` through `tsconfig.json`'s `paths` declares the eight types the package's declarations import, and
  `tsc -b` passed with it. The spike used the package's real API through the shim with no `any`.
- **Bundle**: the client bundle never pulled in `react-native` (no `processColor` or `TurboModuleRegistry` in any
  chunk). Bun auto-installed `react-native@0.88.0` as the package's peer, 31 MB in the store, which nothing imports.
- **Size**: the baseline build at `738bf7da` has 7,438,997 bytes of client JavaScript and 372,719 bytes of CSS. The
  BlockNote editor chunk is 1,054,724 bytes (gzip 316.70 kB) with a 263,763-byte stylesheet (gzip 39.35 kB), and it
  loads a 429,053-byte emoji data chunk (gzip 82.21 kB). The spike's editor chunk, Tiptap and DOMPurify included,
  was 325,067 bytes (gzip 103.88 kB) with a 7,132-byte stylesheet (gzip 1.54 kB). Expected after the swap: about
  6,280,000 bytes of JavaScript (1.16 MB less, 16 percent) and about 116,000 bytes of CSS (69 percent less); on the
  note path, about 105 kB gzipped in place of about 438 kB.
- **Measured after the swap** (the apply's build of the finished change): 6,433,653 bytes of client JavaScript, down
  1,005,344 bytes (14 percent), and 106,584 bytes of CSS, down 266,135 bytes (71 percent). The note path is a shared
  chunk holding the editor package at 345,046 bytes (gzip 107.70 kB), the editor's own chunk with the toolbar, the
  thread, and the conflict notice at 194,608 bytes (gzip 63.06 kB), the reader's chunk at 13,954 bytes (gzip
  4.92 kB), and a 7,132-byte stylesheet (gzip 1.54 kB): about 177 kB gzipped in place of about 438 kB. No client chunk
  holds `processColor` or `TurboModuleRegistry`.
- **Pasted images**: a synthetic paste of HTML holding a remote `<img>` kept the image as an inline node, and
  `getHTML()` wrote it out. With `onPasteImages` left unset, a pasted image file inserts nothing. On the api's origin
  the image did not load: the content security policy's `img-src` allows only the app itself, blob and data urls,
  and three avatar hosts.
- **Sanitizer**: the proposed `sanitize-html` allowlist (decision 4) run over the round-trip output kept every editor
  tag, dropped the images, stripped the `<html>` wrapper, wrote `<br />` and `checked="checked"`, and was idempotent.
  Over hostile markup it dropped a `javascript:` href, `target` and `rel`, a `style` attribute, a `<mention>`, and a
  data-url image. Loaded back into the editor through `defaultValue`, that form round-tripped the same content.
- **A development-only crash**: with the spike's content loaded through `defaultValue`, the Vite dev server page
  sometimes threw `Cannot read properties of null (reading 'commands')` from inside the package's
  `useEffect(() => editor?.commands.normalizeBoldInStyledHeadings())` during React StrictMode's effect re-run,
  reading a Tiptap editor whose `destroy()` had nulled its command manager. The same url passed on one load and
  failed on the next, with the same input. The production build on port 3000 passed on every load. The apply pinned
  the cause: Tiptap's `useEditor` creates the editor during render and schedules its destruction one millisecond
  later unless an effect has mounted the component by then. A cold open of the dialog renders the lazily loaded
  editor and commits its effects in a later task, so the timer wins and the package's effects run on a destroyed
  editor. The spike only passed when a state update the editor sent before the mount forced an earlier flush. The
  dependency patch under `patches/` is the fix; see risks.
- **Compatibility**: the package's compatibility table puts React Native 0.88 outside 1.1.x. The web build does not
  care, so this change pins 1.1.1 for `apps/web`; the mobile note change moves both apps to the 1.2 line together.

The web side did not fall short, so the Tiptap-on-the-web alternative is not taken.

## Goals / Non-Goals

**Goals:**

- One editor component for the web and, later, the mobile app, writing one HTML format the api stores and sanitizes.
- Save-and-sync with a version check, where a lost race never loses what the person typed.
- One plain-text comment thread per note with the same permissions as today, and the unread counts unchanged.
- The contracts, the api client calls, and the save scheduling placed where the mobile change imports them as is.
- BlockNote, Mantine, Yjs, and JSDOM out of both apps, and the client bundle measured smaller.

**Non-Goals:**

- The mobile note screens. They come in their own change on the package's 1.2 line.
- Keeping existing notes or comments. The migration deletes them.
- Live presence, cursors, or live refresh of a note another person is editing. A conflict is found on save.
- Comment editing, replies, resolving, reactions, mentions, or notifications.
- Images, tables, nested lists, or text alignment in a note. The package has no nesting, and the sanitizer drops the
  rest.
- Any change to `permissions.ts`, the note table, the create flow, the badges, or their copy.

## Decisions

### 1. One package, resolved by condition, loaded in the browser only

`apps/web` depends on `react-native-enriched-html@1.1.1` exactly, like every other client library in its
`dependencies`, and imports `EnrichedTextInput` and `EnrichedText` from it. Vite takes the package's default export,
the Tiptap build; Metro will take the `react-native` condition. No `react-native-web`, no alias, and no Vite config
change: the spike showed Vite's default conditions already pick the web build, and excluding the package from
dependency optimization breaks its CommonJS `use-sync-external-store` shim, so it stays optimized.

Both components render only in the browser. `NoteDialog.tsx` keeps `lazy(() => import("./NoteEditor"))` for an
editor open and gains `lazy(() => import("./NoteStatic"))` for a read-only open, so the package and its stylesheet load
in one chunk when a note opens and never on the server. The dialog itself mounts after a click, so no route changes
its `ssr` setting. `noteStates.test.tsx` keeps asserting the lazy import, with its "never imports BlockNote
statically" check retargeted at the new package.

Alternative considered: a Tiptap editor of the web app's own, saving the same HTML subset. Rejected because the spike
passed, and two editors would mean two toolbars, two shortcut sets, and two normalizers to keep producing one format.

### 2. React Native's types through a shim, its code nowhere

`apps/web/src/reactNativeTypes.d.ts` declares the eight types the package's declarations import, as the spike's shim
did, and `apps/web/tsconfig.json` maps `"react-native"` to it under `paths`. The real `react-native` types are never
read, so their global declarations never merge into the web's DOM types. The shim is honest about what the web uses:
`ColorValue` is a string, `NativeSyntheticEvent<Payload>` is `{ nativeEvent: Payload }`, `TextStyle` names the fields
the package indexes and leaves the rest `unknown`.

Bun installs `react-native@0.88.0` as the package's peer. It is never imported by the web build and never reaches a
bundle, which the apply proves with the same grep the spike used. It also lands in the production image's
`node_modules` through `bun install --production`, 31 MB on disk. Alternatives: a dependency patch in `patches/`
marking the peer optional (rejected: a patch to re-apply on every version bump, for disk space in an image), or
`--omit=peer` on the image's install (rejected: it would drop every package's peers). The apply builds the image
once to confirm the install resolves with `apps/mobile` absent, as the image's dependency proof.

### 3. The body is sanitized HTML with an integer version, saved by compare-and-set

`notes` loses `ydoc` and gains `version integer not null default 1`. `html` stays the body and becomes the only
copy. `last_editor_user_id` and `body_edited_at` stay, now written by the save route itself. A note read
(`GET /api/notes/:id`) returns `version` beside `html` for every open.

The save is `PUT /api/notes/:id/body` with `{ html, version }` validated by `noteBodyPayload` in
`packages/contracts/payloads.ts`. The route rejects a visitor with a 404 before reading the body, applies its own
body limit, validates, loads the note through `loadVisibleNote`, requires `canEditNote`, sanitizes the HTML (decision
4), and then runs one statement:

```sql
update notes set html = $html, version = version + 1, last_editor_user_id = $user, body_edited_at = now()
where id = $id and version = $version returning version
```

A returned row is a 200 with the new `version`. No row means the stored version moved: the route answers 409 with
`{ error: "conflict", version, lastEditorUsername }` from one more read joined to `users`. A sanitized body equal to
the stored one writes nothing and answers the stored version, so a save that changes nothing bumps nothing and badges
nobody. The advisory lock, the transaction, and the debounced regeneration go: the conditional write is atomic on its
own.

`NOTE_HTML_MAX_CHARS = 512 * 1024` in `packages/contracts/notes.ts` bounds the payload's `html`, and the route's body
limit is `NOTE_HTML_MAX_CHARS * 4 + 1024` so any UTF-8 encoding of a string at the limit fits; `NOTE_BODY_PATH`
replaces `NOTE_SYNC_PATH` in `apps/api/api.ts`'s `OWN_BODY_LIMIT_PATHS`, and `api.test.ts` retargets its 413 and
visitor-404 cases. A larger body is a 413 or a 400, never a 500. `NOTE_UPDATE_MAX_CHARS` and `noteSyncPayload` go.

The empty document is stored as `""`: the editor writes `<html><br></html>` for it, the sanitizer leaves `<br />`,
and the route maps that one string to an empty body, so a note nobody has written in still reads as empty and still
shows its placeholder. `createNote` keeps setting `last_editor_user_id` and `body_edited_at` as today, so the
badge rule "a never-read note counts" holds unchanged.

Alternative considered: `updated_at` as the version. Rejected: a rename or a visibility change moves it, and a
millisecond clock is a worse equality key than a counter.

### 4. The sanitizer narrows to the editor's tag set

`sanitizeNoteHtml` moves from `noteYdoc.ts` to a new `apps/api/note/noteHtml.ts`, still `sanitize-html` 2.18.1, with
an allowlist read from the supported tags page instead of the defaults:

- `allowedTags`: `p`, `br`, `b`, `i`, `u`, `s`, `code`, `a`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `ul`, `ol`, `li`,
  `blockquote`, `codeblock`.
- `allowedAttributes`: `a: ["href"]`, `li: ["checked"]`, and `data-type` on `ul` only when it is exactly `checkbox`,
  through a `transformTags` entry, since `sanitize-html`'s value filter leaves an empty `data-type` behind and the
  package styles `ul[data-type]` as neither list.
- `allowedSchemes`: `http`, `https`, `mailto`, as today.

Everything else is dropped: `img` (images stay out), `mention`, `script` and `style` with their contents, `style`
attributes (so text alignment is gone too), event handlers, `target` and `rel`, and unknown tags with their text
kept. The `<html>` wrapper the editor writes is stripped as a disallowed tag with its content kept; the editor reads
the body back with or without it, as the spike showed. The sanitizer runs on every save and nowhere else; the stored
HTML is served as is, and the package's own DOMPurify pass on the client is a second layer, not the one that counts.
`renderSafety.test.ts` retargets its source assertions at `noteHtml.ts` and the save route's call.

### 5. Saving is scheduled by a core hook

`packages/core/hooks/useNoteBodySave.ts` owns the schedule, `toNoteBodySave`, DOM-free and React-free with its test
beside it, and the hook that reads it, so the mobile editor uses both unchanged. The hook takes the note id, the
version it opened at, and the save call from `packages/client/noteClient.ts`, and returns
`scheduleSave(html)`, `setSavedHtml(html)`, `resolveConflict(html, version)`, the status (`saving`, `saved`,
`unsaved`), and the conflict (`null` or `{ version, lastEditorUsername }`). The rules:

- `scheduleSave` keeps the latest HTML, strips any `<img>` tag from it, and starts or restarts a one-second timer;
  HTML equal to the last saved body cancels the timer instead. The status reads `saving` from the first change.
- At most one save is on its way; a change during it schedules one more after it returns. `saved` is reported only
  once nothing is pending and nothing is on its way.
- A 200 stores the returned version for the next save. A network failure or a 4xx other than 409 keeps the body
  pending, reports `unsaved`, and leaves it to the next change to retry; the web dialog toasts the reason, as today.
- A 409 sets the conflict, reports `unsaved`, and stops every further save until `resolveConflict(html, version)`
  takes the stored body as the saved one, takes its version, and clears the conflict. The hook does no fetch:
  `NoteEditor`'s `handleReload` fetches the note with `fetchNote`, passes its HTML to the editor's `setValue`, and
  then passes the HTML and the version to `resolveConflict`. `setSavedHtml(html)` sets the saved body without a save,
  so the editor's first normalized HTML of the stored body never counts as a change.
- `flushSave` on the schedule sends a pending save at once; the hook calls it when the editor unmounts, so closing the
  dialog sends the last keystrokes.

The dialog's conflict notice (`NoteConflictNotice.tsx`) sits above the editor: "Saved by @name since you opened it.
Copy anything you want to keep, then reload." with a Reload button. The status reads "Not saved" while it shows. The
old "too large to save" toast stays for a 413 or 400, reworded to say a copy is the way out.

Alternative considered: a periodic poll of the note's version while the dialog is open, to show a conflict before the
person types. Rejected for now: a conflict is rare between teammates, and the save already finds it; the hook's shape
allows adding a poll later without moving anything.

### 6. Comments are rows on the note

`note_comments` becomes `id` (`primaryId`), `note_id` (not null, cascading from `notes`), `author_user_id`
(set null on account close), `body text not null`, and the timestamps, with one index on `(note_id, created_at)`
that serves the list and the unread count. `thread_id`, the jsonb body, and `deleted_at` go with
`note_comment_threads`: the author deletes a comment outright, and nothing anchors to it. `NOTE_COMMENT_MAX_CHARS =
2000` and `noteCommentPayload` (`body` trimmed, 1 to that many characters) live in `packages/contracts`.

Routes in a new `apps/api/note/noteComments.ts`, mounted beside `notesRoute`:

- `GET /api/notes/:id/comments`, view access, oldest first, each as `NoteComment`: `id`, `body`, `createdAt`,
  `author` (`{ id, username, avatarUrl }` or `null` for a closed account), and `canDelete` for the caller.
- `POST /api/notes/:id/comments` with `{ body }`, edit access through `canEditNote`, tracking `note_comment_added`
  with the note id alone.
- `DELETE /api/notes/:id/comments/:commentId`, the author alone; a note's deletion cascades the rest.

Every rejection is a 404 like the other note routes, and a bad body is a 400 before any query, in the existing
`stubConnectionPool` test shape. `GET /api/notes/:id/users` goes: a comment includes its author. A comment does not
move the note's `updated_at`: the note's row did not change, and the unread comment count already says a comment
arrived. `loadUnreadCommentCounts` in `noteBadges.ts` counts `note_comments` by `note_id` directly, and
`isNoteBodyChanged` with its comment-mark stripping goes, since the save route compares the two bodies as strings.

The web shows the thread for anyone who may read the note, with the composer for anyone with edit access. The layout
keeps today's shape: a `w-64` column beside the page card on a wide screen, open by default, a sheet over the note on
a phone, and the header toggle reading "Show comments" or "Hide comments". `packages/core/hooks/useNoteComments.ts`
loads the list when the dialog opens, appends the comment the api returns after a post, and removes a deleted comment
from the list in place; there is no second load and no live push.

### 7. The note's style lives in Nightshift

`packages/nightshift/noteHtmlStyle.ts` exports `toNoteHtmlStyle(palette)`, a pure function from six color tokens
(`foreground`, `mutedForeground`, `muted`, `border`, `link`, `primary`) to the object an app passes as `htmlStyle`,
typed structurally as `NoteHtmlStyle` so Nightshift depends on nothing new and each app's assignment is checked
against the package's `HtmlStyle`. Sizes come from the type roles through `toPixels`: `h1` at `pageTitle`, `h2` at
`sectionHeading`, `h3` at `bodyLarge`, all bold; the block quote's border from `border` and its text from
`mutedForeground`; inline code and the code block on `muted` in `foreground`, the block's radius from
`toRadiusPixels("md")`; links in `link`, underlined; bullets and numbers in `foreground`; the checkbox in `primary`.
The web passes the palette as CSS variables (`var(--color-link)` and the rest, through a new `toColorCssVariable`
beside `toKebabName` in `theme.ts`), so the theme toggle restyles an open note with no re-render; a mobile note
screen will pass `latte` or `darkRoast` for its mode when the mobile note change lands. Headings render in the body
family at those sizes on both platforms: the package sets no font family per tag, and the mobile app has to match the
web.

Alternative considered: keeping the style object in `apps/web` and copying it to the mobile app. Rejected: two copies
of the same numbers, which is what Nightshift exists to prevent.

### 8. The toolbar is the app's own

`NoteToolbar.tsx` renders, in order: bold, italic, underline, strikethrough, inline code; heading 1, 2, and 3; bulleted,
numbered, and check lists; quote and code block; link. Each is the Nightshift `Button` at `variant="ghost"` and
`size="icon-sm"` with a Lucide icon, `aria-pressed` from `isActive`, `MENU_OPTION_SELECTED_CLASS` while pressed,
`disabled` from `isBlocking`, and a tooltip naming it. The state comes from `onChangeState`; each press calls the
matching ref method and refocuses the editor. The link control opens a popover with an `Input` for the url and
applies `setLink` over the current selection from `onChangeSelection`, or removes the link when the selection already
has one; it is enabled only while the selection sits inside one paragraph (risk 3). The bar scrolls sideways on a phone
with the `scrollbar-none` utility `noteEditor.css` used, which stays in `globals.css` for it. The package's keyboard
shortcuts and its default text shortcuts (`- ` and `1. `) stay on. There is no slash menu, no image, mention, color,
or alignment control, and `h4` to `h6` are readable but not offered.

### 9. The read-only open renders the package's display component

`NoteStatic.tsx` renders `EnrichedText` with the stored HTML, the same `htmlStyle`, and an `onLinkPress` that opens
the url in a new tab with `noopener`. The editor passes no `onLinkPress`: a click in the editor places the caret, and
a link opens from the Open button of the toolbar's link control. The reader is lazy-loaded like the editor, so the
`dangerouslySetInnerHTML` exemption for it in `renderSafety.test.ts` goes and the rule tightens to zero in the ui.
`NotesSection.test.tsx`'s static render test moves to the component's source, since `EnrichedText` throws without a
DOM in `bun test`.

### 10. One migration, deleting first

The schema change is one `drizzle-kit generate` run, and the generated SQL gets `delete from notes;` as its first
statement, before the `alter` statements, so the column type change on `note_comments` and the new not-null columns
apply to empty tables. Deleting `notes` cascades to the old threads, comments, and reads through the existing foreign
keys. The migration runs on deploy as every migration does. There is no rollback path for the data, by decision: the
notes and comments are prelaunch test content.

### 11. What leaves, what arrives

Out of `apps/web/package.json`: `@blocknote/core`, `@blocknote/mantine`, `@blocknote/react`, `yjs`, `y-prosemirror`,
`y-protocols`. Out of `apps/api/package.json`: `@blocknote/core`, `@blocknote/server-util`, `yjs`. In:
`react-native-enriched-html@1.1.1` in `apps/web`. `sanitize-html` stays. `bunfig.toml`'s three-day
`minimumReleaseAge` is satisfied by a version from August. The stale `noteEditor.css` import in `globals.css` goes
with the file.

Files deleted, with their tests: `apps/api/note/noteYdoc.ts`, `noteStream.ts`, `noteCommentThreads.ts`;
`apps/web/src/components/note/useNoteSync.ts`, `noteProvider.ts`, `CommentMentions.tsx`, `noteEditor.css`. The
removed names, routes, column, table, channel, and dependencies are appended to the audit-structure drift list. The
root AGENTS.md's class rule loses its one example (`noteProvider.ts`); it names `apps/web/src/components/chat`'s
stream hook state instead, or drops the clause, whichever reads true at apply time.

## Risks / Trade-offs

- [The development crash from the spike recurs in the real dialog] → It did, on every cold open of the dialog once
  nothing forced an early flush. `patches/react-native-enriched-html@1.1.1.patch` passes `immediatelyRender: false`
  to Tiptap's `useEditor`, so the editor is created in the mount effect and no destruction timer races the commit,
  and it lets the package's change hooks, mention hook, and ref methods take the null editor of the first render.
  Six cold opens in a row then rendered the editor with no console error. The patch stays until a release makes
  the editor's creation safe, and the issue goes upstream with the repro.
- [A lost race discards what the second person typed if they reload without copying] → The notice says to copy first,
  the editor keeps the text until the reload, and no save is sent after the conflict, so nothing is overwritten on the
  server; the trade is accepted in place of a merge engine.
- [`setLink` corrupts a selection spanning blocks on 1.1.1 (issue 757, fixed on main)] → The link control is enabled
  only for a selection inside one paragraph, read from `onChangeSelection`; the 1.2 line lifts the limit.
- [A click below the first line does not focus the editor when it has a minimum height (issue 793, fixed on main)] →
  The page card's click handler focuses the editor when the click lands outside the editor element.
- [Pasted images show in the editor until the next open] → The hook strips `<img>` from every save and the sanitizer
  drops any that slip through; the person sees the image vanish on reopen, and the docs say images are not kept. The
  content security policy already blocks remote images on the app's origin.
- [React Native's 31 MB peer lands in the production image] → Accepted for now; the image build confirms the install;
  the patch alternative is recorded in decision 2 if the size ever matters.
- [HTML normalization differs across platforms (entities, whitespace between list tags, issues 818 and 829)] → The
  version check and the badge compare are on the sanitized string the api stores, which both platforms load as is;
  the mobile change tests its round trip against the same fixtures before it ships.
- [Nested lists and tables pasted from elsewhere flatten or vanish] → Documented in the docs page; the package has no
  nesting on its roadmap yet.
- [A comment no longer bumps the note's `updated_at`, so the table's Updated column stops moving on comments] → The
  unread badge covers it; if the column should move, the post can touch the row later with one statement.

## Migration Plan

1. Land the change on main. The migration deletes every note and comment and reshapes the tables; the deploy runs
   it before the new api starts serving, as every migration does.
2. The new api serves the save and comment routes and no longer serves the ydoc, update, event, thread, or user
   routes; a browser holding the old client reloads on its next navigation and takes the new chunks.
3. Rollback is a redeploy of the previous image with a hand-written reverse migration that restores the columns and
   the table empty; the deleted content is gone either way, by decision.
4. The docs embed runs on deploy, so the rewritten tasting-notes page reaches Carl without a manual step.

## Open Questions

- Whether a comment should move the note's `updated_at` so the table's Updated column counts comment activity, as it
  did by accident under Yjs. The design says no; a one-line change in the post route flips it.
