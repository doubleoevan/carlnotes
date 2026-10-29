# Mobile Coffee Break tasks

## 1. Extract playback rules and preserve the web adapter

- [x] 1.1 Recount the seven client calls listed in the design, inspect the current Nightshift component catalog, and record the web reference states and one selected iPhone target; verify the baseline has one production caller per listed API and no second device runtime is required.
- [x] 1.2 Move chapter lookup, seek bounds, skip lengths, rate cycling, and portable metadata into core `podcastEpisodePlayback`; keep browser Media Session code in web and verify the existing assertions plus exact boundaries, empty chapters, and rate-cycle tests pass.
- [x] 1.3 Extract `podcastEpisodePlayerStore` and `podcastEpisodePlayActions` into core with typed audio/lifecycle adapters; verify loaded reuse, chapter-title versus pill behavior, paused seeking, explicit-position precedence, and stale-load cancellation with shared tests.
- [x] 1.4 Move listen save interval and next-episode policy into shared stores, retaining one caller for each API; verify actual-play-only start recording, pause/background/completion saves, no visitor progress, and late-autoplay suppression with fake-clock and deferred-response tests.
- [x] 1.5 Bind the existing web audio element, Media Session, lifecycle, and voice hooks to core; verify all existing web playback and podcast-question regression assertions pass without weakening their expected behavior.
- [x] 1.6 Extract the shown-episode selection and linked recording poll into `useShownPodcastEpisode`; verify precedence, wrong-Topic rejection, recording-to-published transition, cancellation, and no automatic play, then update core/web AGENTS with the moved responsibilities.

## 2. Add authenticated audio resolution without changing existing clients

- [x] 2.1 Add the explicit JSON audio representation, its contract, and a typed client helper on the existing authorized audio route; verify private/invite/public authorization, no-store responses, and preserved legacy GET redirects and HEAD metadata through API/client tests.
- [x] 2.2 Preserve audio-route counting and introduce error-aware episode/feed results where mobile needs to distinguish denial from retryable failure; verify existing web defaults remain unchanged and tests cover 401/403/404, server failures, and network errors.
- [x] 2.3 Verify resolved media requests carry no CarlNotes session header and use range streaming; add redaction tests for signed audio and private-feed URLs, and document the response, retry behavior, and access boundary in the affected API/client/contracts guides.

## 3. Prove the platform audio adapter on one iPhone

- [x] 3.1 Install SDK-compatible `expo-audio` 58.0.10 and configure background playback, iOS audio mode, Android playback service, and disabled recording permissions; verify resolved app config and a reproducible package installation without downloading another emulator runtime.
- [x] 3.2 Add the versioned Expo chapter-command patch with iOS and Android single-player chapter targets and metadata updates; verify patch application and shared-fixture cases for next/previous, first/last boundaries, paused state, and chapter replacement.
- [x] 3.3 Build for the selected iPhone and prove one file can seek forward/back, use the 15/30-second intervals, change rate, and verify the supported chapter-command handlers; record observed results and place physical system/headset command delivery in the manual QA report, as the user authorized.
- [x] 3.4 Connect one root-owned audio instance to core with readiness, status, buffering/error, completion, interruption, and release handling; verify adapter tests discard stale events and navigation never creates another player.
- [x] 3.5 Document the adapter, patch, microphone exclusions, runtime fingerprint, and new-build requirement in mobile AGENTS and the patch documentation; verify all named paths and configuration settings match the implementation.

## 4. Restore position and retire unauthorized playback

- [x] 4.1 Add account-scoped playback checkpoints and paused restoration without persistent URLs or episode payloads; verify restart, completed-episode replay, clamping, rate restoration, visitor behavior, and malformed-storage tests.
- [x] 4.2 Add source refresh, access revalidation, and bounded retries at the lifecycle points in the design; verify expired-source recovery preserves position/rate and confirmed denial unloads while transient errors offer retry.
- [x] 4.3 Integrate session exit, retirement, and account changes with immediate pause and successful-exit cleanup; verify late loads, progress saves, source refreshes, and next-episode responses cannot cross account ownership.
- [x] 4.4 Document checkpoint interval, best-effort cross-device saves, access checks, and buffered-media revocation limits in mobile/core guides; verify restart and foreground-return behavior on the selected iPhone and record the observed checkpoint loss after forced termination.

## 5. Share player and chapter components

- [x] 5.1 Extract portable player-card, details, play-button, pill, and playback-control composition into core using existing Nightshift adapters; verify web regression assertions and both apps' stories show identical controls, labels, rate order, and visibility.
- [x] 5.2 Share the segmented progress and chapter-list composition with title/pill/Finding action separation, first-three expansion, and current chapter styling; verify touch and accessible seeking ahead/behind, loaded-paused seeks, and expansion without restarting audio.
- [x] 5.3 Share chapter rating selection and rollback, reuse the existing Finding reader, and add the eligible missing-Finding chapter action sheet; verify both rating targets, denied permission, selected state, duplicate-action prevention, and failed-write rollback.
- [x] 5.4 Upgrade the existing episode rows, season cards, and related-episode sections to shared composition and actions; verify season changes, pagination, latest labels, title navigation versus playback, and permission-dependent row actions without a second Topic list.
- [x] 5.5 Extend React Native and web stories with unloaded, playing, paused, buffering, error, recording, failed, expanded, long-title, and missing-Finding states; verify both Nightshift themes and update mobile/core/web component maps with actual reuse and adapter boundaries.

