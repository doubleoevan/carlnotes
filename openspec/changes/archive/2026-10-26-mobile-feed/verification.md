# Mobile Feed verification

Implementation and device verification are in progress. Unchecked tasks still require their stated checks.

## Completed checks

- Installed the workspace dependencies and the shared Query dependency. `bun pm ls --all` resolves one React 19.3.0 and one Query 5.104.5.
- The first `bun run check` attempt stopped at formatting while implementation was underway. It was not a clean pre-change baseline.
- The package-boundary check passed across 14 workspaces, including core's universal dependency closure.
- The focused suite passed 339 tests across contracts, client, core, mobile pure modules, live shared hooks, and existing web routes.
- `bun run check` passed: 2,284 tests, zero failures, and 11,642 expectations across 377 files. Biome, package boundaries, component parity, TypeScript, and workflow bundling passed. The command required local-network permission for the existing fake-scanner HTTP server tests.
- Cache tests cover confirmed-data restore, failed refresh, gate eviction, build identity, corruption, delayed storage writes, late reads, and account changes.
- Live-hook tests cover visitor hydration, identity changes, filter reset, reheat, non-optimistic web timing, pending edits, rollback, and per-Finding write guards.
- `expo export --platform all` produced iOS and Android bundles after the Topic roast and shared-card shadow changes. Neither Hermes bundle contains `SET_CURRENT_STORY`. Expo Router emitted internal-path resolution warnings and completed both bundles.
- The web Home reference was captured at 375 pixels in Latte and Dark roast.

## Native builds

