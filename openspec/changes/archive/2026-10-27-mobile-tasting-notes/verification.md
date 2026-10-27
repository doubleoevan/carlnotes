# Mobile Tasting Notes verification

The implementation and automated gate pass. Device acceptance remains open. This report distinguishes tested behavior from source inspection and unrun checks.

## Scope and environment

- Dates: October 26–27, 2026.
- iPhone: iPhone 18 Pro simulator, iOS 27.0, rebuilt native development app.
- Android: deferred by the user. No Android build or runtime result is claimed.
- Team-editor, read-only, and admin device cases: manual acceptance at the user's request. Automated permission tests pass; the signed-in account exercised owner behavior.
- The first simulator build omitted signing and SecureStore failed with a missing-entitlement error. The normally signed rebuild passed, launched on the same development server, and restored the user's signed-in session.
- The user reviewed the visible implementation and authorized one commit, archive, and push to main after the ship reviews. Unrun acceptance remains explicitly unchecked in the archived tasks; archive does not establish those runtime results.

## Build and automated results

| Check | Result | Local evidence |
| --- | --- | --- |
| `bun run check` | Passed after the ship fixes: 2,418 tests, 0 failures, 12,089 assertions across 402 files; preflight green | `/tmp/carlnotes-ship-preflight-12.log` |
| Web production build | Passed after the ship fixes | `/tmp/carlnotes-notes-ship-ui-build-recheck.log` |
| Storybook production build | Passed; Delete Confirmation interaction story also passed all 11 steps | `/tmp/carlnotes-notes-ship-storybook-build-final.log`, `Note/NoteComments/Delete Confirmation` |
| Docs build | Passed with the current help content | `/tmp/carlnotes-notes-ship-docs-build-final.log` |
| iOS native Debug build | Passed with signing enabled, including the checklist hit-target patch; installed app restored the signed-in Home feed | `/tmp/mobile-tasting-notes-ios-checklist-build.log`, `/tmp/mobile-tasting-notes-checklist-toggled.png` |
| iOS production bundle export | Passed after the ship fixes | `/tmp/carlnotes-notes-ship-ios-export-recheck.log` |
| OpenSpec strict validation | Passed | `openspec validate mobile-tasting-notes --strict` |
| Documentation embeddings | Blocked: local embedding service at port 4000 refused the connection; Docker Desktop could not start | `/tmp/carlnotes-notes-ship-docs-embed-final.log` |
| Android export and runtime | Deferred by user | Not run to completion |

The iOS dependency patch preserves the existing web changes and fixes React header imports for enriched HTML 1.1.1. Native builds need that patch; an export alone does not verify compatibility.

## Reuse and web checks

Web and mobile consume actual shared `NoteEditor`, `NoteStatic`, `NoteToolbar`, `CreateNote`, `NoteConflictNotice`, `NoteComments`, and `NoteUnreadBadge` compositions from core. Stable platform slots supply DOM or native elements. Shared hooks own autosave, conflict recovery, comments and acknowledged unread counts.

Native-only code supplies the route, keyboard layout, system sheets, permissions-aware management controls and durable account storage. Both recap renderers consume one sanitized Markdown tree. Native comments follow the body; phone-browser comments retain the existing sheet.

The native visibility picker now uses the web's lock, team and globe icons in its trigger and options. Its existing Select primitive accepts custom option content; note creation and management reuse the same picker. The `Small` Select story follows the web reference.

The signed-in iPhone opened Getting a Literary Agent, showed the shared New note form with Private selected, retained the entered name, and created `Mobile parity check - Oct 26`. The native route showed its name, Private picker, owner Delete control, body, formatting toolbar and Saved status. The private test note remains for review. Evidence: `/tmp/mobile-tasting-notes-native-note.png` and `/tmp/mobile-tasting-notes-submit.log`.

The iPhone saved two paragraphs, including bold text, and posted a comment with the author and timestamp. Reopening retained the body and thread. Chrome then opened the same private note and showed the saved bold markup and comment. Web comments toggled, the dialog expanded and collapsed, and closing returned to the table.

