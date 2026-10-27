# Tasks

Android build and runtime checks are deferred at the user's request on October 26, 2026; continue with iPhone. Tasks that include unrun Android checks remain unchecked.

The user left team-editor, read-only, and admin device cases for manual acceptance on October 26, 2026. Automated permission tests pass. Those cases remain open in `verification.md`.

All implementation and device checks below start unchecked. The proposal's baseline checks do not complete them. Use the current web components and stories as the reference before each extraction or native adapter; record any necessary platform difference in the design and relevant guide.

## 1. Shared note foundations

- [x] 1.1 Add strict read outcomes to the existing note client so missing/inaccessible notes differ from network/server failures; make comments and badges expose failures and note-read calls report acknowledgement. Update affected callers and verify request tests cover success, 404, denied access, transport failure, and 5xx without new endpoints.
- [x] 1.2 Extract `noteFormats.ts` from the web toolbar, including ordered groups, labels, accessibility names, state mapping, and command descriptors. Verify tests cover every existing format, blocked states, and safe add/edit/remove/open link behavior without DOM or native imports.
- [x] 1.3 Extract portable `NoteToolbar`, `NoteEditor`, and `NoteStatic` composition through stable platform slots, retaining web's lazy library loading and initial normalization baseline. Verify web tests show no note-body fetch or editor initialization on the table-only page, no save on untouched mount, and unchanged formatting behavior.
- [x] 1.4 Extract `CreateNote`, `NoteConflictNotice`, visibility descriptions, and save-status copy into shared composition and `noteLabels.ts`; keep platform containers local. Verify existing web creation, validation, conflict Reload, and management controls still render the same copy and permissions.
- [x] 1.5 Update the core and web workspace guides for the new shared modules and adapters, and maintain stories beside changed web components. Verify the Storybook catalog renders their states and the package-boundary and component-parity checks pass.

## 2. Save scheduling and pure draft rules

- [x] 2.1 Expose flush, retry, and observable draft state from the existing save hook/controller without changing the 1,000 ms debounce or one-in-flight/one-pending limit. Verify fake-clock tests cover merged keystrokes, unchanged HTML, close/background flush, repeated lifecycle events, and retry without a tight loop.
- [x] 2.2 Correct conflict handling to preserve the latest text typed during or after the conflicting request while blocking transport. Verify tests cover newer pending text, continued typing after conflict, failed Reload, and successful Reload replacing only the deliberately discarded draft.
- [x] 2.3 Add pure versioned draft transitions in `noteDrafts.ts` for account/note keys, local revisions, original base versions, acknowledgement, conflict, and retirement. Verify tests cover a newer edit during acknowledgement, uncertain acknowledgement followed by 409, account replacement, deletion, and a late callback after retirement.
- [x] 2.4 Preserve validation errors and recoverable text without retry loops, and document the controller's persistence callbacks and draft invariants in the core guide. Verify tests distinguish missing/denied notes, size/validation rejection, transport failures, and successful saves; rerun existing web save/conflict tests.

## 3. Native note reader, editor, and management

