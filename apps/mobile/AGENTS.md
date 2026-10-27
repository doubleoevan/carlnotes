# apps/mobile

The Expo app: CarlNotes for iOS and Android from one codebase, on a development build, never Expo Go. It depends on the
universal packages alone — `@carlnotes/contracts`, `@carlnotes/client`, `@carlnotes/core`, `@carlnotes/nightshift` —
and the package boundary check fails anything else, a type-only import of `@carlnotes/api` included.

## Layout

- `app/` — the Expo Router routes. `_layout.tsx` configures the api client with the session cookie on every request,
  loads the fonts and the session behind the splash screen, stacks the TanStack Query providers and Sentry's wrap, mounts the Reusables `PortalHost` for anchored controls, and guards the screens with `Stack.Protected`: a user sees `(tabs)/index.tsx`, the Home Feed,
  `(tabs)/search.tsx`, the retained site search, `(tabs)/settings.tsx`, a retained alias for Account, and `topics/[topicId].tsx`. Profile, Teams, Activity, Account, Plans, and Topic/Team notes have native routes; a visitor sees `sign-in.tsx`, the three
  sign-in methods and the email form, and `sign-up.tsx`, the email form behind the app signup gate. `storybook.tsx` is
  the component browser, which the layout shows only in a development build. A route's component is a screen
  (`HomeScreen`), the native word for what the web calls a page.
- `src/` — the app's own modules. `authClient.ts` configures the shared auth client at module load with the api base
  url and Better Auth's Expo plugin over `expo-secure-store`, and exports `mobileAuthClient`, the app's handle with
  `getCookie`, and `apiBaseUrl`. `apiRequestSettings.ts` is what the api client sends on every request and what a 401
  does. `appleSignIn.ts` is the native Sign in with Apple sheet. `appSignupGate.ts` attests the install through
  `@expo/app-integrity` and passes the gate, over `appSignupProofPlatform.ts`, which says which proof a build sends.
  `apiBaseUrl.ts` chooses the api url, and `typeRoleStyles.ts` maps the Nightshift type roles to native text styles.
  `theme.ts` restores and saves the device's appearance preference. It defaults to system detection and keeps native
  controls and Uniwind on the same light or dark palette.
  The root loads regular and italic Karla faces at each supported weight so rich-text emphasis keeps the web's font.
  `hooks/useFontScaledSize.ts` grows a size with the system text size, up to double, and
  `hooks/useIsReduceMotionEnabled.ts` follows the system's reduce motion setting. The pure modules have `bun test`
  coverage beside them. No test renders a React Native component or imports a native module.
- `src/components/primitives/` — the app's implementation of each Nightshift component contract, at the path and file
  name of the web's implementation, added from React Native Reusables' Uniwind registry with its CLI and rebuilt on the
  contract. `button.tsx` and `badge.tsx` give the contract's box classes to the `Pressable` or `View` and its text
  classes to the label through `TextClassContext`, and add only the mobile classes: a pressed state for each Button
  variant in place of the web's hover, `flex-row` in place of `inline-flex`, the web's height as a minimum that grows
  with the label, a label that wraps beside an icon, and the border color the web's base layer gives. The Button
  draws each size at the web's height and reaches the 44-point touch target through a hit slop. `toButtonHeight`
  returns a size's height in points from `buttonHeightsRem`, and `toTouchTargetHitSlop` returns the hit slop that
  grows any drawn height to 44 points on iOS or 48 dp on Android, for the Button and for a control drawn to match it. Uniwind
  reads `active:` on a `Pressable` but no `group-active:`, so the Button tracks its own press for its label's pressed
  classes. The mobile Button requires an `accessibilityLabel`. `text.tsx` is the label inside them, in the Karla
  family, and `icon.tsx` a Lucide icon whose className sets its size and color. Every primitive has a story beside
  it, and each implementation's story has the web story's names, args, and controls. `components.json` points the
  Reusables CLI at this folder and its `cn` at `@carlnotes/nightshift/classNames`:
  `bunx @react-native-reusables/cli@0.7.1 add <name> --styling-library uniwind --cwd apps/mobile`, at the version that
  added the primitives here.
  `select.tsx` adapts the registry's `@rn-primitives/select` to Nightshift. Its popup anchors to the trigger, avoids
  screen edges, and closes on selection or outside press. `SelectItem` accepts custom content like web, so visibility
  choices keep their matching icons while the primitive owns selection and its checkmark. Rows uses this dropdown,
  never a choice sheet.