Web saved the supported-format fixture and posted a second comment. Reopening on iPhone rendered the headings, emphasis, lists, checklist, quote, code and link. This comparison exposed missing italic font faces and tighter native editor line spacing. The rebuilt app renders italic text and the shared line spacing correctly. Toggling the native checklist saved successfully; reopening on web retained its checked state and every format. The visibility dropdown also exposed vertical label wrapping. Its text-scaled minimum width keeps Private and Public beside their icons and checkmark, including at the simulator's extra-extra-extra-large text size. The original medium setting was restored.

The live comparison also caught a web palette bug: library styles referenced Tailwind's compiled inline aliases instead of runtime custom properties. The shared helper now returns the actual palette variables. Browser measurements confirmed the dark checkbox accent is `rgb(240, 144, 80)` and the link is `rgb(255, 163, 103)`; quote borders and code fills also render again. A regression test verifies every note color exists in both generated runtime palettes.

A controlled web edit followed by native typing produced a real conflict. Mobile retained the newer local suffix and showed Not saved. Terminating and relaunching the app retained the suffix, original conflict and Reload action. Deliberate Reload then restored the newer web body and Saved status. Evidence: `/tmp/mobile-tasting-notes-recovered-conflict.png`, `/tmp/mobile-tasting-notes-conflict-reloaded.png`, and `/tmp/mobile-tasting-notes-recover-conflict.log`. The initial automation assertion used Reload instead of the accessible name Reload note; the screenshot confirmed the conflict and the corrected recovery flow passed.

A clean native reopen after a web edit exposed a React render-phase update warning. Controller activation now runs after commit, so refreshing the baseline can notify the still-mounted Topic table safely. The existing store test verifies clean adoption and pending-draft preservation. The runtime recheck loaded the latest web paragraph with Saved status and no new render-phase warning. Evidence: `/tmp/mobile-tasting-notes-clean-reopen.png`.

The final native comment check showed both authors, timestamps, wrapped paragraphs and the padded composer below the body. The Comments heading uses the shared display font. Evidence: `/Users/doubleoevan/.maestro/tests/2026-10-26_181216/mobile-tasting-notes-comments-final/takeScreenshot/native-comments-padding.png`. An edge-back gesture returned to the Topic at the same table position. The private note remained visible; multi-page table state was not exercised. Evidence: `/tmp/mobile-tasting-notes-return-current.png`.

The user's desk review moved formatting below the title, added top padding, and requested a full-width toolbar with an orange overflow cue. The native toolbar now shares `ScrollIndicator` with the existing vertical scrollboxes. An iPhone observation confirmed the title, full-width toolbar, orange thumb, body and Saved status together. The user then selected a top-right X matching web; Close note returns to the existing Topic route beside the existing edge-swipe gesture. The keyboard-dismissal control is text Done below the body and only appears while the software keyboard is open. Keyboard behavior and the close control remain manual acceptance checks; the user was operating the simulator during the attempted interaction checks.

Both clients now require confirmation before deleting a comment. Native uses Alert and web reuses ConfirmDialog with shared wording. The web Delete Confirmation story passed all 11 interaction steps: opening and cancelling made no deletion request, kept the comment visible, and confirming on a second opening called the mock delete handler once with the correct ID. Its accessibility scan reported zero violations. No live comment was deleted for this check.

The user reported that the native Comment field accepts only one letter through the Mac keyboard. Retrying after code updates and simulator automation were paused did not fix it. Device Hub controls also timed out while the simulator and CarlNotes process stayed running. The user then asked to stop investigating the emulator and accepted the notes and comments appearance. Mac-keyboard typing remains unverified; earlier automated text entry does not establish that this input path works.

The simulator launch investigation found the development server running and an in-app browser covering CarlNotes. Restarting the installed app restored the signed-in native UI without clearing data. The sandboxed gate failed six scanner tests because their temporary HTTP servers could not bind. Rerunning with local-server access passed the entire gate.

The Finding's Share action opened the iOS system panel with the Markdown Topic heading and canonical link visible in its preview. The user then dismissed the panel and confirmed: "Finding stays open in place." This is a manual pass for iPhone cancellation preserving the Finding and its scroll position. Share completion and failure remain unverified.

The earlier automated outside tap retained the Finding but also increased its displayed view count. The driver appeared to reach the underlying app through system overlays, and its dismiss gesture left the panel open. That automation attempt is not acceptance evidence. No share destination was selected during automation. Evidence: `/tmp/mobile-tasting-notes-share-current.png`, `/tmp/mobile-tasting-notes-share-cancelled.png`, and `/tmp/mobile-tasting-notes-share-gesture.log`.

