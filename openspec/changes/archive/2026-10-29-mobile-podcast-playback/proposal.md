# Mobile Coffee Break

## Why

Mobile already shows Podcast Episodes, seasons, chapters, and search results, but playback opens the web.
Finish Coffee Break inside the app while retaining the web's player behavior and the existing mobile pages.

## What Changes

- Extract portable player state, chapter selection, seeking, speed, listen tracking, and next-episode rules into `packages/core`.
  Keep browser audio, Media Session, and voice integration in web adapters.
- Share player, chapter, episode-row, transcript, and feed-dialog composition through small platform adapters.
  Upgrade the existing mobile cards and lists; do not build a second Topic screen or season list.
- Add device playback with Expo SDK 58's `expo-audio`, authenticated audio resolution, background playback, and system media controls.
  Include the narrow remote-chapter extension needed to match web next/previous behavior within one audio file.
- Match the segmented seek bar, 15-second back skip, 30-second forward skip, speed cycle, chapter highlighting, and independent Finding actions.
  Retain the first-three-chapters preview and expansion control.
- Add a mobile episode screen with the existing episode payload, transcript, permitted actions, and related episodes.
  Route episode links, search results, and every existing play control to the app player.
- Keep a mini player across screens, with shared layout clearance for content and the Coffee Talk pill.
  Preserve the hidden tab bar, Nightshift themes, theme-song credit, paused-show copy, and sign-off.
- Finish podcast subscription and removal actions inside the app. Reuse the existing Topic podcast switch and save flow.
  Add private-feed reset confirmation to both platforms, as the user confirmed; the current web implementation resets immediately.
- Persist account-owned playback position, clear playback on session exit, and reject stale responses or revoked access.
- Verify against rendered web states and perform device QA on one iPhone target only.

## Capabilities

### New Capabilities

None. Extend the existing podcast capabilities instead of introducing overlapping mobile specifications.

### Modified Capabilities

- `podcast-episode-player`: shared player behavior, mobile transport, chapter controls, progress restoration, and the docked player.
- `podcast-episode-pages`: mobile episode navigation, transcript and action parity, reusable presentation, and verification requirements.
- `podcast-feeds`: mobile podcast-app destinations, private-token handling, and confirmed feed reset on both platforms.

## Impact

Primary areas are `apps/web/src/components/podcast`, its player stores and playback helpers, `apps/mobile`, and `packages/core`.
`packages/client/podcastEpisodeClient.ts` remains the API entry point. A small authenticated audio-resolution response extends the existing audio endpoint.
Its authorization, range-serving object URL, and listen-counting rules remain shared with web.

Add `expo-audio` at an SDK 58 compatible version with the 58.0.10 skip-interval support and a versioned remote-chapter patch.
The audio module and platform configuration require new iOS and Android binaries; an over-the-air update alone is insufficient.
Configure Android's playback service but do not launch, install, or test an Android emulator in this change.

Update affected module guides and the Coffee Break docs. Keep existing web regression assertions and add shared-rule tests and mobile Storybook states.
Prompt 49 retains broader visitor/access work and live-count polling; this change enforces current podcast permissions and exposes listener-display inputs.
Prompt 51 retains verified app-link associations and store release. Prompt 54 retains voice and recording; this change adds no microphone.
