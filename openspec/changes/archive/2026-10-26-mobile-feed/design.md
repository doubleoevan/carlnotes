# Design

## Context

See `proposal.md` for the motivation and the five delta specifications for the behavior contract.

`TopicFeedProvider.tsx` currently owns the Feed query, filters, sort, reheat, and four Finding mutations. Its router dependencies supply visitor loader data, reset state on pathname changes, and identify pages with Findings. Filtering and sorting already reuse `packages/core/lib/topicFindingFilters.ts`, `topicFindingSorts.ts`, and `topicSorts.ts`.

The web Topic page loads separately through `useTopicPagePayload.ts`. Its action handlers reload that payload. The home Feed uses Query mutations and invalidation. Neither path currently supplies the complete mobile optimistic rollback behavior.

`topicClient.ts` logs rejected writes and shows the configured error, then resolves. A Query mutation cannot distinguish that result from a saved action. Reliable rollback requires an explicit rejected-write path.

Mobile already has authenticated routes, a Query client, AsyncStorage, `expo-network`, `expo-web-browser`, Gorhom bottom sheets, gesture handling, Reanimated, and Nightshift Button and Badge implementations. Its Home is a temporary palette and public-search demonstration. The package has no FlashList, Expo Image, or Query persistence adapter yet.

The Finding contract contains `relevanceExplanation`, which includes the summary and relevance explanation together. It has no separate summary or article-image field. Its existing image input is `faviconPath`. `packages/contracts/spokenText.ts` already exports `toPlainText`; the cards do not need a second markdown parser.

## Goals / Non-Goals

**Goals:** Keep one Feed implementation, preserve the web adapter's observable behavior, and add native reading screens with reversible actions. Keep saved data isolated through authentication and application updates.

**Non-Goals:** No new API endpoint, database migration, offline write queue, full article reader, Topic editor, Source editor, prompt editor, or native audio playback. Site search uses the existing search client. Tags and Resource kinds use the shared filters.

## Decisions

### 1. Extract state by concern and keep navigation in each app

Move the router-free implementation into core. Give the exported hook an explicit `TopicFeedState` return type and an options object. Its inputs include `userId`, optional visitor initial data, and `shouldUpdateOptimistically`, which defaults to false.

The web provider reads the session and loader, calls the shared hook, resets it from its pathname effect, and adds `hasTopicFeed`. Keep its existing context exports and consumer-facing shape. It never passes visitor initial data for a signed-in user. Preserve the 60-second visitor hydration freshness interval.

Mobile mounts one authenticated provider over Home, Settings, and Topic screens. It passes the same session identity and enables optimistic presentation. Its own route effect resets shared filters. A Topic query uses `fetchTopicPage` with `["topic-page", userId, topicId]`; it does not require that Topic to occur on Home.

| Existing concern | Destination | Purpose |
| --- | --- | --- |
| Provider query, filter state, and reheat | `packages/core/hooks/useTopicFeedState.ts` | Own state and expose loading, error, refresh, and reset behavior |
| Provider Finding types, mutations, and router-free page handlers | `packages/core/hooks/useTopicFindingActions.ts` | Own action transport, pending changes, and reconciliation |
| Provider's `filterTopicFeed` and tag matching | `packages/core/lib/topicFeed.ts` | Apply pure Feed selection without a React or router dependency |
| Section titles and empty lines from `TopicSection` and `TopicFindingsSection`; sort labels from `TopicFeedSort`; view labels from `searchFilterOptions` | `packages/core/lib/topicFeedLabels.ts` | Keep shared Feed wording in one module and update the web readers |
| Tutorial opener type and event properties from `TopicTutorialVideoDialog` | `packages/core/lib/topicTutorialVideo.ts` | Share video event construction and accessible wording without a player or analytics SDK |
| Existing plain-text, age, date, and Topic ordering helpers | Their current contracts/core modules | Reuse their existing implementations and tests |
| Router loader, pathname, browser analytics, and platform element rendering | Their existing app modules | Keep platform dependencies outside core; portable React composition lives in core |

`reheat` accepts an optional additional reload callback. Home calls it unchanged. Mobile Topic refresh passes its page refetch so the shared busy state covers both reads. Only a successful complete refresh advances `reheatKey`. Check known offline state before awaiting a refetch so a paused query cannot leave the refresh indicator running.

