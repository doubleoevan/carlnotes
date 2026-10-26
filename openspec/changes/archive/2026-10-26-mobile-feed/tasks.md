# Tasks

## 1. Extract shared Feed state and preserve web behavior

- [x] 1.1 Install the workspace dependencies missing from this checkout and add core's existing-version TanStack Query dependency. Verify the boundary check resolves the universal dependency closure and record the baseline `bun run check` result.
- [x] 1.2 Extract `useTopicFeedState`, pure Feed/tag selection, and shared presentation labels into the design's core modules. Use explicit state and options types; verify selector tests cover every view, tag mode, kind reset, bookmark scope, and sort, including Featured order and ties.
- [x] 1.3 Reduce the web provider to session/loader input, context, pathname resets, and `hasTopicFeed`. Keep its existing consumer exports; verify the existing Home and Topic route tests retain visitor hydration, signed-in isolation, and markup.
- [x] 1.4 Add a web-owned React DOM hook harness and shared hook tests for defaults, identity changes, navigation reset, loader seeding, reheat generation, failed reads, and known-offline refresh. Verify these tests run without importing a native component.
- [x] 1.5 Update `packages/core/AGENTS.md` and `apps/web/AGENTS.md` for the extracted concerns. Verify their module names and dependency descriptions match the import graph and the focused core/web tests pass.

## 2. Share Finding actions and plain-text presentation

- [x] 2.1 Convert the four touched Finding write helpers to options objects with `shouldThrowOnError`, retaining the default behavior and existing messages. Update every caller; verify client tests cover HTTP rejection, network rejection, successful writes, and silent background-open failure.
- [x] 2.2 Distinguish failed Topic-page reads from gated or missing results in the client. Verify a server error throws, existing gates remain recognized, and existing web Topic tests preserve their visible behavior.
- [x] 2.3 Extract the shared Finding action hook and router-free page handlers. Add optional mutation-derived optimistic changes and acknowledged cache updates; verify web defaults retain their prior action timing and page reload behavior.
- [x] 2.4 Test optimistic bookmark, consume, open, rating clear, and thumbs-down removal across Home and Topic data. Verify failures restore only their action, overlapping Findings remain independent, same-Finding writes are guarded, and a failed reconciliation read preserves an acknowledged save.
- [x] 2.5 Reuse `toPlainText`, `toOneLineText`, and existing date/age helpers. Extend shared text tests for links, image alt text, emphasis, headings, lists, inline code, empty input, and line breaks; verify existing speech and metadata tests still pass.
- [x] 2.6 Update core and client guides for action ownership and helper options. Verify the moved modules follow code-style, export explicit contracts, contain no platform imports, and pass the focused client/core/web tests.

## 3. Persist account-bound reading queries

- [x] 3.1 Add the TanStack Query persistence packages at versions compatible with the installed Query release and reuse AsyncStorage. Verify successful dependency installation without a second React or incompatible Query instance.
- [x] 3.2 Implement pure cache rules for `carlnotes:feed:<userId>`, the build/update buster, and the home Feed plus latest visible Topic allowlist. Verify tests reject other identities, each changed buster input, gated/error/auth queries, and all mutations.
- [x] 3.3 Implement restore-before-query, matching retention settings, latest-Topic eviction, and corrupt-storage recovery. Verify injected-storage tests restore the last confirmed Feed offline and never serialize tentative edits or replay writes.
- [x] 3.4 Implement persistence lifetime cleanup with cancellation and storage-write ordering. Verify delayed writes and old query responses cannot repopulate the cache after sign out, account change, or revocation.
- [ ] 3.5 Connect Settings sign out, successful account deletion, and unauthorized-session handling to cleanup. Verify failed deletion retains the session/cache, successful deletion clears content despite a later sign-out failure, and failed sign out can resume a clean lifetime.
- [ ] 3.6 Connect the existing Expo network and native app-focus signals to Query and clean up their listeners. Verify reconnect refreshes stale reads, offline writes roll back, and mobile unit tests import no native implementation.
- [x] 3.7 Update `apps/mobile/AGENTS.md` with storage, query eligibility, build busting, and session cleanup. Verify every documented rule has a corresponding pure test or named device check.

## 4. Add the native shell, links, and tutorial

