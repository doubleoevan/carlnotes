## 1. The proxy, the gate, and the vocabulary

- [x] 1.1 Keep LiteLLM on `v1.94.0`, whose Gemini pass-through forwards the Interactions route, by tag and digest in
  `infra/litellm/Dockerfile` and by tag in `docker-compose.yml`
- [x] 1.2 Rewrite the comment block in `litellm-config.yaml`: speech and transcription have no model-list entry, both
  call Google's model by name through the pass-through, speech is charged from LiteLLM's price table, and transcription
  goes to `/interactions` with `store` false and charges nothing on the key
- [x] 1.3 Add `shared/voiceChat.ts`: `chatTranscriptionModel()` reading `CHAT_TRANSCRIPTION_MODEL` (default
  `gemini-3.5-transcribe`, empty is off) and `isVoiceChatConfigured()` requiring it and the podcast speech model
- [x] 1.4 Document `CHAT_TRANSCRIPTION_MODEL` in `.env.example` and the README's Development section, with ffmpeg named
  for voice beside the podcast
- [x] 1.5 Add the spoken chat turn to the domain-model skill's Chat Turn row, and `chat-spoken.md` to the prompt-
  authoring skill's chat fragments

## 2. Schema, contracts, and payloads

- [x] 2.1 Add `is_spoken` boolean not null default false to `chatTurns` and `chatRoomMessages` in `db/schema/chat.ts`,
  then `bun run db:generate`, and pin both columns in `db/schema.test.ts`
- [x] 2.2 Add `isSpoken` (default false) to `chatTurnPayload` and `chatRoomMessagePayload` in `shared/payloads.ts`, the
  `voiceChatPage` payload, the transcription, speech, and spoken events payloads, and `SPOKEN_PART_CHARS`
- [x] 2.3 Add `isSpoken` to `ChatTurnRow` and `ChatRoomMessage`, and `isVoiceChatConfigured` to `ChatConversation` and
  `ChatRoomMessagePage` in `shared/contracts/chat.ts`
- [x] 2.4 Add `spoken_question_sent` and `spoken_answer_played` to `UserAnalyticsEvent` in `shared/analytics.ts`
- [x] 2.5 Move the plain-words helper from `shared/seo.ts` into `shared/spokenText.ts` as an export, add
  `toParagraphSpokenParts` (fenced code and bare urls removed, link text kept, whitespace collapsed, split on blank
  lines) and `toSpokenParts`, and test both

## 3. The worker

- [x] 3.1 Add `worker/ffmpeg.ts` with `runFfmpeg({ ffmpegArguments, stdin? })`, and rewrite `toScaledCoverJpeg` in
  `api/share/podcastCover.ts` and `joinChapterFiles` in `worker/podcast/podcastEpisodeAudio.ts` over it
- [x] 3.2 Add `worker/transcription.ts`: `transcodeRecording` to 16 kHz mono WAV through `runFfmpeg`, and
  `transcribeRecording({ audioBytes, litellmApiKey })` posting the WAV inline to the pass-through's
  `/gemini/v1beta/interactions` with `store: false` and the transcription model on the user's key, sorting failures
  with `toModelCallFailure`, and returning the transcript with its token usage, estimated from the audio's seconds
  if the response gives none
- [x] 3.3 Add `transcriptionCost` to `worker/budget.ts` beside the speech rates, at $2 per million audio input tokens
  and $12 per million output tokens, and test it
- [x] 3.4 Add `recordSpokenAnswer({ text, litellmApiKey })` and `toSpokenAnswerRequestBody(text)` to `worker/speech.ts`:
  one speaker in the host voice, standard tier, audio output, sharing the fetch, the failure sorting, and `toWavBytes`
  with `recordSpeech`; test the body shape beside the two-speaker test
- [x] 3.5 Add `worker/prompts/chat-spoken.md` (version 1, model tier chat) and register it in
  `FALLBACK_PROMPT_TEMPLATES`