The final native theme automation also reached a profile browser instead of the intended appearance control. Restarting restored the signed-in native Home feed. This attempt does not verify native light-theme parity; the successful browser theme checks remain separate.

Evidence: `/tmp/mobile-tasting-notes-edit-body.log`, `/tmp/mobile-tasting-notes-post-comment.log`, `/tmp/mobile-tasting-notes-reopen-note.log`, `/tmp/mobile-tasting-notes-comments-reopened.png`, `/tmp/mobile-tasting-notes-web-roundtrip.log`, `/tmp/mobile-tasting-notes-final-native.log`, `/tmp/mobile-tasting-notes-checklist-toggled.png`, `/tmp/mobile-tasting-notes-large-text.png`, and `/tmp/mobile-tasting-notes-large-menu.png`.

Observed browser checks used the built Storybook at port 6007:

- Editing rendered the stored heading, link, checklists, quote and code block beside the comment thread. Toggling a checklist item changed its checked state.
- Conflict showed the last editor and retained the typed suffix. Reload removed the notice and restored the fetched body.
- Failed creation retained the entered name and Team visibility and offered retry.
- Comment entry accepted text; the successful mock post cleared the composer. Hook tests separately verify append and deletion.

At 375 pixels, the editor and comments overlay rendered in Latte and Dark roast. The checklist controls initially measured 16 pixels and failed Storybook's touch-target check. Their web styles now provide 24-pixel controls with the Nightshift accent. Rendered measurements confirmed 24 by 24 pixels, and the editor and comments stories report zero accessibility violations. Native targets and keyboard behavior remain separate device checks.

The Notion Mobile decision's reading, reuse and offline rows were saved and fetched back. They identify the shared AST renderer, native adaptations, durable drafts and pending device checks.

## Scenario evidence

Note scenarios are mapped below; expanded mobile page scenarios are mapped in `parity-audit.md`. Automated evidence refers to passing tests in the full gate. Source inspection is identified explicitly and does not count as a runtime pass.

Test locations:

- Save scheduling: `packages/core/hooks/useNoteBodySave.test.ts`.
- Draft transitions: `packages/core/lib/noteDrafts.test.ts`; durable storage: `apps/mobile/src/stores/noteDraftStore.test.ts`.
- Shared components: `apps/web/src/components/note/noteShared.test.tsx`.
- Comments and badges: `apps/web/src/hooks/useNoteComments.test.tsx`, `useNoteBadges.test.tsx`; `packages/core/stores/noteBadgeStore.test.ts`.
- Format commands and safe Markdown: `packages/core/lib/noteFormats.test.ts`, `safeNoteMarkdown.test.ts`.
- Client outcomes: `packages/client/noteClient.test.ts`; existing server rules: `apps/api/note/*.test.ts`.

### tasting-notes

