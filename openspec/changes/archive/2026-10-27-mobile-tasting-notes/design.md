# Design

## Context

See [proposal.md](proposal.md) for scope and motivation. This is Prompt 46, including the unfinished reading work carried from Prompt 45.

The initial implementation provided these data and presentation foundations:

| Area | Observed implementation | Remaining work |
| --- | --- | --- |
| Notes table | Both apps adapt `packages/core/components/NotesTable.tsx`; native selection and creation open web handoffs. | Native navigation, creation, and badges. |
| Editor | Web uses `react-native-enriched-html` 1.1.1, with a committed web initialization patch. | Add that same version to mobile and rebuild native clients. |
| Saving | `useNoteBodySave.ts` owns the 1,000 ms debounce, one in-flight save, one pending body, and conflicts. | Expose flush/retry and lifecycle state for background saves and durable drafts. |
| Comments | `useNoteComments.ts` owns fetch, post, and delete. Web `NoteComments.tsx` owns presentation. | Share presentation and distinguish request failure from an empty thread. |
| Badges | `noteBadgeStore.ts` owns counts and optimistic suppression. Web polls from `AppChatPanel.tsx` every 45 seconds. | Native polling, acknowledged reads, stale-response guards, and account reset. |
| Note styles | `packages/nightshift/noteHtmlStyle.ts` owns editor/display styles; web passes CSS variables. | Native passes the active palette and body type role. |
| Recaps | Both apps use shared `TopicScanRecap`, `SafeNoteLink`, and numbered Finding components. | One pure safety transform replaces independent renderer policies. |
| Finding details | Native `TopicResourceInfo.tsx` retains the sheet through mutations and uses `toNotesMarkdown`. | Native Markdown sharing and remaining runtime checks. |

Discovery found correctness gaps relevant to this change. `fetchNote` collapses inaccessible notes and transport failures into `null`. Comments and badges collapse HTTP errors into empty arrays. `sendNoteRead` ignores HTTP failure. The badge store has no explicit account lifetime. The save controller's conflict branch can replace a newer pending body with the older in-flight body. These need shared fixes, not mobile workarounds.

The web source and its existing stories are the implementation references. This planning pass did not claim new rendered comparisons or device verification.

## Goals / Non-Goals

**Goals:** Keep one maintained implementation for portable composition and state. Separate native storage, keyboard, navigation, and browser APIs from universal modules. Preserve fresh server permission gates and recover every durably written draft without silently changing its base version.

**Non-Goals:** Live co-editing, offline note creation or comment queues, a new Finding route, a second API, or replacement of the delivered Feed. Native Admin, podcast playback, chat, and broader live badge counts remain separate. No database migration is needed. The app's existing authenticated navigation remains; this change does not introduce visitor browsing.

## Decisions

### 1. Share the existing note components through platform adapters

Extract portable composition before writing native counterparts. Use the existing core pattern: typed element slots and callbacks, with adapters declared at module scope. Do not import DOM, React Native, routers, or the editor package into core.

| Concern | Shared implementation | Platform adapter and reason |
| --- | --- | --- |
| Note body/editor lifecycle | `core/components/NoteEditor.tsx`, the existing save hook, and normalized editor events | Each app imports `EnrichedTextInput`; native views and web refs have different types and layouts. |
| Read-only body | `core/components/NoteStatic.tsx` with an injected display element | Each app imports the same library's `EnrichedText`; links use the app's existing opener. |
| Toolbar | `core/lib/noteFormats.ts` plus `core/components/NoteToolbar.tsx` | DOM Button/tooltip/popover versus native Button, horizontal scrolling, and link sheet. |
| Comments | `core/components/NoteComments.tsx` with `useNoteComments` | Avatar/profile links, text input, keyboard, and container placement differ. |
| Conflict notice | `core/components/NoteConflictNotice.tsx` | DOM alert versus native live-region announcement; both retain the same message and Reload action. |
| Creation | `core/components/CreateNote.tsx` with shared visibility/copy rules | Web dialog versus the existing native `Sheet`, input, and anchored `Select`. |
| Save status and visibility copy | A small `core/lib/noteLabels.ts` used by both wrappers | Platform text elements only; no second set of strings. |
| Notes table and recaps | Existing core components | Keep existing wrappers and stories; change their slots and callbacks. |