- [x] 4.1 Consult the running Nightshift Storybook catalog before writing components. Add Expo-compatible Expo Image and WebView, the embedded YouTube wrapper, the web's Simple Icons version, and the current stable FlashList release; verify dependency compatibility and the installed FlashList API.
- [ ] 4.2 Add the mobile `common/AnchorLink` and route existing session links and logos through it. Verify internal routes, browser links, scheme links, and replacement navigation in stories without introducing bare feature-level framework links.
- [x] 4.3 Move Home and Settings into the tab layout and add the protected Topic stack route. Verify `/` and `/settings` still resolve, visitors cannot reach guarded screens, sign-in form replacement still works, and the development Storybook route remains available.
- [ ] 4.4 Build the compact shared Header with the existing mug, wordmark, and tutorial icon. Use the Topic logo to return to retained Search when present, otherwise Home, without a visible Topic Back button. From Search, clear its query and filters on the logo's Home action. Move account identity to Settings; verify Home logo reheat, retained Search, return Home, tab navigation, back gestures, and a single Settings header.
- [ ] 4.5 Extract tutorial opener/event construction to core and update the web dialog to read it. Implement the mobile YouTube sheet and Settings option; verify actual-play deduplication, opener properties, stop-on-dismiss/background, playback error fallback, and disabled analytics.
- [ ] 4.6 Add Header, link, tutorial, and Settings stories with named web references. Verify both palettes, enlarged labels, sheet focus return, and each control's platform touch target and accessible state.
- [x] 4.7 Write the visual authority rule and every native replacement from the design into `apps/mobile/AGENTS.md`. Update route/module documentation and existing mobile story references; verify all listed paths and web counterparts exist.

## 5. Implement Home, Topic reading, and Finding rows and details

- [x] 5.1 Add pure flattened-row construction with section/Topic/card keys and recycling types. Verify tests cover repeated Topics across sections, initial open-section rules, empty sections, the five-Finding preview, in-place expansion and collapse, bookmark ranks, and separators.
- [ ] 5.2 Replace the demo Home with one FlashList over the shared Feed. Match the web's section counts, linked Topic titles, notebook tile and Topic roast sheet, team-or-owner bylines, plain unread counts, separate share icons, tags, and spacing. Verify all four sections, card recycling, in-place more/less controls, loading/empty/error states, and pull-to-refresh reheat without nested scrolling lists.
- [ ] 5.3 Implement the Topic screen over its account-keyed page query and shared selectors. Verify all delivered Findings, Topic changes, distinct gate/missing/error states, retained content on read failure, and page-plus-Feed refresh.
- [ ] 5.4 Implement compact TopicResource rows matching the live web, with rank/bookmark marks, kind icons, metadata, and shared card edges. Tapping opens a details sheet with full notes, on-demand source preview, Fetched, Views, and permitted actions. Verify details alone do not record an open; the explicit source link records once and opens its browser even if recording fails.
- [ ] 5.5 Add sort and finding-filter bottom sheets using the installed library and shared labels. Verify Relevance/Newest/Trending, All/Unread/Bookmarked, Team bookmark choices, dismissal/focus behavior, and shared tag and Resource-kind controls.
- [ ] 5.6 Add Home, Topic, and card stories for unread, consumed, bookmarked, Team-bookmarked, up-rated, removed down-rated, pending, rollback, read-only, missing-image/metadata, and long-content states. Verify each names its web reference and supports both palettes and enlarged system text.
- [x] 5.7 Update mobile/core module documentation for Feed components, rows, selectors, and the shared handlers. Document the requested toolbar, read-only Topic cards, and explicit web handoffs. Keep native editors and a standalone Finding route outside scope.

## 6. Verify the integrated change

- [x] 6.1 Run `bun run check` with dependencies installed and resolve failures caused by this change. Verify Biome, package boundaries, component parity, TypeScript, workflow bundling, and the full suite pass, with no unresolved universal dependency checks.
- [ ] 6.2 Run the existing mobile export for both platforms and rebuild both development clients for the native dependencies. Verify Metro resolves each bundle and production bundles retain the existing Storybook exclusion.
- [ ] 6.3 Compare the web Feed, header, filters, sort, and actions before and after extraction. Verify identical visible behavior for visitor, owner, subscriber, and Team-member cases, including server hydration and permission restrictions.
- [ ] 6.4 Capture web at 375 pixels and native iOS/Android comparisons in both palettes. Verify text scaling, screen readers, target sizes, safe areas, tablet reading width, reduced motion, tab/back navigation, sheet dismissal, images, and actual tutorial playback.
- [ ] 6.5 Verify a cold offline start, refresh failure, reconnection, account switching, sign out, revocation, successful/failed account deletion, and app-version/update busting on development clients. Confirm no old-account content or offline write replay appears.
- [x] 6.6 Run `openspec validate mobile-feed --strict` and review the implementation against all five delta specs. Verify the change review includes module documentation, test results, and named visual references, with earlier OpenSpec tooling edits identified separately.

## 7. Fill the requested web parity gaps

- [x] 7.1 Compare the live site and web sources for sharing, the toolbar, action bar, and Topic cards. Add matching native controls and named stories.
- [x] 7.2 Connect site search, tag and Resource-kind filters, native sharing, and scan-note reads to the existing clients. Keep transient queries outside the persistence allowlist.
- [x] 7.3 Add visible New Topic and unfinished-action placeholders with explicit web handoffs, plus the web Topic page card order.
- [x] 7.4 Verify the new sheets, search results, private sharing gates, card expansion, and navigation on iOS. Rebuild the approved iOS client with Expo Clipboard and verify both copied URLs. Android rebuild and runtime verification remain in 6.2 and 6.4.