Core gains `@tanstack/react-query` at the apps' existing version range. It gains no router, native, browser, Bun, Node, or environment dependency. The package boundary check must resolve the installed dependency closure when proving this boundary.

Copying the provider into mobile was rejected: each future filter or action correction would require two implementations. Moving the web provider wholesale was rejected because its loader and router belong to web.

### 2. Keep authoritative query data separate from tentative mobile edits

Convert the four touched Finding write helpers to named options objects. Add `shouldThrowOnError`, defaulting to false, and update every caller in the same change. Preserve the existing error message and silent background-open reporting. The mobile shared handlers request thrown failures; existing web behavior keeps its current default.

Make `fetchTopicPage` reject server failures instead of classifying every unsuccessful response as missing. Keep the existing gated response and missing-Topic handling. This prevents a server outage from erasing a usable saved Topic as though access had been removed.

Represent Finding actions with a discriminated union: opened, consumed, rating, or bookmark, with each variant's own fields. The shared action hook uses Query's mutation state to expose tentative Finding changes when optimistic presentation is enabled. Apply those changes before filtering, sorting, pinning, and calculating unread counts.

Keep the tentative changes outside authoritative query data. Pending edits therefore never enter persistence. After a mobile write succeeds, commit its acknowledged fields to the user's cached Feed and affected Topic, then invalidate both. Release its tentative change after committing, without depending on another network read. A failed reconciliation read never rolls back an acknowledged write. On write failure, remove only that action's change. A failed action cannot undo another Finding's saved state.

Disable additional writes to the same Finding while one is pending. Different Findings remain independent. Mobile mutations use immediate failure behavior while offline and no automatic retries or durable queue. Opening a source records one view attempt and never retries an open event implicitly.

Web leaves optimistic presentation disabled and keeps its existing page reload path. Its header, controls, and action timing remain unchanged. This avoids turning the extraction into a web redesign.

Whole-Feed snapshot rollback was rejected because an older failure can overwrite a different Finding's newer success. Updating each mobile card's private state was rejected because Home and Topic would disagree.

### 3. Use native navigation and one mobile link component

Move Home and Settings into Expo Router's `app/(tabs)/index.tsx` and `app/(tabs)/settings.tsx`, with their tab layout beside them. Add `app/topics/[topicId].tsx` as a protected native-stack destination above the tabs. The public paths remain `/` and `/settings`. Keep the root sign-in guard and development-only Storybook route.

Home and Settings are the two available top-level destinations. A Topic pushes onto the stack. Keep iOS edge-swipe and Android system Back, including predictive Back where the installed navigator supports it. Returning Home through the logo uses the existing Home destination instead of stacking duplicate Homes.

Add `src/components/common/AnchorLink.tsx`, at the web counterpart's path. All mobile links use it. Internal links use Expo Router, HTTP/HTTPS links use `WebBrowser.openBrowserAsync`, and supported scheme links use Expo Linking. Existing session link and logo wrappers use it too. Cards provide an `onPress` callback to record their open; the link owns browser opening.

Use `handle` for local callbacks and `on` for callback props. A Finding row opens its details sheet. The sheet's source link and action buttons are separate pressable siblings. Opening details does not record a source open. A bookmark, rating, or read press cannot also open the source.

### 4. Treat the phone web page as the visual authority

