# Tasks

## 1. Core: the portable voice rules and state

- [x] 1.1 Move `voiceRecordingRules.ts` and `isMicShown` from `apps/web` to `packages/core/lib/voiceRecordingRules.ts`,
  and the pure parts of `spokenQuestionsPaused.ts` (`UPGRADE_PROMPTS`, `PREMIUM_PLAN_PROMPTS`,
  `toSpokenQuestionsPausedAction`) to `packages/core/lib/spokenQuestionsPaused.ts`, with their tests.
- [x] 1.2 Define the adapter types in `packages/core/lib/voiceRecorder.ts` (`VoiceRecorderAdapter`, the session, the
  level and end callbacks) and `packages/core/lib/spokenAnswerPlayer.ts` (`SpokenAnswerPlayerAdapter`, the speaker
  metadata), with `toSpokenPartByteLength` in `stores/spokenAudioCache.ts`, and add `voiceRecordingDecisions.ts`'s
  per-platform constant set with a test that the web's defaults give the same thresholds as before.
- [x] 1.3 Move `spokenAnswerQueue.ts`, `spokenAudioCache.ts`, `spokenAnswerStore.ts`, and `streamedSpokenAnswer.ts` to
  `packages/core/stores/` over the player adapter, with `spokenAnswerStore.test.ts` and `streamedSpokenAnswer.test.ts`
  moved beside them and passing against a fake adapter. Replace `MediaMetadataInit` with core's
  `PodcastEpisodeMediaMetadata`. Keep the web stores as adapters that register the `<audio>` element and the media
  session, and verify the web's `SpokenAnswerButton.test.tsx` still passes.
- [x] 1.4 Move `useListenMode.ts`, `useVoiceRecording.ts`, and `useChatRoomSpokenAnswer.ts` to `packages/core/hooks/`
  over the recorder adapter and the registered voice notices, and add tests for the listen-mode transitions (reopen
  after an auto-played end, end on stop, typed send, background, the two-minute wait) and the recording states with a
  fake recorder. Keep the web hooks as wrappers that pass the browser recorder and sonner, and verify
  `MicButton.test.tsx` and `sharedChatRoomHooks.test.tsx` pass.
- [x] 1.5 Move `podcastEpisodeQuestionStore.ts` to `packages/core/stores/` with `podcastEpisodeQuestionStore.test.ts`
  and its fixtures, taking the budget notice and the plans navigation as effects, and verify the web's
  `PodcastEpisodeQuestionControls.test.tsx` passes against the web wrapper.
- [x] 1.6 Update `packages/core/AGENTS.md` and `apps/web/AGENTS.md` for the moved modules and the adapters, run
  `bunx tsc -b`, `bun test packages/core apps/web`, and `bun scripts/check-package-boundaries.ts`, and confirm the web
  imports each moved module from core.

## 2. Client and contracts

- [x] 2.1 Widen `sendTranscription` to a `VoiceRecordingBody` (`Blob`, or `{ uri, name, type }` on native) and add
  `readSpokenPartAudio` to `fetchSpokenAnswerAudio` through a `configureVoiceClient({ readSpokenPartAudio })` with the
  web's `Blob` as the default, and test both bodies and both readers with a stubbed fetch, including the one retry and
  the 402 cutoff.
- [x] 2.2 Add the four voice routes to `packages/contracts/chatRouteContracts.ts` (spoken questions GET, transcription
  multipart POST, speech json POST with a binary response, spoken events POST), add
  `voiceClient.sendSpokenQuestionEvent` to `API_ROUTE_HELPERS`, add their fixtures to `apps/api/contractFixtures.ts`,
  and verify
  `apps/api/apiRouteContracts.test.ts` and `bun scripts/check-contract-freeze.ts` pass.
- [x] 2.3 Update `packages/client/AGENTS.md` and `packages/contracts/AGENTS.md` for the body type, the reader, and the
  route entries.

## 3. Mobile: recorder, player, permission, and the audio root