| Scenario | Automated evidence or source inspection | Runtime result / remaining check |
| --- | --- | --- |
| Several notes share a page and a visibility | Existing notes contracts and API; unchanged data model. | Not exercised with several live notes. |
| A save raises the version | API notes.test.ts checks accepted and stale versions; save controller tests preserve the returned version. | iPhone showed Saved; reopening on web retained both paragraphs and bold markup. |
| A device draft is not a server save | Draft store restoration and save-status tests distinguish local text from acceptance. | A conflicting native draft survived termination/relaunch and still showed Not saved; web retained its own accepted body. |
| Default page load is table-only | Web render-safety and NotesSection tests; editor remains lazily imported. | Browser network trace pending. |
| Opening a note loads the editor on the stored body | Shared editor test checks mount normalization without a save. | Both live clients reopened the stored body; iPhone also rendered the fixture saved on web. |
| A read-only open renders the stored body | NotesSection static-render test; shared reader has no editor input. | Web Every Format reader rendered all fixture constructs without an editor toolbar. Device acceptance is manual at the user's request. |
| The dialog expands and collapses | Existing web NoteDialog controls retained. | Live web Expand, Collapse and Close worked; the table remained underneath. |
| Closing sends the pending save | useNoteBodySave.test.ts checks immediate flush. | Native back navigation pending. |
| Mobile opens a Topic note natively | NoteScreen checks fresh permissions and the owning Topic or Team membership. | Creating a private note opened its native editor on iPhone. Edge-back returned to the same Topic table position. Team-note runtime acceptance remains pending. |
| Mobile opens a Team note natively | The Team notes route uses the same NoteScreen and checks Team membership. Shared editor and API permission tests cover its controls. | Owner Team-note creation and round-trip acceptance remain unrun; nonowner roles are manual at the user's request. |
| Both creation actions open the same sheet | NotesSection uses one shared CreateNote sheet; shared creation test covers validation and retained failed values. | Web failed creation retained name and visibility; iPhone Add Note created a private note and opened its editor. Empty-invitation trigger remains pending. |
| A team editor does not own the note | API permissions tests; native management gates rename by canEdit and visibility by isNoteOwner. | Manual device acceptance at the user's request. |
| An admin has deletion access alone | API permissions tests; native delete uses canDelete independently. | Manual device acceptance at the user's request. |
| A rejected management action preserves the view | Native handlers retain values and mounted body on rejection. | Failure and cancellation UI pending. |
| Every supported format survives a round trip | noteFormats tests cover commands; API sanitizer retains every editor tag; both adapters pin enriched HTML 1.1.1. | Passed for the fixture: web saved all formats, iPhone rendered and toggled the checklist, and web reopened every format with the checked state intact. |
| Toolbar controls follow the selection | Shared toolbar tests cover active and blocked state. | Web code-block selection disabled inline formats; native Bold produced persisted bold text and its selected state. Other native commands remain pending. |
| Pasting stays within the supported formats | Shared save test strips images; existing sanitizer tests retain supported markup. | Native rich paste pending. |
| Link editing preserves the selection | noteFormats and shared toolbar tests cover captured range, normalization and unsafe URLs. | Web link popover opened on its stored URL, rejected javascript: URLs and closed on Remove. Native selection pending. |
| Editing the bottom of a long note | Native bounded input and sibling toolbar inspected in source. | Software/hardware keyboard and caret checks pending. |
| Large text and keyboard dismissal | Native input allows font scaling and exposes explicit blur. | iPhone extra-extra-extra-large text kept the body and visibility options readable and controls visible. Original medium restored. Software-keyboard dismissal remains pending. |

### tasting-note-sync

| Scenario | Automated evidence or source inspection | Runtime result / remaining check |
| --- | --- | --- |
| Keystrokes merge into one save | Save controller fake-clock tests pass at 1,000 ms. | Native typing reached Saved and persisted across reopen and web reading. Exact request timing remains covered by automated tests. |
| A change during a save queues one more | Save controller tests assert one in-flight and one pending body. | Live delayed request pending. |
| A failed save retries on the next change | Save controller tests retain text and avoid a retry loop. | Device transport failure pending. |
| Closing sends the pending save | Save controller flush tests pass. | Native close pending. |
| Backgrounding flushes without another edit | Repeated lifecycle flush test passes; provider connects AppState. | Actual background transition pending. |
| An offline edit survives termination | Draft store test restores latest durable HTML and original version for the same account. | A durable conflicting draft survived real process termination/relaunch. Offline transport remains a separate unrun check. |
| Storage cannot keep a draft | Injected write-failure test retains text and raises storage-error state. | Device warning rendering pending. |
| An app update invalidates the feed cache | Draft key has its own versioned prefix; existing feed identity tests pass. | Installed update with pending draft not run. |
| Reconnection saves an unchanged server version | Draft-store reconnect and save-controller tests reuse the original base. | Device reconnect pending. |
| Another client saved first | Pure transitions and controller tests retain newer typing on conflict without rebasing. | Passed live: web saved first, native retained subsequent typing and named the last editor, restart preserved the conflict, and Reload restored the web version. |
| A conflict exists on a closed note | Draft-store test restores a closed-note conflict without an automatic overwrite. | Reopened the conflicting note after process restart; local suffix and Not saved persisted until deliberate Reload. |
| Reload fails | Shared editor interaction test keeps conflict and current text after failed fetch. | Device failed Reload pending. |
| Typing continues during a successful save | Pure transition and draft-store tests preserve a newer revision after acknowledgement. | Device in-flight typing pending. |
| Typing continues during a conflicting save | Save and draft transition tests preserve latest text and block retries. | Device in-flight conflict pending. |
| The server accepted a save but the response was lost | Uncertain-save tests keep the original version and accept the server conflict decision. | Live lost response not simulated. |
| A delayed write completes after sign out | Ordered-write retirement and live-session dispatch-fence tests pass. | Device sign-out/account switch pending. |
| Account deletion succeeds but sign out fails | Existing session retirement hides content before cleanup; note retirement is connected. | Destructive live account deletion not run. |
| Deletion fails | Native delete handlers retire drafts only after acceptance. | Live deletion rejection pending. |
| Permissions changed while offline | Draft-store revoked-access test removes text and fences callbacks. | Live permission revocation pending. |

