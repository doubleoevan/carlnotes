# Mobile Coffee Break implementation and QA report

The mobile player now uses the web's shared playback rules and portable React components. The bottom player's title
opens its episode without restarting audio. Topic and episode pages use the same player card and clickable chapter bar.
Simulator playback and representative visual checks passed. Physical-iPhone verification is handed over explicitly at the user's request; those results are not claimed as passing.

## What is shared

These are actual React compositions in `packages/core/components/`, consumed by both apps through element adapters:

| Components | Shared responsibility |
| --- | --- |
| `PodcastEpisodePlayerCard`, `UnpublishedPodcastEpisodeCard`, `PodcastEpisodeDetails` | Published/recording/error presentation, identity, controls, chapter display, and subscription action |
| `PodcastEpisodePlayButton`, `PodcastEpisodePill`, `PlaybackControlButtons` | Playback states, action selection, labels, skip lengths, speed cycle, and visibility |
| `PodcastEpisodeSeekBar`, `PodcastEpisodeChapters` | Weighted chapter segments, seek rules, current chapter, title/pill/Finding actions, and expansion |
| `PodcastEpisodeRow`, `PodcastEpisodesCard` | Episode row composition, season tabs, selection, pagination, and permitted removal |
| `PodcastPlayer` | Persistent player's linked cover/title, chapter line, progress, skips, and play/pause |
| `PodcastEpisodeTranscript`, `PodcastThemeSongCredits` | Speaker/chapter sections, expansion state, credits, and full lyrics |
| `PodcastFeedDialog`, `RemovePodcastEpisodeDialog` | Content, confirmation flow, pending state, and destructive-action ordering |
| `PodcastEpisodeChapterTag` | Podcast chapter tags inside existing chat answers |

Core also owns playback state/commands, listen save interval, next-episode selection, chapter lookup, seeking, metadata,
recording polling, chapter ratings, feed requests, and table column/total rules. The table as a whole is not shared:
web preserves its server-rendered overflow rows, while mobile uses its existing fixed-first-column DataTable.

### Platform adapters

- Web retains HTML audio, Media Session, router links, dialogs, and voice integration.
- Mobile retains Expo audio, platform images and links, Nightshift controls, sheets, and system confirmations.
- `PodcastEpisodeSeekBar` uses the installed system slider inside a 44-point iOS or 48-point Android touch target. Android shows a Nightshift-colored drag handle; the iOS hit target preserves the segmented appearance. Its accessible wrapper
  provides bounded 30-second increment and 15-second decrement actions through shared seek rules.
- The phone dock reserves that touch height inside its own layout. A previous negative offset intercepted nearby page buttons;
  the final fix removes that overlap. A page button eight screen pixels above the dock collapsed the transcript while playback stayed paused at 4:25.
- The root owns keyboard avoidance while an episode is loaded. Chat and notes disable their inner avoidance then,
  placing their composer/editor above the player and the player above the keyboard. While typing, the progress strip
  folds away; linked title, skips, and play/pause remain. Chat hides its duplicate context line and truncates only the
  choice trigger. Note body editing hides the brand header and note metadata until Done; name editing retains its field.
  Both editors were verified at normal and increased text sizes. Opening a sheet dismisses the underlying keyboard.
- Episode headings and credit buttons are sibling elements. React Native text grouping otherwise hid the credit button
  from screen readers. The separate heading and credits controls were verified in the iPhone accessibility tree.
  Credits and feed sheets restore VoiceOver focus to their concrete trigger when closed.
- `PodcastEpisodeTranscript` supplies a bounded platform ScrollView, orange scroll indicator, and themed fade.
- `PodcastThemeSongNote` is a platform trigger around the shared credits. `PodcastEpisodeScreen` is an Expo screen around the existing page payload.

## Audio, access, and persistence

The installed SDK-compatible library is `expo-audio` 58.0.10. One root-owned instance streams a continuous episode file.
The versioned patch adds adjacent-chapter system commands to that same player; a playlist would change files instead.
iOS background audio and the Android playback service are configured. Recording permissions and microphone UI are excluded.
A rebuilt application is required; an over-the-air JavaScript update cannot install the audio module or patch.

