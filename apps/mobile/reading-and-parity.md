# Native reading and visual parity

## Feed reading

`providers/TopicFeedProvider.tsx` adapts the shared core hook to Expo navigation, connectivity, and foreground events.
It restores one account's queries before their first request. It removes network and app-focus listeners on teardown.
Visitors use the same hook in an isolated memory-only query client; their feed opens Home topics and never persists account data. The visitor menu links to native Log in and Sign up. Public finding details hide read/bookmark/rating controls, and account actions require authentication.
`topicFeedRows.ts` flattens Home into section, Topic, Finding-card, empty, and expansion rows with distinct recycling types.
Only one section opens at a time. Each Topic initially shows five Findings. `MoreButton.tsx` expands them in place
with the web's `+ N more ▾` and `show less ▴` controls. Topic titles link to the independent Topic page query.

`components/layout/Header.tsx` supplies the compact brand and tutorial on Home, Topic, and Account, and owns the one
tutorial dialog that its compact button opens. `HomeHero.tsx` holds its own tutorial button and dialog.
`UserMenu.tsx` restores the hamburger’s secondary destinations through a native sheet. Profile, Teams, Activity,
Account, and Plans use platform routes. Docs and permission-gated Admin open their existing web pages. The groups and dividers
follow the web menu. `ThemeMenu.tsx` is the menu's appearance items. It matches the web's Light mode or Dark mode toggle. The choice survives relaunch;
system appearance is the silent fallback when no preference is saved. `hooks/useSignOut.ts` shares pending state and
error handling between the menu and Settings, through the account's session cleanup.
`components/common/AnchorLink.tsx` owns internal navigation, replacement, in-app browser links, and supported system schemes.
`common/ThemedSpinner.tsx` is the spinner in a theme color, which the mic, the play button, and the podcast question
button show while they wait.
`common/Sheet.tsx` owns bottom-sheet dismissal, safe insets, Android Back, and accessibility focus return.
`common/YoutubePlayer.tsx` shares the inline video player between chat, Finding previews, and the tutorial. A tap loads
YouTube, closing the sheet or backgrounding the app stops playback, and unavailable embeds show an inline error.
`youtubePlayer.ts` limits WebView navigation to the player document and YouTube embed frames. Player popups and
app intents stay blocked. The WebView keeps its popup
handler and all-scheme interception so Android cannot bypass the navigation check for a new window.
`common/BrandIcon.tsx` supplies `YoutubePlayIcon` to the tutorial, header, and menu with the web's shared SVG paths.
The tutorial uses its red play mark over a full-color thumbnail; chat and Finding previews use the orange play button
over a dimmed thumbnail. Neither adds a separate Open on YouTube link.
The Icon primitive resolves a `currentColor` fill to its Nightshift text color for consistent play triangles.
`branding/CoffeeLoading.tsx` gives loading labels the Architects Daughter font and trailing dots, with a native spinner.
Its scroll indicator contrasts with the active theme and flashes when the sheet opens or its content grows.
Nested sheets push above their parent, preserving its content and scroll position when sharing closes.
Its modal provider sits inside `TopicFeedProvider` so sheet content retains the account's query and search contexts.

