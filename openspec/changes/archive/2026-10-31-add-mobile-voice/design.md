# Design

## Context

See proposal.md for the motivation. What shapes the approach:

- The web voice stack is three layers. Recording (`apps/web/src/lib/voiceRecorder.ts`, `voiceActivity.ts`) is all DOM:
  `getUserMedia`, `AnalyserNode`, `MediaRecorder`, `requestAnimationFrame`, `document.visibilitychange`. The rules it
  feeds are already in `packages/core/lib/voiceRecordingDecisions.ts`. The hooks and stores
  (`useVoiceRecording.ts`, `useListenMode.ts`, `useChatRoomSpokenAnswer.ts`, `spokenAnswerQueue.ts`,
  `spokenAnswerStore.ts`, `spokenAudioCache.ts`, `streamedSpokenAnswer.ts`, `podcastEpisodeQuestionStore.ts`) are
  portable state over four platform primitives: an `AudioContext` listen mode holds open so iOS Safari reopens the
  mic without a tap, one `HTMLAudioElement` with blob urls and a silent WAV unlock, `navigator.mediaSession`, and
  sonner toasts. `voiceRecordingRules.ts`, `spokenQuestionsPaused.ts`'s pure parts, and `isMicShown` are pure.
- Core already runs the shared chat hooks with voice as optional effects: `useTopicChat`'s `createSpokenAnswer` and
  `stopSpokenAnswer`, and `useChatRoom`'s `awaitSpokenAnswer` and `speakPendingSpokenAnswer`. Mobile passes none of
  them today and renders `voiceChatPage={null}` into the shared `ChatTurnBlock` and `ChatRoomMessageBubble`, whose
  `Answer` and `Footer` elements already receive the page. `podcastEpisodeQuestionRules.ts`,
  `toPodcastEpisodeSpeakerMediaMetadata`, and core's `PodcastPlayer` with its `phaseLabel` and `Announcement` are
  shared already.
- `packages/client/voiceClient.ts` goes through `fetchApi`, so the base url, the session cookie, and the device headers
  are already right on the phone. Its two platform leaks are the `Blob` it appends to `FormData` and the
  `response.blob()` it returns: React Native's `FormData` takes `{ uri, name, type }` parts, and neither AVFoundation
  nor ExoPlayer plays a React Native `blob:` url.
- `expo-audio` 58.0.10 is installed with the repo's chapter patch. Its `AudioRecorder` writes AAC in MPEG-4 (`.m4a`)
  on both platforms and reports `metering` in dBFS on each `getStatus()` poll. It has no JS interruption event: a
  phone call, another app's audio, or a removed headset pauses players and stops the recorder natively, and the app
  sees it through `playbackStatusUpdate` and `RecorderState.isRecording`. `setAudioModeAsync({ allowsRecording })`
  switches iOS to `playAndRecord` with speaker output and Bluetooth HFP, and back. Several `AudioPlayer`s may exist,
  one of them lock-screen active. `expo-file-system` 58 (`File`, `Paths.cache`) is installed and already used to
  write a fetched attachment to the cache and delete it. No voice activity detector package is installed.
- The app config sets `microphonePermission: false` and `recordAudioAndroid: false`; the store data inventory says
  the app uses no microphone. Flipping them changes the runtime fingerprint, so a new development build and store
  build follow this change.
- The transcription route accepts `mp4`/`m4a` with `aac`, a 4 MiB body, and names the file part `recording`. No api
  change is needed.

## Goals / Non-Goals

**Goals:**

- One implementation of every voice rule and state, in core, driven by the web and the app through small adapters, so
  the web's tests move with the code and keep passing unchanged.
- The web's controls, words, placement, and transitions on the phone, with the platform's interruption rules replacing
  the browser's visibility rules.
- No microphone, spoken audio, or audio file left running or lying around: every path releases the recorder, deletes
  its file, and removes a spoken part's file when its sound ends.
- A measured silence threshold, not a guessed one, with the measurements written down.

**Non-Goals:**

- An on-device voice activity detector. It is added in a later change only if the hardware check shows metering fails.
- A route picker, an input selector, or any audio control the web does not have.
- Changes to the voice routes, the speech models, or the spoken events.
- The podcast player's other controls, attachments, and the new-topic chat.

## Decisions

### 1. The hooks and stores move to core behind three adapters