### tasting-note-comments

| Scenario | Automated evidence or source inspection | Runtime result / remaining check |
| --- | --- | --- |
| A wide screen opens the thread beside the note | Web NoteLayout keeps its margin column. | Web Editing story shows comments beside the body. |
| A phone opens the thread on demand | Web NoteLayout retains its narrow-screen sheet. | At 375 pixels, the web Editing story overlays comments; Comments Closed shows the editor and horizontal toolbar. |
| The header control toggles the thread | Existing NoteDialog toggle retained; shared content accepts isCommentsOpen. | Live web Hide comments and Show comments retained the body and both comments. |
| A reader sees the thread without a composer | Shared comments composition gates composer with canComment. | Web read-only fixture rendered the thread without a composer or toolbar. Device acceptance is manual at the user's request. |
| Native comments follow the note | Native NoteLayout renders comments below body in outer ScrollView. | iPhone scrolled to the thread, posted a comment, cleared the composer, and retained the saved body and route. Reopening retained the comment. Software-keyboard and long-thread checks remain pending. |
| A thread request fails | useNoteComments test covers failure and successful retry. | Web Failed story rendered the error and retry action, completed its retry interaction, and passed the accessibility scan. Native failure remains pending. |
| A comment post fails | Shared interaction test retains failed text and prevents duplicate posts. | Web successful mock post cleared composer; native failure pending. |
| A comment is deleted | Shared and hook tests cover author-only control, rejected deletion and successful in-place removal. | Live device deletion not run. |

### note-badges

| Scenario | Automated evidence or source inspection | Runtime result / remaining check |
| --- | --- | --- |
| Opening a note clears it | Badge store and acknowledged-read hook tests pass. | Live cross-client refresh pending. |
| The last editor is not badged for their own edit | Existing API noteBadges test passes. | Cross-account UI pending. |
| A never-read note counts | Existing API noteBadges test passes. | Cross-account UI pending. |
| Mobile reading clears web counts | Both adapters use the acknowledged-read hook and existing endpoint. | Two-client live check pending. |
| An acknowledgement fails | Hook test restores tentative suppression after rejection. | Device acknowledgement failure pending. |
| A Topic has edits and comments waiting | Badge store tests sum edits/comments; shared badge content supplies details. | Native title/row/section visual check pending. |
| A count exceeds nine | Shared formatter renders 9+ and supplies actual-count accessibility text. | Web Many story showed 9+ with accessible text naming 1 unread edit and 12 unread comments. Native pending. |
| A user changes accounts during a poll | Hook tests ignore late old-account reads and badge responses. | Live account replacement pending. |
| A refresh fails | Hook test retains confirmed counts after failure. | Live failure pending. |
| New changes arrive after a read | Hook test releases suppression after acknowledgement/refetch. | Live subsequent edit/comment pending. |

### injection-defense

| Scenario | Automated evidence or source inspection | Runtime result / remaining check |
| --- | --- | --- |
| A citation of a kept item is a link, anything else is inert | safeNoteMarkdown tests enforce exact HTTP(S) allowlists and inert rejected destinations. | Native link activation pending. |
| The relevance explanation renders as text | Finding notes retain the plain-text renderer. | Native long explanation visual check pending. |
| A hostile recap reads the same on both clients | Both recap adapters consume the same transformed AST; safety tests cover nested linked images and literal HTML. | Rendered native hostile fixture pending. |
| Disallowed URLs cannot regain links | Direct AST rendering and final SafeNoteLink guard prevent reparsing; safety tests pass. | Native tap checks pending. |
| Empty or unusual input fails closed | Safety tests cover null/malformed nodes, empty links, raw HTML and literal code. | No additional device check required for pure transform; renderer pending. |
| A recap uses all heading levels | AST test keeps six levels; both adapters use compact Nightshift display roles. | Long recap and large-text visual checks pending. |