- `src/components/<area>/` — the app's own components, one PascalCase file per component, at the web's path and file
  name where the web has the same component. `branding/CoffeeMug.tsx` is the web's steaming mug, drawn from
  `@carlnotes/nightshift/coffeeMug` with the steam on React Native's `Animated` and its native driver. As on the web,
  the steam holds still below Nightshift's `md` breakpoint and under reduced motion, and rises on a wider screen.
  `common/` holds the components shared across areas: `ClassNameSvg.tsx` is an svg whose className sets the
  `currentColor` its paths draw in, and `ClassNameSafeAreaView.tsx` the safe area view whose className sets its style.
  Uniwind styles only the components it wraps, so a screen's safe area goes through it. `session/` holds what the
  sign-in, sign-up, and settings screens share: `SessionScreen.tsx` (the frame with the logo, the mug beside the name in
  the `logo` type role, in the web's session column, 24rem wide at most and centered both ways), `SessionTextInput.tsx`
  (the labeled field and the email and password fields over it), `SessionLink.tsx` (a session text link through `common/AnchorLink.tsx`, also used by the logo and the
  footer line that replaces the current form), `SessionErrorText.tsx`, and
  `OAuthProviderIcons.tsx` (the Google and Apple icons from `@carlnotes/nightshift/oauthProviderIcons`). Their buttons
  are the primitives' `Button`. A route imports `src/` through the `@/` alias, and so does a module whose relative
  import would climb two folders, as in `apps/web`.
- `global.css` — the stylesheet: tailwind, uniwind, and `@carlnotes/nightshift/uniwind.css`, the theme and the
  `shadow-raised` utility Nightshift writes, with the component contracts and `field.ts` read as Tailwind sources.
  Change a token in `packages/nightshift/`, never here.
- `metro.config.js` — Sentry's base config inside Storybook's `withStorybook`, inside `withUniwindConfig`, which must
  stay the outermost wrapper. Storybook is on outside production. In an export, a release build, or an update,
  `withStorybook` empties every Storybook module and every file under `.rnstorybook/`, and the CI export job fails if
  a bundle holds Storybook's `SET_CURRENT_STORY` or either platform's bundle is missing. `metro.config.js` also turns
  Storybook's telemetry off however Metro starts. Expo configures Metro for the monorepo and Bun's isolated install on
  its own, so add no watchFolders and no resolver aliases.
- `.rnstorybook/` — Storybook for React Native: `main.ts` finds the stories under `src/components/`, with the
  on-device controls and actions and the backgrounds feature, and `preview.tsx` loads the stylesheet, switches the
  Uniwind theme with the light and dark toggle, and puts a `surface: "card"` story on the card fill. `manager.tsx`
  brands the frame as the web's is: `NIGHTSHIFT_STORYBOOK_THEME` maps the web frame's Dark roast fields onto
  Storybook's native theme in both modes, and `NightshiftStorybookUI` draws Storybook's own `FullUI` with the app
  icon and the name in the logo type role as the brand. The brand is set after Storybook's deep merge of the theme, which
  overflows the stack on a React element. The frame's own text stays in the platform font, since the native theme
  has no font family.
  `storybook.requires.ts` is the stories index Storybook's Metro wrapper writes on each start, committed so `tsc -b`
  resolves the route. Never edit it. Leaving the route restores the app's saved appearance.
- `uniwind-types.d.ts` — generated by Uniwind from the theme, committed like the web app's route tree. Regenerate with
  the dev server, never edit it.
- `assets/` — the launcher icons and the light and dark splash wordmarks. The splash uses Nightshift's coffee mug,
  Architects Daughter, and foreground and orange brand accent colors at 280 points wide. The mug is an unfilled outline.
  Changing it requires a native rebuild.
- `app.config.ts` — the identity, the scheme from `@carlnotes/contracts/mobileApp`, the EAS project link, Sign in
  with Apple, the App Attest production entitlement, and the Sentry, splash screen, Apple sign-in, secure store, and
  web browser plugins. `eas.json` — the build profiles, each pinned to Bun 1.4.3 and an EAS environment. EAS is Expo
  Application Services, the vendor's name for its cloud build and update services, so identifiers and files keep its
  word. A change that adds a native module, as the sign-in change did, needs a rebuilt development client.

## Commands

- `bun run dev:mobile` — the Expo dev server under Doppler's dev config, with the expo-mcp server on, from the repo
  root. In a development build connected to it, `carlnotes:///storybook` opens the component browser.
- `bun run mobile:build -- --profile development-simulator` — an EAS cloud build; profiles: development,
  development-simulator, preview, production.
- `bun run mobile:update` — an EAS Update on the fingerprint runtime policy.
- `bun run mobile:env:sync` — moves the mobile values from Doppler into the EAS environments. Never type a value into
  the EAS dashboard.
- CI exports both platforms' bundles (`expo export`) to prove Metro resolves the isolated install; preflight does not,
  because the bundle takes minutes.

For a local iPhone development build, use `bun run --cwd apps/mobile expo run:ios`. Keep simulator signing enabled;
SecureStore needs the app's application-identifier entitlement even on a simulator. `CODE_SIGNING_ALLOWED=NO` can
produce a launching app that cannot read or save its session. After a native rebuild, verify sign-in before treating
the build as a runtime pass. A bundle-only check uses `bun run --cwd apps/mobile export --platform ios`.

## The api in development

`apiBaseUrl.ts` points the client at port 3000 on the host the device reached the dev server on, so the iOS simulator,
the Android emulator, and a phone on the same network all reach `bun run dev:api` with no setting. The one gap is a
USB-connected Android device in localhost mode, which needs `adb reverse tcp:3000 tcp:3000`.

## Accessibility bar

Every mobile change holds to the bar the web's Storybook checks set:

- Every pressable control has an `accessibilityLabel` and an `accessibilityRole`. The primitives' `Button` gives the
  role, and a Button without the label fails to type-check.
- Text scales with the system's text size on iOS and Android without clipping. Leave `allowFontScaling` on, and give
  a box around text a minimum height, never a fixed one, as the primitives' `Button` does. The logo and the oauth
  provider icons grow with the text up to double, the 200 percent the web is built for, so they still fit the screen
  at the largest sizes. The mug and the icons size through `useFontScaledSize`, and the name through
  `maxFontSizeMultiplier`.
- Touch targets are at least 44 points on iOS and 48 dp on Android. A control drawn smaller, to match the web, reaches the platform minimum through its hit slop,
  as the primitives' `Button` does.
- Colors come from Nightshift through Uniwind utilities (`bg-primary`, `text-muted-foreground`), whose contrast test
  already holds text to WCAG AA. No literal color values.
- Type goes through the roles in `src/typeRoleStyles.ts`, so a role reads the same on both platforms. A primitive's
  label takes its type from its contract's text classes instead, as the web's implementation does.

## Sign-in

The session is Better Auth's, kept by the Expo client in secure storage and sent as the `Cookie` header on every
request, the api client's through `apiRequestSettings.ts` and the auth client's own. Apple signs in through the native
sheet on iOS and the system browser on Android, Google through the system browser on both, and email and password
natively. On iOS the Apple button is Apple's native button at the other sign-in buttons' height, never shorter, inside
a `Pressable` whose hit slop gives it the 44-point touch target, since the native view takes touches only inside its
own bounds. A browser sign-in returns on `carlnotes://`, which the api trusts. Email sign-up passes the app signup gate
in place of the web's Turnstile: a release build attests the install with App Attest or Play Integrity against a
one-time challenge, and a development build sends the development proof, which only the dev api accepts. A release
build that cannot attest is sent to the web's sign-up. A 401 from any request signs a revoked session out once, and the
guard shows the sign-in screen.

## Values

The app reads `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, and `EXPO_PUBLIC_PLAY_CLOUD_PROJECT_NUMBER`, the
Google Cloud project number Play Integrity is prepared with, inlined by Metro, and an EAS build reads
`SENTRY_AUTH_TOKEN` to upload source maps. All four live in Doppler (dev and prd) and reach EAS through
`mobile:env:sync`. A reporter without its key stays off, so a build without keys sends nothing, and an Android
release build without the project number cannot attest and sends sign-ups to the web.

## Feed reading

`providers/TopicFeedProvider.tsx` adapts the shared core hook to Expo navigation, connectivity, and foreground events.
It restores one account's queries before their first request. It removes network and app-focus listeners on teardown.
`topicFeedRows.ts` flattens Home into section, Topic, Finding-card, empty, and expansion rows with distinct recycling types.
Only one section opens at a time. Each Topic initially shows five Findings. `MoreButton.tsx` expands them in place
with the web's `+ N more ▾` and `show less ▴` controls. Topic titles link to the independent Topic page query.

`components/layout/Header.tsx` supplies the compact brand and tutorial on Home, Topic, and Account.
`UserMenu.tsx` restores the hamburger’s secondary destinations through a native sheet. Profile, Teams, Activity,
Account, and Plans use native routes. Docs and permission-gated Admin open their existing web pages. The groups and dividers
follow the web menu. The menu matches the web's Light mode or Dark mode toggle. The choice survives relaunch;
system appearance is the silent fallback when no preference is saved. `hooks/useSignOut.ts` shares pending state and
error handling between the menu and Settings, through the account's session cleanup.
`components/common/AnchorLink.tsx` owns internal navigation, replacement, in-app browser links, and supported system schemes.
`common/Sheet.tsx` owns bottom-sheet dismissal, safe insets, Android Back, and accessibility focus return.
`common/YoutubePlayer.tsx` shares the inline video player between Finding previews and the tutorial. A tap loads
YouTube, closing the sheet or backgrounding the app stops playback, and unavailable embeds link to YouTube.
The Icon primitive resolves a `currentColor` fill to its Nightshift text color for consistent play triangles.
`branding/CoffeeLoading.tsx` gives loading labels the Architects Daughter font and trailing dots, with a native spinner.
Its scroll indicator contrasts with the active theme and flashes when the sheet opens or its content grows.
Nested sheets push above their parent, preserving its content and scroll position when sharing closes.
Its modal provider sits inside `ReadingProvider` so sheet content retains the account's query and search contexts.
`components/account/SettingsContent.tsx` shows account identity and the account controls without another session header.

`components/topic/TopicFeed.tsx` renders Home's flattened FlashList. `TopicFindingsSection.tsx` uses the same five-row
preview and in-place expansion on the Topic screen. Expansion state belongs to the list, so recycling cannot reset it.
`topic/Topic.tsx` matches the web's linked heading, team-or-owner attribution, plain unread count, share icon, and
secondary tag badges. `branding/Avatar.tsx` shares the web's stored images, initials, and tints between attribution and
Settings. `share/ShareTopic.tsx` shows the web sharing options in a native sheet. `ShareTargets.tsx` owns the matching social
and direct-message destinations. Native Share, owner-only invite creation, Copy page link, and public Copy RSS
preserve the web visibility gates. Expo Clipboard needs a rebuilt native client; an older client shows selectable
link text instead of reporting a successful copy.
Team and profile bylines navigate to their native routes through `nativePath.ts`. Canonical Topic slugs and absolute note links also resolve to native routes.
`TopicFindingList.tsx` owns each list's single border, background, rounded corners, and raised shadow. Home recycles whole
Finding cards; rows within a card are keyed by Finding identity and have no shadow. The Topic screen scrolls its header, Findings, and metadata cards together.
`TopicResource.tsx` opens details from compact rows. `providers/TopicResourceInfoProvider.tsx` holds the open Finding outside recycled rows,
retains acknowledged actions when filtering removes a row, and discards failed optimistic edits. Navigation and
account changes close it. Stories keep their isolated local sheets.
`TopicFindingSummary.tsx` owns the rank, filled bookmark marks, kind, title, and source metadata.
`TopicResourceInfo.tsx` presents full plain-text notes, an on-demand link
preview, Fetched, Views, and permission-aware actions in a sheet. `TopicFindingRating.tsx` owns rating and feedback.
The preview shows a native progress indicator until its metadata and image finish loading, with text retained after an image failure.
Opening details leaves read state unchanged; the explicit source links record the open. Previews never enter persisted queries.
`branding/NoteIcon.tsx` matches the web's notebook tile. `topic/TopicInfo.tsx` opens the Topic roast sheet beside the title
on Home and Topic screens. It shows the owner, prompt, latest recap and ranked Findings, attachments, Sources, visibility,
and team/follower counts. `TopicSources.tsx` matches the default and custom Source labels, icons, and processing states.
The Topic note uses the same safe Markdown subset as the diary. Long prompts and expanded recaps use `ScrollBox`.
`TopicFeedControls.tsx` exposes sort and Finding views through sheets. Team bookmark scope appears on eligible Topic pages.
`TopicFeedStatus.tsx` supplies loading and retry states. `TopicTutorialVideoDialog.tsx` embeds the shared YouTube tutorial.
`TopicFeedSkeleton.tsx` and `TopicSkeleton.tsx` match Home and the Topic screen, sharing the real finding-list card.
The Topic skeleton retains a known title and omits the podcast placeholder when Home reports no episode.
The first actual play reports the shared opener properties. Dismissal or backgrounding unmounts the player.
Stories beside these components name their web references. `topicFeedStories.ts` supplies inert handlers and reference paths.
`search/SearchBar.tsx` edits in place on every reading screen and opens `(tabs)/search.tsx` when the user submits.
`topic/topicFeedIcons.ts` binds the web's Lucide symbols to native sort and filter rows and Finding metadata.
Finding-view options and tag labels come from core, including direct My bookmarked and Team bookmarked choices.
Focusing or typing alone does not navigate. `SearchResults.tsx` calls the existing search client.
`providers/SearchBarProvider.tsx` keeps search text and filters within one account's reading lifetime.
The logo returns to the retained search from another screen. From search they clear it and open Home.
Search keeps an editable toolbar and scrolling results. Header navigation replaces the bottom tab bar. Opening a Topic preserves the search.
Search uses account-keyed, abortable transient queries and the current sort, view, Resource kinds, and tag filters.
`SearchResultsList.tsx` shares `TopicFindingListCard`, `TopicResource`, and the Finding sheet with the feed.
It adds result ranks, parent Topic links, and metadata for Topics, podcasts, Teams, and profiles.
Search shows one API page with shared pagination controls. Changing the query or filters starts at page one.
Its `site-search` queries stay in memory, expire when unused, and never enter saved reading data.
`podcast/PodcastEpisodePill.tsx` shares episode and chapter links across search, feed rows, and Finding sheets.
Topic, Team, and profile results navigate natively. Podcast results retain their web handoff. `TopicHomeActions.tsx` supplies Tags
and native New Topic. `TopicPageActions.tsx` supplies the shared web action bar, refresh, follow, native editing and brewing, and explicit podcast/chat handoffs.

`TopicPageContent.tsx` owns the Topic screen’s single scroll area. `CollapsibleSection.tsx` matches its open-by-default
section headings. `TopicPageCards.tsx` renders Topic roast, Artisanal Blend, and Similar topics. `TopicScanHistory.tsx`
loads a selected scan note on demand. `note/NotesSection.tsx` lists Topic and Team Tasting Notes and opens their native routes.
Its `NotesTable.tsx` draws core's shared table with sortable Note, Visibility, and Updated columns, totals, and pagination.
`TopicSettingsCard.tsx` owns Artisanal Blend under the same filename as the web.
The Brew diary uses the shared Scan timestamp, each scan's episode pill, and the notebook button. The note opens
from the row or its notebook button, while the episode pill opens the player independently.
`TopicScanRecap.tsx` matches the web's Dear Diary content, Markdown formatting, allowed Finding links, failure recovery,
and cost/duration footer. `common/ScrollBox.tsx` bounds its recap, with native gesture handling and a visible
`CopyMarkdownButton.tsx`. `common/SourceResultsChart.tsx` draws the web's Source footnotes and expandable details.
The scrollbox's orange thumb remains visible while content overflows and follows scrolling on the native driver.
It also bounds Finding notes, long Topic prompts, and expanded Topic roast notes, matching the web's placements.
Source ordering, totals, labels, placeholders, and copied Markdown come from core. Editors can confirm Source removal
through a native alert; the diary stays open and past results remain visible. `TopicInfo.tsx` reuses its numbered Finding list.
Tasting Notes uses the web's primary Add Note button and linked empty invitation. Both open the same native creation sheet,
and the API's creatable visibilities determine whether either action appears.
`podcast/PodcastEpisodePlayerCard.tsx` shows the latest episode and chapters. `PodcastEpisodesCard.tsx` lists season
tabs and episodes. `PodcastEpisodeRow.tsx` and `PodcastEpisodePlayButton.tsx` also serve Topic roast, Topic headings,
and tables; playback opens the web player.
Older seasons use the existing client in account-scoped transient queries. Episodes and Brew diary use five-row pages
and `common/Pagination.tsx`, which supplies native controls to core's shared pagination component.
Chapter rows share `PodcastEpisodeChapterPill` with Findings. Their source line opens the Finding sheet, while
their title and pill open the web player. The native chapter list omits rating thumbs, as the narrow web layout does.
`TopicCountsLine.tsx` shows Viewers and Followers in the web's display font and footer spacing. It refreshes every minute
while its Topic route is active, retains counts when offline, and reserves the footer space before the first read.
The Topic screen records its view through the shared core helper, once per app runtime.
Its `PodcastEpisodeRow` also supplies Topic roast's play button, numbered title, date, duration, and latest label.
Topic roast uses the labeled Share button from the web.
`table/TableCard.tsx` shares the native table surface, header, and row separators. `table/TopicNameLink.tsx` shares
linked Topic names with the same podcast play button. `RelatedTopicsSection.tsx` uses them for Similar topics,
including name sorting and the existing web player handoff. `SortableHeader.tsx` draws core's sort state and also
serves Notes. The pagination footer stays inside its table card. Future native tables reuse these components.
`table/TablePagination.tsx` supplies native controls to core's shared table footer and `usePagination` state.
Rows opens the anchored `Select` dropdown; changing size or sort returns to page one.
`topicPageStories.tsx` supplies complete page fixtures and an isolated Query client for the card stories.
`common/WebFeature.tsx` supplies the labeled browser handoff for Admin and deferred podcast and chat workflows.
Topic creation, editing, team management, manual scans, reporting, and Topic and Team notes run natively.
Native audio playback and a standalone Finding route remain outside this pass.

## Saved reading data

`queryCacheRules.ts` owns `carlnotes:feed:<userId>` and the schema/app/native-build/runtime/update identity used to reject old snapshots.
`queryCache.ts` owns the account's Query client, confirmed snapshots, latest visible Topic, and ordered storage writes.
Only successful `['topic-feed', userId]` and the latest visible `['topic-page', userId, topicId]` enter AsyncStorage.
A failed refresh retains its last successful snapshot. A gated or missing response removes the Topic from Home, search, and saved data, and closes its Finding sheet.
Access revocation cancels earlier Home and search reads. Transient query updates do not rewrite an unchanged saved snapshot.
Authentication queries, other identities, failed payloads, and mutations never persist. Pending edits stay outside query data.
The two reading query families have infinite retention until session exit or a build identity change.

`sessionExit.ts` clears the captured lifetime after successful sign out. Failed sign out retains usable data.
Session screens and Settings link to the published Privacy policy through `AnchorLink`.
Successful deletion and revocation retire the session before another sign-out request, hiding content even if that request fails.
Account changes receive a new Query client. Cleanup deactivates persistence, cancels reads, drains accepted writes, and removes storage.
Late responses and delayed writes cannot recreate the retired cache. Corrupt storage starts empty.

`queryCache.test.ts` checks restore, retention after read failure, build changes, latest-Topic eviction, corruption, and cleanup ordering.
`topicFeedRows.test.ts` checks section selection, card identity, empty sections, preview limits, expansion, collapse, ranks, and separators.
The web-owned live-hook tests check optimistic rollback, overlapping Findings, query identity, and known-offline reheat.
Device checks cover cold offline startup, reconnect, foreground refresh, account switching, revocation, and successful/failed deletion.
They also cover both palettes, enlarged text, screen readers, safe areas, tablet width, reduced motion, navigation, and actual video playback.

## Visual authority and native replacements

The portable components are in `packages/core/components/`: table and section pagination, diary composition,
Source footnotes, numbered Findings, safe note links, scan failures, expansion controls, and copy feedback.
The shared `NotesTable`, `ResourceMetadata`, and `RatingThumbs` also own their content and interactions.
Their local wrappers supply native elements and device APIs; edit the shared composition before either wrapper.
Do not recreate those components inside a screen. Keep adapter components at module scope to preserve selection,
expanded state, and focus through rerenders.

Before changing a mobile screen or component:

1. Find and read the matching web component, its child components, and its Nightshift stories. Trace every action's destination and permission gate.
2. Inspect the rendered web version at phone width. Compare the relevant loading, empty, populated, expanded, selected, and error states.
3. Reuse the existing web component first. Extract portable components into an appropriate universal package so both apps consume one implementation, preserving module boundaries.
4. Before writing a native renderer, identify the concrete platform dependency preventing reuse. Check whether a small platform adapter resolves it. When replacement is necessary, keep the renderer thin and compose existing Nightshift components. Share its data, formatting, permission rules, and state logic through core.
5. Audit formatting, visibility, and styling with the checklist below. Match interactions as well as appearance.
6. Compare the running mobile result against the web reference before hand-off. Test changed actions and state transitions.
7. Record the web references, necessary native adaptations and their reasons, and any gaps or comparisons that remain unverified. Distinguish actual component reuse from shared logic and native replacements.

Check these dimensions for every changed screen and its child panels:

| Dimension | Required comparison |
| --- | --- |
| Visibility | Sections, fields, actions, badges, counts, metadata, permission gates, signed-in/visitor differences, and narrow-screen controls. A missing control is a gap even when the rest looks similar. |
| States | Loading, empty, populated, failed, disabled, selected, expanded, collapsed, and mutation feedback. Include slow requests and content that overflows. |
| Formatting | Copy, capitalization, punctuation, date/time/duration/count labels, Markdown, line wrapping, truncation, and singular/plural wording. Reuse shared formatters. |
| Styling | Nightshift font roles, sizes, weights, colors, spacing, hierarchy, surfaces, borders, radii, shadows, icons, fills, button variants, and separators. The final row has no trailing separator. |
| Behavior | Link and button destinations, independent nested actions, search/Home navigation, selection persistence, sheet lifetime, pagination, scrolling, and feedback after success or failure. |
| Native adaptation | Safe areas, touch targets, text scaling, accessibility focus, gestures, and sheet presentation. Preserve the web content and control styling within those adaptations. |

Reuse the same native renderer wherever the corresponding web component repeats: lists, tables, play buttons, metadata,
scrollboxes, and popups. Fix the shared component so every usage improves. Do not create a one-off lookalike for each screen.
Copying a component into mobile and restyling it is duplication, not reuse. Keep one maintained implementation wherever the platforms allow it.
Use the web's terminology, component names, and filenames for matching concerns. Keep Expo's required route layout
and name native-only behavior accurately. Document any different name with its concrete platform reason.
When web changes shared behavior or presentation, inspect the native counterpart in the same change and update it or record the specific gap.

Do this without waiting for the user to request a web check or name the component. Screenshots help locate the reference;
they do not replace reading its current source. A missing native feature retains the web's control styling and an explicit web handoff.
An existing handoff is a recorded functionality gap, not proof of native parity. Do not silently hide the feature or call the screen complete.

Use [carlnotes.com](https://carlnotes.com/) at 375 pixels and its current web components as the visual authority.
The older HTML export does not override the shipped components. Keep Nightshift's Latte and Dark roast palettes, type roles, radii, and spacing.
Match the web's behavior and design by default, including padding, font families, sizes, colors, hierarchy, copy, and control styling.
Links look like links: Topic titles and source links use Nightshift's `text-link` treatment and the web's matching type role.
Deviate only for an expected mobile convention, and name that reason in the change. Safe areas, touch targets, system
text scaling, gestures, and a sheet replacing a popup justify adaptations; a different visual preference does not.
The logo returns Home. Topic screens have no visible Back button.
Use Architects Daughter and Karla, the shared mug, Lucide content icons, and the web's Simple Icons YouTube mark.
Center the reading column on tablets. Keep portrait orientation and reduced-motion support.
Platform behavior follows [Apple's Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
and [Material Design](https://m3.material.io/).

| Web pattern | iOS replacement | Android replacement |
| --- | --- | --- |
| Header navigation and account menus | Header logo for Home, stack navigation, and secondary destinations in a sheet | Header logo for Home, stack navigation, and secondary destinations in a sheet |
| Browser history or custom back links | Edge-swipe gesture; the logo returns Home without a visible Back button | System Back button and gesture; the logo returns Home |
| Centered dialog, popover, or radio menu | Dismissible bottom sheet with focus return | Dismissible bottom sheet with Back handling and focus return |
| Destructive confirmation dialog | System confirmation alert with the web's words | System confirmation dialog with the web's words |
| Hover tint and scale | Pressed feedback | Pressed feedback using the installed native primitives |
| Tooltip-only action name | Visible label or accessible label and long-press explanation where needed | Visible label or accessible label and long-press explanation where needed |
| Browser date and time inputs | System picker | System picker |
| Compact choice inputs, including Rows | Anchored dropdown using the shared Select primitive | Anchored dropdown using the shared Select primitive |
| Browser sharing flow | System share sheet | System share sheet |
| Desktop keyboard assumptions | Correct keyboard, return action, dismissal, and avoidance | Correct keyboard, IME action, dismissal, and avoidance |
| Refresh action in the page menu | Pull to refresh, plus the Home logo's reheat | Pull to refresh, plus the Home logo's reheat |
| Browser safe padding | Safe-area insets around header, sheets, and content | Status, navigation, cutout, and keyboard insets |
| Small web icon target | At least 44 points through size or hit slop | At least 48 dp through size or hit slop |
| Browser zoom | System text scaling without clipped controls | System font scaling without clipped controls |
| Generic web sign-in button | Required native Sign in with Apple button | Platform sign-in flow and required provider branding |
| Web pagination | Preserve bounded table and section pagination; recycle long scrolling feeds | Preserve bounded table and section pagination; recycle long scrolling feeds |

The five-row Finding expander is unchanged in behavior: expand and collapse in place, with the web's wording and arrows.
Home uses continuous Topic scrolling instead of numbered web pagination. Home currently reads the complete
delivered Topic collection; scrolling does not fetch extra API pages. The Brew diary keeps the web's bounded recap above
Source footnotes, with a native scroll indicator and gesture handling inside its sheet.

## Native Tasting Notes

`app/topics/[topicId]/notes/[noteId].tsx` and `app/teams/[teamId]/notes/[noteId].tsx` open `components/note/NoteScreen`.
The route checks membership in the owning page and fresh permissions before displaying server content.
Public readers do not need a draft store. Draft records include their Topic or Team page context.
`NoteEditor`, `NoteStatic`, `NoteToolbar`, `CreateNote`, `NoteComments`, `NoteConflictNotice`, and `NoteUnreadBadge`
adapt actual shared core components. The native editor and reader use the same pinned enriched HTML 1.1.1 as web.
The existing patch preserves web initialization and qualifies iOS React headers for the current native build.
Generated `ios/` and `android/` projects are ignored; Expo configuration remains their source.

One screen-level KeyboardAvoidingView owns iOS avoidance with the measured header offset. Android resizes its window.
The editor has bounded internal scrolling. The full-width toolbar stays below the title and above the body.
`common/ScrollIndicator.tsx` supplies its persistent orange horizontal thumb and `ScrollBox`'s vertical thumb.
A Done control below the body appears while the software keyboard is open and explicitly blurs the editor.
The screen gives the metadata 16 points of top padding. The top-right Close note control returns to the owning Topic or Team route and its table position;
iOS edge-swipe navigation remains available.
Comments remain below the body in the outer scroll view. A link sheet captures the selected
range before blurring. Metadata uses canEdit for rename, isNoteOwner for visibility, and canDelete for confirmed deletion.
Deleting a comment opens a native confirmation with the web's shared wording before invoking the shared delete handler.
Creation offers only server-returned visibilities. Read-only notes expose no editor, toolbar, or comment composer.

`noteRead.ts` validates note access and page membership before recovering an offline draft. A confirmed denial retires the draft even when the other read fails.
`stores/noteDraftStore.ts` owns one controller per account/note. Mounted editors acquire and release it; closed clean controllers leave memory, while pending drafts survive until saved. `noteDraftStorage.ts` supplies AsyncStorage, subscribable
account activation, and a live-session dispatch fence. `providers/NoteDraftProvider` connects AppState and Query online
and focus managers. Ordered, coalesced writes use `carlnotes.note-drafts.v1:` independently of the feed build identity.
Pending text survives route unmount and cold restart after storage completes. A storage failure is visible and keeps
text in memory; it cannot promise survival after process termination. Unknown schemas are left untouched.

Recover an offline note from Local drafts on its Topic or Team. Uncached notes and creation need a connection. Reconnect checks
permissions before retrying open or closed drafts, at their original base version. A conflict remains durable and stops
transport until deliberate Reload succeeds. Failed Reload and transport failures preserve text. Successful sign-out,
account replacement, revoked editing access, and accepted deletion retire controllers and remove the affected drafts.
Failed sign-out or deletion preserves them. App or route unmount alone never clears drafts.

Rollback requires a compatible rebuilt runtime because enriched HTML is native code. Preserve the draft prefix and
schema when reverting JS; never clear AsyncStorage as a rollback step. Older clients that do not understand a newer
schema must leave its bytes intact. Finish pending saves or copy text before deliberately signing out or uninstalling.

The shared badge hook refreshes on open, foreground, reconnect, and every 45 focused online seconds. Failed reads keep
confirmed counts; failed note opens never acknowledge a read. Native badges expose actual counts to accessibility and
explain edits/comments on tap or long press. The visible count caps at 9+.

Recaps use `safeNoteMarkdown` and `markdown-to-jsx/native` to render the same transformed tree as web. Keep raw HTML
inert, drop images, and allow only exact stored HTTP(S) Finding URLs. Headings one through six use the compact display
role. Findings stay before the page recap; Topic roast places its recap after the prompt. Diary Source footnotes and
permitted timing/cost details keep their shared composition. This supersedes Prompt 45's enriched-markdown proposal.
A Finding inspection is not a source open. Only explicit source links/previews and the first actual inline play record
one. `common/ShareMarkdownButton` shares the same `toNotesMarkdown` content as Copy through the native sheet; every
outcome leaves the Finding and its feedback mounted. `ScrollBox` supplies an action row for both accessible controls.

## Native menu pages, forms, and footer

`app/profiles/[userId].tsx`, `app/teams/index.tsx`, `app/teams/[teamId].tsx`, `app/activity.tsx`,
`app/account.tsx`, and `app/plans.tsx` use `layout/PageScreen`. It owns the reading column, compact heading/byline
spacing, filter/action toolbar, refresh, safe areas, and shared footer. The header logo opens Home and the hamburger menu opens Account and the other pages. The retained `/settings` route renders Account, and no bottom tab bar is shown. The hidden tab navigator preserves Feed/Search route state.

`table/DataTable.tsx` adapts core's table composition. `TableScroll.tsx` fixes the first column while the remaining
columns scroll horizontally. `ScrollIndicator` keeps an orange thumb visible while content overflows. Pagination
has 12 points of bottom padding. Rows remains an anchored dropdown. Small result sets hide pagination.
Domain table columns, sorting, and totals live in core. Native row actions use the existing clients and permission gates.

`topic/EditTopicModal` uses core's Topic draft, Source editor, Team choices, and save flow. `team/EditTeamModal`
uses shared TeamFields and saveTeam. Team Up, add-to-Team, member/follower invitations, avatar selection, reporting,
and account fields stay native. Native adapters own system photo/document/time pickers and destructive confirmations.
A failed Team save retains its created identity, accepted memberships, and unsent invitations for retry.
`useTeamFields` shares name availability checks across clients and ignores replies for a changed name.
`topic/TopicAttachmentLink` uses the authenticated client for owner downloads and the native file preview.
Downloaded preview files stay available until the parent view unmounts, then are removed. Attachment content
reuses the safe Markdown renderer and bounded orange scrollbox, with explicit edit/done controls.
The prompt paperclip and attachment link share one native file picker. `SessionTextInput` preserves the Nightshift
field border and fill when a caller changes its size. Report issue hides its extra visible label to match web.

`account/AccountBudget`, `AccountFields`, and `PlanCard` adapt shared compositions. Account pause checkpoints use
server-provided cutoffs and core's budget calculations. An admin without a budget override has no pause checkpoints.
`avatar/UserAvatarPicker` reveals its camera overlay on the first tap; the next tap opens the system photo picker.
`font-display` uses Architects Daughter and `font-sans` uses Karla from Nightshift's generated Uniwind font tokens.
The Text primitive supplies a default class, without an inline family overriding a selected type role.

`layout/Footer` adapts `core/components/Footer` in scrolling page content and on sign-in. Its words and links match
web. Compact links retain native hit slop. Privacy, Terms, License, docs, Releases, Source Code, and Nightshift use
existing web destinations in iOS's dismissible browser sheet. Android uses its browser custom tab. Note editors and
modal forms keep their focused layout without a footer. Hosted checkout and billing management use their existing
browser flows. Admin, podcast playback, and chat retain explicit web handoffs; broader live counts remain separate work.

Topic loading uses `core/components/TopicSkeleton` with the web section order, native card shapes, and a pulse that
stops for reduced motion. Known Topic names stay visible, and a known Topic without a podcast omits its player.
The initial loading scroll area fills the available content space. A separate footer scroll area is mounted only
after loading ends, so it cannot squeeze the skeleton. `TopicFeedStatus.stories.tsx` covers loading and retry states.

`layout/PageSkeleton` uses the same core composition and utility classes as web for Profile, Teams, Activity,
Account, and Team. `common/SkeletonPulse` shares native reduced-motion behavior with Topic loading. Placeholders
expose one busy accessibility label and hide decorative descendants. Loaded pages remain visible during refresh.
The PageSkeleton stories mirror the web story names, including the separately loading Profile topics table.

## Menu parity audit

`search/PageActionMenu.tsx` and web's same-named adapter render core's `PageActionMenu`: page options, New topic
when the page has no equivalent button, Add to AI, then Report issue. Pull-to-refresh remains on the page.
`layout/UserMenu.tsx` uses core's `UserMenuItems` for destinations, grouping, selection, and Admin visibility.
`common/AddToAiDialog.tsx` uses core's `AddToAi` for provider ordering, instructions, and copy feedback. Platform
adapters supply icons, storage, clipboard, and presentation. Cursor and VS Code offer copyable setup on a phone;
the web retains desktop install links. The production MCP URL is used on mobile.
`common/ChoiceSelect.tsx` supports Lucide icons for both the selected value and options. Topic visibility matches
web's Lock, Globe, and Mail. Sharing a Topic opens the native report form instead of a browser handoff.
The Account route uses `useAccount` from core, so a partial or failed budget load never shows incomplete totals.

## Telemetry

`src/visitAnalytics.ts` sends the web visit event names through the native PostHog SDK. Screen paths, URL fields, and public Topic attribution use `contracts/reportedPath` and `contracts/visitAnalytics`. Anonymous identifiers and queues live only in memory. Person profiles, replay, autocapture, and remote feature flags are disabled. Backgrounding flushes the queue. `deviceTelemetry.ts` supplies platform, OS version, device model, and app version/build to both visit events and API/auth headers. These descriptions never grant access.

`src/monitoring.ts` configures Sentry crash reporting, Expo Router render-error handling, and sampled navigation timing. `monitoringRedaction.ts` builds on the shared content redaction and removes native request bodies, headers, user identity, and navigation params. Development events carry a development environment. SDK source maps retain the existing Expo plugin configuration. `Common/TelemetryCheck` is a development-only, explicit send-and-flush check. Dashboard verification remains separate.

The system browser sheet has a separate cookie store from the native SecureStore session. Admin and hosted account flows can require web sign-in. Do not copy session cookies into a browser URL or claim automatic sign-in.

`hooks/useTopicScan.ts` adapts core's serialized scan polling to route focus, app activity, and connectivity. It refreshes only the Topic page and shares web's backoff.