`useVoiceRecording`, `useListenMode`, `useChatRoomSpokenAnswer`, `spokenAnswerQueue`, `spokenAnswerStore`,
`spokenAudioCache`, `streamedSpokenAnswer`, `podcastEpisodeQuestionStore`, `voiceRecordingRules`, and the pure parts of
`spokenQuestionsPaused` move to `packages/core` with their tests. The web keeps the files that hold browser code as
adapters, and imports the rest from core. Three adapters hold the platform:

- `VoiceRecorderAdapter` (`packages/core/lib/voiceRecorder.ts` types): `start({ onLevel, onEnded, onFailed, session })`
  returns a handle with `send()` and `cancel()`, and `createSession()` returns the opaque session listen mode holds
  and closes. The web's session is its `AudioContext`; the app's is `null`.
- `SpokenAnswerPlayerAdapter`: `unlock()`, `play(audio, { onPlaying, onEnded, onFailed })`, `stop()`, and
  `showSpeaker(metadata)` and `clearSpeaker()` for the lock screen. The web's is the one `<audio>` element and
  `navigator.mediaSession`; the app's is a second `expo-audio` player over transient files.
- A `notice(message, action?)` effect in place of the toasts, which the web gives as sonner and the app as the chat
  panel's existing `onNotice` alert.

Why: the user asked for the portable rules in core and the platform parts out of it, and this is the same adapter
shape core already uses for podcast playback (`PodcastEpisodeAudioAdapter`). Alternative considered: a second,
native-only voice hook. Rejected as a second implementation of the listen-mode and spoken-answer state machines.

### 2. The spoken audio cache holds bytes, and the client reads the body through the platform

`fetchSpokenAnswerAudio` takes a `readSpokenPartAudio(response)` reader configured once with the adapter: the web's
returns a `Blob`, the app's returns a `Uint8Array` from `response.arrayBuffer()`. The cache stores whatever the reader
returned and measures it through the adapter's `toByteLength`, keeping the 40 megabyte limit and the eviction order. The
app plays a part by writing the bytes to `new File(Paths.cache, "spoken-part-<n>.<mp3|wav>")`, loading `{ uri }`, and
deleting the file on `didJustFinish`, on stop, and on a status error. A launch sweep deletes any `spoken-part-*` file.

Why files and not data urls: `file://` plays on both platforms through the same path `downloadFirst` uses, Android's
`data:` support is unconfirmed, and a base64 string of a multi-hundred-kilobyte part crosses the bridge on every play.
Why bytes in memory and a file only to play: the web keeps spoken audio in memory for the session so a replay spends
nothing, and the user asked that private audio be cleaned up on completion. A transient file satisfies both. The
`audio/wav` fallback the speech route may return gets the `.wav` extension from the response's content type.

### 3. The recorder is `expo-audio`'s `AudioRecorder`, metered, in mono AAC

`apps/mobile/src/voiceRecorder.ts` prepares the recorder with `RecordingPresets.HIGH_QUALITY` overridden to one
channel, 16 kHz, 64 kbps, `isMeteringEnabled: true`, and `extension: ".m4a"`, keeping Android's `mpeg4`/`aac` and
iOS's `MPEG4AAC`. It records with `forDuration: 60` as the native backstop beside the shared 60-second rule, polls
`getStatus()` every 100 ms, converts `metering` from dBFS to the web's linear scale (`10 ** (dB / 20)`), and feeds
each frame to `toRecordingLevelReader`, `toSpeechFrame`, and `toRecordingDecision`. The recording posts as
`{ uri, name: "recording.mp4", type: "audio/mp4" }`, and `sendTranscription` takes a `VoiceRecordingBody` that is a
`Blob` on the web or that part on native. The file is deleted after the post, a cancel, or a failure. The
`LOW_QUALITY` preset is never used: on Android it is AMR in 3GP, which the api rejects.

Why not `useAudioStream`: it gives raw PCM, which would let the app run its own energy detector, but its file output is
WAV, which the api does not accept, so it would need a second recorder on the same microphone, which is unconfirmed.
Metering is the cheaper signal and the one the shared rules already consume. Why 16 kHz mono: the api transcodes to
16 kHz mono WAV, and 60 seconds at 64 kbps is well under the 4 MiB body limit. If a device rejects 16 kHz, the check
falls back to 44.1 kHz.

### 4. The silence constants are calibrated on hardware, and iOS and Android may differ