- [x] 3.6 Add `{{spokenBlock}}` above the closing rules of `chat-topic.md`, `chat-team.md`, and `chat-new-topic.md`,
  `toSpokenBlock()` beside `toConductBlock` in `worker/chat/chatPrompts.ts`, an `isSpoken` option on the three builders
  (defaulted, through an options object), `isSpoken` on `ChatTurnInput`, and its pass through `buildReplyPrompt`; test
  that a spoken turn splices the block once and a typed turn never does, in all three chats
- [x] 3.7 Dedupe the drift `reportError` in `worker/prompts/fetch.ts` once per process per prompt name, like the wording
  log, and test it
- [x] 3.8 Extend `worker/speech.smoke.ts` with a single-speaker clip and a transcription on the test key, asserting the
  key's spend rises by the app's own speech estimate within ten percent, the spoken answer is an MP3, and the
  transcript has the spoken word

## 4. The api

- [x] 4.1 Add `recordChatSpendRow` to `api/chat/chatTurns.ts`: a text-less `chat_turns` row with cost and tokens for a
  private page or a room, `roomMessageId` null, and test it beside the ephemeral turn test
- [x] 4.2 Add `authorizeVoiceChatPage(userId, page)` in `api/chat/voiceAuthorization.ts`, mapping each page kind to the
  chat turn's own authorization and a room to `loadChatRoom` plus the monthly spend gate; test every rejection
- [x] 4.3 Add `api/chat/voiceRoute.ts` with `POST /chat/transcription` under `toolCallerRateLimiter`, the signed-out
  rejection, and a 4 MiB `VOICE_RECORDING_BODY_LIMIT_BYTES` listed in `OWN_BODY_LIMIT_PATHS`, reading the multipart page
  and file, transcoding, transcribing, writing the spend row, and returning the transcript; test the gates, the budget,
  the body limit, and the empty transcript with `transcribeRecording` mocked
- [x] 4.4 Add `POST /chat/speech` to the same file under a new `speechRateLimiter` (60 a minute, `rate-limit:speech`),
  the signed-out rejection, and the default body limit, returning the audio with `private, no-store`, 402 on a spent
  key, 503 with `Retry-After` on a proxy rate limit, and writing the spend row; test the gates and the limiter window
- [x] 4.5 Add `POST /chat/spoken-events` to the same file, capturing `spoken_question_sent` and `spoken_answer_played`
  with the page's ids, `chatKind` (`toChatKind` exported and extended with `room`), and `toAnalyticsProperties`; test
  the properties and the gates
- [x] 4.6 Mount `voiceRoute` beside the chat routes in `api/api.ts`, and add the new route files to
  `budgetRejection.test.ts`'s file list
- [x] 4.7 Pass `isSpoken` from `chatTurnPayload` through `answerChatTurn`, `streamChatReply`, and the stored row in
  `api/chat/privateChat.ts`, `chatTurnStream.ts`, and `chatTurns.ts`, read it back in `loadChatTurns`, add it to
  `chat_turn_sent`, and set `isVoiceChatConfigured` in `toChatConversation`; test the stored and replayed flag
- [x] 4.8 Pass `isSpoken` through `postChatRoomMessage` and both room POST handlers, make it address Carl, store it on
  the member's row, add it to `room_message_sent`, read it in `loadChatRoomMessages`, and set `isVoiceChatConfigured` in
  `toChatMessagePage`; test the addressing rule and the page flag
- [x] 4.9 In `runModelChatRoomTurn`, select `isSpoken` beside `content`, pass it into `streamChatReply`, and set it on
  Carl's reply row; test the reply's flag
- [x] 4.10 Update `api/AGENTS.md` for `voiceRoute.ts` and `voiceAuthorization.ts`, `worker/AGENTS.md` for `ffmpeg.ts`
  and `transcription.ts`, and `shared/AGENTS.md` for `voiceChat.ts` and `spokenText.ts`