The audio route's explicit JSON representation returns a short-lived signed URL after existing authorization.
Legacy GET redirects, HEAD metadata, range behavior, and counting remain covered by the API smoke assertions.
Only the signed URI reaches Expo audio; CarlNotes session headers do not travel to object storage.
Signed audio and private-feed URLs are redacted from monitoring.

Account-scoped checkpoints contain episode ID, position, rate, completion, and timestamp. They contain no audio URL,
transcript, title, or session secret. Restoration is paused. Progress is saved on playback transitions and every 30 seconds
while playing. Current access, including an episode that was public when loaded, is rechecked on restore, resume, foreground return, and a foreground interval.
Confirmed denial unloads playback and clears its checkpoint; a transient failure retains retry. Buffered media is not
instantly revocable. Session retirement rejects delayed loads, refreshes, saves, and automatic next-episode responses.

## Automated verification

- `bun run check` passed: **2,543 tests, 0 failures, 12,734 assertions across 437 files**.
  This includes formatting, package boundaries, component parity, TypeScript, Temporal bundling, and tests.
  The post-fix run passed after the dock, keyboard, and focus-return changes: 25.47 seconds for the test suite.
  A restricted run could not bind its local fake-scanner ports; rerunning with local network access passed.
- Existing web playback and podcast-question regression assertions were retained.
- Added tests cover chapter boundaries, rate cycle, paused seeking, stale requests, completion/autoplay,
  recording selection/poll cancellation, ratings/rollback, feed resets, episode removal, routing, protected outcomes,
  checkpoint ownership, source refresh, and retirement ordering.
- API smoke checks passed with the legacy assertions and six additional JSON-audio visibility checks and five numeric-boundary rejection checks.
- The final incremental iPhone SE build compiled, including the Swift chapter-command patch. Bun applied the patch successfully.
- A temporary Swift harness executed the actual chapter methods extracted from the versioned patch. Next/previous,
  first/last/empty boundaries, paused/playing state, invalid-target filtering, metadata updates, target replacement, and
  clearing targets passed. Its stub player does not prove AVPlayer or operating-system command delivery.
- Docs build and the final search refresh passed: **112 sections, 1 embedded, 0 deleted**.
- Portable package boundary checks passed. Core imports no app module or platform global.
- Strict OpenSpec validation and `git diff --check` passed. All 43 tasks are complete under the explicitly documented physical-device handoff.
- Kotlin chapter methods extracted from the same versioned patch compiled and passed the identical fixture matrix using cached Kotlin 2.2.21 compiler jars. No Android build, runtime, or download was required. Both harnesses cover handler behavior, not operating-system command delivery.

The final call census retains exactly one production caller for each of the seven APIs:

| API | Owner |
| --- | --- |
| `fetchNextUnplayedPodcastEpisode` | Core player store |
| `sendPodcastEpisodeListen` | Core listen store |
| `sendPodcastEpisodeChapterRating` | Core chapter rating hook |
| `sendTopicPodcast` | Existing core `saveTopic` |
| `fetchPodcastFeedUrl`, `sendResetPodcastFeed` | Core feed hook |
| `sendRemovePodcastEpisode` | Core removal component |

## iPhone evidence

Only the existing **CarlNotes QA iPhone SE**, iOS 27.0, was used. No second runtime was downloaded or booted.
Android device QA was excluded at the user's request. Available disk space was 7.7 GiB at the final check; existing build caches were reused.