- [ ] 3.1 Add the same `react-native-enriched-html` 1.1.1 dependency used by web to mobile and rebuild both development clients. Verify iOS and Android launch with editor and display components available; record native runtime compatibility and preserve the existing web patch.
- [ ] 3.2 Add the Topic note route and `NoteScreen`, replace Topic note browser handoffs, and verify Topic membership and fresh server permissions before rendering. Verify navigation tests and device checks cover loading, retry, inaccessible/missing notes, back navigation preserving table state, and native Team notes using the same editor and fresh permissions.
- [ ] 3.3 Adapt shared `NoteStatic` and `NoteEditor` to native library components with `toNoteHtmlStyle`, normalized events, safe link opening, and the existing save controller. Verify read-only users see no editor or toolbar, editor mounts do not save unchanged HTML, and web/native HTML round trips preserve every supported format.
- [ ] 3.4 Build the native toolbar adapter from Nightshift Buttons and matching Lucide icons, consuming shared format descriptors and selection state. Verify selection survives toolbar presses and link entry; checklist toggles, blocked commands, active states, and supported link operations work on both native clients.
- [ ] 3.5 Implement the keyboard layout in the design: one screen-level owner, metadata with top padding, a sibling toolbar below the title, bounded internally scrolling editor, and outer body/comment scrolling. Show Done only while the keyboard is open. Verify long-note caret visibility, nested scroll gestures, software/hardware keyboards, explicit blur, safe areas, and enlarged text on both platforms.
- [ ] 3.6 Use shared creation composition in a native sheet with returned creatable visibilities; connect both Add Note and the empty invitation's Topic link. Verify validation and failure retain entered values, successful creation opens the editor, and the table refresh preserves its settings.
- [ ] 3.7 Add rename, visibility, and confirmed delete using fresh `canEdit`, `isNoteOwner`, and `canDelete` fields. Verify owner, team editor, read-only reader, and admin cases; cancellation or rejection keeps the note and body intact, while accepted deletion returns to the Topic.
- [ ] 3.8 Preserve the web's paste normalization and image removal, and add native stories for every editor/read-only format, toolbar states, conflict message, and large content in both themes. Verify stories on-device and rich paste/checklist/link round trips against the pinned library on iOS and Android.
- [x] 3.9 Update `apps/mobile/AGENTS.md`, affected module maps, and the Tasting Notes help page for native routes, keyboard behavior, creation, permissions, and native Team notes. Verify paths and terminology against the implementation and run `bun run build:docs` for the changed help content.

## 4. Durable native drafts and account lifecycle

- [ ] 4.1 Add the account-owned draft store and AsyncStorage adapter with a versioned prefix separate from the feed cache, ordered/coalescing writes, and one save controller per note. Verify storage tests cover rapid edits, delayed writes, write failure, schema handling, and a feed build-identity change without losing completed draft writes.
- [ ] 4.2 Connect accepted editor changes to immediate draft persistence and expose recoverable Topic draft entries when offline. Verify a cold restart restores the latest durable text and original version for the same account; another account sees none, and an uncached note cannot be opened or created offline.
- [ ] 4.3 Wire AppState flush and foreground/connectivity retry for open and closed notes. Revalidate permissions and share controllers with open editors. Verify lifecycle tests cover repeated events, one save at a time, offline-to-online success, closed-note conflicts, and no silent rebase after another client saves.
- [ ] 4.4 Clear only acknowledged revisions and preserve newer edits and durable conflicts across restarts. Verify storage/controller integration tests cover late success, lost responses, failed Reload, accepted Reload, and validation failure without automatic resubmission.
- [ ] 4.5 Extend session exit, account replacement, revocation, and accepted note/account deletion to retire controllers and drain/remove old-account writes. Verify races cannot dispatch under a new session or recreate cleared data; failed sign-out/deletion retains drafts, and route/app unmount alone never clears them.
- [ ] 4.6 Show honest unsaved, conflict, device-storage failure, and unavailable-note states through shared copy where applicable. Verify offline/editability-loss stories and tests distinguish recoverable transport failure from known revoked access without exposing forbidden content.
- [ ] 4.7 Document device-local draft limits, reconnect/conflict recovery, and deliberate sign-out cleanup in the mobile guide and Tasting Notes help. Verify the documented steps against native behavior and rebuild the docs; include runtime rollback guidance that preserves stored drafts.

## 5. Shared comments and native thread

- [x] 5.1 Extract portable `NoteComments` composition around `useNoteComments`, sharing author/timestamp formatting, closed-account fallback, composer, pending state, and author-only deletion. Verify shared tests cover oldest-first order, append/delete in place, duplicate-post prevention, failed loads, retained failed-post text, and failed deletion.
- [ ] 5.2 Add the complete native thread below the body with the composer gated by fresh `canEdit`. Verify read-only and editor stories in both themes, author profile behavior, keyboard access, long threads, and comment actions preserving unsaved note text and navigation.
- [x] 5.3 Retain the web's wide-screen column and phone-browser sheet while reusing the extracted content. Verify web toggle labels, placement, composer permissions, and deletion behavior against existing stories and interaction tests.
- [x] 5.4 Update the Tasting Notes help, mobile/core guides, and domain-model guidance to distinguish native comments below the note from phone-browser comments in a sheet. Verify the documented permission and layout rules match both implementations and build the docs.

## 6. Unread counts and acknowledged reads

