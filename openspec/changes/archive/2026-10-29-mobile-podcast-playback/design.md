# Mobile Coffee Break design

## Context

See [proposal.md](proposal.md) for the scope. This design keeps one playback implementation for the web's rules and two audio adapters.
The existing mobile cards become real controls over that player. They remain in their current screens.

The inspected app uses Expo `~58.0.0`, React Native `0.88.0`, and no audio package.
Mobile already has the episode card, season list, pills, play buttons, Topic podcast switch, and shared Topic save flow.
Its playback controls currently open the web. The web store combines portable decisions with an audio element, Media Session, browser lifecycle, and voice integration.

The rendered reference was the local Getting a Literary Agent Topic, episode 4, with 15 chapters.
It showed a segmented progress bar, three initial chapters, the expansion control, Subscribe, credits, seasons, and permitted removal.
This proposal inspected that rendered dark-theme state and the source. It does not claim completed device QA.

## Goals / Non-Goals

**Goals:**

- One owner for playback decisions, episode/chapter state, listen rules, and portable composition.
- Preserve web behavior, including its voice integration and server-rendered public episode pages.
- Keep account and episode changes authoritative over delayed loads, seeks, saves, and autoplay.
- Prove the selected audio adapter's chapter controls early on one iPhone target.

**Non-Goals:**

- No new Topic screen, alternative season list, general-purpose media framework, offline audio download, or microphone.
- No Android emulator or additional iPhone simulator runtime. Configure Android support and state its device verification limit explicitly.
- Prompt 49 owns broader visitor/access changes and live counts. Existing episode authorization remains enforced here.
- Prompt 51 owns verified app-link association and store release; existing in-app link routing is included here.
- Prompt 54 owns recording and voice. Preserve an adapter coordination point without adding mobile voice controls.

## Decisions

### 1. Extract the existing player instead of implementing a second state machine

Use module-scoped stores and typed adapter functions, following existing core stores. Do not add a singleton class or a media-service abstraction.
Keep high-frequency position subscribers separate from episode/chapter subscribers, as the current player does.

| Current source | Shared destination and responsibility | What remains in the app |
| --- | --- | --- |
| Web `lib/podcastEpisodePlayback.ts` | Core `lib/podcastEpisodePlayback.ts`: chapter lookup, skip lengths, rate cycle, seek bounds, portable metadata values | Browser availability checks and Media Session objects stay in the web module |
| Web `stores/podcastEpisodePlayerStore.ts` | Core `stores/podcastEpisodePlayerStore.ts`: commands, load/seek ordering, completion, next-episode policy. `podcastEpisodePlayerState.ts`: loaded episode, position, playing state, rate, and subscriptions | Audio element events, page lifecycle, and voice calls are injected by web; Expo events by mobile |
| Web `stores/podcastEpisodePlayActions.ts` | Core module with the same basename: loaded-episode reuse, episode/chapter actions, missing-chapter fallback | App wrappers bind navigation and feedback only where required |
| Web `stores/podcastEpisodeListenStore.ts` | Core module with the same basename: once-per-load start, 30-second save interval, pause/exit/completion saves | Session ownership and lifecycle notifications come from each app |
| Web `PodcastEpisodePlayer.tsx` selection hook | Core `hooks/useShownPodcastEpisode.ts`: loaded/linked/recording/failed/latest precedence and bounded recording polling | Search parameters and platform lifecycle are inputs |
| Web chapter rating handler | Core hook beside existing rating hooks: target selection, optimistic update, rollback, and permission input | Finding-reader opening and presentation are adapters |
| Web feed and removal handlers | Core hooks: request state, confirmation state, duplicate-submit prevention, session retirement, and result handling | Clipboard, app-scheme opening, navigation, and dialog/sheet primitives |
| Web `podcastThemeSongLyrics.ts` | Core `lib/podcastThemeSongLyrics.ts`, preserving its parser and tests | Scroll container and link handling remain platform elements |

Preserve current web exports through thin wrappers where existing voice callers or regression tests depend on them.
Move the implementation once; wrappers must not retain a second copy of its state or rules.
Web-only callbacks retain the current question-ending and spoken-answer behavior on play, pause, seek, and chapter changes.
Mobile supplies no recording behavior in this change. A later voice adapter can pause/resume the same player through that boundary.