| Check | Observed result |
| --- | --- |
| Actual playback | Home episode playback advanced the clock; navigation retained the same player |
| Bottom title navigation | Opened the currently loaded episode without restarting it |
| Topic segmented bar | A paused tap moved 4:06 to 16:13 |
| Episode segmented bar | A paused tap moved 6:16 to 16:19; a backward drag moved 16:19 to 14:46 |
| Final seek after drag optimization | Paused tap moved 0:03 to 16:30, then a backward drag reached 14:50; playback stayed paused |
| Final full-card seek | A playing tap reached 18:09; playback remained active. Paused tapping reached 17:52 |
| Chapter actions | Chapter 4 then 2, current-title restart, and current-pill pause/resume worked |
| Expansion | All 15 chapters appeared without restarting playback |
| Timed skips | Final dock: paused 4:25 → 4:55 → 4:40. Full-card skips also passed |
| Final dock seek/play | Tap 4:40 → 11:16, play advanced the clock, backward drag while playing reached about 9:35, then pause retained position |
| Speed | Full cycle observed: 1, 1.25, 1.5, 2, 0.75, then 1 |
| Finding | Chapter source opened the existing Finding reader; thumbs-up selection was verified. A second tap was issued to undo the test rating |
| Completion | Episode 6 finished; the next unplayed episode loaded and played. The opened page stayed on episode 6 until its new bottom title was pressed |
| Background / simulator lock | Audio advanced from 4:11 to 4:51 at 1.25x across locking/return; Home backgrounding also continued playback |
| Forced restart | Last observed 0:37 restored paused at 0:37 with 1.25x. No loss was visible at that observation resolution |
| Feed | Public feed sheet opened; unavailable podcast-app handler showed copy fallback; copy feedback appeared |
| Credits | Player and episode-heading credits opened the shared lyrics sheet in light and dark |
| Transcript | Read more expanded the bounded reader; inner scrolling exposed chapter dividers and speaker lines. Read less collapsed it while playback remained at 4:25 |
| Themes | Player, feed, and credits were inspected in both Nightshift themes against web references |
| Keyboard and larger text | Chat and note body remained usable above the compact dock at text sizes 3 and 7. Send/Done stayed visible; long conversation labels truncated only in the trigger. Original size was restored |
| Accessibility | Exposed increment/decrement actions moved paused playback 11:43 → 12:13 → 11:58. Credits and Subscribe regained VoiceOver focus after sheet dismissal. VoiceOver was turned off afterward |
| Additional fixture previews | Playback error inspected in light/dark; buffering inspected in dark. Story previews now scroll so long cards remain reachable on the SE |

Local screenshot evidence is in `/tmp/`: `carlnotes-podcast-iphone-player-dark.png`,
`carlnotes-podcast-iphone-feed-light.png`, `carlnotes-podcast-iphone-credits-light.png`,
`carlnotes-podcast-iphone-transcript-dark.png`, `carlnotes-podcast-iphone-finding-rating.png`,
`carlnotes-podcast-web-feed-dark.png`, and `carlnotes-podcast-web-player-light.png`, and `carlnotes-podcast-iphone-dock-touch-fixed.png`.
Final keyboard/focus evidence: `carlnotes-podcast-iphone-keyboard-dock.png`,
`carlnotes-podcast-iphone-keyboard-large-text.png`, `carlnotes-podcast-iphone-keyboard-long-title.png`,
`carlnotes-podcast-iphone-note-keyboard.png`, `carlnotes-podcast-iphone-note-keyboard-large-text.png`, and
`carlnotes-podcast-iphone-feed-focus-return.png`. Error previews: `carlnotes-podcast-iphone-error-light.png` and
`carlnotes-podcast-iphone-error-dark.png`.
Player images taken before the last dock adjustment are historical evidence, not proof of its final geometry.

## Verification limits and manual handoff

The user reported that the emulator works and authorized physical-iPhone checks to move into the manual QA report.
`logs/manual-qa-report.md` lists system/headset commands, Bluetooth, interruptions, route disconnects, long background
sessions, real-network expiry, access retirement, feed-app integration, removal against disposable data, and physical
VoiceOver gestures with steps and expected results. Automated coverage for source expiry, sign-out, access loss,
feed reset, and removal passed; their physical end-to-end behavior is not claimed.

Additional rendered comparisons covered private feed content in both themes; loading, unavailable, and failed-reset
copy; the iPhone reset alert and web reset dialog; and recording/failed-recording cards. The failed-recording card was
compared in both themes. The subscription description is now one shared composition with the show title bold in both
apps. The web story supplies the required dialog context, and the mobile preview scrolls so all private-link content
is reachable. These are representative state comparisons, not an exhaustive theme × device × account matrix.
No implementation drift was found in the checked requirements. Hardware-dependent scenario coverage remains partial.