iOS reports `averagePower` (an RMS-like average) and Android reports `maxAmplitude` (a peak since the last read), so
the same room reads differently on each. `voiceRecordingDecisions.ts` keeps one `toSilenceThreshold` and gains a
per-platform set of constants the adapter passes in, defaulting to the web's. The hardware check records ambient and
speech levels in a quiet room and a noisy one, through the built-in microphone and a Bluetooth headset, on one iPhone
and one Android phone, from a development-build-only level trace the recorder logs, and the chosen values replace the
guess. The result, with the measurements and whether metering was enough, is written into `apps/mobile/AGENTS.md`.
Until then the guide names the values as unverified. A voice activity detector is a follow-up decision for the user,
since it is a native dependency and a build.

### 5. The audio mode switches around a recording, and the system's interruptions are read from status

Before `record()`, the app calls `setAudioModeAsync` with `allowsRecording: true` and the podcast mode's other values
(`playsInSilentMode`, `shouldPlayInBackground`, `doNotMix`), and after the recorder stops it switches back to
`allowsRecording: false`, so the answer and the podcast episode play on the `.playback` category with Bluetooth A2DP.
The switch happens after the podcast episode is paused through the player store, which is the web's order too. A
recorder that reports `isRecording: false` before the app stopped it is an interruption: the recording cancels with no
notice, the same as the web's hidden page. A spoken-answer player whose status reports `playing: false` without the
app's stop is a system stop: the answer ends with the web's `isMediaSessionPause` meaning, so listen mode ends and a
podcast question leaves the podcast episode paused. `AppState` leaving `active` cancels a recording and ends listen
mode. A playing answer continues through the app's background audio mode, and the podcast question's resume runs after
it.

Why not an event: `expo-audio` emits none for interruptions. Why the podcast episode stays paused: that is the web rule
for a lock-screen or headset pause while a host talks, and resuming over a phone call would be wrong.

### 6. The spoken-answer player takes the lock screen while a host answers a podcast question

The web swaps the media session's metadata to the host's name and routes the lock screen's pause to stopping the
answer. On the phone only one `expo-audio` player may be lock-screen active, so the spoken-answer player calls
`setActiveForLockScreen(true, { title: host, artist: PODCAST_NAME, album: episode title, artworkUrl })` with no skips
when a podcast answer starts playing, and the podcast adapter's `updateMetadata` restores the podcast episode's controls
when the answer ends, through core's existing media-session refresh. A chat answer sets no lock-screen metadata. This
hand-off is a device check item.

### 7. Notices are the panel's alert, and the cutoff names the 1st for every plan

The app has no toast, and the chat panels already route core's notices through `Alert.alert("Coffee Talk", ...)`. The
voice notices use the same effect, and the mobile guide's native replacements table gains a "transient toast" row
naming it. A denial whose `canAskAgain` is false adds an "Open settings" button that calls `Linking.openSettings()`,
the push section's pattern. Past the spoken questions cutoff the web sends a non-premium user to the plans page with an
upgrade line; the app sells nothing, so it shows the premium line, "Speak with Carl again on the 1st." or "Speak with
Carl and Vienna again on the 1st.", which is true on every plan. A spent budget shows `SPENT_BUDGET_LINE` bare. These
are the only copy differences from the web, and both follow the app's existing no-plans-link rule.

### 8. The composers, bubbles, and player compose the shared components with thin native elements

`MicButton`, `RecordingBar`, `SpokenAnswerButton`, and `PodcastEpisodeQuestionControls` get mobile files of the same
names under `components/chat/` and `components/podcast/`, each a thin renderer over the core hook or store: Lucide
`Mic`, `X`, `ArrowUp`, `Square`, and `Play` icons, the primitives' `Button` at the 44 point size, the ring as a
border, and the meter as twenty `View` steps. `ChatComposer` takes a `sendSlot` and a `recordingBar` so both composers
share one layout, `ChatTurnBlock`'s and `ChatRoomMessageBubble`'s `Answer` and `Footer` elements render the play
button when `voiceChatPage` is set, `PodcastPlayer`'s `Controls` swaps the skips for the stop control while a phase
label exists, its `Announcement` calls `AccessibilityInfo.announceForAccessibility`, and the card renders the mic
after `PlaybackSpeedButton`. A root `SpokenAnswerAudio` component beside `PodcastEpisodeAudio`, restarted for each user
id, owns the second player, the notices, the launch sweep, and the cleanup on sign-out and account switch, through
`exitSession`. The recorder and the `AppState` listener are in `components/chat/useVoiceRecording.ts`.