- [x] 3.1 Set `microphonePermission` to Carl's purpose line and `recordAudioAndroid: true` in `app.config.ts`, keep
  `enableBackgroundRecording: false`, and verify `bunx expo config --type introspect` shows
  `NSMicrophoneUsageDescription` and `RECORD_AUDIO`. Note in `apps/mobile/AGENTS.md` that this needs a new
  development and store build.
- [x] 3.2 Write `apps/mobile/src/voicePermission.ts` over `getRecordingPermissionsAsync` and
  `requestRecordingPermissionsAsync`, returning granted, denied, or denied-for-good, with a pure-logic test of the
  outcome mapping, and the notice that adds "Open settings" (`Linking.openSettings`) only for denied-for-good.
- [x] 3.3 Write `apps/mobile/src/voiceRecorder.ts`: the `expo-audio` `AudioRecorder` adapter with the mono AAC options,
  `forDuration: 60`, the 100 ms `getStatus()` poll, dBFS to linear conversion, the ambient sample skipping Android's
  first frame, the `isRecording` interruption read as a cancel, the file part for the post, the file delete on every
  end, and a development-build-only level trace. Test the pure parts (options, conversion, interruption
  classification, file naming) with `bun test`.
- [x] 3.4 Write `apps/mobile/src/spokenAnswerAudio.ts`: the second `expo-audio` player adapter that writes a part's
  bytes to `new File(Paths.cache, ...)` with the extension from the content type, plays `{ uri }`, deletes the file on
  finish, stop, and error, reads a system stop from `playing: false`, and takes and gives back the lock screen for a
  podcast answer. Test the file naming, the extension choice, and the cleanup rules as pure logic.
- [x] 3.5 Write `apps/mobile/src/voiceAudioMode.ts`: the `setAudioModeAsync` switch around a recording, and
  `apps/mobile/src/components/chat/SpokenAnswerAudio.tsx`, the root component restarted for each user id that owns the
  second player, the notices, the launch sweep of `spoken-part-*` files, and the cleanup through `exitSession` and the
  account switch. The recorder and the `AppState` listener (cancel a recording and end listen mode on leaving for the
  background) are in `components/chat/useVoiceRecording.ts`. Mount the component in `_layout.tsx` beside
  `PodcastEpisodeAudio` and configure the voice client's `readSpokenPartAudio` there.
- [x] 3.6 Extend `useSignOut` and `exitSession` so sign-out stops a recording and an answer, empties the memory cache,
  and deletes the transient files, and add a monitoring redaction test case for a transcript and a cache file path.

## 4. Mobile: chat controls