## 6. Dock the player and connect every existing play entry point

- [x] 6.1 Extract shared mini-player presentation and mount one mobile host with measured safe-area clearance; verify cover/title navigation, progress, both skips, and play/pause in stories without adding a speed control, microphone, or tab bar.
- [x] 6.2 Apply dock clearance to Home lists, PageScreen, chat, notes, and sheets, and move Coffee Talk above it; verify content remains reachable with the keyboard, open sheets, large text, player load/unload, and both themes on the selected iPhone.
- [x] 6.3 Replace podcast browser handoffs across Home, Topic, tables, profiles, teams, activity, related Topics, search, Topic roast, Finding pills, and chat chapter tags; verify each starts the same player and preserves its original navigation and permission rules.
- [x] 6.4 Expose the episode listener display to the existing shared count input without adding a polling loop; verify unavailable values do not appear as invented live counts and update mobile AGENTS and Coffee Break docs for the dock, controls, and continued playback.

## 7. Add the episode screen and share its content

- [x] 7.1 Add the episode route and canonical-link mapping ahead of the generic Topic matcher; verify search/title/chat links, stale slugs, retained query context, unrelated-host rejection, and return-to-episode after sign-in through routing tests.
- [x] 7.2 Compose the episode screen from the current episode-page payload, existing layout/actions, and shared podcast components; verify loading, gated, missing, retryable error, owner/member/visitor, and join-date states without leaking prior protected content.
- [x] 7.3 Share `PodcastEpisodeTranscript` and theme-song content/composition; verify read more/read less, bounded scrolling, speaker labels, chapter dividers, empty transcript, credits/lyrics links, and retained sign-off with tests and both-theme stories.
- [x] 7.4 Preserve the web's responsive cover and duplicate-table visibility, related-episode sorting, byline, and selected episode; compare rendered web and iPhone states and update mobile/core/web AGENTS plus Coffee Break docs with the episode route and transcript behavior.

## 8. Finish feed and authorized episode actions

- [x] 8.1 Share feed-dialog request state and composition, including loading, private warning, errors, close/session retirement, and copy feedback; verify stale requests cannot restore a private link and story states match web.
- [x] 8.2 Add the user-approved Reset my link confirmation to both web and mobile; verify cancellation sends nothing, pending confirmation submits once, success replaces the link, failure retains it, and access denial clears it.
- [x] 8.3 Add the narrow iOS/Android podcast-scheme opener and required scheme queries, with Copy feed link always available; verify URL/token preservation, unsupported handlers, launch/copy failure, and no secret-bearing telemetry through adapter tests and iPhone checks.
- [x] 8.4 Share episode-removal confirmation/state and wire every permitted row and page action; verify cancelled/failed/successful removal, page return, list refresh, matching-player unload, resume cleanup, and stale-autoplay rejection.
- [x] 8.5 Retain and verify the existing Topic podcast switch/save flow and episode Topic actions; test owner/non-owner, cancel, partial save failure, published episodes after switch-off, Share topic, Report issue, and Add topic to team permission parity.
- [x] 8.6 Update the affected module guides and Coffee Break docs for confirmed feed reset, subscription fallback, episode removal, paused-show behavior, and the mobile voice boundary; verify documented copy against the shared components and refresh docs search with `bun run docs:embed`.

## 9. Complete integration and handoff evidence

- [x] 9.1 Compare rendered web and iPhone player, episode, transcript, feed, confirmation, and credit states in light/dark themes; fix differences in layout, spacing, icons, formatting, colors, visibility, loading, empty, error, and overflow states, and retain comparison evidence.
- [x] 9.2 Run the complete iPhone playback sequence: chapter 4 then 2, current-title restart, current-pill pause/resume, bar tap/drag ahead and behind while playing and paused, 15/30-second skips, rate cycle, expansion, Finding opening/rating, completion, and next episode; verify each against the design matrix.
- [x] 9.3 Verify background/locked playback, metadata, system/headset chapter and timed-seek commands, interruption/disconnect, source expiry, sign-out, access loss, removal, and restart on the available iPhone hardware; record specific unavailable hardware checks without claiming a simulator proves them.
- [x] 9.4 Verify VoiceOver actions, adjustable progress, increased text size, focus restoration, keyboard/composer layout, and safe areas with the dock and sheets; fix any blocked or overlapping control and record the tested iPhone target.
- [x] 9.5 Run `bun run check`, the unchanged web regression assertions, and touched-module checks; verify all required gates pass, repeat the API call census, and confirm portable packages import no platform globals or app modules.
- [x] 9.6 Deliver the audit report with actual shared components, shared logic, platform replacements and their reasons, test/device evidence, long files or new terminology, and any unverified hardware behavior; explicitly state Android device QA was excluded at the user's request.