### 9. The voice routes join the contract registry

`packages/contracts/chatRouteContracts.ts` gains the four voice routes: the spoken questions `GET`, the transcription
`POST` with a multipart body of the page and the recording, the speech `POST` with a json body and a binary response,
and the spoken events `POST`. `voiceClient.sendSpokenQuestionEvent` is a helper over `sendSpokenEvent` and joins
`API_ROUTE_HELPERS`. `contracts/releases.json` is empty, so no frozen snapshot has to read them, and the five
`voiceClient` rows leave `apps/mobile/parity.md`, which the client parity check requires once the app reaches them.

### 10. Device QA runs one phone at a time

The emulator and the simulator never run together: Android first, shut down, then the iPhone, freeing memory between
them. Emulators pass the host microphone through, so the controls, the transitions, the permission prompt, the cleanup,
and the stories are checked there, and the silence calibration, Bluetooth, a phone call, and the lock screen are the
user's real-device steps, named as manual instructions.

## Risks / Trade-offs

- [iOS may glitch a playing player when the session switches to `playAndRecord`] → the podcast episode is paused through
  the store before the switch, as on the web, and the device check watches for a stall on resume.
- [Android's recorder requests no audio focus, so another app's audio can keep playing while recording] → the podcast
  episode is paused by the app; another app's sound mid-recording is an acceptable noisy room, and the check records it.
- [Metering alone may cut a slow speaker off or never end in a noisy room] → the calibration check names the case, and
  a voice activity detector is the recorded follow-up instead of an untested dependency.
- [`maxAmplitude` on Android is a peak since the last read, so the first poll reads zero] → the ambient sample skips
  the first frame, and the check confirms the threshold against the trace.
