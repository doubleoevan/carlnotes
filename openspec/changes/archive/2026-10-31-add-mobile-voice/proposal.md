# Proposal

## Why

The web lets a user talk to Carl in the private chat and ask Carl and Vienna a question from the podcast player, and
the mobile app shows the same conversations and plays the same podcast episodes with no microphone and no spoken
answer. Text chat and podcast episode playback shipped in the app, so the recorder, the spoken answer, and the podcast
question are the remaining web-only pieces of talking to Carl, and `apps/mobile/parity.md` holds five `voiceClient`
rows deferred to this change.

## What Changes

- The portable voice rules and state that still live in `apps/web` move to `packages/core`: the recording states and
  the reopened-recording and spoken-questions rejections, listen mode, the spoken answer queue, the streamed spoken
  answer splitter, the spoken audio cache, the room's once-only spoken reply, the podcast question lifecycle, and the
  cutoff and budget copy. The web keeps its `MediaRecorder`, `AudioContext`, voice activity detector, one `<audio>`
  element, and `navigator.mediaSession` behind new recorder and spoken answer player adapters. The moved modules'
  tests move to core, and the web imports them from `@carlnotes/core`.
- The voice client sends a native recording as a file part and returns a spoken part's audio in a form a native player
  can load, over the api base url, session cookie, and device headers the app already configures. The web keeps its
  `Blob` path.
- The mobile private chat and Team room composers show the web's mic in the empty send slot, the recording bar with
  cancel, level meter, timer, and send, and listen mode with the ringed mic. Every Carl reply, and every reply Vienna
  gave, gets the play button that speaks it in that host's voice. A spoken room message addresses Carl, and only the
  asker's phone speaks his reply, once.
- The app records with the installed Expo SDK recorder, in AAC inside MPEG-4, which the transcription route already
  reads. The recorder's level frames feed the shared silence rules, with the threshold constants calibrated on real
  iPhone and Android hardware in a quiet room and a noisy one, and the result recorded. An on-device voice activity
  detector is added only if that check shows metering cannot end a recording reliably.
- The microphone permission is asked on the first mic tap, never at launch. A denial shows Carl's line and, if the
  phone will not ask again, a way to the app's system settings. The app config declares the microphone purpose, which
  changes the runtime fingerprint and needs a new development and store build.
- The docked player and the player card gain the web's "Talk with Carl and Vienna" mic, the Listening, Thinking, and
  answering chapter line, the Cancel and Stop control in the skips' place, the podcast episode's pause and resume
  around the answer, and the answering host on the lock screen. A visitor's tap routes to sign-up with the podcast
  question's prompt.
- The app pauses the podcast episode for a question, records through the system's current input, built-in or
  Bluetooth, plays the answer through the system's current output, and resumes the podcast episode where the web's
  rules say. A phone call, a route change, a removed headset, backgrounding, and another app's audio end a recording or
  stop an answer by the platform's interruption rules. No microphone and no spoken audio run unexpectedly, and a
  transient audio file never outlives the sound it held.
- The spoken questions cutoff and a spent budget show the web's words without the plans link, as the rest of the app
  does.
- Storybook stories cover the mic states, the recording bar, the play button, and the player's question controls. The
  mobile guide, the client, core, and contracts guides, `parity.md`, the store data inventory and release checklist,
  and the user docs describe voice on the phone.

## Capabilities

### New Capabilities

- `mobile-voice`: spoken questions and spoken answers in the mobile app: the mic and recording bar in both composers,
  the native recorder and its silence rule, the microphone permission, transcription and speech over the configured
  api, Carl's and Vienna's spoken answers, listen mode, the room's once-only reply, the podcast question controls and
  chapter line, audio coordination with the podcast episode and the system, the cutoff and budget words, and audio
  cleanup.

### Modified Capabilities

- `mobile-chat`: the deferred media requirement no longer keeps voice input, spoken answers, and the podcast question
  controls out of native chat.
- `mobile-store-delivery`: the data inventory names the microphone and what a recording reaches, and the acceptance
  list covers the microphone permission, a spoken question in each place, the podcast question's resume, and the
  interruption cases on a device.

## Impact

- `packages/core/`: new `lib/voiceRecordingRules.ts`, `lib/spokenQuestionsPaused.ts`, `lib/voiceRecorder.ts`,
  `lib/spokenAnswerPlayer.ts`, `hooks/useListenMode.ts`, `hooks/useVoiceRecording.ts`,
  `hooks/useChatRoomSpokenAnswer.ts`, `hooks/useSpokenAnswerButton.ts`, `hooks/usePodcastEpisodeQuestionButton.ts`,
  `stores/spokenAnswerQueue.ts`, `stores/spokenAnswerStore.ts`, `stores/spokenAudioCache.ts`,
  `stores/streamedSpokenAnswer.ts`, `stores/podcastEpisodeQuestionStore.ts`, and `stores/voiceNoticeStore.ts`. The
  modules moved from `apps/web` bring their tests, over a recorder adapter, a spoken answer player adapter, and the
  registered voice notices.
- `packages/client/voiceClient.ts`: a recording body that is a `Blob` on the web or a file part on native, and a spoken
  part's audio returned as bytes beside the web's `Blob`.
- `packages/contracts/`: the four voice routes join the chat route contracts, so the contract freeze serializes them
  once the app reaches them.
- `apps/web/`: the moved modules leave the web, which imports them from core. The web keeps the files that hold
  browser code as adapters: `useVoiceRecording.ts`, `lib/voiceRecorder.ts`, `stores/spokenAnswerStore.ts`, and
  `SpokenAnswerAudio.tsx`.
- `apps/mobile/`: `voiceRecorder.ts` over `expo-audio`'s recorder, `spokenAnswerAudio.ts` over a second `expo-audio`
  player and transient cache files, the microphone permission module, `MicButton`, `RecordingBar`,
  `SpokenAnswerButton`, and `PodcastEpisodeQuestionControls` with their stories, the composer and bubble changes, the
  dock and card changes, the audio mode switch around a recording, and the app config's microphone purpose. A new
  development build and store build follow.
- Docs: `apps/mobile/AGENTS.md`, `apps/mobile/parity.md` (five rows retired), `apps/mobile/store/data-inventory.md`,
  `apps/mobile/store/release-checklist.md`, `packages/core/AGENTS.md`, `packages/client/AGENTS.md`,
  `packages/contracts/AGENTS.md`, `apps/web/AGENTS.md`, and the user docs `feed/chat.md`, `feed/coffee-break.md`,
  `teams/group-chat.md`, and `get-the-app.md`.
- No api route, schema, or Doppler change. The transcription, speech, spoken questions, and spoken events routes are
  reached as they are.