## 5. The ui

- [x] 5.1 Export `pausePodcastEpisode()`, `isPodcastEpisodePlaying()`, and `refreshPodcastEpisodeMediaSession()` from
  `podcastEpisodePlayerStore.ts`, and stop the spoken answer in its `play` handler
- [x] 5.2 Add `ui/src/stores/spokenAnswerStore.ts` and `ui/src/components/chat/SpokenAnswerAudio.tsx` mounted in
  `Layout.tsx`: the element that plays silence in the tap, the spoken part queue per reply key, the blob cache, play and
  stop, the episode pause, Carl's media session metadata, and the refresh after the last spoken part; test the queue's
  pure parts
- [x] 5.3 Add `ui/src/lib/voiceRecorder.ts`, lazy-imported on the first mic tap: the synchronous `AudioContext`, the
  `getUserMedia` request, the analyser loop with `toRecordingLevel`, `toSilenceThreshold` from the ambient sample, and
  `toRecordingDecision` (send after 1.5 quiet seconds once speech was heard, cancel after 8 seconds with none),
  `toRecordingMimeType`, the `MediaRecorder`, the 60-second send, the hidden-page cancel, and track and context cleanup;
  test the pure parts - [x] 5.4 Add `useVoiceRecording` in `ui/src/components/chat/`: the state machine, the three
  toasts, the silence played in the send tap, the transcription client call, and the timings kept for the spoken events
  post
- [x] 5.5 Add `voiceClient.ts` in `ui/src/clients/` for the transcription, speech, and spoken events posts, with the
  speech 402 and 429 told apart from a chat rejection
- [x] 5.6 Add `MicButton.tsx` and `RecordingBar.tsx`, and render them in `ChatComposer` and `ChatRoomComposer` on the
  empty-box rule with the configured flag, blurring the box on the tap; test the slot switch and the labels with
  `renderWithRouter`
- [x] 5.7 Carry `isVoiceChatConfigured` through `useChatConversationLoad` into `ChatConversationGates`, and through
  `fetchChatRoomMessages`, `showFirstChatMessagePage`, and `ChatRoomState` into the room composer
- [x] 5.8 In `useTopicChat.send`, take the spoken transcript with `isSpoken`, enqueue each finished paragraph from the
  chunk callback and the remainder at the end for a spoken turn, and post the spoken question event on the first
  `playing` or at the stream's end
- [x] 5.9 Widen `sendChatRoomMessage` to return `chatMessageId`, prefix a spoken transcript with `@carl ` in place of
  `@all ` and send it with `isSpoken`, keep the pending spoken id in `useChatRoom`, and speak Carl's reply once on the
  matching stream message - [x] 5.10 Add `SpokenAnswerButton.tsx` (play and stop, playing silence in the tap, posting
  `spoken_answer_played`), and render it beside the copy button in `ChatTurnBlock`'s answer footer and in
  `ChatRoomMessageBubble`'s footer with stable callbacks; test the button labels. No message shows a mic mark, since a
  mic means recording everywhere else
- [x] 5.11 Update `ui/AGENTS.md` for the new store, lib, and components
- [x] 5.12 Listen mode in `useVoiceRecording`: a tap starts a session on one `AudioContext`, the transcript's send
  waits for carl's reply, `subscribeToSpokenAnswerEnd` in the store announces each queue's end with whether it played
  to its end, a finished reply reopens the mic with no toast on silence, a stopped reply, a typed send, a cancel, a
  hidden page, an unmount, or a two-minute wait ends the session, `MicButton` rings while the session waits, and the
  recorder leaves the context open for the hook; test the store's announcement and document listen mode in the docs

## 6. Copy, docs, and evals