The alternative, keeping two stores with similar code, would let chapter and listen semantics drift. Reusing browser globals inside core violates package boundaries.

### 2. Share rendered composition, not just calculations

Follow the existing `packages/core/components/AccountBudget.tsx` pattern: portable React composition receives small typed element adapters.
Put podcast components in the existing flat `packages/core/components/` directory and preserve corresponding basenames in app wrappers.
Read the Nightshift component catalog before implementation. Reuse existing primitives and contracts before introducing a new primitive.

| Actual component reuse to deliver | Shared responsibility | Concrete platform dependency and thin replacement |
| --- | --- | --- |
| `PodcastEpisodePlayerCard`, `PodcastEpisodeDetails` | Section order, metadata, selected state, chapter/AI-voices line, Subscribe placement | DOM layout and links versus Nightshift Views, Text, and app links |
| `PodcastEpisodeChapters` | First-three expansion, row composition, source/times, action separation, selected chapter, rating eligibility | Browser pointer events and Finding dialog versus pressable regions and the existing mobile Finding reader |
| `PodcastEpisodePlayButton`, `PodcastEpisodePill`, `PlaybackControlButtons` | Icons, labels, toggle state, skip values, rate control and visibility | Existing web/mobile Button and Tooltip implementations; touch accessibility labels replace hover-only access |
| `PodcastEpisodeRow`, `PodcastEpisodesCard` | Episode ordering, season/pagination rules, latest label, title/play separation, permitted removal | DOM/SSR overflow rows and router links versus scrolling mobile tabs and app navigation |
| `PodcastEpisodeTranscript` | Transcript blocks, speaker labels, expansion state, headings, and read-more control | CSS mask, browser scrolling/tab stop versus bounded mobile scroll area and accessible expansion |
| `PodcastFeedDialog`, `RemovePodcastEpisodeDialog`, `PodcastThemeSongCredits` | Content, warning/confirmation order, controls, disabled/pending state, credits and lyric sections | Dialog versus mobile Sheet; clipboard and URL opening remain app adapters |
| `PodcastEpisodeChapterTag` | Chat chapter label, description, and playback action | Browser tooltip/IconButton versus an accessible mobile pressable tag |
| Docked player's presentation extracted from `PodcastEpisodeAudio` | Cover/title/current chapter, seek and playback-control order | Web audio/layout wrapper versus one mobile root audio host and safe-area layout |

Reuse the existing shared `RatingThumbs`, `MoreButton`, `DataTable`, `PageActionMenu`, and mobile Finding reader.
Do not introduce a framework that merely moves each entire screen into an adapter slot. Core must own the meaningful composition.
Keep class names and Nightshift roles where portable; adapters translate concrete layout and accessibility properties.

The handoff report must separate these actual shared components from shared hooks/rules and platform renderers.
Name the dependency that requires each remaining renderer. Visual similarity alone is not evidence of reuse.
`PodcastEpisodesSection` and `PodcastEpisodeChaptersTable` share their column definitions, formatting, sorting inputs,
and totals. Their section/table renderers remain platform components: web preserves server-rendered overflow rows,
and mobile uses the existing fixed-first-column table. This is shared logic and column composition, not reuse of the
entire table component. `PodcastThemeSongNote` is the platform trigger; `PodcastThemeSongCredits` is its shared content.

### 3. Treat the inspected web behavior as an acceptance matrix