- [x] 4.1 Write `components/chat/MicButton.tsx` (idle, ringed, 44 point, "Talk to Carl", `Keyboard.dismiss()` on tap)
  and `RecordingBar.tsx` (Cancel, the web's filled meter bar, timer via `toClockLabel`, Send) over the core hook, with
  stories for idle, ringed, each meter level, and the 375 point width at enlarged text, each naming its web reference.
- [x] 4.2 Give `ChatComposer` a send slot and a recording bar slot, wire `PrivateChatPanel` to core's
  `useVoiceRecording` and `useTopicChat`'s spoken answers, with the box read-only while
  a transcript is on its way and a typed send ending listen mode, and verify on the emulator that the mic shows only
  with voice configured and the budget notice replaces it when spent.
- [ ] 4.3 Wire `ChatRoomPanel` and `ChatRoomComposer` to core's `useChatRoomSpokenAnswer` through core's
  `useChatRoom`, which calls it itself, posting the transcript with `isSpoken` and its timings, and verify with two
  accounts on the emulator that only the asker's phone speaks the reply, once, and a reconnect replays nothing.
- [x] 4.4 Write `components/chat/SpokenAnswerButton.tsx` ("Play message"/"Stop", the `answer_played` event) and render
  it in the mobile `ChatTurnBlock` `Answer` footer and the `ChatRoomMessageBubble` `Footer` beside the copy button when
  `voiceChatPage` is set, speaking in `chatTurn.speaker`'s voice, with stories for idle, loading, and playing in both
  palettes.
- [x] 4.5 Register the voice notices in `SpokenAnswerAudio` through `showChatNotice`, with the cutoff lines ("Speak with
  Carl again on the 1st.") and the bare budget line, and add the "transient toast" row to the native replacements table
  in `apps/mobile/AGENTS.md`.

## 5. Mobile: podcast question

- [x] 5.1 Write `components/podcast/PodcastEpisodeQuestionControls.tsx`: `PodcastEpisodeQuestionButton` (beside play
  in the dock at `size="default"`, after `PlaybackSpeedButton` in the card's `Control` shape, "Talk with Carl and
  Vienna", Send while recording, a visitor to sign-up with the `podcast-question` prompt, the bare budget line) and
  `PodcastEpisodeQuestionStopButton` (Cancel, then Stop), over core's question store, with stories for each phase.
- [x] 5.2 Pass the phase label into the mobile `PodcastPlayer`, swap `Controls` to the stop control while a label
  exists, announce the label through `AccessibilityInfo.announceForAccessibility`, and render the card's mic in
  `PodcastEpisodePlayerCard.tsx`. Wire the podcast adapter's `onPlaybackStarted` and `onSeek` to the question endings
  as the web store does.
- [ ] 5.3 Implement the lock-screen hand-off in `spokenAnswerAudio.ts` and the podcast adapter's `updateMetadata`
  restore, and verify on the emulator that the chapter line reads Listening, Thinking, then the host, the podcast
  episode resumes after 600 ms, Cancel resumes at once, and a seek leaves it paused.

## 6. Parity, store docs, and user docs

- [x] 6.1 Retire the five `voiceClient` rows from `apps/mobile/parity.md` and add the voice controls to its page and
  action inventory, then verify `bun scripts/check-client-parity.ts` passes.
- [x] 6.2 Update `apps/mobile/store/data-inventory.md` with a Microphone row (the recording, the api and Google's
  transcription with storage off, never kept, cache only) and the Apple and Play answers written from it, and add the
  spoken questions item to `apps/mobile/store/release-checklist.md` with the one-phone-at-a-time note.
- [x] 6.3 Update the user docs: `feed/chat.md` and `feed/coffee-break.md` drop "On the web" and the mobile listening
  note, `teams/group-chat.md`'s phone section says a spoken message reaches Carl, and `get-the-app.md` drops voice
  from what stays on the site. Run `bun run docs:embed`.
- [x] 6.4 Write the voice section of `apps/mobile/AGENTS.md`: the modules, the adapters, the audio mode switch, the
  interruption reading, the file lifecycle, the unverified threshold values, and the reuse record (shared
  composition, shared logic, native replacements) with the web references.

## 7. Device checks, one phone at a time

- [ ] 7.1 On the Android emulator with the host microphone, with no simulator running: the first-tap permission
  prompt, a denial and "Open settings", a spoken question in the private chat and a Team room, listen mode's reopen
  and quiet end, the play button on Carl's and Vienna's replies, the podcast mic in the dock and the card with the
  podcast episode's resume, backgrounding mid-recording, sign-out cleanup (the cache holds no `spoken-part-*` or
  recording file), and every story in both palettes at the largest text. Shut the emulator down afterwards.
- [ ] 7.2 On the iOS simulator, after the emulator is down: repeat 7.1 and the lock-screen hand-off. Shut it down
  afterwards.
- [ ] 7.3 Manual instructions for the user, on a real iPhone and a real Android phone: run the level trace in a quiet
  room and a noisy one through the built-in microphone and a Bluetooth headset, a phone call mid-recording and
  mid-answer, headset removal mid-answer, and the lock screen while Vienna answers. Record the measured levels, the
  chosen constants, and whether metering was enough in `apps/mobile/AGENTS.md`, replace the guess comment on
  `NATIVE_SILENCE_THRESHOLD_SETTINGS` in `apps/mobile/src/voiceRecorder.ts`, and mark anything not run as unverified.

## 8. Gate

- [ ] 8.1 Run `bun run check` green, confirm the web's voice tests and stories are unchanged in behavior, and build a
  new development client with `eas build --profile development` for each platform, one at a time.

## Workflow follow-up

- Ship through `/ship`, archive with `openspec archive add-mobile-voice --yes`, and email the manual device steps.