Additional evidence: `/tmp/carlnotes-podcast-iphone-feed-bold.png`,
`/tmp/carlnotes-podcast-iphone-private-feed-light.png`, `/tmp/carlnotes-podcast-web-feed-bold-dark.png`,
`/tmp/carlnotes-podcast-iphone-reset-confirmation.png`, `/tmp/carlnotes-podcast-web-reset-light.png`,
`/tmp/carlnotes-podcast-web-reset-dark.png`, and the iPhone recording-failed light/dark screenshots.

## File structure and terminology

Corresponding podcast components keep the same basename in web, mobile, and core. Core holds portable composition;
app wrappers hold concrete renderers. The Expo route is `app/topics/[topicId]/episodes/[season]/[episodeNumber].tsx`.
Its `PodcastEpisodeScreen` name follows the existing mobile screen convention; web retains `PodcastEpisodePage`.

The state subscriptions live in `podcastEpisodePlayerState.ts`; playback commands live in `podcastEpisodePlayerStore.ts`.
Existing imports remain compatible through explicit exports. `sessionReturnPath.ts` preserves the requested route through sign-in.
`useIsScreenActive.ts` generalizes the existing chat activity hook so recording polls stop off-screen or in the background.
`ShimmerText.tsx` extracts the existing reduced-motion-aware highlight for reuse in recording and loading states.
`patches/expo-audio@58.0.10.patch` follows Bun's versioned patch naming.

Long changed files: core `podcastEpisodePlayerStore.ts` is **454 lines**, retaining one playback command/lifecycle owner
with state subscriptions split out. Web `styleClasses.ts` is **400 lines**, an existing style-constant catalog.
Other changed TypeScript files are under 350 lines at this audit.

New implementation terms: an **adapter** connects shared rules to browser or Expo operations; a **checkpoint** is the
saved local playback position; the **dock** is the persistent bottom player. These add no user-facing domain vocabulary.

## Final review fixes

Security review found three medium issues, all fixed: cached public visibility now undergoes current access checks;
episode numeric parameters are bounded to the database integer range; and removal callbacks/results belong to the
specific mounted account lifetime, including an A → B → A account change.

Performance review found four medium issues, all fixed: only the loaded seek child subscribes to position ticks;
dragging previews locally and seeks once on release; recording polls follow screen/app/network activity and abort
retired requests; and next-unplayed selection filters eligible latest episodes in one bounded query before final authorization.
A two-card probe retained one chapter render per card through ten position ticks, compared with eleven before the fix.

External reviews prompted additional fixes for checkpoint cleanup failures, Android touch-target visibility,
confirmation callback timing, removal cleanup failures, and consecutive accessibility seeks. A disposable React
harness exercised the current SeekTrack source with host elements replacing device controls: consecutive +30/+30/−15
requests accumulated before player props updated, drag preview survived a render without committing a seek, release
committed once, committed position synchronized, and seeking clamped at duration. This proves component event behavior,
not physical screen-reader gesture delivery. Gemini completed with no findings. Full review outcomes are in the ship report.

The final terminology pass applied complete Podcast Episode names, boolean prefixes, options objects for expanded
request helpers, current logical-group comments, and the shared AnchorLink for credits. All matching callers and spies
were updated. No new domain entity or model prompt was introduced.

## Approved naming updates

The requested terminology update renames the theme-song family to `podcastThemeSong` / `PodcastThemeSong` across
web, mobile, and core, including lyrics, credits, note buttons, stories, imports, and `PODCAST_THEME_SONG_LYRICS`.
`platformPath.ts`, `platformPath.test.ts`, and `toPlatformPath` replace the former generic native-path names.
Existing behavior and regression assertions are retained. Framework names such as React Native and nativeEvent remain exact.
The module guides and rename catalog now match these names. These mechanical changes follow the external-review snapshot;
the full gate is rerun before archive and commit.