- [Android development build](https://expo.dev/accounts/carlnotes/projects/carlnotes/builds/5705f38a-414b-4b90-9875-61c1f3b5ec0c)
- [iOS simulator development build](https://expo.dev/accounts/carlnotes/projects/carlnotes/builds/232bf325-4f48-41ae-a720-4fe772080f2d)

Both EAS builds finished successfully. The iOS client was installed on iPhone 18 Pro and iPhone 17 simulators.
Doppler authentication was refreshed, and this checkout's Metro server runs on port 8082.
Android installation and runtime checks remain pending: emulator startup exhausted disk space, so the emulator was stopped.
The user requested iOS verification while that remains blocked.

## iOS checks in progress

- The authenticated Home loaded 26 owned Topics. A Topic opens its independent page with all delivered Findings.
- Relevance, Newest, and Trending change the visible sort. All, Unread, and Bookmarked change the view and close their sheets.
- The brand returns Home from the Topic. Home and Settings tabs work. The Topic header now omits its visible Back button to match the web.
- The iOS edge-swipe gesture returns from a Topic to Home.
- Settings has one heading, account identity, tutorial, sign out, and close-account controls.
- The tutorial loads in the sheet, starts actual YouTube playback, and disappears on dismissal.
- Home, Topic, and Settings were captured in Latte. Home and Settings were captured in Dark roast.
- At iOS's largest accessibility text size, Settings scrolls, labels wrap, and all three sort choices and Close remain reachable. The simulator's original medium text size and light appearance were restored.
- Native Storybook opens after replacing React-element story arguments with serializable values and render functions.
- The sheet now exposes its title, close control, and selected choices individually in the iOS accessibility tree. The container previously hid them. Its background now reaches the bottom safe area while content keeps inset padding.
- A separate disposable account reaches Home with empty owned/followed sections and populated Featured/Popular sections. Guarded Settings and Topic deep links return a visitor to sign-in.
- Marking a public Finding read updates Home and its independent Topic page. The account sees the read control and no unauthorized bookmark or rating controls. Opening another source uses the in-app browser and marks that Finding read. The seeded source URL has no live server, so its browser reports a DNS failure.
- The disposable install's AsyncStorage contains one account cache, exactly the `topic-feed` and `topic-page` query families, and zero persisted mutations.
- Declining Close account preserves the disposable account. Confirming deletion returns to sign-in and removes every `carlnotes:feed:` entry from that install's AsyncStorage.
- A second disposable account shows fresh unread Findings instead of the first account's read state. Sign out returns to the sign-in screen and removes its saved Feed cache. Signing back in creates one account cache with no persisted mutations.
- Relaunching the app online restores the signed-in Home. A missing Topic deep link shows the unavailable state.
- Section headings use Architects Daughter at 20 points, matching the web's `text-xl`. Their extra outer padding was removed.
- The iPhone 17 Browsing story shows linked Topic titles, team-or-owner attribution, tags, plain unread counts, separate share icons, and pluralized section counts.
- The Finding card's extra 12-point bottom margin was removed. An iPhone 17 capture confirms the web's gap above the left-aligned more control.
- A single parent card now owns the Finding list's shadow. The iPhone 17 Browsing capture shows continuous fill between dashed separators and no row shadows.
- The notebook tile opens Topic roast on iPhone 17. Its 21-Finding note scrolls through the final Finding, Sources, and the delivered team/follower counts in one vertical scroll area.
- Swiping the Topic roast down restores the Feed. Expanding 21 Findings and collapsing them back to five succeeds on iPhone 17, with the next Topic still present.
- More/less uses one triangle glyph, rotated for the expanded state, and excludes the arrow from the pressed underline. Two-digit Finding ranks remain on one line without widening the row's rank column.
- The iPhone 17 Finding details story opens a sheet with a centered heading, close icon, source link, preview, full notes, Fetched, Views, feedback, rating, Bookmark, and Mark read.

Full VoiceOver navigation, focus return, background playback, offline startup, session lifecycle, and the remaining story states still need verification.
The user approved a disposable account for destructive lifecycle checks. The existing account must remain intact.
Maestro's shared iOS driver port initially returned the first simulator for both device IDs. A fresh local CLI MCP process and a single active driver isolate the disposable install. The original device's account remains signed in.

## Visual references

Native stories name the current web component or Storybook story they follow.
Header uses `layout-header--user`. Links use `common-anchorlink`.
Feed, Topic, and Finding cards reference `HomePage`, `TopicSection`, `TopicFindingsSection`, `TopicResource`, and `TopicResourceInfo` at 375 pixels.
Sort and view sheets reference `TopicFeedSort` and `SearchFilters`.
Settings references `AccountPage`; tutorial playback references `TopicTutorialVideoDialog` and `common-youtubeplayer--thumbnail`.

## Review against the delta specs

`openspec validate mobile-feed --strict` passes. All five delta specs were reviewed against the implementation, tests, and native observations.

| Delta spec | Evidence | Remaining device checks |
| --- | --- | --- |
| `topic-feed-state` | Shared state and action hooks, universal boundary check, live-hook and selector tests, existing web route tests | Full visitor, subscriber, and Team-member visual parity |
| `mobile-feed` | Home and independent Topic queries, recycled rows, controls, actions, tutorial, account cache, pure tests, iOS navigation and reading checks | Offline restart/reconnect, failure injection, remaining stories and Android |
| `mobile-sign-in` | Protected routes, Settings identity, sign out, confirmed deletion, declined confirmation, account isolation | Failed deletion and sign-out recovery on device |
| `finding-bookmarks` | Shared selectors and actions, permission-aware card controls, Team scope choices and stories | Native Team scope and bookmark failure checks |
| `mobile-app` | Mobile guide, named web references, palettes, enlarged text, sheet accessibility-tree fix | Full screen-reader/focus pass, tablet, reduced motion, Android |

Unchecked tasks remain open; the review does not replace their device checks. Android remains blocked by local disk space.

## Separate tooling edits

The earlier OpenSpec installation updated generated workflows under `.agents`, `.claude`, and `.opencode`.
Those edits precede the mobile Feed implementation. No commit, push, or archive has been made.

## Requested web parity pass

The live public Topic page on carlnotes.com at 375 pixels and the current web components guided this pass.
The mobile toolbar now includes site search, Resource-kind and tag filters, the page actions menu, Tags, and New Topic.
The header includes the secondary navigation menu. Sharing includes the web's social destinations, native Share,
owner invite links, Text, Email, page-link copying, public RSS copying, and a report-issue handoff.

The Topic screen now scrolls its action bar, header, podcast, Findings, Topic roast, Artisanal Blend, episodes,
scan history, Tasting Notes, and Similar topics together. Cards use Nightshift fonts, colors, separators, radii,
and whole-card shadows. New Topic, editing, team management, manual scans, reporting, Notes, and podcast
subscription use explicit web-handoff sheets. Podcast playback opens the existing web player.

- `bun run check` passed after these changes: 2,284 tests, zero failures, 11,642 expectations, and preflight green.
- The final `expo export --platform all` produced both iOS and Android bundles. The known Expo Router internal-path
  warnings remain nonfatal.
- `openspec validate mobile-feed --strict` and `git diff --check` passed.
- On the isolated iPhone 17, the complete Topic story rendered its action bar and podcast. The podcast section
  collapsed and reopened, and its subscription action opened the explicit web-handoff sheet.
- The settings and episode sections collapsed in place. Tasting Notes and Similar topics remained reachable in
  the same scroll area. Add Note opened and closed its web-handoff sheet.
- The public share sheet exposed page-link and RSS options. Before rebuilding, Copy page link displayed
  selectable text when the native clipboard module was unavailable.
- New Topic opened and closed its explicit placeholder sheet. Tag selection added a chip and removing it cleared
  the selection. Newest updated the sort, and the Resource-kind controls remained selectable.
- Searching for Cursor returned live Findings through the existing API. Submitting dismissed the keyboard, and
  closing Search restored the toolbar. The Expo developer overlay initially intercepted Close; moving that
  development-only control cleared the obstruction without an app change.
- Share opened the iOS system dialog with Copy and Open in Safari. Dismissing it returned to the sharing options.
  No destination was selected, no message was sent, and no invite was created during verification.
- The private Topic fixture disabled all four social destinations, native Share, Text, Email, and Copy RSS. Its
  invite action was absent and Copy page link remained enabled, matching the web's gates.
- The hamburger menu opened and closed with Home, Teams, Activity, Account, Plans, and What CarlNotes Is reachable.
- On the rebuilt iOS client, Copy page link and Copy RSS each displayed Copied. Simulator clipboard reads matched
  `https://carlnotes.com/topics/topic-1/better-coffee-at-home` and `https://carlnotes.com/topics/topic-1/feed.xml`.
- A cold Storybook launch exposed a cyclic JSX argument in the CollapsibleSection story. Keeping its text argument
  serializable and rendering Text in the story fixed the launch. The full gate passed again with 2,284 tests.

The user approved the EAS source upload and iOS rebuild. The [new iOS build](https://expo.dev/accounts/carlnotes/projects/carlnotes/builds/1bf24417-b0a4-4aab-8679-b58f0f01e958)
finished successfully and was installed on the isolated iPhone 17. Both native clipboard actions passed there.
The primary iPhone 18 Pro was not modified during the initial isolated verification.
Android runtime checks remain unverified after the earlier disk-space failure; the user requested iOS verification.

### Local recovery and physical iPhone build

On October 26, the user requested `carl-up` after Docker stalled. Docker's normal restart timed out.
Stopping its stuck processes and relaunching restored the daemon. `carl-up` then completed after LiteLLM finished
starting. Redis, Temporal, LiteLLM, and the scanner ran without container restarts. The scanner completed model
loading and returned HTTP 200 at its localhost root.

The verified simulator client was installed on the user's iPhone 18 Pro simulator, preserving its signed-in account.
The feed loaded 26 Topics with the updated search bar, New Topic action, bylines, tags, and Finding cards.
Metro and the API responded at the Mac's Wi-Fi address. Metro's manifest advertised that address for both its
bundle and host, confirming that it does not direct a physical phone to localhost.

The [physical iPhone development build](https://expo.dev/accounts/carlnotes/projects/carlnotes/builds/7ca87c5d-4ce9-425f-8b6d-9947712b7b86)
finished successfully using the existing provisioning profile for the registered iPhone. Its IPA is ready to install.
Installation and runtime verification on the physical phone require the user to open the install link there.

## Reuse and parity audit — October 26

The audit compared the current web sources, their Nightshift stories, and the running local web Topic page with iOS.
The current live-browser comparison used desktop width. Earlier 375-pixel references still guide the mobile layout;
this pass does not replace the outstanding phone-width, Android, both-palette, and accessibility comparisons above.

### Reuse decisions

The root `AGENTS.md`, mobile's “Visual authority and native replacements” section, and the opening web guide now require reuse first.
Agents must check whether a small platform adapter enables sharing before adding a native renderer.
Copying or restyling a component does not count as component reuse. Reports must distinguish shared components, shared logic, and native replacements.
The mobile checklist covers visibility, states, formatting, styling, behavior, and justified platform adaptations.

| Area | Shared implementation | Platform rendering |
| --- | --- | --- |
| Source footnotes | Core `sourceResults.ts`: ordering, totals, status, details, and tooltip copy | Web's DOM chart and mobile's native `SourceResultsChart` remain separate. Mobile reuses its chart across diary entries. |
| Diary and copied notes | Core `topicScanRecap.ts`: fields, missing/failure copy, and copied Markdown | Native `TopicScanRecap` uses `markdown-to-jsx/native`; web uses the library's DOM renderer. |
| Topic Sources | Core `topicSources.ts`: ordering, disabled defaults, and screening messages | Both Topic info views and the web editor consume those rows and messages. |
| Table pagination | Core `usePagination`: page selection, row slicing, and clamping; contracts supply page sizes | Web keeps its DOM select and server-rendering wrapper. Native uses existing Nightshift buttons and a choice sheet. |
| Section pagination | Core page-slot rules | One native `Pagination` renders episode and Brew diary controls. |
| Search labels | Core `toAgoLabel` | Both search result lists use the same relative-time copy. |
| Controls and styling | Existing Nightshift Button/Badge contracts, fonts, colors, radii, and shared icon definitions | Native primitives still render Pressable, Text, and native SVG instead of DOM elements. |
| Scrollable notes | Shared copy payloads and existing theme tokens | Native `ScrollBox` handles nested gestures and its orange indicator; it is reused in the diary, Topic roast, prompts, and Finding notes. |

This pass extracted shared logic and reused existing design contracts. It did not convert the web's composite UI components into universal components.
The chart, scrollbox, diary, and pagination still have separate renderers because their existing implementations use DOM elements,
browser scrolling, or browser controls. These remain candidates for further component extraction where adapters reduce duplication.

### Gaps fixed

- Dear Diary now has bounded Markdown, a copy action, Source footnotes, proportional read/kept bars, expandable details, and cost/duration metadata.
- Orange scroll indicators remain visible when a bounded note overflows. The same native scrollbox serves the other long-note panels.
- Add Note uses the primary button. The empty-state Topic link opens the same editor handoff.
- Topic info shares Source ordering and screening copy with web. Disabled default Sources are muted, and failed scans show the failure treatment.
- Topic visibility includes its icon, and “not brewing” links to Plans. The featured episode title uses the web's foreground treatment.
- Brew diary and episode lists use five-row pages. Episodes expose seasons; Similar topics uses the web's Rows selector and table footer.
- Account exposes the full web account settings through a labeled button.

### Verification

- `bun run check` passed after the shared pagination extraction: 2,286 tests, zero failures, 11,654 expectations, and preflight green.
- `git diff --check` passed. No commit or push was made.
- On iPhone 18 Pro, scrolling a long diary entry moved its orange indicator while preserving the sheet. Copy also preserved the sheet.
- Both Add Note and the empty-state Topic link opened the same editor handoff and closed successfully.
- The live AI Coding Topic diary rendered 10 kept from 140 read across 10 Sources. The web search row showed 10/45.
- Tapping that Source expanded its read/kept details; tapping again collapsed them without dismissing Dear Diary.
- Brew diary's next-page control displayed the second page.
- Similar topics advanced to page two, opened the Rows choice sheet, and switched from five to ten rows successfully.
  The first attempt targeted a footer below the scroll viewport; scrolling it fully into view made the interaction pass.

### Remaining gaps and limits

Native podcast playback, seeking, and player management still open the web player. Chat, rich Tasting Note editing,
and the complete Team, Profile, Activity, Admin, and account workflows still require web handoffs.
Mobile does not yet hydrate the web menu's unread badges. The collapsed Topic roast does not reproduce the web's fade treatment.
These are recorded functionality or presentation gaps, not completed native parity.

This pass did not retest every permission state, Source removal, slow/error request, physical phone, enlarged-text setting,
or screen-reader transition. Android runtime verification remains blocked by the earlier disk-space issue.
The Storybook picker renders but its open tree was absent from Maestro's accessibility snapshot; this limits automated story selection.
The new older-season fixture and episode pagination still need a device interaction check.

## Shared component extraction — October 26 follow-up

This follow-up replaces duplicate composition with nine React components in `packages/core/components/`.
Both web and mobile import them. It supersedes the earlier pass's logic-only reuse decisions and Rows choice sheet.
Core remains free of DOM and native imports; each app supplies typed platform elements at module scope.

| Shared component | Responsibility shared by both apps | Platform adapter retained |
| --- | --- | --- |
| `TablePagination` | Rows choices, page reset, footer visibility, previous/next actions and disabled states | Web select and SSR wrapper; native anchored dropdown and touch targets |
| `Pagination` | Previous/next controls, numbered slots, gaps, current-page state and labels | Web links, SSR policy and scroll restoration; native buttons |
| `TopicScanRecap` | Note/Findings grouping, Source chart placement, placeholder and footer gates | DOM/native Markdown renderer, scrollbox and footer elements |
| `SourceResultsChart` | Heading, date, totals, row order, one expanded row, earlier findings and removal eligibility | CSS subgrid/tooltips versus native flex layout and font scaling; bar and row elements remain platform-specific |
| `NumberedTopicFindingList` | Finding order, rank, title, destination, Source visibility and explanation | HTML list/anchors versus native layout and links |
| `SafeNoteLink` | Finding URL allowlist and safe fallback content | DOM anchor/text versus native anchor/text |
| `TopicScanFailure` | Failure copy, account link and budget-upgrade action | Inline HTML or native Text, platform buttons and navigation |
| `MoreButton` | Expanded label, arrow and activation composition | DOM focus/hover and native pressed/touch behavior |
| `CopyMarkdownButton` | Successful-copy feedback, repeated-copy timing and unmount cleanup | Browser clipboard/tooltip and native clipboard/announcement; button drawing remains platform-specific |

The native `Select` comes from React Native Reusables' Uniwind registry, adapted to Nightshift. The app layout mounts
its `PortalHost`. The menu stays anchored to Rows and fits within the safe area. It does not use the details sheet.
No native binary rebuild was needed for these JavaScript-only dependencies.

### Boundaries reviewed

- The Feed, Topic and search screens retain app-level composition: web has server-rendered links and paged HTML;
  native uses Expo routes, recycled Feed rows, safe areas, and retained search state. They already share Feed queries,
  filtering, labels, Finding writes, pagination state, and view recording. This pass does not claim whole-screen reuse.
- Sheets, links, scrollboxes, media, avatars and branding retain platform rendering for native gestures and focus,
  Expo navigation/browser/clipboard, native images/SVG/animation, and WebView video. Nightshift supplies their tokens,
  button/badge contracts and shared icon paths. Native scrollboxes remain reused across diary, roast, prompts and notes.
- Header, account and session controls retain platform authentication, storage and navigation. The visible menu
  still follows the web reference; separate platform code does not permit a styling or visibility exception.
- Podcast cards and play controls still hand off to the web player. Tasting Notes and editor actions still hand off
  to the web editor. Those are recorded functionality gaps, not claims of shared playback or editor components.
- Topic info and Source lists share their domain rows and formatting. Finding details retain native sheet, share,
  preview and mutation presentation. The prior permission, badge and full screen-reader gaps remain open.

### Regression scope

The reusable components also change web rendering. A focused web pass covers:

1. Similar topics: Rows 5/10/25/50, previous/next, page reset on size/sort, disabled arrows and a one-page table.
2. Brew diary and episode pages: numbered controls and stable scroll position after switching to a shorter page.
3. Dear Diary: bounded note scrolling, copy feedback, Source detail open/close, missing/failure copy and cost visibility.
4. Findings and chapters: more/less labels and arrows; links in Topic roast and notes; no stray trailing separators.
5. Both palettes and phone width: legible labels, controls and orange indicators; keyboard focus on web and touch targets on mobile.

Live web checks passed for Similar topics next/Rows changes, Dear Diary Source expansion/collapse and copy feedback,
and Finding expansion/collapse. The new web integration tests exercise size/sort resets, retained focus/control identity,
pagination scroll restoration and single-row Source expansion. Existing recap security and failure-copy tests remain in use.
Both iOS and Android production bundles exported successfully. Expo Router's existing internal-path warnings remain nonfatal.

`bun run check` passed: 2,289 tests, zero failures, 11,677 expectations, and preflight green. The security guard now
follows the extracted `SafeNoteLink`; hostile Markdown behavior remains covered by rendered-output tests. An earlier
run hit the existing five-second ffmpeg test timeout under memory pressure; the complete rerun passed unchanged.
`git diff --check` passed.

On iPhone 18 Pro, the Rows menu displays all four choices within the safe area and selection changes the displayed
rows. Next-page navigation passed. The compact Rows trigger is 48 points wide at the default text size, down from
80, while retaining a 48-point touch target. The shared footer uses total row count: five or fewer results hide Rows
and the pager; five rows on the last page of a larger result set retain Previous. The web integration test covers
the five-result cutoff. The native account and its saved appearance were preserved.

Pagination colors now come from `packages/nightshift/pagination.ts` in both apps: card fill and border with muted
labels for idle controls, and primary fill, border and label for the current page. Native table arrows match the
web's unraised treatment and disabled opacity. Rows uses the same card fill instead of the generic field tint.
Both stylesheets scan the shared classes, so palette changes reach both implementations.

## Ship review — October 26

The final reuse pass adds ResourceMetadata, RatingThumbs, and NotesTable to the nine portable React components already shared by both apps.
Native adapters retain platform links, touch targets, sheets, scrolling, clipboard access, and video playback. The web remains the reference for layout, visibility, copy, and icons.
Root and mobile agent guides require reuse before a separate implementation, named web references, matching terminology and filenames, and rendered parity checks.

Readonly security and performance reviews found and verified fixes for these cases:

- A successful Topic denial now removes its copies from Home, search, and persistence, cancels earlier reads, and dismisses its Finding sheet.
- The sheet observes access passively, preserving the active Topic query's fetch function during Finding reconciliation.
- Transient queries no longer rewrite unchanged reading snapshots. A failed storage write permits retrying the same snapshot.
- Search mounts one server page, with shared pagination and automatic correction when a saved action shrinks the page count.
- Podcast episode and scan-history pagination share `usePagination`. Table sorting uses named options throughout both apps.
- Finding transport moved to `topicFindingClient.ts`; `clientWrite.ts` shares rejection and failure-message behavior with Topic writes.

The cache suite passes eleven tests and twenty-eight assertions, including denied access, late responses, account isolation, deduplication, and retry.
Both reviewers rechecked the fixes and reported no remaining findings. The documentation review corrected export comments, sort comments, and search submission wording.
Strict OpenSpec validation passes. Task 6.6 is complete; the fifteen existing device and broad regression verification tasks remain open.

The Sort and Filters sheets now display the web's Lucide icons. Reheat uses Coffee, and a followed Topic uses the filled PawPrint state.
Both apps share tag labels and the Finding-view option list. Team Topics show My bookmarked and Team bookmarked directly.
Sort, Filters, and Home actions were inspected in the iPhone 18 Pro simulator. The app was returned to Home without changing account data.
Screenshots are `/tmp/carlnotes-mobile-sort-icons.png`, `/tmp/carlnotes-mobile-filter-icons.png`, and `/tmp/carlnotes-mobile-action-icons.png`.

The coordinated Play launch work updated only `apps/web/src/pages/PrivacyPage.tsx` and supplied its own source-backed validation.
This chat added Privacy policy links to native session screens and Settings through the existing AnchorLink.
The policy's notice-before-material-change requirement remains part of publication; this work has not deployed it.

Repeated full checks exposed existing timing-sensitive claim and media tests under machine load. The actual audio mix passed in 10.3 seconds with its assertions unchanged.
Its integration-test timeout is now thirty seconds. The cover test passed independently in 14.4 seconds; its existing thirty-second timeout is unchanged.
The final mechanical-gate result and external-review status are recorded in `logs/ship-report.md` when the review completes.
The user approved private-code reviews by CodeRabbit and Google Gemini. The first app review covered 207 files with no findings; the package review covered 45 files and identified duplicate reports of locale whitespace in scan timestamps, now normalized. The scripts review covered three files with no findings. The spec review identified contradictory navigation-reset and sharing descriptions; those descriptions now match the implemented retained Search and sharing options.

Gemini identified overlap between opening and bookmarking one Finding. Shared action guards now distinguish action kinds, retain mutable tracking in a ref, and apply every pending change in submission order. The Finding sheet uses that same reducer. Its cancellation concern was checked with a live-hook test: an older response that ignores cancellation cannot overwrite an acknowledged bookmark, so the synchronous cancellation ordering is retained.

Focused action and label checks pass nineteen tests and eighty-one assertions. The final full preflight passed 2,296 tests with no failures and 11,704 assertions across 379 files. Biome, package boundaries, component parity, types, and Temporal bundles passed. Strict OpenSpec validation and diff whitespace checks also pass. Final external rechecks and coverage are recorded in `logs/ship-report.md`.