- [x] 6.1 Move note badge polling out of web chat composition into a shared lifecycle hook with focus/connectivity adapters and the existing 45-second interval. Verify tests cover initial/foreground/reconnect refresh, retained counts after failure, teardown, account reset, and late old-account responses.
- [x] 6.2 Make successful opens submit acknowledged read records, roll back failed tentative suppression, and release suppression after acknowledgement/refetch. Verify tests cover failed note opens, failed acknowledgements, later edits/comments arriving during settlement, and no permanent false zero count.
- [ ] 6.3 Reuse shared badge content and count formatting in native note rows, Topic titles, and the Tasting Notes section. Verify edit/comment details, combined totals, `9+`, outline styling, accessible actual counts, and press/long-press explanations in stories and interaction tests.
- [ ] 6.4 Verify cross-client clearing with the same account and another editing account: read on mobile and observe web refresh, then reverse. Record observed results and confirm a later edit or comment restores the appropriate count on both clients.
- [ ] 6.5 Update core/mobile guides and the Tasting Notes help for polling, acknowledged reading, and offline count behavior. Verify the text matches observed cross-client behavior and build the docs.

## 7. Shared recap safety and reading decisions

- [x] 7.1 Add the existing Markdown parser dependency to core and implement `safeNoteMarkdown.ts` as a pure AST transformation. Verify tests cover exact stored HTTP(S) allowlists, absent allowlists, inline/reference/autolinks, disallowed label-plus-destination text, nested linked images, raw HTML as inert characters, malformed nodes, and literal code without DOM/native globals.
- [ ] 7.2 Make web and native recap adapters render the same transformed tree without serializing and reparsing it. Keep `SafeNoteLink` as the final guard. Verify existing web recap tests still pass and new renderer tests show identical text/destinations, no image loads, and no disallowed links becoming clickable again.
- [ ] 7.3 Share compact Nightshift display-heading treatment for levels one through six while preserving paragraphs, lists, bounded scrollboxes, and Source footnotes. Verify web and native long-recap/hostile-link stories in both themes and enlarged text, with no clipped headings or changed web appearance.
- [ ] 7.4 Preserve the current web order of Findings, Topic information, and Topic roast recap; retain diary composition and remove any remaining divergent placement. Verify component tests and rendered web/native comparisons show one page recap, the expected expansion controls, and permitted Source/time/cost details.
- [x] 7.5 Update the core/mobile guides and the existing Notion Mobile decision's reading, reuse, and offline rows with the selected renderer, its verified limits, shared components, and draft behavior. Verify the saved page and guides explicitly reconcile Prompt 45's renderer/layout/open-event proposals without changing unrelated roadmap decisions.

## 8. Finding sharing and source-opening semantics

- [ ] 8.1 Add native `ShareMarkdownButton` using `toNotesMarkdown` and the system share sheet, and expose a scrollbox action slot alongside the existing copy control. Verify tests pass the same title, explanation, and canonical Topic URL as web copy; stories show both actions with accessible touch targets in both themes.
- [ ] 8.2 Keep the Finding provider, sheet, scroll position, and feedback mounted through share completion, cancellation, and failure. Verify interaction tests and both device runtimes return to unchanged Finding content, with no false success state or lost feedback.
- [ ] 8.3 Retain Expo WebBrowser and shared Finding handlers for explicit source links/previews and first actual inline playback. Verify tests distinguish inspection from opening, avoid duplicate pause/resume events, restore tentative read state after recording failure, and stop playback on close/background.
- [ ] 8.4 Update mobile guidance and relevant reading help for copy/share and source-open behavior. Verify stories and documentation preserve existing bookmark, rating, consumed-state, feedback, preview-loading, and recap interactions; build the docs for any changed help page.

## 9. Integrated web and device acceptance

