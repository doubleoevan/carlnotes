# Tasks

This is the running bug list from device review. Add new reports here as they arrive; keep implementation and broader device verification distinct.

## 8. Home and Topic form controls

- [x] 8.1 Restore Home's Reheat action with Lucide Coffee through the shared PageActionMenu and feed handler.
- [x] 8.2 Share TopicSource and TopicDefaultSource composition with web. Replace the source toggle and fallback diamond with web's labeled row and add/remove controls. Share staged summary formatting and map the search source icon correctly.
- [x] 8.3 Move the anchored-control portal above modal sheets. Add an InSheet dropdown story.
- [x] 8.4 Verify Android Reheat and all Topic form dropdowns: frequency, weekday, maximum findings, visibility, and source type. Compare light/dark Source rows with web.

## 9. Note controls and comments

- [x] 9.1 Make the faint title pencil a standard Button that focuses the name input. Use foreground contrast for pencil and Close; retain standard visibility and destructive buttons.
- [x] 9.2 Add a visible Comments button beside Close and show the existing shared thread in a native sheet, matching web's phone layout. Use the sheet's keyboard-aware input and preserve read-only permissions.
- [x] 9.3 Verify Android comment typing, posting, confirmed deletion, sheet dismissal, and retained body edits. Check long notes, read-only notes, and both themes.
- [x] 9.4 Rename NoteStatic to NoteViewer in core, web, mobile, their stories, callers, tests, and module documentation.

## 10. Inline YouTube playback

- [x] 10.1 Intercept native player navigation and new-window requests. Keep embed playback inside the app, without an extra Open on YouTube link. Add URL-policy regression coverage. Match web's tutorial and preview play buttons.
- [x] 10.2 Verify inline tutorial, chat, and Finding playback on Android. The user narrowed video QA to inline play and web parity; enlargement checks are not required. Do not claim playback verified from URL-policy tests.

The user has reached the native app for QA. A later fresh Google OAuth flow also returned to the app successfully; see the evidence below.

## 11. Account budget colors and labels

- [x] 11.1 Restore all shared spend-meter color classes to both web and native stylesheets. Keep dots with their labels and use compact spacing when the legend wraps. Add matching narrow stories and a browser color regression.
- [x] 11.2 Check cutoff rules and local seed-account settings. The Evan seed account has role admin, Plus plan, and no budget override; its $1,000 backstop intentionally has no cutoff markers. Seed Free/Plus/Premium accounts have normal user roles. No account settings changed.
- [x] 11.3 Verify all three bar segments and legend colors on Android and web in both themes. Check markers with a cutoff-enabled account or story separately from the admin case.

## 1. Shared thinking line

- [x] 1.1 Share the phrase deck and stable ThinkingLine composition, add the native shimmer, and document module moves. Verify phrase-cycle tests, unchanged web output, wrapping, and reduced-motion stories.

## 2. Reply controls

- [x] 2.1 Remove mobile's extra reply ×. Verify that selecting @all preserves draft text and sends no parent-message reference; retain matching icons and labels.

## 3. Message deletion

- [x] 3.1 Add shared confirmation wording with the existing web dialog and native alert. Verify Cancel sends nothing, Confirm deletes once, permission gates remain, and failure leaves the message visible.

## 4. Integration and device checks

- [x] 4.1 Run `bun run check` and validate this change; record the results.
- [x] 4.2 Compare rendered web and Android chat in light/dark modes, including enlarged text, animation lifecycle, reply selection, and deletion confirmation. Record any unverified iPhone checks.
- [x] 4.3 Install and open the completed Android preview, and retain the physical-iPhone installation link.
- [x] 4.4 Deliver a compatible preview update after the fixes pass device checks. Verify the running build/update identity.

## Review evidence