### mobile-feed

| Scenario | Automated evidence or source inspection | Runtime result / remaining check |
| --- | --- | --- |
| A source opens while recording fails | Existing Finding action tests restore tentative read state independently of other feedback. | Native browser return pending. |
| Inspecting a Finding is not opening its source | Details remain separate from explicit source/preview handlers. | Device inspection/open comparison pending. |
| Inline playback records its first actual play | YouTube adapter retains first-play guard and background unmount; fallback now uses the same opener. | Actual playback, pause/resume and background checks pending. |
| Sharing exports the Finding text | Native copy and share receive the same toNotesMarkdown output, including canonical Topic URL. | iOS system preview showed the Markdown Topic heading and link. Full payload and completion remain unverified; no destination was selected. |
| Sharing returns to the Finding | Share action never dismisses the provider or parent sheet; failure is caught without success feedback. | iPhone cancellation passed manual acceptance: the user confirmed the Finding stays open at the same scroll position. Completion/failure remain unrun; Android is deferred. |
| The latest recap appears once in the page layout | Existing shared Topic/diary composition and section order retained. | Current web/native rendered comparison pending. |
| The notebook opens the same reading content | Native TopicInfo and ScanHistoryPopup reuse TopicScanRecap and Source footnotes. | Expansion and permitted footer-detail comparison pending. |

## Remaining acceptance

The signed-in owner checks cover creation, all-format web/native round trips, checklist saving, comment posting and persistence, larger text, back navigation and conflict recovery after restart. The private fixture remains for manual review.

Remaining iPhone checks include software-keyboard/caret behavior, rich paste and the remaining toolbar/link commands, metadata rejection/cancellation, offline transport/reconnect, account boundaries and cross-account badges. Team-editor, read-only and admin device checks are manual acceptance at the user's request. Permanent account deletion has not been performed on the user's account.

Complete the outstanding native theme, VoiceOver, reduced-motion, tablet, share completion/failure and Finding playback scenarios listed above. iPhone share cancellation has passed manual acceptance. Keep a failed automation attempt separate from a product failure or a verified pass.

Run the embedding command after the local embedding service is available. Android acceptance remains deferred. Keep any task containing an unrun requirement unchecked.


## Expanded page parity and loading checks — October 26

The expanded implementation now includes native Profile, Teams, Team details, Activity, Account, Plans, shared tables, and their form/action adapters. This section records the current code checks without replacing the manual acceptance gaps above.

### Shared implementation

- Core owns table/domain columns, account budget and fields, plans, Team and invitation fields, footer, Topic loading order, and the five menu-page skeleton layouts.
- Platform adapters supply DOM/native elements, navigation, touch targets, system pickers, and authenticated attachment previews. Web and mobile retain their own runtime-specific controls.
- Advisory Team name checks ignore stale replies and preserve authoritative save validation. Hook tests cover stale responses, owned names, and offline lookup failures.
- Attachment downloads use the configured authenticated API client. Tests cover the native session cookie and rejected access. Preview files remain available until the parent unmounts.
- Report issue uses the shared field styling, one visible question/input, Cancel, and Send report. Native prompt paperclip and attachment selection share one file picker.
- The Home/Settings bottom bar is hidden. Header navigation retains the existing Feed and Search route state. The iPhone showed the loaded feed without the extra bar.

### Current automated checks

| Check | Result | Evidence |
| --- | --- | --- |
| `bun run check` | Passed: 2,384 tests, zero failures; Biome, boundaries, component parity, TypeScript, and workflow checks passed | `/tmp/mobile-pages-skeleton-check.log` |
| `bun run build:ui` | Passed | `/tmp/mobile-pages-skeleton-ui-build.log` |
| `bun run build:storybook` | Passed | `/tmp/mobile-pages-skeleton-storybook.log` |
| iOS bundle export | Passed | `/tmp/mobile-pages-skeleton-ios-export.log` |
| `openspec validate mobile-tasting-notes --strict` | Passed | CLI output |
| `git diff --check` | Passed | CLI output |