- [ ] 9.1 Run `bun run check`, `bun run build:ui`, `bun run build:storybook`, and `bun run build:docs`, plus iOS and Android bundle exports using the mobile workspace's documented commands. Record successful results separately from runtime checks; resolve regressions introduced by the change.
- [ ] 9.2 Exercise the web note regression matrix after extraction: table-only initial load, lazy editor, every format/link action, creation/management permissions, autosave/conflict/Reload, comments on desktop and phone, badges, and recap safety/appearance. Record browser results and representative screenshots.
- [ ] 9.3 On rebuilt iOS and Android clients, complete the note matrix for private/team/public visibility, owner/editor/reader/admin permissions, formatting/paste/checklists, create/rename/visibility/delete, complete comments, keyboard and long-note scrolling, and web round trips. Record separate platform outcomes and leave any unrun check unfinished.
- [ ] 9.4 On both platforms, exercise offline edits, termination/restart, reconnect on a closed note, background flush, concurrent web save/conflict, failed Reload, access revocation, successful/failed sign-out and deletion, and account switching. Verify durable text and version/account boundaries with observed outcomes, not exports alone.
- [ ] 9.5 Complete the carried Prompt 45 reading checks on both platforms: long Finding explanations and recaps, safe/unsafe citations, Source footnotes, image/video preview loading and failures, explicit source opens, inline playback, feedback, ratings/bookmarks, consumed state, and native share cancellation. Record behavior against the current web and fix any remaining gaps in scope.
- [ ] 9.6 Complete light/dark, larger system text, VoiceOver/TalkBack focus and labels, platform touch targets, reduced motion, safe areas, tablet layouts, nested scrolling, and back-navigation checks across note and Finding flows. Record both platform results and any actual environment blocker without claiming it passed.
- [ ] 9.7 Review the updated guides/help/Notion decision against implemented behavior, run `bun run docs:embed` for changed help content, and run `openspec validate mobile-tasting-notes --strict`. Deliver verification evidence mapping every spec scenario and remaining manual check to its result before requesting review.


## 10. Expanded native pages and action parity

The user expanded this change during review to cover the remaining mobile menu pages, forms, shared tables, and footer. Android remains deferred. These implementation checks do not complete the separate device acceptance matrix.

- [x] 10.1 Share table composition, domain columns, sorting, and totals. Add native fixed-first-column scrolling, an orange overflow indicator, compact row controls, and bottom padding. Preserve the web table layout.
- [x] 10.2 Implement native Profile, Teams, Team, Activity, Account, and Plans pages with the web's terminology, headings, icons, and shared layout. Add native Team note routes.
- [x] 10.3 Reuse shared Topic/Team form state, Source editing, invitations, Team selection, save validation, and partial-success retry handling. Keep native adapters for system file/photo/time pickers and confirmations.
- [x] 10.4 Match report fields, Join Team, invitation cancellation, and attachment read/edit/download actions. Share stale-safe Team name checks and verify their delayed-response behavior with tests.
- [x] 10.5 Share Account settings, budget checkpoint calculations/copy, plan cards, and the global footer. Open hosted documents and Nightshift in the in-app browser. Retain explicit Admin, billing, podcast, and chat handoffs.
- [x] 10.6 Remove the bottom Home/Settings bar at the user's request. Keep Home on the logo and Account in the header menu, preserving the existing Feed/Search route state.
- [ ] 10.7 Complete live iPhone acceptance for all page actions, picker cancellation, private attachment preview, partial failures, and non-owner permissions. The user authorized labeled invitation/report and account-setting tests on October 27. Check the configured backend before mutations. Billing transactions, credential changes, and account deletion remain excluded from unattended QA.
- [ ] 10.8 Complete rendered light/dark, large-text, VoiceOver, and narrow/wide layout comparisons for the expanded pages. Record the user's accepted layouts separately from unrun scenarios.

- [x] 10.9 Share the Topic skeleton section order with web, retain native placeholders and reduced-motion behavior, and prevent the loading/footer scroll areas from competing for space. Add web and native loading stories.

- [x] 10.10 Share Profile, Teams, Activity, Account, and Team loading composition across web and mobile. Preserve known headings, available settings, and loaded content during refresh. Add matching page and partial-table stories.

- [x] 10.11 Audit the implemented mobile pages against web. Share page actions, header destinations, Add to AI composition, and Account retry state. Fix visibility menu wrapping/icons, singular counts, and Share-to-Report presentation. Record rendered checks and remaining acceptance coverage in parity-audit.md.
- [x] 10.12 Fill mobile PostHog and Sentry gaps: shared privacy rules, visit events, native request attribution, device/app context, route errors, and sampled navigation. Verify native test-event flushes without dashboard access.
- [ ] 10.13 Confirm PostHog event properties and Sentry issues in their dashboards after the user provides access.