| Action or state | Required behavior |
| --- | --- |
| Episode play button | Load and play, or toggle the already loaded episode without a second fetch |
| Episode title | Navigate to that episode; do not count or start a play |
| Chapter title | Start at that chapter's beginning, including when that chapter is already playing |
| Chapter pill | Toggle if it is current; otherwise start that chapter |
| Remaining chapter row | Open its visible Finding; if none is available, play the chapter without fabricating a Finding |
| Seek before loading | Load and play at the chosen time |
| Seek while loaded and paused | Change position and highlighted chapter, retaining pause |
| Back / forward | Clamp a 15-second backward or 30-second forward seek to the episode bounds |
| System previous / next | Jump to the adjacent chapter's start, retaining pause; no-op past either end |
| Speed | Cycle `1 → 1.25 → 1.5 → 2 → 0.75 → 1`; retain it on episode replacement |
| Current chapter | Last chapter with start at or before position; first chapter before all starts; none for an empty list |
| Progress segments | Use the existing chapter-duration weighting and fill rules; preserve intro and sign-off audio |
| Expansion | Three initial chapters; show all on expansion without resetting playback |
| Completion | Save completion and request the next unplayed episode from another owned or followed Topic; stop if absent or failed |
| Page presentation | Prefer the loaded episode of this Topic, then its linked episode, recording/running scan state, permitted failure state, then latest |

The Topic player has no cover. At phone width, the episode page hides its large heading cover and duplicate chapters table.
Retain that web behavior. The mini player and system controls carry the cover; wider episode pages retain their cover rule.

Ordinary phone chapter ratings remain in the existing Finding reader. A filtered-out Finding can still have an episode-chapter rating on web.
Mobile exposes that eligible orphan chapter's rating through a labeled chapter action sheet using shared RatingThumbs.
This touch adaptation preserves the capability without crowding narrow rows or creating a false Finding.
Hide it when rating is disallowed. Preserve the existing optimistic rollback and source link.

The user approved one deliberate web behavior change: private feed reset gains confirmation on both platforms.
Existing web episode deletion already confirms and keeps its current wording.

### 4. Use Expo audio with an explicit chapter-command extension