- [x] 6.1 Update the Google Gemini row in `ui/src/pages/PrivacyPage.tsx` for spoken questions and replies read aloud
- [x] 6.2 Add a "Talk to Carl" section to `docs/src/content/docs/feed/chat.md` and the spoken rule to "Who hears you" in
  `docs/src/content/docs/teams/group-chat.md`, then `bun run docs:embed`
- [x] 6.3 Add the spoken case to `evals/topic-chat/` with a no-markdown check and a spoken rubric, pass `isSpoken` to
  the builder in its provider, and add a passing and a failing calibration case in `evals/grader-
  calibration/graderCalibrationTopicChatCases.ts`

## 7. Review fixes

- [x] 7.1 Transcribe through the Interactions API with `store: false`, read the transcript from the steps' text items
  and the tokens from the usage, and test the exact request body, the usage shapes, and a status that did not complete
- [x] 7.2 Remove the `stt-model` alias and default `CHAT_TRANSCRIPTION_MODEL` to `gemini-3.5-transcribe`, and restore
  the LiteLLM v1.94.0 pin in `infra/litellm/Dockerfile` and `docker-compose.yml`
- [x] 7.3 Harden the transcode with `TRANSCODE_ARGUMENTS`: the protocol, format, and codec whitelists, `-t 61`,
  `-flush_packets 0`, and a 10-second timeout; test a Safari fragmented mp4 and a rejected WAV container
- [x] 7.4 Return `{ outcome: "silent" }` for a WAV with no samples with no model call, and answer it 200 with an empty
  transcript and no spend row
- [x] 7.5 Encode a spoken answer to a 64 kbps MP3 after the paid call, returning the WAV and reporting the failure if
  the encode fails, with a 90-second speech timeout, and send the result's content type from the speech route
- [x] 7.6 Limit the process to 4 transcodes at once with a 503 and `Retry-After: 5`, and a user to 3 spoken parts in
  flight with a 429
- [x] 7.7 Add `spokenEventRateLimiter` (30 a minute, `rate-limit:spoken-events`) and `authorizeVoiceChatPageAccess`, so
  a spoken event checks the page's access and never runs the spend sums
- [x] 7.8 Report every voice model failure but a spent budget to Sentry under a fixed message per model call and outcome
- [x] 7.9 Filter the text-less rows out of `loadChatTurns` in SQL
- [x] 7.10 Retry a 503 or a network failure once after `Retry-After` at most 5 seconds on the transcription and speech
  posts, stop a reply on a 402, and skip any other failed spoken part
- [x] 7.11 Start a reply with a short first spoken part ending at the first sentence end past 60 characters, pack later
  spoken parts to 500 characters, drop spoken parts with no letter or digit, and prefetch the next spoken part while one
  plays - [x] 7.12 Key the session audio cache by each spoken part's text and limit it to 40 MB, dropping the oldest
  spoken parts first
- [x] 7.13 Stop only the rejected play's own queue, remember stops per reply key, silence the streaming reply when the
  panel closes, drop a transcript whose composer unmounted, and load the recorder inside the `try`
- [x] 7.14 Redraw the level meter only on a twentieth step, keep a room's reply from auto-playing while its asker
  records, and make the private composer read-only while a transcript is on its way, leaving the draft's attachments
- [x] 7.15 Update the Privacy page's Google Gemini row for the recording, the read-aloud reply text, and Google's
  paid-tier terms, the Coffee Talk and group chat docs, the README, the module guides, and this change's design and
  specs

## 8. Verification

- [x] 8.1 `bun run check` green, `bun run smoke:speech`, and a Playwright Chromium run with a fake
  microphone through record, transcribe, reply, and speak
- [ ] 8.2 After the deploy: `bun run prompts:sync:prd`, then a spoken question on carlnotes.com with its PostHog event
- [ ] 8.3 The device check on carlnotes.com from a phone: the mic prompt, the container, a blob playing after 10 seconds
  from the element that played silence, the level after the tracks stop, the episode pausing on the mic and the lock
  screen returning after Carl stops, the home-screen app, and a hidden page cancelling