`components/topic/TopicFeed.tsx` renders Home's flattened FlashList. `TopicFindingsSection.tsx` uses the same five-row
preview and in-place expansion on the Topic screen. Expansion state belongs to the list, so recycling cannot reset it.
`topic/Topic.tsx` matches the web's linked heading, team-or-owner attribution, plain unread count, share icon, and
secondary tag badges. `branding/Avatar.tsx` shares the web's stored images, initials, and tints between attribution and
Settings. `share/ShareTopic.tsx` shows the web sharing options in a native sheet, for a Topic or for a Topic Post shared in its place. `ShareTargets.tsx` owns the matching social
and direct-message destinations. Native Share, owner-only invite creation, Copy page link, and public Copy RSS
preserve the web visibility gates. Expo Clipboard needs a rebuilt native client; an older client shows selectable
link text instead of reporting a successful copy.
Team and profile bylines navigate to their platform routes through `platformPath.ts`. Canonical Topic slugs and absolute note links also resolve to platform routes.
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
The Topic skeleton is laid out as the loaded screen is: the button row, the image beside the title, the byline with
the reactions, and the details line, then each section in `CollapsibleSectionSkeleton` inside the screen's inset
column, the film's card above the player card. It retains a known title and omits the film and podcast placeholders
when Home reports no episode. Its film card, player card, and empty section card serve the podcast episode screen's
loading state too, whose player card has no podcast feed button.
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
It adds result ranks, parent Topic links, and metadata for Topics, podcasts, Topic Posts, Teams, and profiles.
`toSearchRowTitleAside` returns the control beside each kind's title, the web's function of that name.
Search shows one API page with shared pagination controls. Changing the query or filters starts at page one.
Its `site-search` queries stay in memory, expire when unused, and never enter saved reading data.
`podcast/PodcastEpisodePill.tsx` shares episode and chapter links across search, feed rows, and Finding sheets.
Topic, Team, profile, Podcast Episode, and Topic Post results navigate to their app screens. `TopicHomeActions.tsx` supplies Tags
and native New Topic. `TopicPageActions.tsx` supplies the shared web action bar, refresh, follow, native editing and scanning, and the shared podcast player. Chat uses the shared global launcher.
Home supplies Reheat, with Lucide Coffee, to the existing shared `PageActionMenu` and calls the feed's shared reheat handler.
`topic/TopicSource.tsx` adapts core's actual `TopicSource` and `TopicDefaultSource` components with native Badge and Button
elements. Both editors use the same enabled row, remove action, disabled add action, and staged summary formatter.
Web retains hover tooltips; native summaries wrap and controls retain touch targets. `ChoiceSelect`'s InSheet story
checks dropdown selection above a form sheet, using the root portal order.

`TopicPageContent.tsx` owns the Topic screen’s single scroll area. `CollapsibleSection.tsx` matches its open-by-default
section headings. `TopicPageCards.tsx` renders Topic roast, Artisanal Blend, and Similar topics. `TopicScanHistory.tsx`
loads a selected scan note on demand. `note/NotesSection.tsx` lists Topic and Team Tasting Notes and opens their platform routes.
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
and tables; all playback enters the single root-owned player.
Older seasons use the existing client in account-scoped transient queries. Episodes and Brew diary use five-row pages
and `common/Pagination.tsx`, which supplies native controls to core's shared pagination component.
Chapter rows share `PodcastEpisodeChapterPill` with Findings. Their source line opens the Finding sheet, while
their title starts the chapter and their current pill toggles playback. The native chapter list omits rating thumbs, as the narrow web layout does.
`TopicCountsLine.tsx` shows Viewers and Followers in the web's display font and footer spacing. It refreshes every minute
while its Topic route is active, retains counts when offline, and reserves the footer space before the first read.
The Topic screen records its view through the shared core helper, once per app runtime.
Its `PodcastEpisodeRow` also supplies Topic roast's play button, numbered title, date, duration, and latest label.
Topic roast's film row is the same row, with the Video button's poster thumbnail in its play button's place.
Topic roast uses the labeled Share button from the web.
`table/TableCard.tsx` shares the native table surface, header, and row separators. `table/TopicNameLink.tsx` shares
linked Topic names with the same podcast play button. `RelatedTopicsSection.tsx` renders core's Similar topics section
through them, with its name sorting and the same shared play action. `SortableHeader.tsx` draws core's sort state and
also serves Notes. The pagination footer stays inside its table card. Future native tables reuse these components.
`table/TablePagination.tsx` supplies native controls to core's shared table footer and `usePagination` state.
Rows opens the anchored `Select` dropdown; changing size or sort returns to page one.
`topicPageStories.tsx` supplies complete page fixtures and an isolated Query client for the card stories.
`common/WebFeature.tsx` supplies the labeled browser handoff for Admin.
Topic creation, editing, team management, manual scans, reporting, and Topic and Team notes run natively.
Finding details continue to use the existing shared screen-level sheet.

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
| Transient toast, including the voice notices | System alert with the web's words, its action as a second button | System alert with the web's words, its action as a second button |
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