The first sandboxed gate could not bind the mock scanner's local ports. Re-running with local-server permission passed. The iOS export validates bundling; it does not replace device acceptance.

### Loading presentation

Profile, Teams, Activity, Account, and Team details consume `core/components/PageSkeleton`. Both app stylesheets scan its shared utility classes. Matching stories cover all five layouts and Profile topics loading separately. Topic continues through its shared composition and now reuses the native pulse.

Web previews were inspected at 375 pixels in light and dark themes. The Profile and Team identity/table shapes and Account budget rendered correctly. Teams, Activity, and Account exposed their named busy status with content width equal to viewport width. The dark placeholder fill was adjusted to remain visible against the page background. Native placeholders use the same Nightshift fill and geometry.

Live reports, invitation delivery, billing changes, permanent deletion, and role-specific mutations were not performed as unattended QA. The user's remaining manual role checks and deferred Android acceptance stay open.

The iPhone component browser rendered the Profile skeleton in Latte with the shared identity, heading, table, totals, and second-section spacing. Its story scrolls to the later table. The native story argument serialization issue found during this check was fixed by moving the React child into its render function. Automated checks passed afterward.

The iPhone Account skeleton also rendered its fund title, spend meter, checkpoint rows, daily usage, and plan at full content width. The app was returned to the feed after preview checks. Reduced-motion and VoiceOver device acceptance remain open; the shared implementation follows the existing system preference hook.


## Final page/action audit and telemetry — October 27, 2026

Detailed scope, rendered checks, fixes, and remaining acceptance are in [parity-audit.md](parity-audit.md).

- Required gate: `bun run check` — 2,394 passing tests across 397 files, no failures. Includes request-scope isolation, device attribution, credential preservation, private note path shaping, and native error/span redaction. Final log: `/tmp/carlnotes-parity-telemetry-final-check.log`.
- Web build: `bun run build:ui` passed. Log: `/tmp/carlnotes-parity-telemetry-ui-build.log`.
- Component browser: `bun run build:storybook` passed. Log: `/tmp/carlnotes-parity-telemetry-storybook.log`.
- iOS bundle: `doppler run -- bun run --cwd apps/mobile expo export --platform ios --output-dir /tmp/carlnotes-parity-telemetry-ios` passed. Log: `/tmp/carlnotes-parity-telemetry-ios-export.log`.
- `openspec validate mobile-tasting-notes --strict` and `git diff --check` passed.
- iPhone runtime: labeled PostHog and Sentry test events both reported successful flushes. Native navigation recorded three breadcrumbs using Expo Router's public navigation ref. Evidence: `/tmp/carlnotes-mobile-telemetry-delivery.png`.
- iPhone runtime: Share Topic → Report issue retains a visible sheet with the bordered input, Cancel, and Send report. Cancel returns to the feed. Evidence: `/tmp/carlnotes-mobile-report-sheet.png`.
- Web/native visibility icons and native dropdown width were visually checked. Evidence: `/tmp/carlnotes-parity-visibility-web.png` and `/tmp/carlnotes-parity-visibility-iphone.png`.

The iOS export retains an upstream warning about Sentry's optional internal Expo Router module lookup. Navigation uses the working public ref adapter. SDK posting/flushes were checked; dashboard grouping, issue details, source maps, and production ingestion remain for the user's later dashboard sign-in. No deliberate native crash was triggered.

The sandbox initially blocked six test listeners and two external password checks. The full authorized rerun passed. Android remains deferred. Non-owner device, accessibility/large-text, full theme/layout, and remaining mutation/failure-recovery checks remain open. No credentials, billing, or account deletion were changed. No commit or push was made.

## Ship review fixes — October 27

- A confirmed note denial or revoked edit grant retires the local draft even when the companion request fails. Native loader tests cover both request orders.
- Closing the last clean note editor releases its controller. Pending drafts retain their original version until saved, then release the closed controller.
- Web and native Brew polling share a serialized timer and backoff. Native polling requires a focused route, active app, and connection, and refreshes only that Topic.
- A confirmed missing or gated Topic clears a cached diary. Transport failures remain retryable.
- Rejected Markdown destinations already present in formatted labels display once.
- Task 5.3 is complete from the recorded desktop/narrow layout, toggle, permissions, and deletion-story checks. Other unfinished acceptance remains open.