- Implementation is present for the chat gaps and the additional session/navigation reports below; native verification is tracked separately.
- Latest repository gate after the Android fixes and NoteViewer rename: 2,489 tests passed across 420 files, zero failures. Biome, boundaries, component parity, types, and the workflow bundle checks passed. The diff has no whitespace errors.
- Android Reheat opens the refresh state and retains the feed. Frequency, weekday, maximum findings, and visibility dropdowns open above the Topic sheet and retain selection. The default web Source uses the shared labeled row and remove control.
- Android video QA reproduced a native WebView graphics crash. Running the existing emulator with `-gpu swangle` resolved it: tutorial playback advanced past 24 seconds inline and the user confirmed it works. The same emulator's graphics preference now retains that mode. Chat and Finding playback also advanced inline during separate Android checks. Both retained the app and omitted the extra external link.
- Final iOS and Android production JavaScript bundles exported and published to preview after all device fixes and shared-code cleanup. Existing Expo Router export-resolution warnings used file-based fallback and did not prevent bundling.
- Additional shared-component regression: the selected phrase survives a web rerender and its styles update. Phrase-cycle and @all draft-preservation tests pass.
- Web confirmation story: Cancel calls no deletion; Confirm calls it once with the selected message id. The ordinary-member story retains the permission gate. Dark and light previews run without browser errors.
- Actual component reuse: both apps consume core's `ThinkingLine`; web uses its existing `ConfirmDialog`. Existing shared room-message composition remains in place.
- Shared logic and copy: the phrase deck, selection state, and deletion wording. Native replacements: the text shimmer and system confirmation alert, because CSS and DOM dialogs do not render natively.
- Physical-iPhone build: `c396bc2d-073d-405f-9f7e-95cdcd8811aa`, finished before this fix pass. Android preview: `a4a0b673-9d48-4947-95df-dd4ad3eff9c5`. Android development build for iterative checks: `7bc5e277-74d2-4141-8f20-006c7229fbb7`.
- Both Android builds finished. The standalone preview installed and opened at sign-in; the development build then installed over it without clearing app data. Its runtime matches the preview: `3addfc89fb2fca5cc0d9a81c96faa76a0997ace8`.
- The local mobile server needed IPv4 rather than IPv6-only localhost for the Android connection. Restarting the emulator with host graphics restored input; the explicitly authorized “Don’t allow” choice dismissed Nearby devices. Reconnecting port 3000 restored access to the local API. The final compatible preview update is now published; delivery evidence follows.
- iPhone checks for these new fixes are not yet verified. No iPhone simulator is running alongside Android.

## 5. Session pages and visitor navigation

- [x] 5.1 Align Sign up / Log in beside their prompts, retaining wrapping and touch targets. Remove the global footer from both session screens, matching web. Verify both forms on Android.
- [x] 5.2 Let the session logo open the existing public homepage. Reuse feed queries, search, public Topic/Profile/Team/note screens, and server visibility rules. Keep account-only routes and writes behind authentication; verify public browsing, account transitions, and visitor menus.
- [x] 5.3 Check the visitor feed, filter, finding-details, and session-link stories and rerun the repository gate after these additions.

## 6. Android Google sign-in

- [x] 6.1 Restore Android's connections to the local API and web callback. Normalize 127.0.0.1 to localhost in development so the browser's state-cookie hostname matches the OAuth callback. Add a regression test and document the setup.
- [x] 6.2 Verify a fresh Google sign-in returns to the Android app with a session. An interrupted callback cannot be retried by reloading the browser error page.

The local redirect probe reproduced a cookie on 127.0.0.1 with a callback on localhost. With the fix, both use localhost; sign-in initiation returns 200 and the Expo browser proxy returns 302. The server reported missing/mismatched state-cookie verification. No state validation was disabled, and no production sign-in settings changed. A fresh Google flow completed on Android and returned to the native account feed. The local browser first required sign-out because the existing proxy guard rejects a browser session. No guard was relaxed.

## 7. Android browser rendering

- Deferred at the user's request: Android Chrome showed magenta blocks and duplicated, overlapping row fragments. The same account's local feed renders correctly in the other browser; the emulator log contains bad color-buffer handles and graphics-context restoration errors. Focus on getting into the native app for QA. The light theme's cream background and white cards are intentional. Native-app sign-in and rendering remain separate checks.