The authority is the corresponding page on [carlnotes.com](https://carlnotes.com/) at 375 pixels, backed by the current web components and Nightshift sources. The older HTML design export does not override the shipped component's current appearance. No PRODUCT.md or DESIGN.md was found during proposal preparation.

Use Latte and Dark roast through Uniwind, Architects Daughter for the matching display roles, and Karla through `toTypeRoleStyle`. Match the web's radius, spacing utilities, icon names, selected states, and component variants. Nightshift currently has no separate spacing module; preserve the web's utility-scale spacing instead of inventing another scale.

Match the web's behavior and design by default, down to padding, font family, type size, colors, hierarchy, copy, and control styling. Topic titles and source links retain Nightshift's link treatment. Each deviation must have a concrete mobile convention as its reason, such as safe areas, touch targets, system text scaling, navigation gestures, or a sheet replacing a popup. Visual preference alone is not a reason to deviate.

Content icons use the same Lucide symbols: FileText, Play, Headphones, Bookmark, Check, Circle, and the rating thumbs. Platform-specific icon components stay in their app. The YouTube icon uses the web's Simple Icons data and the existing shared play-triangle path; use the same package version on mobile. The coffee mug already has a shared Nightshift definition.

Write this replacement table into `apps/mobile/AGENTS.md`, with links to [Apple's Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) and [Material Design](https://m3.material.io/). Brand fonts, content icons, and Nightshift palettes remain the requested brand choices.

| Web pattern | iOS replacement | Android replacement |
| --- | --- | --- |
| Header navigation and account menus | Home/Settings tabs, stack navigation, and secondary destinations in a sheet | Home/Settings navigation bar, stack navigation, and secondary destinations in a sheet |
| Browser history or custom back links | Edge-swipe gesture; the logo returns Home without a visible Back button | System Back button and gesture; the logo returns Home |
| Centered dialog, popover, or radio menu | Dismissible bottom sheet with focus return | Dismissible bottom sheet with Back handling and focus return |
| Destructive confirmation dialog | System confirmation alert with the web's words | System confirmation dialog with the web's words |
| Hover tint and scale | Pressed feedback | Pressed feedback using the installed native primitives |
| Tooltip-only action name | Visible label or accessible label and long-press explanation where needed | Visible label or accessible label and long-press explanation where needed |
| Browser date, time, and choice inputs | System picker | System picker |
| Browser sharing flow | System share sheet | System share sheet |
| Desktop keyboard assumptions | Correct keyboard, return action, dismissal, and avoidance | Correct keyboard, IME action, dismissal, and avoidance |
| Refresh action in the page menu | Pull to refresh, plus the Home logo's reheat | Pull to refresh, plus the Home logo's reheat |
| Browser safe padding | Safe-area insets around header, sheets, content, and tab bar | Status, navigation, cutout, and keyboard insets |
| Small web icon target | At least 44 points through size or hit slop | At least 48 dp through size or hit slop |
| Browser zoom | System text scaling without clipped controls | System font scaling without clipped controls |
| Generic web sign-in button | Required native Sign in with Apple button | Platform sign-in flow and required provider branding |
| Feed scrolling | Recycled scrolling | Recycled scrolling |
| Table and card pagination | Shared pagination controls; Rows uses an anchored dropdown | Shared pagination controls; Rows uses an anchored dropdown |

Keep reduced-motion behavior, the existing portrait orientation, and the app's tablet support. On wider screens, center the reading column and allow platform navigation to adapt without stretching a 375-point card across the display.

### 5. Flatten Feed sections and Findings into one FlashList

Use the current stable FlashList release at implementation time. The reviewed documentation describes v2, which requires the New Architecture already used here and handles sizing without estimates. Do not add v1's removed sizing props. [FlashList migration guide](https://shopify.github.io/flash-list/docs/v2-migration/)

Flatten section headings, Topic headings, Finding cards, empty rows, and expansion buttons into one typed collection. Use a discriminated union and `getItemType` for recycling. Card keys include section and Topic identity because one Topic can occur in more than one section. Findings within each card have stable Finding keys. Recycle whole cards so each list has one background, border, and shadow. Never nest a scrolling findings list inside another scrolling list.

Keep the web's single-open-section behavior and initial section rule. Home previews up to five Findings per Topic under the selected shared sort. The `+ N more ▾` button expands every delivered Finding in place; `show less ▴` restores the five-row preview. The Topic screen uses the same expansion behavior and exposes the same sort and view choices. Expansion state lives outside recycled cells and is scoped by section and Topic on Home. The Topic title remains the link to its independent page. Browsing more Findings never requires navigating away.

Place the shared branded header above the list, with the mug, wordmark, and tutorial button on the hero band. Restore the hamburger’s secondary destinations in a native sheet alongside Home and Settings tabs. From a Topic, the logo returns to retained Search results when present, otherwise Home. From Search, it clears the retained query and filters and returns Home. Topic screens have no visible Back button; native back gestures remain available. Keep one header on Settings and its account identity.

Copy the web Topic heading's complete layout: linked display title, team-or-owner "Brewed by" link with its avatar, plain "N new" text and a separate share icon, then secondary tag badges. Section counts include the noun. Show the web sharing destinations in a native sheet, with native send, owner-only invite creation, clipboard page and public RSS links, and the same visibility gates. An older development client without Expo Clipboard offers selectable link text. Open byline destinations in the in-app browser while their native routes are absent. Match the web's padding and extend compact drawn targets with hit slop where needed.

The notebook tile beside a Topic title opens the web's Topic roast content in a native sheet. Keep its section labels and order: owner, available podcast episode, prompt, recap and ranked Findings, attachments, Sources, non-public visibility, and counts. Native text selection supports copying, and long notes scroll with the sheet.

Use the installed bottom-sheet library for `TopicFeedSort` and the finding-filter controls. The Topic filter includes My bookmarked and Team bookmarked when applicable. Mobile also exposes Read/Watch/Listen, tag selection, and the web’s four tag-match modes. Search uses the same current sort and Finding filters.

The native `TopicResource` follows the live web's compact rows: rank or own-bookmark mark, Resource-kind icon, title, favicon, host, and age. `TopicFindingList` owns the shared card and its single Nightshift shadow. Rows have only inset dashed separators. The Topic screen scrolls its header, Finding card, and metadata cards together, while Home recycles cards. Clamp row titles and keep their complete accessible names.

Tapping a row opens `TopicResourceInfo` in the existing native sheet. Show the linked title, metadata, an on-demand link preview, full plain-text Carl's notes, Fetched, Views, permitted rating controls with optional feedback, Bookmark, and Mark read. Fetch the preview only while details are open through `fetchTopicFindingLinkPreview`; it never enters persisted reading data. Opening the source from its title or preview records the open once and uses the in-app browser. Dismissal returns focus to the row. Feedback uses the existing endpoint with opt-in rejection so failed saves retain their text without claiming success.

Use `expo-image` for favicons and the existing preview's image, with `toApiUrl` for relative paths. Provide a missing-image fallback and reset recycled images by identity. Feed rows fetch no previews. [Expo Image documentation](https://docs.expo.dev/versions/latest/sdk/image/)

Reuse the exact web empty-section and empty-findings lines through the shared presentation module. Render the empty Home invitation as text, without an unavailable creation action. The initial load has a skeleton; failed initial reads have retry; background failures retain cached content. Use the existing shared failure copy where web has no matching Feed-specific line.

### 6. Embed the tutorial and retain actual-play analytics

Choose `react-native-youtube-iframe` with an Expo-compatible `react-native-webview` inside a Gorhom sheet. Use its documented HTTPS player wrapper. This keeps the event tied to an observed play instead of inferring playback from a handoff to another app. The player needs no YouTube API key. [Player documentation](https://lonelycpp.github.io/react-native-youtube-iframe/), [player events](https://lonelycpp.github.io/react-native-youtube-iframe/component-props/)

Read the id, title, and thumbnail from `TOPIC_TUTORIAL_VIDEO`. The core tutorial module builds `visit_video_played` properties. Retain every existing web opener and add `mobile-header` and `mobile-settings`. Web sends through `captureVisitEvent`; native sends through its existing PostHog instance. Neither analytics SDK moves into core.

Record once on the player's first `playing` state for each sheet opening. Opening the sheet, loading, or resuming after pause sends no extra event. Dismissing or backgrounding stops playback; a later opening starts a new event lifetime. Fit the player to the available width with a minimum 200-by-200 viewport. Provide a canonical YouTube link on playback failure without claiming that fallback opening was a play.

An installed-app handoff was considered, but it cannot prove a play occurred. Embedding preserves the web event's meaning and satisfies the request's in-app playback option.

### 7. Persist one account's confirmed reading data

Wrap the authenticated tree in `PersistQueryClientProvider` with `createAsyncStoragePersister` over the already-installed AsyncStorage. Restore before querying, using the provider's restoration guard. Give each signed-in identity its own QueryClient and persister lifetime. The unauthenticated tree gets no persisted Feed client. [TanStack persistence](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient), [AsyncStorage persister](https://tanstack.com/query/latest/docs/framework/react/plugins/createAsyncStoragePersister)

Use `carlnotes:feed:<userId>` as the storage key. The buster includes a cache-schema version, app version, native build version, runtime version, and EAS Update id, with a stable embedded-build marker when no update id exists. Read native values only in the mobile adapter and pass them to pure rules in `src/queryCacheRules.ts`.

Persist only successful `["topic-feed", userId]` and the most recently loaded successful, visible `["topic-page", userId, topicId]` result. This bounds the saved snapshot to the home Feed and one Topic page. Exclude auth, search, counts, gated or missing payloads, errors, mutations, and optimistic presentation. A denial or missing result removes the formerly visible Topic entry before the next save.

Keep these saved reads until explicit cleanup or a buster change, using matching infinite persistence age and retention for the two eligible query families. The persistence predicate selects only the latest successful visible Topic key, even when older Topic queries remain active in the navigation stack. Keep those active pages in memory for back navigation; drop older inactive Topic-page entries when a newer Topic succeeds. This preserves the requested last-loaded Feed without an arbitrary offline expiry and bounds the saved snapshot. Data stays stale and refreshes when online; persistence does not grant access after an online denial.

Connect `expo-network` to Query's online manager and React Native AppState to its focus manager once in the mobile adapter. Clean up listeners on teardown. Never introduce a browser listener or platform global into core. [TanStack React Native integration](https://tanstack.com/query/latest/docs/framework/react/react-native)

### 8. Clear persistence before old work can repopulate it

Keep lifecycle functions in a mobile module, `src/queryCache.ts`, with state in module scope or the owning hook. It holds the active account's QueryClient and persistence lifetime, not a singleton class. Inject an AsyncStorage-shaped adapter into the lifecycle logic for pure tests.

On confirmed session exit or identity change: deactivate the old lifetime, stop persistence, cancel its queries, settle any storage operation already running, remove its storage key, and clear its QueryClient. A storage adapter checks the lifetime before accepting delayed writes. Query responses and mutation callbacks from the old lifetime cannot reach a new client's state.

Route Settings sign out and the unauthorized-session path through the same cleanup. A failed sign out keeps the session and reports the existing error; if cleanup already ran, recreate a clean persistence lifetime for that same account. Successful account deletion clears data immediately and locally retires the authenticated reading tree even if the final sign-out network call fails. A failed deletion leaves its session and cache intact.

Keep cookies in SecureStore through Better Auth. AsyncStorage contains only the chosen query snapshot. Persistent storage failure leaves online reading usable and reports through the existing error instrumentation.

### 9. Verify behavior with focused tests and named comparisons

Add shared hook tests for initial identity, loader seeding, defaults, reset, reheat success/failure, mutation rollback, and overlapping Finding actions. Keep pure selector and mutation-lifecycle tests beside core modules. Exercise live React hooks with a small web-owned React DOM test harness; install any required DOM test libraries only as web development dependencies. Mobile unit tests continue to render no React Native component.

Extend the existing plain-text tests for the markdown the cards display. Cover links, image alt text, bold/emphasis, headings, lists, inline code, empty text, and line breaks. Reuse `toPlainText` and `toOneLineText`; any necessary correction must retain the existing speech and metadata tests.

Test cache rules and lifecycle with injected storage: account keys, query selection, every buster input, restore failures, sign out, successful and failed deletion, revocation, identity changes, and delayed-write cleanup. Check that no pending action persists or replays.

Every mobile story declares a named web reference in its parameters and description. Header references `Layout/Header → User` and the compact header on a Topic page. Finding cards reference the Topic page's `TopicResource`/`TopicResourceInfo` and `Patterns/InfoPanel → Open`, `LongNotes`, or `LongTitle`. Button, Badge, and link stories reference their matching web stories. Use equivalent invented fixtures without importing another app.

Include unread, consumed, own bookmark, team bookmark, rating up, a failed down rating restored, permitted and read-only actions, pending, failure, missing metadata/image, and long text. Both palettes and enlarged text must be selectable. A successfully down-rated Finding is absent from the Feed, so its story demonstrates removal rather than a persistent visible down-rated card.

Run `bun run check` with installed workspace dependencies. Verify the boundary and parity checks, existing web route tests, shared hook tests, and native pure tests. Then compare web at 375 pixels against iOS and Android captures in both palettes, including enlarged text, screen readers, back gestures, sheet dismissal, offline startup, and reconnect. Include iPad or expanded-window checks because the app already supports tablets.

Follow code-style throughout: comment logical groups, exported functions first, helpers in call order, explicit return types, named options objects, full domain nouns, guard clauses, and discriminated unions. Keep functions screen-sized and split modules by concern. Follow jsx-conventions for link routing, handler names, string expressions, native heading markup, and section comments.

## Risks / Trade-offs

- **Web behavior drifts during extraction** → Keep its adapter exports and default mutation presentation; run existing hydration, Topic, filter, sort, and header checks before native work.
- **An optimistic edit survives failure or restart** → Keep tentative edits in mutation presentation, persist confirmed reads only, and test overlapping failures and app restoration.
- **An old account recreates a deleted snapshot** → Invalidate the persistence lifetime before storage cleanup and test a deliberately delayed write and response.
- **A cached restricted Topic outlives an offline access change** → Treat it as last-loaded content; remove it on the next online denial or session exit.
- **YouTube embedding fails on a device or blocks a gesture** → Verify the actual tutorial on both rebuilt development clients, preserve its viewport minimum, and provide the canonical fallback link.
- **New native modules are absent from an existing development client** → Rebuild both clients after adding Expo Image and WebView; validate runtime fingerprints before EAS Update.
- **The checkout cannot currently run the full gate** → The preceding setup attempt failed on missing Bun and React types. Install workspace dependencies before implementation verification; do not claim this proposal passed the application gate.

## Migration Plan

Implement shared extraction and web compatibility first, then persistence and session cleanup, native navigation and the header, and finally the reading screens. The implementing agent owns the code, module documentation, stories, and verification.

Update `packages/core/AGENTS.md` and `apps/mobile/AGENTS.md` with the modules above and the visual/native convention table. Update client and web guides for moved responsibilities and changed Finding helper signatures. Record route moves in the root module map where its wording changes. Do not edit generated route trees, Storybook indexes, or theme files by hand.

No database or API deployment migration is required. New native dependencies require development-client rebuilds. A rollback restores the earlier app and web adapter; the build-aware buster rejects incompatible saved data in either direction. Keep the prior OpenSpec tooling updates separate from this change's implementation review.

### 10. Complete the requested visual parity pass

The Search bar matches the web’s card, placeholder, Filters, Sort, and page menu. Its native Search screen calls `searchSite` with account-keyed, abortable, transient queries. Topic results navigate natively; other result kinds open their existing web pages. Search text and filters remain available while browsing Topics. Home returns to that search from another screen; from Search, Home clears the search and opens the Feed. Search results never enter the persisted Feed snapshot.

The Topic page follows the phone web order: action bar, title and byline, tags, Coffee Break podcast, Topic findings, Topic roast, Artisanal Blend, podcast episodes, Brew diary, Tasting Notes, and Similar topics. Cards keep Nightshift’s border, radius, padding, and single raised shadow. Read more expands the recap within the page’s single scroll area. Scan notes load on demand. Tasting Notes use the shared sortable table; reading and editing hand off explicitly to the web.

New Topic, editing, team membership, manual scans, reporting, and Tasting Note creation use visible placeholder buttons. Their sheets state availability on carlnotes.com and offer a browser link. They do not simulate saved changes. Podcast play controls open the existing web player and announce that destination. Episode lists support season selection and pagination. Native audio and chapter seeking remain outside this change.

Expo Clipboard requires a rebuilt development client. The user approved the EAS source upload and iOS rebuild. The build finished and was installed on the isolated iPhone 17 simulator. The Android client still needs its Clipboard rebuild.

### 11. Share portable React composition and bound retained work

Twelve components in `packages/core/components/` own the composition used by web and mobile: TablePagination, Pagination, TopicScanRecap, SourceResultsChart, NumberedTopicFindingList, SafeNoteLink, TopicScanFailure, MoreButton, CopyMarkdownButton, ResourceMetadata, RatingThumbs, and NotesTable.
Platform adapters provide native or DOM elements, icons, links, scrolling, and clipboard access. Sorting and pagination hooks also live in core. Nightshift owns shared pagination colors.
Native Sort, Filters, and page actions use the web's Lucide symbols through `lucide-react-native`. Tag labels are shared; icon bindings stay with each platform.

Search mounts one API page with the shared pager and resets when filters change. It returns to a valid page when actions shrink the result set.
Persistence skips unchanged retained snapshots and retries after storage errors. A successful access denial cancels older reads, removes all cached Topic copies, and dismisses its Finding sheet.
The sheet observes access through a passive subscription, preserving the Topic query's fetch options. Failed reads retain confirmed data.