- [Two lock-screen-active players] → the hand-off is explicit and ordered, and verified on a locked device.
- [A crash between writing and deleting a spoken part's file] → the launch sweep and the sign-out cleanup.
- [The native build] → `microphonePermission` and `recordAudioAndroid` change the fingerprint. An EAS Update cannot
  ship this change, and the release checklist says so.
- [Transcription content in error reports] → the voice client logs the route and the status only, and the monitoring
  redaction test gains a transcript and a file path case.

## As built

The build kept the decisions above and changed these details. Each one is in the code and the mobile guide's Voice
section.

- The adapters' methods are the ones built: the player's `unlock`, `play`, `showSpeaker`, and `stop`, the notices as a
  registered store with `showNotice` and `showSpentBudgetNotice`, and the recorder's `openSession`, `start({ session,
  onLevel, onFinished, onCancelled })`, `deleteRecording`, `toMicrophoneRejectedAction`, and `subscribeToBackground`,
  which `toVoiceRecorderAdapter` makes. The app's session is `NATIVE_VOICE_RECORDING_SESSION`, which does nothing. The
  lock screen is given back by the player's `stop` and core's media session refresh, not by a `clearSpeaker`.
- The recorder takes no preset. `toPlatformRecordingOptions` builds each platform's options: iOS's `aac ` format code
  with a quality, and Android's `mpeg4` container with the `aac` encoder.
- The meter is the web's bar, filled to the level, which core already quantizes to twentieths, not twenty `View` steps.
- Every chat answer takes the lock screen with the host's name, the same as a podcast question's answer.
- The background that ends a recording is the `background` app state. iOS's `inactive` is skipped, since the microphone
  prompt itself makes the app inactive.
- `toSpokenPartByteLength` is a function in core's `spokenAudioCache`, and the recording is 32 kbps.
- A podcast question on the phone ends on the level's silence, the same rule as a chat question, since the app has no
  voice activity detector. The phone's silence threshold settings live in the mobile recorder.
- The core hooks' tests run on the web's hook harness, since bun has no React Native renderer.
- expo-file-system's `File.write` is async in SDK 58, so the player guards each play with a version and deletes a file
  whose part was stopped during its write.
- The answer files are deleted by `SpokenAnswerAudio`'s cleanup when the account changes, and the session exit ends the
  recordings and stops the answer at once through `voiceSession.ts`. An accepted sign-out then drops the spoken audio
  from memory.
- The image picker's plugin needs the microphone purpose too, since its `false` removes the iOS key and blocks
  `RECORD_AUDIO` on Android.
- The mobile redaction also strips cache file paths and urls from exception messages, and the shared redaction drops a
  `transcript` field.
- The phone's paused mic says when speaking comes back on every plan, and the mobile chat has no visitor mic. The
  podcast mic sends a visitor to sign-up, as the web does.
- Core's `useChatRoom` calls `useChatRoomSpokenAnswer` itself, and core's `useTopicChat` calls the spoken answer
  stores, the podcast question's chat turns, and the new-topic chat itself, so neither app wires them. The podcast
  mic's label, its visibility rule, its button hook, the mic slot's face, the play button's hook, the recorder's level
  reader, and the audio adapter hooks that end a question moved to core for both apps.
- The room's exactly-once rule is tested in core through `toChatRoomSpokenAnswer`, which the hook wraps over its ref:
  two devices in one room, a teammate's reply, a reply to another message, a reconnect's replay, and a rejected reply.
  The test counts the player's plays, since the audio cache serves a replay without a second fetch.
- The iPhone simulator found a push registration loop on iOS, outside voice: each token read sends a token event, and
  the token listener registered again, which read the token again. `toPushTokenRegistration` in the push rules
  registers again only for a changed token reported outside a registration.
- The Android emulator found the room composer behind the keyboard. Edge-to-edge Android never resizes its window, and
  the root's KeyboardAvoidingView, which owns avoidance while a podcast episode is loaded, set no Android behavior. The
  root, the chat panel, and the note screen now pad on both platforms.
- The Android emulator found the composer's placeholder cut off at the largest text. The box grew from the draft's
  content size, which an empty draft reports as one line. The input now grows natively, since React Native measures an
  empty input by its placeholder, and stretches to the box when the keyboard leaves the box less room.
- The ship audit changed four details. The phone limits the spoken audio cache to 8 megabytes through
  `configureSpokenAudioCache`, since the app holds the bytes in its own memory beside a podcast episode, and a replay
  moves a part to the end so the least recently played part is dropped first on both apps. A chat screen that loses
  focus leaves its recording and listen mode through `useLeaveVoiceRecordingOnBlur`, so the mic never reopens under a
  profile or a link. A sign-out ends a podcast question through `endPodcastEpisodeQuestionOnSignOut` before the
  recordings and the answer stop, so the podcast episode stays paused. Each play button reads its own reply's state, and
  the private chat's composer owns its recording, so a level frame re-renders neither the conversation nor every bubble.

## Device QA

Run on 2026-10-30, one phone at a time, with the emulator shut down before the simulator started.

Android emulator, on the development client installed before this change, since the new build's signature needs an
uninstall that loses the session:

- Verified: a denied microphone in all three mic places with Carl's line, the Send and mic swap, the speak control and
  its states, the spoken part files deleted on a stop and at the end, the podcast episode's resume after a denied mic,
  the card's mic, and every story in both palettes at the largest text.
- Verified after the two composer fixes, in a Team room with a podcast episode loaded: at the default and the largest
  text, the composer sits above the dock and the dock above the keyboard, the two-line placeholder shows in full, and a
  long draft grows to the box's limit and scrolls. The chat panel and the note screen without a loaded podcast episode
  stay unverified, since the dock has no control that unloads a podcast episode.

iPhone SE simulator on iOS 27, on a local Debug build of the current native config, signed in:

- Verified: the dock's mic opens the Listening phase with Cancel, and the conversation and spoken questions reads reach
  the configured api. The first tap shows the system prompt with the app's microphone purpose. After Allow, the recorder
  opens as 16 kHz mono AAC. Cancel during the wait restores the dock at once. With the microphone revoked, a tap shows
  Carl's line with Open settings, and the dock returns to idle.
- Blocked: the recorder's prepare waits on the Mac's audio input, which needs the Mac's own microphone grant for the
  Simulator. Everything after the recording starts stays unverified on iOS.

Unverified on both platforms, each needing a live recording, a second signed-in account, or a real phone: the level
trace, the no-speech end, a transcript and its answer, listen mode's reopen and quiet end, the room's reply on two
phones, the Listening, Thinking, and host phases with the 600 ms resume and a seek, backgrounding mid-recording,
sign-out cleanup on a device, the lock screen hand-off, and the hardware check in the mobile guide.

## Open Questions

- Whether the hardware check needs different constants for the built-in microphone and a Bluetooth headset. The check
  records both, and the adapter can pass a set per input if they differ, without changing the specs or the tasks.