## Final Android audit evidence

- Source controls: the RSS type picker opens above the Topic sheet, accepts a full URL, and stages the expected summary. Removing the final Source shows the shared warning. With RSS present, the web Source can be removed and restored. The unsaved test form was discarded. Light and dark rows retain the web structure.
- Notes: full-sentence comments post on the first tap with the keyboard open. Cancel keeps a comment, confirmed deletion removes it, and body edits survive closing and reopening. Long read-only NoteViewer and editable NoteEditor states render in both themes. The disposable QA note was removed.
- Budget: all three segment and dot colors render in light and dark. Narrow legends wrap whole labels without indentation. The cutoff story displays 15%, the moving 58% weekly cutoff, and 90% markers, with all pause descriptions. Admin accounts without overrides intentionally omit them.
- Markdown: both themes render tables as phone cards, safe HTTPS links open and return, raw HTML remains literal, and unsafe/new-topic links remain text. Partial streaming and finished answers render.
- Waiting line: ordinary animation changed 1,275 pixels between sampled frames; reduced motion changed none. The narrow line wraps at font scale 1.3. Backgrounding and returning preserved the story without a crash. The native loop's cleanup and activity listener were reviewed. Font and animation settings were restored.
- Chat: a full sentence posted once to the seed room and Carl answered over the live stream. Cancel sent no DELETE; confirmation removed the message once. The ordinary-member preview hides Delete. Shared action tests cover rejected/offline deletions retaining history, accepted refresh order, retired accounts, and refresh failure. Forced native failure injection was inconclusive and is not claimed as a device pass. Disposable room messages were removed.
- Keyboard: the actual chat Replying menu exposed a hidden option behind the keyboard at font scale 1.3. Shared Select collision insets now keep both options visible, and changing to @all preserves the draft. Chat action targets use separate 48-point boxes instead of overlapping hit slop.
- Session and visitor checks: sign-in and sign-up have aligned links and no global footer. Logo navigation opens the public feed. New Topic leads a visitor to sign-up. A public Topic loads its Findings and shows Follow instead of owner actions. Account isolation and remaining public-route guards were reviewed in code and tests.
- Google: a fresh sign-in returned to the native hotcup account feed. Removed the premature session-store check that reported a false error while that session was updating; the handler now awaits a fresh session read. The existing signed-in-browser proxy restriction remains documented.
- Device scope: one existing Android emulator, no new native build or recording. iPhone checks remain unverified for this pass. Fullscreen video behavior was explicitly excluded by the user.

## Preview delivery

- Published final Android update `01a1816e-15a6-7cd5-a216-04fa79ecaa96` and iOS update `01a1816e-15a6-7beb-80f8-6a1f297ce553` to the preview channel. Both runtime fingerprints match the existing preview binaries.
- Queried Expo with each platform, runtime, and preview channel. Its manifests returned those exact final update IDs.
- Reinstalled the already-downloaded Android preview, version 0.1.0 / build 1. After restart, its sign-in screen showed aligned links without the footer, and the logo opened the public Featured feed. No production writes or sign-in were performed. The preview exposes no on-screen update ID; the exact ID evidence is the delivery manifest, not a device log.
- Restored the existing development build for localhost QA. No emulator data was wiped and no new build was made.
- The physical-iPhone installation page remains https://expo.dev/accounts/carlnotes/projects/carlnotes/builds/c396bc2d-073d-405f-9f7e-95cdcd8811aa. No iPhone device claim is made.

## External review corrections

- Separate accepted message deletion from its history refresh. A failed refresh now keeps the success notice after the server accepted deletion. The existing regression test covers that outcome.
- Use the canonical internal term chat in the mobile sign-in requirement.
- Clarify that visitor content cannot access the outgoing account cache while session exit clears it. The visitor uses a separate query client; removing persisted data may finish asynchronously.
- Record the platform-wording preference in the root AGENTS.md and reuse the standing CodeRabbit/Gemini review authorization in /ship. The external code-style skill remains unchanged.