Keep file and export names aligned with web. `NoteScreen` is the route component because Expo renders a native screen, while web retains `NoteDialog`. Avoid a generic form or editor framework. If a component is only a platform container, leave that container local.

Add `app/topics/[topicId]/notes/[noteId].tsx` and `app/teams/[teamId]/notes/[noteId].tsx`. Both use `NoteScreen`, retain their owning page context, and verify membership in that page's visible note list. Fetch fresh `NoteResponse` permissions before choosing editor or reader. Returning updates the owning page's note list without resetting its sorting or pagination.

The dependency is the same `react-native-enriched-html` package already used on web. Its [display and editor components use the same HTML format](https://docs.swmansion.com/react-native-enriched-html/core-functionalities/rendering-rich-text/). Native builds need the library; web keeps its existing lazy imports and SSR patch.

### 2. Match web permissions; place native comments below the note

The user explicitly selected web permission parity during planning on 2026-10-26. Use `canEdit` for body editing, renaming, and the comment composer; `isNoteOwner` for visibility; `canDelete` for note deletion. A comment's `canDelete` remains author-only. This supersedes the pasted prompt's creator-only management wording.

The native screen shows the full oldest-first thread below the note, as the user requested. Web keeps its side column and phone sheet. This is a documented layout adaptation, not omitted content. Update the comments spec, docs, and domain guidance to distinguish native screens from phone browsers.

Use fresh note permission fields, not only the table row captured at navigation. Confirm deletion with the web's words through the native alert. Keep failed submissions in place. The shared comment component owns draft text, pending state, append/delete behavior, and the closed-account fallback.

Improve existing client outcomes without changing endpoints. Add an opt-in strict read mode that preserves 404 as missing and rejects transport/5xx failures. Return an acknowledged result from `sendNoteRead`. Make shared comment and badge consumers handle failures explicitly. Distinguish an unavailable note/save from a retryable error, including when permissions change after opening. Update all affected web callers in the same change.

### 3. Share formats and commands, not just their labels

`noteFormats.ts` contains the web's ordered control groups, format identifiers, labels/accessibility names, state keys, and command descriptors. It imports no native or DOM types. A structural editor-command interface allows both adapters to execute the same descriptors.

The format list is bold, italic, underline, strikethrough, inline code, headings 1–3, bulleted list, numbered list, checklist, quote, code block, and links. Preserve the current link editor's add/edit/remove/open actions and its single-paragraph selection rule. Move URL validation with that behavior; accept HTTP, HTTPS, and mailto, with HTTPS for a bare host. Block unsupported schemes before applying or opening a link.

The shared toolbar reads `isActive` and `isBlocking` from normalized `onChangeState` events. Native uses Nightshift ghost Buttons, Lucide equivalents, selected fills, and platform touch targets. Toolbar presses must not drop the editor selection. Link entry captures the intended range before moving focus.

Use `toNoteHtmlStyle` in both apps. Notes use Karla/body headings; model recap headings use Architects Daughter. Do not conflate those roles. The native editor style includes text scaling and active Nightshift colors rather than hard-coded colors. Reuse the existing editor normalization baseline so mounting an untouched body does not autosave it.

The library supports [single-level lists and a fixed HTML tag set](https://docs.swmansion.com/react-native-enriched-html/misc/known-limitations/). Keep web's normalization for pasted lists/tables, omit image insertion, and strip images from outgoing HTML. Server sanitization remains authoritative. Verify actual native paste behavior against 1.1.1 rather than assuming every feature in current upstream documentation exists in that pinned version.

### 4. Give the keyboard one native layout owner

Use a screen-level keyboard-avoiding frame, not a bottom-sheet editor or WebView. On iOS, its padding accounts for the safe area and measured header. On Android, use the resized window and avoid adding keyboard height twice. The full-width toolbar stays below the title and above the scrolling body, matching the web's order. Reuse the orange scrollbox indicator horizontally to expose additional formats. Metadata receives 16 points of top padding. The user's October 26 review selected this placement. Show a text Done control below the body while the software keyboard is open; autosave needs no save button. A top-right Close note control uses the web's X icon, returns to the existing Topic route and complements iOS edge-swipe navigation. Comment deletion requires confirmation on both clients, using shared wording with the existing web dialog and native alert.

The editor keeps its internal native scrolling enabled in a bounded viewport. Size that viewport to the available space after header, toolbar, and insets. The outer page scrolls the body and comments below the fixed metadata and formatting controls. Native text scrolling keeps the caret visible within that viewport. Read-only content uses the ordinary page scroll.

This avoids an unbounded editor whose bottom sits behind the keyboard. The library documents [internal scrolling and selection events](https://docs.swmansion.com/react-native-enriched-html/api-reference/enriched-text-input/). Its global blur limitation means explicit dismissal calls the editor's `blur()`; do not rely on `Keyboard.dismiss()` alone. Validate nested scroll gestures and caret visibility on both operating systems, including enlarged text and hardware keyboards. Do not add a keyboard library unless those specific checks expose a missing native behavior.

### 5. Extend the existing save controller for durable working copies

Keep `NOTE_SAVE_DEBOUNCE_MS = 1000`, one save in flight, and one latest waiting body. Expose flush and retry from the existing hook. Add observable draft state or narrow callbacks so persistence can track the latest HTML, base version, revision, and conflict without reading private controller state.

Correct the conflict path to keep the newest text, including changes during an in-flight request and changes after a conflict. A conflict blocks transport, not local draft capture. Reload replaces the body only after a successful fetch, following the existing warning to copy anything worth keeping. Failure leaves the current text intact.

Keep pure draft transitions in `core/lib/noteDrafts.ts`, beside tests. Store and lifecycle operations stay in mobile. One account-owned `noteDraftStore.ts` manages drafts, active save controllers, ordered storage writes, and reconnect attempts. It is a module, not a singleton class or generic mutation queue. An open editor and reconnect processing share one controller per note, so they cannot save concurrently.

A persisted record includes schema version, account id, note id, owning Topic or Team context, note name, latest HTML, original base version, local revision, and conflict state. It retains the last confirmed editing grant only to recover that account's own draft offline. Online reads always revalidate access. A draft is never used to populate another account or to expose a server note after a known access rejection.

Use the already-installed AsyncStorage through a thin adapter. Keep keys under an account-specific note-draft prefix, separate from `carlnotes:feed:<userId>`. Do not apply feed build/runtime invalidation to unsent work. Persist accepted HTML changes immediately through an ordered, coalescing writer. Storage failure keeps text in memory and reports that device recovery is unavailable; it must not claim durability.

When the note list cannot load offline, show recoverable draft entries for that Topic from the current account's registry. They link to the same note route and clearly represent local drafts. Do not manufacture server notes or enable new offline creation. A cold offline open with no draft remains unavailable.

### 6. Reconnect and cleanup preserve version and account boundaries

AppState leaving active flushes the latest pending body immediately. Durability comes from prior local writes; iOS or Android can suspend the network request. Reconnection and foreground activation retry drafts, including closed notes, after checking the active account and note permissions. A failed request retains work; a 409 retains the original version and conflict. No background task service is added.

| Transition | Required result |
| --- | --- |
| Save accepted; no newer revision | Delete only that acknowledged draft. |
| Save accepted while more text exists | Keep newer text, advance its base to the acknowledged version, then save it. |
| Response lost after server acceptance | Retry the original base; accept the existing conflict response rather than guessing a new base. |
| Conflict | Keep the latest editor text and durable record; stop automatic saves. |
| Reload accepted | Replace text with the fetched body/version and remove the deliberately discarded draft. |
| Network/server failure | Retain the draft; retry on a later connectivity, foreground, or edit trigger without a tight loop. |
| Validation/size failure | Retain text; require correction instead of repeated automatic submissions. |
| Access missing or revoked | Stop retries, hide inaccessible content, and retire the forbidden note's draft. A remaining read-only grant allows no replay. |
| Successful note deletion | Retire its controller and remove its draft. |
| Successful sign out/deletion, revocation, account replacement | Hide content, retire controllers, invalidate callbacks, drain accepted writes, then remove the old account's records. |
| Failed sign out/deletion | Retain the session's recoverable work. |

Extend `sessionExit.ts` and the account provider to capture the exiting account's cleanup, as query cleanup already does. Never clear drafts merely because the app process or a route unmounts. Fence asynchronous work by account lifetime and local revision. A late save response cannot delete newer work, and a delayed write cannot recreate retired data. Bind every outgoing request to the captured active account before dispatch.

### 7. Share acknowledged badge state across client refreshes

Move note-specific polling out of the web chat component into a shared lifecycle hook with platform focus/connectivity adapters. Keep the existing 45-second interval, plus an initial read and foreground/reconnect refresh. Only the active account publishes results.

Add explicit account reset and read-failure rollback to `noteBadgeStore.ts`. A successful note open clears local badges and sends the read record. A rejected acknowledgement removes tentative suppression. After acceptance, refetch badges and release suppression so later edits can count even if they arrived before a zero-count poll.

Use the shared NotesTable badge slot, the native Topic heading, and the section heading. Extract the web's count formatting and badge content into portable composition; render the outline badge with native elements and accessible details. Web's other badge placements remain intact. Cross-client clearing is eventual through the server and polling, not a new socket or a shared in-memory store across devices.

### 8. Keep the delivered Markdown renderer and share a safe tree

Retain `markdown-to-jsx` 9.10.3 with its current patch, and `markdown-to-jsx/native` for native rendering. The package exposes a parser and [platform-specific AST rendering](https://github.com/quantizor/markdown-to-jsx). Both existing adapters already render the required recap subset. Adding `react-native-enriched-markdown` or Expo DOM would introduce another renderer without a demonstrated missing requirement.

Add `core/lib/safeNoteMarkdown.ts`. Use the package's non-UI parser entry, declare it in core, and return a transformed AST. Recursively remove image nodes; replace raw-HTML interpretation and disallowed links with inert text nodes. Allow only exact stored HTTP(S) destinations. Handle inline, reference, and autolinks uniformly, and never serialize unsafe text into Markdown that a second parse could autolink. Unknown nodes fail to inert text rather than arbitrary components or resource loads.

Raw HTML wording needs precision: the request says remove raw HTML, while the existing spec and `TopicScanRecap.test.tsx` require its literal characters. Remove HTML nodes as executable markup, keeping their characters as text. Images render nothing. Preserve allowed formatting and the original web tests. Keep `SafeNoteLink` as a final presentation guard while the pure transform owns policy.

The web adapter renders the safe tree with DOM elements; the native adapter renders it with native elements. Both share the heading treatment for levels 1–6 through Nightshift roles. Keep existing paragraph/list spacing, bounded recap composition, Source footnotes, and copy format. This decision covers delivered recap reading; it does not promise untested native chat streaming or wide-table behavior for future changes.

### 9. Reconcile Prompt 45 explicitly

| Earlier proposal | Current evidence | Selected behavior |
| --- | --- | --- |
| Enriched Markdown, with Expo DOM fallback | Both recap adapters use markdown-to-jsx; native uses no WebView for recap text. | Keep the existing parser/renderer and share the safety transform. |
| Collapsed recap above Findings | `TopicPage.tsx` and native Topic content put Findings before Topic information; Topic roast holds the recap after the prompt. | Preserve this web order and existing expansion; add no duplicate recap. |
| Opening a Finding screen records an open | `TopicResource` opens details without the shared open handler; explicit source links and actual inline playback call it. | Keep inspection separate from source opening. Add tests for links, previews, and first playback. |
| Raw HTML removal | Web expects literal HTML characters and no interpreted markup. | Remove interpretation, preserve inert characters, remove images. |
| Creator-only management | Current contracts distinguish edit, ownership, and delete permission; the user selected parity. | Keep those permission fields unchanged. |
| Phone comment sheet | Web uses a sheet; the new request explicitly asks for the thread below the native note. | Preserve web; show the native thread below. |

Update the [Notion Mobile decision](https://app.notion.com/p/3c462400378d81a4b82efc175f03c807) during implementation. Its Reading and Markdown row still names Enriched Markdown. Its Design system row also predates portable component extraction. Update the affected reading, reuse, and offline-draft statements without changing unrelated roadmap decisions.

### 10. Share Finding Markdown through the native system sheet

Keep `toNotesMarkdown` as the only content builder. Add `ShareMarkdownButton.tsx` beside the existing native copy control and expose an optional scrollbox action slot, so the Finding popup can offer both. Use React Native `Share.share` with the Markdown message; no file export dependency is needed.

Retain the parent Finding provider and sheet while the system sheet opens and closes. Cancellation is not a successful send, and errors leave the notes and feedback untouched. Keep Expo WebBrowser and `topicFeedHandlers.openTopicFinding` on explicit source opening. Confirm that changing ratings or bookmarks still leaves the Finding popup open.

## Risks / Trade-offs

- **Native editor differences:** pinned 1.1.1 can differ from current upstream docs → verify paste, checkboxes, text scaling, selection, and long-note caret behavior in rebuilt clients.
- **Interrupted persistence:** a process can stop before a storage promise completes → write on every accepted edit, drain at lifecycle boundaries when possible, and state that only completed writes are durable.
- **Conflicts after uncertain acknowledgement:** a save can reach the server without its response reaching mobile → preserve text and use the existing conflict path instead of guessing.
- **Stale permissions:** an offline device cannot learn revocation immediately → recover only the current account's draft, revalidate online, and retire it on known rejection.
- **Web regressions from extraction:** shared composition changes mount identity and focus → keep adapters stable, retain lazy editor loading, and test web formatting, conflict, comments, badges, and recap output.
- **Android verification debt:** the prior report records unverified runtime checks after a disk-space issue → require actual Android checks with separate outcomes; exports are only bundle validation.

## Migration Plan

1. Extract portable behavior with web regression tests still passing. Add native dependency and build clients before editor device testing.
2. Introduce the versioned, account-keyed draft store. It has no existing records to migrate; future schema handling must preserve recoverable text on unsupported records.
3. Replace Topic and Team note handoffs with native routes and creation sheets.
4. Deliver shared recap safety, Markdown sharing, and badge lifecycle fixes in the same change.
5. Run repository checks, both bundle exports, relevant web/Storybook regressions, and the iOS/Android matrix in tasks.md. Update guides and docs with observed behavior.
6. Keep runtime compatibility tied to the added native module. Rollback must retain draft storage, never silently erase drafts when restoring a web handoff. Older binaries remain on their compatible bundle.

## Expanded mobile pages and shared components

The user's implementation review added Profile, Teams, Team detail, Activity, Account, Plans, and their forms to this change. `PageScreen` supplies the common native reading column, heading/byline spacing, toolbar, refresh, and footer.

Core owns `DataTable`, domain column definitions, sorting, totals, AccountBudget, AccountFields, PlanCard, TeamFields, InviteFields, and Footer. Both apps adapt portable composition. Native containers use views, the installed Nightshift primitives, Lucide icons, and system pickers. Web-specific expandable rows retain their DOM adapters.

`TableScroll` keeps the first column fixed and scrolls the remaining columns together. An orange indicator stays visible during overflow. Pagination keeps the web's colors, hides for small result sets, and gives controls bottom padding. Rows uses an anchored dropdown.

Topic and Team editors use shared field hooks and save helpers. Existing API endpoints remain authoritative for permissions and validation. Save retries retain created identities, accepted memberships, and accepted invitations. Additions finish before removals so a rejected addition cannot remove existing access.

Native photo, file, and time pickers replace browser inputs. Long prompt text remains available when validation fails; native text input does not expose the browser's paste/drop events. Account pause checkpoints use server cutoffs and shared calculations, including passed and moving states. An admin without an override has no cutoffs. Architects Daughter and Karla use generated Nightshift font classes.

The global footer uses the same words and destinations as web, with compact visual spacing and native touch targets. It appears at the end of scrolling pages and sign-in screens. Focused note editors and forms omit it. Privacy, Terms, License, docs, Releases, Source Code, and Nightshift reuse hosted pages through iOS's system browser sheet or Android's custom tab. Dismissing the browser preserves the app's route and scroll position. No additional embedded WebView is needed for these links.

Admin remains a web handoff. Hosted checkout and billing management also use their existing browser flows. Native podcast playback, chat, and broader live badge counts remain outside this implementation. Android testing is deferred by the user; role-specific note device checks remain manual acceptance.


### Header navigation and file actions

The user chose to remove the bottom Home/Settings bar. The header logo returns Home; the hamburger menu opens Account and the remaining native pages. The existing hidden tab navigator retains Feed/Search state and the `/settings` alias, while its declared screen title uses Account.

The native attachment adapter downloads through the shared authenticated API client, then presents the installed native file viewer. Browser cookies are not required for private files. Preview cache files remain until their parent view unmounts and are removed then. Context uses the existing safe Markdown renderer, bounded orange scrollbox, and explicit edit/done controls. Native document selection replaces browser drag/drop and clipboard-file events; oversized prompt text remains available for correction rather than being truncated.

### Shared page loading layouts

`core/components/TopicSkeleton` owns Topic section order. Web retains its desktop columns, while native reserves one scrolling area and keeps known Topic names. The footer cannot shrink the loading area.

`core/components/PageSkeleton` owns the Profile, Teams, Activity, Account, and Team identity, table, and budget shapes. Thin adapters supply DOM or native elements. Both stylesheets scan its shared classes. Known headings, actions, and Account settings stay usable. Refreshes retain loaded content. Profile topics can show their own table skeleton after identity loads.

Web uses a motion-safe pulse. Native shares `SkeletonPulse` across these pages and Topic, stops animation on unmount, and follows the device's Reduce Motion setting. Decorative shapes are hidden from accessibility; each loading region exposes a busy label. Matching stories exercise the page kinds without artificial production delays.

### Audit and telemetry parity

Core owns page action ordering, header destinations, Add to AI composition, and Account loading/retry state. Both clients use these shared components. Native Share keeps one sheet mounted when switching to Report issue. Visibility menus use the same Lucide icons and retain readable labels.

Mobile visit events use the web event names for Topic views, Finding source clicks, CTA tags, sharing, and tutorial plays. Server business events remain emitted once by the existing handlers, with native platform/device attribution from bounded descriptive headers. Sentry uses request isolation for server errors and the native SDK for crashes, render errors, and sampled navigation. Both clients share route redaction and content policies. Native visits remain anonymous, memory-backed, and free of session replay. Test-event posting is accepted verification for this pass; dashboard confirmation will follow after the user signs in.

The native session does not transfer into the system browser sheet. Admin remains a web sign-in handoff. Android and non-owner device acceptance retain their explicitly deferred status.