Choose `expo-audio` **58.0.10**, installed through Expo's SDK-compatible installer and pinned with the repository's patch mechanism.
The package provides streaming sources, source headers, background playback, system metadata, interruption handling, and configurable system seek intervals.
Its plugin configures iOS background audio and Android's media playback service. These are documented in [Expo's SDK 58 audio reference](https://docs.expo.dev/versions/v58.0.0/sdk/audio/).
The 58.0.10 release adds separate backward and forward seek intervals; use 15 and 30 seconds. See the [Expo audio changelog](https://github.com/expo/expo/blob/main/packages/expo-audio/CHANGELOG.md).

Inspection of the published 58.0.10 source found a material limitation: single-player next/previous commands do not support chapter targets.
Playlist next/previous changes tracks, which cannot represent this app's chapters inside one continuous MP3.
The inspected version is recorded by the [published package metadata](https://registry.npmjs.org/expo-audio/58.0.10).

Add `patches/expo-audio@58.0.10.patch` and its root `patchedDependencies` entry.
Extend the single player with ordered chapter start times and labels supplied from the shared state.
System next/previous commands seek inside that same file and update chapter metadata without depending on an active React render or JavaScript timer.
Implement the same boundary rule on iOS and Android. Use shared fixtures to check those small platform translations.
Clear the supplied chapters when replacing or releasing the player. Do not represent chapters as separate playlist tracks.

The app uses one root-owned `createAudioPlayer` instance, not a player tied to a screen's mount cycle.
Bind its status events to the shared store, await source readiness before seeks, and discard callbacks from retired loads.
Keep platform source URLs inside the adapter. Configure `downloadFirst: false` and release listeners and sources when unloading.

Configure `playsInSilentMode`, background playback, and interruption mode `doNotMix`; recording remains disabled.
The plugin enables background playback and sets microphone permission, Android recording permission, and background recording to false.
Activate lock-screen controls for the loaded episode and keep artwork, title, hosts, chapter, elapsed time, and rate current.
Operating systems choose which transport buttons they display. Every supported command must map to the shared chapter or timed-seek rule.
Test both visible controls and available headset commands; do not promise simultaneous display of every button.

On an interruption or route disconnect, reconcile actual platform state into core. A user pause or episode/session change cancels any pending automatic resumption.
Stop and clear the system session on unload. A future recording adapter can claim audio focus through the same coordination boundary.

React Native Track Player was considered. Its current generation offers a different media-service architecture, adding a larger dependency migration.
Expo fits the installed SDK and confines the missing capability to chapter commands.
The first implementation milestone must build and prove this extension on the selected iPhone before extensive UI wiring.

### 5. Resolve private audio with the existing session and authorization

The current `/api/episodes/:id/audio.mp3` route checks access and returns a no-store redirect to a one-hour object-storage URL.
Its HEAD response returns audio metadata and range support. Keep those browser, feed, and MCP behaviors unchanged.

Add an explicit JSON representation requested with `Accept: application/json` on that same authenticated audio route.
Return a validated `{ audioUrl, expiresAt }` through a new typed client helper, using the same access and source-signing helpers.
The current API request carries the mobile session header. Expo receives only the returned media URL, with no session headers attached.
This avoids relying on platform redirect behavior to strip credentials before a request reaches object storage.
The resolved URL stays in memory and never enters persistent playback state, query persistence, breadcrumbs, or analytics.

Preserve HEAD behavior regardless of Accept and keep legacy GET redirects unchanged.
Set private/no-store caching on the JSON response and account for representation variance.
Retain the existing audio-route listen counting and rate limit; request a source only for actual playback or its necessary refresh.
Restoring a paused player must not request audio or count a play.

On expired-source failure, obtain fresh authorization and reload at the saved position and rate.
Use the current bounded retry interval, cancellation, and a visible retry state. Never retry a confirmed denied or removed episode.
Use typed client outcomes to distinguish transport/server failures from denied or missing content.
Preserve existing web default results while adding an explicit error-aware client path for mobile access decisions.

Revalidate the loaded episode’s current access on restoration, foreground return, resume, and source refresh.
While foreground playback continues, check access at a bounded interval and share one check for the loaded episode.
This check is authorization, not Prompt 49's live-count polling. Clear protected page, source, resume, and system metadata when access is denied.

Already buffered media cannot be revoked remotely at the exact instant permissions change.
Background execution and an issued object-storage URL also limit immediate revocation, as they do on web.
Do not claim instant remote revocation. Stop at the next confirmed access decision and require authorization before further loading or resuming.
Removing an episode through this app and signing out stop the local player immediately.

### 6. Persist position without persisting access

Use the existing account-scoped storage conventions for a versioned record containing episode ID, position, completion, rate, and save time.
Do not store the episode payload, artwork, session, feed token, or audio URL there.
Update the local checkpoint on the existing 30-second interval and flush on pause, replacement, background transition, completion, and orderly exit.
Restoration loads metadata under the current session, clamps the saved time, and creates a paused player without an audio source.
For the last locally loaded episode, use its local checkpoint; for a newly selected episode, use the API's saved progress as web does.
The existing best-effort server progress save remains the cross-device behavior; this change adds no offline write queue.

Use an account/session generation and episode-load generation to retire pending work.
A newer explicit play, sign-out, removal, or access denial invalidates earlier source resolution, play promises, seeks, and next-episode requests.
An ended event may autoplay only if its episode and session are still current and no later user action superseded it.
Bind saves to the initiating account so a delayed save cannot use the next account's session header.

Integrate `sessionExit.ts` and revoked-session handling. Pause before a sign-out attempt; a successful exit clears persisted playback and media metadata.
A failed sign-out retains the prior account's paused state and does not silently resume.
Visitors can play currently permitted public episodes but get no persistent personal progress or automatic next-episode lookup.

### 7. Keep API mutations in one shared owner

The planning audit found these production call counts, excluding declarations, imports, tests, and stories:

| Client call | Calls | Current owner | Intended owner |
| --- | ---: | --- | --- |
| `fetchNextUnplayedPodcastEpisode` | 1 | Web player store | Shared player store |
| `sendPodcastEpisodeListen` | 1 | Web listen store | Shared listen store |
| `sendPodcastEpisodeChapterRating` | 1 | Web chapters | Shared rating hook |
| `sendTopicPodcast` | 1 | Core `saveTopic.ts` | Keep the current shared save flow |
| `fetchPodcastFeedUrl` | 1 | Web feed dialog | Shared feed hook |
| `sendResetPodcastFeed` | 1 | Web feed dialog | Shared feed hook behind confirmation |
| `sendRemovePodcastEpisode` | 1 | Web removal dialog | Shared removal hook |

Recount these immediately before implementation and after extraction.
Each user action must reach one policy owner, regardless of how many controls display it.
`isPlaybackStart` is sent once after actual playback starts for a loaded episode, never on metadata fetch, restoration, failed play, or a seek.
Chapter changes and remote commands do not create new loads or extra starts.
Completion and progress remain separate from the audio route's aggregate listener counting.

### 8. Add the episode route and finish existing entry points

Add `app/topics/[topicId]/episodes/[season]/[episodeNumber].tsx` with `components/podcast/PodcastEpisodeScreen.tsx` following the existing mobile route/screen pattern.
Use `fetchPodcastEpisodePage` and its current payload; do not build a parallel episode API.
Map canonical slugged episode URLs to that route before the generic Topic matcher in `platformPath.ts`.
Preserve query/hash context, reject unrelated hosts, and retain an episode destination through sign-in.
This is internal routing, not Prompt 51's verified association-file work.

Wire Home, Topic, profile/team/activity tables, related Topics, search, Topic roast, Finding pills, and chat chapter tags to shared play actions.
Update only their podcast handoffs. Keep Admin's existing browser behavior.
Share transcript composition and theme-song lyrics, and use the existing page actions and forms for Topic sharing, reporting, and team membership.
Episode removal appears wherever web's `canRemovePodcastEpisodes` or page permission exposes it.
On success, invalidate episode/season/Topic data and unload only the removed episode.

Retain the current mobile `EditTopicModal` Podcast switch and `saveTopic` flow.
Check ownership, cancellation, failed podcast saves, settings summary updates, paused-show copy, and published-episode availability when switched off.
Do not add mobile pricing links or bypass existing permissions.

### 9. Reserve space for the mini player and Coffee Talk

Mount the mobile audio host and mini player once at the app root.
Measure the dock height, include the bottom safe-area inset once, and expose its clearance through a small shared layout value.
Screens reserve that space through their existing layout/scroll adapters; avoid separate magic numbers in each screen.
Home lists, PageScreen pages, chat, and note editors must all consume it.
Place Coffee Talk above the dock using that measurement plus its existing gap; preserve its current keyboard/chat-screen hiding rules.

For keyboard screens, place the dock in the screen's reserved bottom layout above the keyboard, with the composer above the dock.
Use a single host/portal placement so this does not mount a second audio player or a second visible mini player.
Modal sheets retain their own safe-area and keyboard layout, and reserve room for their actions instead of letting the dock overlay them.
Dismissed sheets reveal the same player and position. Do not add a visible tab bar.

Reserve the system slider's full 44-point touch height inside the phone dock. An invisible target must not extend
into the page above or the playback buttons below. This touch requirement makes the phone progress strip taller than
the web's pointer-sized strip. The root owns keyboard avoidance for the navigator and loaded player together;
the chat and note wrappers disable their inner avoidance while that root adjustment is active. While typing, fold away
the progress strip and device bottom inset; retain the linked title, skips, and play/pause. Hide the duplicate chat
context line and show one line in its choice trigger; the choice sheet retains full labels. While typing a note body,
hide the brand header and note metadata until Done; keep the name field when editing the name itself. These measured
iPhone SE adaptations preserve room for editing at increased text sizes. Opening a sheet dismisses the underlying
keyboard. Feed and credits sheets return accessibility focus to their trigger.

### 10. Subscribe and reset use shared state with platform URL handling

Move feed loading, pending reset, confirmation, copy text, errors, and current-link state into shared composition and hooks.
The user explicitly approved reset confirmation on both platforms. Explain invalidation and replacing the link in podcast apps before submission.
Failure retains the current link unless access has been denied. Closing, changing Topic, or retiring the session clears private links and late responses.

Use a narrow podcast-link opener on mobile: `podcast://` on iOS and `pcast://` on Android.
Construct it only from the feed URL returned by the trusted API; preserve its token and avoid logging the destination.
Check scheme support and catch opening failures; retain the Copy feed link fallback in every state where a feed is available.
Add only the necessary iOS query schemes and Android package-visibility intents through app config/config plugins.
Do not broaden the general link helper to permit arbitrary schemes.

### 11. Verify behavior, reuse, and device limits explicitly

Keep all existing web regression assertions, including playback actions, details, sections, controls, theme-song lyrics, and podcast-question/voice behavior.
Move or import pure helpers without weakening expected results. Add tests for new shared state and adapter ordering.
Test chapter boundaries, pauses, rate order, late events, completion, next-episode races, session changes, missing/denied/error outcomes, and once-per-load listen recording.
Test audio JSON versus redirect/HEAD authorization and privacy, feed confirmation/copy fallback, removal, and internal episode links.

Stories must cover unloaded/playing/paused/buffering/error/recording/failed player states, expanded chapters, long titles, missing Findings, ratings, transcripts, and the mini player.
Include feed loading/private/reset/error states, deletion confirmation, theme credits, and permission variants in both themes.
Reuse fixtures between web and mobile. Use existing stories and framework adapters instead of a second fake implementation for QA.

Compare rendered web and iPhone states for typography, spacing, icons, colors, button variants, labels, visibility, overflow, and loading/empty/error behavior.
On the chosen iPhone, seek ahead and behind by dragging, tapping, chapter title, pill, skips, and supported system commands.
Check loaded-paused seeks, intro/last chapter boundaries, first-three expansion, rates, completion, account restoration, background playback, and permission changes.
Exercise the dock with Coffee Talk, keyboard, notes, and sheets at increased text size and with VoiceOver.

Reuse one available iPhone target and existing build caches. Do not boot Android or install another simulator runtime.
A simulator can verify layout and much playback, but hardware Bluetooth, interruptions, and lock-screen behavior need a physical iPhone.
Prefer the user's physical iPhone for those checks if connected; otherwise report those exact checks as unverified instead of claiming they passed.
Do not delete unrelated caches or simulator data to make room.
The user accepted physical-iPhone checks as manual QA at ship handoff. Handler fixture execution and simulator playback are automated/device evidence; system, headset, Bluetooth, and physical VoiceOver gesture delivery remain explicitly unverified until that handoff is completed.

Run `bun run check` after implementation and all targeted checks required by the touched modules.
Update core, mobile, web, API/client/contracts guides as their responsibilities change, plus the root map if needed.
Update `apps/docs/src/content/docs/feed/coffee-break.md` with app playback, subscription/reset, transcript, and the mobile voice boundary, then refresh docs search.
The final report separates shared components, shared logic, platform replacements, rendered/device evidence, and remaining device-only checks.

## Risks / Trade-offs

- **Expo chapter extension maintenance** → Pin the package, keep a small versioned patch, verify it applies in clean installs, and test platform command boundaries first.
- **One iPhone cannot verify Android runtime behavior** → Validate Android configuration and compile/type boundaries where available; label Android playback as device-unverified.
- **Expired or revoked audio while buffered** → Reauthorize at defined lifecycle points, never persist media credentials, stop on confirmed denial, and state the revocation limit honestly.
- **Late requests restart the wrong episode** → Retire work by session/load generation and test rapid switching, removal, sign-out, and ended-event races.
- **Suspension or process termination loses the last unsaved seconds** → Keep bounded checkpoints and lifecycle flushes; test force-close restoration and measure the maximum loss.
- **A dock crowds small screens** → Use measured clearance, keyboard-aware placement, accessible controls, and rendered comparison on the one selected iPhone.
- **Shared composition changes web behavior** → Preserve existing assertions and rendered states; ship thin web adapters without moving browser or voice globals into core.

## Migration Plan

1. Add shared logic and components while the web continues through its adapter; keep existing exports where callers depend on them.
2. Add the backward-compatible audio JSON response and tests before the mobile build needs it.
3. Add Expo audio, the chapter patch, and app configuration. Build once for the chosen iPhone and prove system chapter/seek behavior.
4. Wire the existing mobile controls, episode route, dock, feeds, and actions to the shared implementation.
5. Complete regression tests, stories, rendered comparison, and iPhone QA; update guides and user docs.
6. Release through the normal workflow after implementation is requested. This proposal performs no application changes or release.

The app's fingerprint runtime policy must change with the audio module and plugin configuration; an OTA update cannot install them.
The API extension remains compatible with older apps and web. Roll back the mobile build or its compatible update if playback fails.
Keep the additive API representation until no released mobile build depends on it. No database migration is required.
