## Context

Coffee Talk has two composers. `ChatComposer` serves the private chat on a topic, on a team, and the new-topic chat,
through `useTopicChat`, whose `send()` posts `chatTurnPayload` to one of three paths under
`toolCallerRateLimiter → chatSignedOutRejection → chatBodyLimit → zValidator → authorize*ChatTurn`, and reads the reply
as newline-delimited `ChatReplyLine`s, chunk by chunk, into the newest turn. `ChatRoomComposer` serves every chat room
through `useChatRoom.postChatMessage`, where the member's message posts whole, Carl is addressed by `@carl`, `@all`,
or a reply to his message, and his reply arrives whole over SSE with `replyToChatMessageId` set to the member's
message. Both composers switch the send slot between stop, the signup arrow, and send on the same `size-11 sm:size-8`
button, and both blur the box on a touch screen after a send.

Audio today is the podcast: `worker/speech.ts` posts a two-speaker `generateContent` request to LiteLLM's Gemini
pass-through on the user's key and wraps the 24 kHz PCM in a WAV header, `worker/budget.ts` prices it with
`speechCost`, and `ui/src/stores/podcastEpisodePlayerStore.ts` drives the one `<audio>` element `Layout.tsx` mounts,
with `togglePlayback` as its only pause entry and `updateMediaSession` private. The browser has no capture code and no
second audio element. ffmpeg is in the runtime image, run through pipes by the api's cover encode and on temp files by
the worker's episode join. LiteLLM is pinned to v1.94.0, whose Gemini pass-through forwards any `/gemini/{endpoint}`
path on a virtual key after checking that key's budget.

The gates voice must honor are the chat's: the per-caller rate limit, the signed-out rejection before the body, the
page's authorization, the monthly spend budget, the key's own budget on the proxy, and the podcast's "off without a
speech model" rule. The analytics rule is that a user event is keyed on the server, never from the browser.

## Goals / Non-Goals

**Goals:**

- Talk to Carl from every composer that can chat today, under the same gates, on a phone's web browser.
- Carl speaks his reply in his podcast voice, starting while the rest streams, and never over a Podcast Episode.
- Every voice dollar counts in the user's monthly spend the way a chat turn does.
- CarlNotes stores nothing recorded, Google is asked to store nothing, and the mark that a turn was spoken survives a
  reload.
- A viral day's burst of recordings and spoken parts slows voice down and never takes the api process with it.
- A self-hosted instance with no Google key runs with the mic hidden.

**Non-Goals:**

- Vienna answering, asking from the podcast player, a voice meter segment on the Account page, and a native app.
- Streaming a room reply by paragraph. A room reply posts whole today and keeps doing so.

## Decisions

### Transcription goes through the Interactions API with storage off, on the pinned proxy

`worker/transcription.ts` posts JSON `{ model, input: [{ type: "audio", data, mime_type: "audio/wav" }], store: false
}` to `${LITELLM_BASE_URL}/gemini/v1beta/interactions` with the user's virtual key in `x-goog-api-key`, the same
pass-through that `worker/speech.ts` uses for `generateContent`. The model is Google's `gemini-3.5-transcribe`, which
`CHAT_TRANSCRIPTION_MODEL` overrides. The transcript is the text items of `steps[].content[]`, joined and trimmed, and a
status other than `completed` is retryable. The input tokens are `usage.total_input_tokens` (audio plus text), or the
sum of `input_tokens_by_modality` if the total is missing, and the output tokens are `total_output_tokens` plus
`total_thought_tokens`. A response with no usage falls back to an estimate: 32 audio tokens a second and four
transcript characters a token. A WAV of `WAV_HEADER_BYTES` or fewer has no samples, and returns `{ outcome: "silent" }`
with no call.

`store: false` is the reason for the route. The Interactions API stores every interaction by default, with the
recording and the transcript, retrievable by id: 55 days on the paid tier and one day on the free tier. `store: false`
opts one request out, so the project keeps nothing. Google's abuse monitoring log on paid services still applies on top
of that, for a limited time (its abuse monitoring page says 55 days), and the Gemini Developer API has no way to turn it
off. The Privacy page says both. Paid-tier prompts and responses are not used to train or improve Google's models.

The pass-through checks the key's budget before it forwards a call, so a spent key still blocks a transcription with
the chat's 402. It meters only the `generateContent` and video routes, so the key is never charged for a transcription.
The api's own spend row, priced by `transcriptionCost` in `worker/budget.ts` from Google's page ($2 per million audio
and text input tokens, $12 per million output tokens, thought tokens priced as output), is the only meter of a
transcription, and the monthly budget reads it. The live response measured 62 input and 10 output tokens for a
2.4-second clip, and the smoke's 126 in and 17 out cost $0.000456.

LiteLLM stays on v1.94.0, pinned by tag and digest in `infra/litellm/Dockerfile` and by tag in `docker-compose.yml`.
`gemini_proxy_route` is the same code in v1.94.0 and v1.100.5, with the same `user_api_key_auth` and the same forwarding
of any path, so the Interactions route needs no upgrade. `litellm-config.yaml` has no transcription entry, and its
comment says that speech and transcription both call Google's model by name through the pass-through, that speech is
charged from LiteLLM's price table, and that transcription charges nothing on the key.

Google accepts a 20 MB inline request and tokenizes audio at about 32 tokens a second, so a minute of 16 kHz mono WAV
(1.9 MB, about 2.6 MB in base64) is far inside both.

Alternatives: an `stt-model` alias on `/v1/audio/transcriptions`, which needs the Gemini transcription handler that
first ships in v1.100.0, would have metered the key by tokens, but that handler calls the Interactions API with no
`store` field, so Google would have stored every recording for 55 days. Setting the project's retention to 7 days still
keeps every recording for a week. Vertex AI offers zero data retention, but it is a second provider account and a
second LiteLLM route for one model call.

### One ffmpeg helper, and the transcode runs through pipes inside whitelists

`worker/ffmpeg.ts` exports `runFfmpeg({ ffmpegArguments, inputBytes?, timeoutMs? })`, which spawns ffmpeg with
`-hide_banner -loglevel error`, returns stdout as bytes, kills ffmpeg past its timeout, and throws `ffmpeg exited with
<code>: <stderr>` on a nonzero exit. The api's `toScaledCoverJpeg` and the worker's `joinChapterFiles` are rewritten
over it, which is the DRY rule applied before a third copy.

The transcode is `TRANSCODE_ARGUMENTS` in `worker/transcription.ts`: `-protocol_whitelist pipe -format_whitelist
matroska,webm,mov,mp4,m4a,ogg -codec_whitelist opus,aac,vorbis -i pipe:0 -ac 1 -ar 16000 -t 61 -flush_packets 0 -f wav
pipe:1`, with a 10-second timeout and the recording on stdin, so the audio lives in the request buffer and ffmpeg's
pipes and nowhere else. The whitelists admit only what a browser's `MediaRecorder` writes: opus in webm from Chrome and
Firefox, opus in ogg from Firefox, and aac in fragmented mp4 from Safari. A WAV, a FLAC, or an HLS playlist is rejected
in about 50 ms, which the route answers 422. `-t 61` limits the WAV to the 60-second recording limit plus the
recorder's last chunk, since a tiny recording of silence decodes to as much WAV as its length says. `-flush_packets 0`
writes the WAV to the pipe in large chunks instead of one write per packet; the output is byte-identical without it.
Each browser's container transcodes in 41 to 91 ms on ffmpeg 9.0.2 and reads from the pipe on the runtime image's
ffmpeg 7.1.5, Safari's fragmented mp4 included, so no temp file is needed.

The process runs at most `TRANSCODE_CONCURRENCY_LIMIT` (4) transcodes at once, counted in module scope in
`api/chat/voiceRoute.ts` the way `activeVisitorRenderCount` counts visitor renders. The check runs after authorization
and before the recording's bytes are copied, and the count rises with no `await` between the check and the increment
and falls in a `finally`. A recording past the limit gets a 503 with `Retry-After: 5`, which the browser retries once.

### Spoken answers return as MP3

`recordSpokenAnswer` pipes the speech call's WAV through `runFfmpeg` with `-f wav -i pipe:0 -c:a libmp3lame -b:a 64k
-flush_packets 0 -f mp3 pipe:1` and a 5-second timeout, and returns `audioContentType: "audio/mpeg"`. A 24 kHz 16-bit
WAV is 48 KB a second and the 64 kbps MP3 is 8 KB, which matters for a phone on mobile data and for the session's audio
cache. Two minutes of noise, the worst case, encode from 5.76 MB to 960 KB in 838 ms. If the encode fails after the
paid call, the function logs it, reports `spoken answer mp3 encode failed` with ffmpeg's reason in the extra fields,
and returns the WAV with `audioContentType: "audio/wav"`, so the paid call is never lost. The route sends the result's
content type. The speech call times out at 90 seconds, so the call and the encode stay under Cloudflare's 100-second
limit on a proxied request. Podcast chapters stay WAV, and the runtime image's ffmpeg 7.1.5 has `libmp3lame`.

### The browser picks its container, and the level meter is the Web Audio loop

The recorder picks the first supported of `audio/webm;codecs=opus` and `audio/mp4` with `MediaRecorder.isTypeSupported`,
never by user agent, since iOS 18.4 and later can record WebM. The live level meter needs an `AudioContext` with an
`AnalyserNode` over the stream, read in a `requestAnimationFrame` loop; there is no other mic level in the platform. The
loop also decides when the recording ends, the way a voice assistant does. The silence threshold adapts to the room: the
first 300 ms of the stream sample the ambient level, and the silence threshold sits a margin above it, never under a
fixed minimum. A frame above the silence threshold is speech. Once speech has started, 1.5 seconds under the silence
threshold sends the recording on its own; if nothing rises above the silence threshold in the first 8 seconds, it
cancels with the toast. The bar's send control sends early at any time, and the 60-second limit sends whatever was
recorded. The `AudioContext` is created and resumed synchronously in the tap, before awaiting `getUserMedia`, which is
the order WebKit needs for the analyser to read a live level on iOS (WebKit 177292).

Every track is stopped at send and at cancel, before any playback, because iOS switches the
audio session category while a capture track is live and plays quieter until it ends (WebKit 218012, 260501, 311451).
The recorder module is one file imported with `await import(...)` on the first mic tap, so a page loads nothing for
voice until then, and the mic button itself ships with the composer. The pure parts, `toRecordingLevel(bytes)`,
`toSilenceThreshold(ambientLevel)`, `toRecordingDecision({ hasSpeechStarted, lastLoudAt, startedAt, now })`, and
`toRecordingMimeType(isTypeSupported)`, each get a unit test; the browser glue
cannot run under `bun test` and is verified on a device.

### The mic shares the composer and the send slot

The mic button renders in place of the send button while `question.trim() === "" && attachments.length === 0` and
nothing streams, at the same size, with `aria-label="Talk to Carl"`. It is the one button in the composer without
`onMouseDown preventDefault`, so the tap blurs the box and a phone keyboard closes. A visitor's tap calls the same
`onSendQuestion`, which routes to `/signup?cta=chat`, so no permission is ever asked of a visitor. A spent budget
already replaces the private composer with `ChatBudgetNotice`, so the mic is gone with it; in a room the composer
stays and the spent user's transcription post comes back 402 with the existing rejection notice.

While recording, a `RecordingBar` replaces the box's children inside the same rounded `FileDropZone` frame: an X with
`aria-label="Cancel"`, the level meter, a `m:ss` timer, and the send button with `aria-label="Send"`, four controls at
44 px that fit 375 px with the bar's padding and `env(safe-area-inset-bottom)`. One hook, `useVoiceRecording`, owns the
state machine (`idle → requesting → recording → transcribing`), the end-of-speech send, the 60-second send, the no-
speech cancel, the `visibilitychange` cancel, and the three toasts: "Carl can't hear you. Type it, he reads fast." if
the browser rejects the microphone, and "Carl didn't catch that. Please try again." on a quiet cancel or an empty
transcript. Both composers use it.

### The voice gate is a flag on the page payload

`shared/voiceChat.ts` reads `CHAT_TRANSCRIPTION_MODEL` (default `gemini-3.5-transcribe`, empty is off) beside
`podcastEpisodeSpeechModel()`, and `isVoiceChatConfigured()` is true only with both. The ui cannot read `Bun.env`, so
the api sets `isVoiceChatConfigured` on `ChatConversation` (every private page's load) and on `ChatRoomMessagePage`
(the room's REST load that precedes its stream). The mic and the play buttons render only with the flag. A self-hosted
instance with `PODCAST_SPEECH_MODEL` or `CHAT_TRANSCRIPTION_MODEL` empty shows no voice control and loads no voice code.

### Three voice routes in one file, with the page in the request

`api/chat/voiceRoute.ts` mounts `POST /chat/transcription`, `POST /chat/speech`, and `POST /chat/spoken-events`. Each
names its page in the request as a `voiceChatPage`: `{ kind: "topic", topicId }`, `{ kind: "team", teamId }`,
`{ kind: "newTopic" }`, or `{ kind: "room", topicId, teamId }`, and one `authorizeVoiceChatPage(userId, page)` returns
the chat turn's own authorization for it: `authorizeChatTurn`, `authorizeTeamChatTurn`, `authorizeNewTopicChatTurn`,
or for a room `loadChatRoom` plus `isMonthlySpendExhausted`. A visitor is rejected 401 before the body is read, as the
chat posts do; a spent budget is 402 with `SPENT_BUDGET_REJECTION`; a page the user may not chat on is 403 or 404 as the
chat turn answers it.

- Transcription takes a multipart body with the `page` as JSON and the recording as a file, under
  `toolCallerRateLimiter` (one hit per spoken question, the same as a typed one, and a transcription is a paid model
  call even in a room, which is why it takes the limiter rooms never had) and `VOICE_RECORDING_BODY_LIMIT_BYTES` of 4
  MiB, listed in `OWN_BODY_LIMIT_PATHS`. After authorization it checks the process's transcode limit, then transcodes,
  calls `transcribeRecording` on the user's key, writes a spend row, and returns `{ transcript }`. An empty transcript
  still returns 200 with `""` and a spend row, since the call was paid. A silent WAV returns 200 with `""` and no spend
  row, since no model was called.
- Speech takes `{ page, text }` with `text` at most `SPOKEN_PART_CHARS` (2,000) under its own limiter,
  `speechRateLimiter` at 60 a minute with a `rate-limit:speech` key, because the browser decides how many spoken parts a
  reply has and a replay of a long reply must not spend the chat's 30. A user may have at most
  `SPOKEN_PARTS_IN_PROGRESS_LIMIT` (3) spoken parts in progress, counted per user id in a module-scope map that a
  `finally` decrements and clears at zero, and a fourth gets a 429 `{ error: "rate limited" }` before the key is loaded.
  It calls `recordSpokenAnswer` on the user's key, writes a spend row, and returns the audio with the result's content
  type and `Cache-Control: private, no-store`.
- Spoken events takes `{ page, event }` under its own `spokenEventRateLimiter`, 30 a minute with a
  `rate-limit:spoken-events` key, and the default body limit, the listen route's shape: the browser sends only its
  measurements, the server adds `toAnalyticsProperties(context)`, `chatKind`, and the page's ids, then `trackEvent`. It
  checks the page with `authorizeVoiceChatPageAccess(userId, page)`, the access half of the gate with no spend sums:
  `isAllowed(userId, "topic:view", topic)` for a topic, `toTeamRole` membership for a team, signed in for the new-topic
  chat, and `loadChatRoom` through the `toChatRoomAccess` helper that `authorizeChatRoomVoice` shares for a room. An
  event never runs the monthly spend sums, and a spent budget can still report a play.

A model call that fails answers the way the chat does: a spent key budget is 402, a retryable failure is 503 with
`Retry-After: 5`, and any other failure is 502. Every failure but a spent budget is reported to Sentry through
`reportError` with the fixed message `<model call> <outcome>`, such as `speech retryable`, and the model call, the
outcome, the HTTP status, and the proxy's reason in the extra fields, so each pair has one stable report window. The
proxy's reason is logged and reported, and never sent to the browser.

Alternative: a route per chat path, as the chat posts have, would be fifteen mounts for the same three handlers.

### Voice spend is a text-less chat turn row

`recordChatSpendRow({ userId, page, cost, totalTokens })` in `api/chat/chatTurns.ts` inserts a `chat_turns` row with
no text, the shape `recordChatRoomTurn` already writes, mapping a private page the way `toChatTurnRow` does and a room
the way the room turn does, with `roomMessageId` null. Every spend reader sums `chat_turns.cost` with no other filter,
so the monthly spend, the exhausted gate, the podcast share, the account meter, the admin console, and the daily alert
all count it with no change. `loadChatTurns` reads only the rows whose question and answer are not null, filtered in
SQL, so a spend row never becomes a bubble and the conversation load skips the spend rows at the database, and a clear
nulls text and keeps rows, so a clear never erases voice spend. The transcription row is written as soon as the
transcript returns, empty or not, and a silent recording writes none; one speech row is written per spoken part, for
whoever tapped.

Alternatives: adding the dollars to the question's turn row cannot work, since a private turn's row is written when the
stream closes, after the first spoken parts are spoken, and a transcription spends before any turn exists. A kind column
for a voice meter segment would touch `RecordedSpend`, the activity and admin payloads, and the account meter, and the
activity-page spec keeps the bar's two segments.

### The spoken flag is stored on both tables and rides the existing reads

`chat_turns.is_spoken` and `room_messages.is_spoken`, boolean not null default false, by one generated migration.
`chatTurnPayload` and `chatRoomMessagePayload` gain `isSpoken` (default false), `ChatTurnRow` and `ChatRoomMessage`
gain `isSpoken`, and `loadChatTurns` and `loadChatRoomMessages` read it, so the page load, the conversation replay,
and the SSE delta (which re-reads the row) all carry it with no transport change. `chat_turn_sent` and
`room_message_sent` gain an `isSpoken` property.

### One prompt fragment, spliced on a spoken turn

`worker/prompts/chat-spoken.md` (version 1, model tier chat, no variables) says the reader said this out loud and will
listen to the reply read aloud, so answer the way Carl would say it across the table, in a few short sentences, with no
tables, lists, headings, or links read aloud, offering more only if asked, and that on this turn it comes before the
rules that follow. `toSpokenBlock()` writes it beside `toConductBlock`, and the three system templates gain a trusted
`{{spokenBlock}}`, filled with the fragment on a spoken turn and `""` otherwise, placed above each template's closing
rules: `write.test.ts` requires every template to end on app-authored text, and the line has to outrank the conduct
rules on lists and links. `ChatTurnInput.isSpoken` reaches `buildReplyPrompt`, and the three builders take it through
an options object, defaulted, so the eval providers keep compiling and the topic chat eval passes it on its spoken
case.

The variable-set change means `fetchPromptTemplate` serves the bundled templates and reports drift on every call until
`bun run prompts:sync:prd` runs after the deploy, the same window the 2026-09-29 fragments paid. The drift
`reportError` is deduped once per process per prompt name, like the wording log already is, so a real drift still
alerts and its repeats stop.

Alternatives: composing the line onto `conductBlock` in TypeScript avoids the window but reaches only two of the three
chats and hides the splice from the registry; putting it in the user message makes it a user-role instruction that the
stored turn and the client-side history would carry.

### A spoken room message addresses Carl as a mention

The composer prefixes a spoken transcript with `@carl ` in place of the `@all ` it gives an unaddressed draft, so the
message addresses Carl through the mention parser as a typed mention does, no other member is badged, and the server's
addressing rule and the ui's `isModelChatTurnPost` are unchanged. `postChatRoomMessage` takes `isSpoken` and stores it
on the member's row. `runModelChatRoomTurn` reads `isSpoken` from the prompt row beside `content`, passes it into
`streamChatReply` so the same `{{spokenBlock}}` splices into the room's system prompt, and sets it on Carl's reply row.
Carl's rejection row does not take the flag.

Only the asker's browser auto-plays: `sendChatRoomMessage` returns the `chatMessageId` the api already sends, the hook
keeps it as the pending spoken message, and the stream handler speaks the first message with that
`replyToChatMessageId`, `isModelChatMessage`, and `isSpoken`, then clears the pending id, so a reconnect's replay never
speaks twice and a teammate's reply never matches.

### Carl's replies play through their own element, unlocked by silence played in the tap

`ui/src/stores/spokenAnswerStore.ts` is a module-scope store in the podcast store's shape: `Layout.tsx` mounts a
`SpokenAnswerAudio` element beside `PodcastEpisodeAudio`, and the store owns a queue of spoken parts per reply key (the
chat turn's or the room message's id), an in-memory cache of audio blobs, and the playing state the play buttons read.
The podcast store's `play` handler drives its own state, so Carl can never play through that element.

WebKit forwards a tap's gesture through a fetch for 10 seconds and the tap → transcription → stream → speech chain is
longer, so the element plays silence synchronously in the tap: `playSpokenAnswerSilence()` sets a silent WAV data URI as
`src` and calls `play()` before the first `await` in `useTopicChat.send`, `useChatRoom.postChatMessage`, and the play
button's handler. Each spoken part is a `blob:` URL of a complete MP3, or of the WAV if the encode failed, never a
`MediaSource`, which would reset the unlock. If the silence's `play()` rejects, the reply is shown as text with its play
button and never auto-plays; `play()` is never retried from a timer or a stream callback. A `play()` that rejects later
stops only the queue it belongs to, so a reply that replaced it keeps playing.

### A short first spoken part, then paragraphs

`toSpokenParts(markdown)` in `shared/spokenText.ts` starts a reply with a short spoken part: `toFirstSpokenPartEnd`
finds the first sentence end in the first paragraph at or past `FIRST_SPOKEN_PART_CHARS` (60). A sentence end is `.`,
`!`, or `?`, an optional closing quote or bracket, then whitespace, and never after a digit, so a numbered list keeps
its numbers. An open code fence before that point keeps the paragraph whole. The cut is the first sentence end past 60
instead of the last one before some length, so it falls in the same place however the stream is chunked, and a replay
produces the same spoken parts and reuses their cached audio. The rest of the reply is `toParagraphSpokenParts`: the
plain-words helper the meta description already uses, moved to shared and exported, plus fenced code and bare urls
removed and whitespace collapsed, with link text kept, split on blank lines and packed to `SPOKEN_PART_PACKED_CHARS`
(500), so one speech call returns about half a minute of audio. `SPOKEN_PART_CHARS` (2,000) stays the route's zod limit.
A spoken part with no letter or digit, such as a `---` rule, is dropped and never sent to speech.

In the private chat, `useTopicChat`'s chunk callback cuts the short first spoken part as soon as its sentence end
streams, then enqueues each finished paragraph, then the remainder at the end through `toUnfinishedSpokenParts`, so Carl
starts talking a sentence in. A replay splits the whole reply. In a room the reply arrives whole and is split then.
While a spoken part plays, the store fetches the next one, so the gap between spoken parts is the next call's head
start.

### A failed spoken part is retried once, then skipped

`ui/src/clients/voiceClient.ts` posts the transcription and each spoken part through one `fetchWithOneRetry`: a 503 or a
network failure is retried once after `toRetryDelayMs`, the response's `Retry-After` seconds clamped to 0 through 5, or
1 second with no response or no header. `fetchSpokenAnswerAudio` returns the blob or a `ChatRejection`. A `budget`
rejection (402) stops the queue and leaves the text with its play button. Any other rejection, a 502, a 429 from the
in-progress limit, or a retry that failed again, skips that spoken part and plays the next one, since one lost sentence
costs less than a silent reply. Rejections are never cached.

### The session cache is keyed by each spoken part's text and limited by size

`spokenAudioCache` and `pendingSpokenAudio` are keyed by the spoken part's text, so the same spoken part in a replay, in
another reply key, or in a prefetch and a play shares one fetch and one blob. `cacheSpokenAudio` keeps a running byte
total and drops the oldest entries, in the `Map`'s insertion order, while the total is over `SPOKEN_AUDIO_CACHE_BYTES`
(40 MB). Nothing is stored past the session.

### One voice at a time, and the composer while a transcript is on its way

One voice at a time: the podcast store exports `pausePodcastEpisode()` (a pause, never a toggle) and
`refreshPodcastEpisodeMediaSession()`, and `isPodcastEpisodePlaying()` for a read outside React. A mic tap and the first
spoken part of a reply pause the episode and never resume it. The episode's `play` handler stops Carl. Starting a
recording stops Carl. While Carl plays, the element sets its own `MediaMetadata`, and `ended` on the last spoken part
calls the refresh so the lock screen shows the episode again.

A stop is remembered per reply key in `stoppedSpokenAnswerKeys`, and a play tap clears only its own key, so a stopped
streaming reply stays quiet after another reply is played and stopped. `stopSpokenAnswerKey(key)` marks a reply
stopped even before its queue starts, and stops the queue only if it is that reply's; the topic chat's stopped stream
and the panel's unmount use it, so closing the panel silences the streaming reply while its text stream goes on.
`useVoiceRecording` sets `setIsVoiceRecordingActive` for every state but idle, and a room reply that arrives while the
asker records or transcribes is not auto-played: it stays as text with its play button, and its spoken question event
posts with no play time. While a transcript is on its way, the private composer's box is read-only, its send button is
disabled, and `sendQuestion` returns early, which covers Enter and a form submit. A spoken send takes no attachment and
leaves the draft and its attachments alone. A transcript that returns after its composer unmounted is dropped. The
recorder's dynamic import runs inside the `try`, so a failed load closes the `AudioContext` and shows the microphone
toast. The level meter's `toMeterLevel` rounds the level to a twentieth, and the recorder calls `onLevel` only when that
step changes, instead of about 39 renders a second.

### Listen mode: one tap is a conversation

A mic tap starts listen mode in `useVoiceRecording`, a session with three states: `listening` while the mic is open or
the transcript is on its way, `waiting` once the transcript sends, and `off`. The spoken answer store announces every
reply's end through `subscribeToSpokenAnswerEnd`, with the reply's key, whether it played to its end, and whether it was
the conversation's own reply, played with no tap: the streaming path and the room's auto-play mark their queues so, and
the play button does not, so an older reply the user plays finishing never reopens the mic. A streamed reply that queued
nothing, like a code block alone, is announced as finished when it completes, and a stopped or rejected turn as a stop
even before its queue started, so listen mode never sits out its two-minute wait. Carl's own reply finishing reopens the
mic, with no tap and no prompt, and a stopped reply ends the session, since a stop from the podcast starting or the
panel closing must never open the microphone. The first tap's `AudioContext` serves the whole session and closes when
the session ends: a context made outside a gesture starts suspended on iOS, so a reopened recording on a fresh context
would read no level and cancel as silence. The recorder therefore stops the microphone's tracks at the end of each
recording and leaves the context to the hook. A reopened recording that reads no speech above the silence threshold
cancels with no toast, since the speaker is done, while a tapped one still toasts. Every other exit ends the session:
the bar's cancel, a rejected or empty transcript, a hidden page, the composer unmounting, a typed send in either
composer, and a two-minute wait with no reply ending. The idle mic shows a ring while the session waits for Carl, and a
tap on it stops him and starts a fresh session, which is the manual interrupt. Talking over Carl was left out on
purpose: on a phone's speaker the mic picks him up, echo cancellation is unreliable on iOS and over Bluetooth, and the
failure is Carl cutting himself off.

### Analytics measure the proof of concept

`spoken_question_sent` and `spoken_answer_played` join `UserAnalyticsEvent`. The browser measures `secondsRecorded`,
`transcriptionMs` (the transcription fetch's round trip), and `firstSpokenWordMs` (the first `playing` of the reply's
first spoken part, from the send tap), and posts them to the spoken events route on that `playing`, or at the stream's
end with no third number if nothing played, with `keepalive: true`. A play tap posts `spoken_answer_played`. The server
adds the plan, the device, `chatKind`, and the page's ids, as the listen route does. A visit event cannot carry them:
the browser's visit analytics run with no identity, and a spoken question is a signed-in act.

### Copy, docs, and the vocabulary

The Privacy page's Google Gemini row names podcast audio, spoken questions, and replies read aloud. It says Google
receives the recording of each spoken question, transcribed with storage turned off and never kept by CarlNotes, and
the text of the replies read aloud: replies to spoken questions, and any reply a user taps play on. It states
Google's paid-tier terms as far as they are certain: none of it trains or improves Google's models, and Google may log
it for a limited time, which its abuse monitoring policy sets at 55 days, only to detect abuse and make legally required
disclosures. The Coffee Talk docs page gets a "Talk to Carl" section that says the same in short, and the group chat
page's "Who hears you" section says a spoken message always reaches Carl and that his reply waits with its play button
while the asker records again. The domain-model skill's Chat Turn row says a **spoken**
chat turn's question arrived by voice and its reply is read aloud, and the prompt-authoring skill lists
`chat-spoken.md` among the chat fragments. "Spoken" is the adjective in every identifier, event, and column; "voice" is
the feature's name in the gate and the routes.

## Risks / Trade-offs

- [iOS plays a reply quieter after a capture] → every track is stopped before playback, the context closes with the
  listen session, and
  `navigator.audioSession.type = "playback"` is set after a recording ends if the device check shows the category does
  not revert on its own.
- [Playing silence fails on some browser] → the reply stays as text with its play button, and the question still sends.
- [A spent key mid-reply] → the speech route answers 402, the queue stops, the text is already on screen, and the play
  button stays; no chat rejection is shown.
- [The chat's 30 hits a minute] → transcription takes one hit per question; speech has its own rate limit window of
  60, so a long reply never trips the chat.
- [A viral day's burst of recordings] → at most 4 transcodes run in the process, each killed after 10 seconds, and the
  rest get a 503 with `Retry-After: 5` that the browser retries once; a user's spoken parts are limited to 3 in
  progress, and the spoken events have their own limiter.
- [Google keeps a copy for abuse monitoring] → `store: false` keeps the recording out of the project, but the abuse log
  on paid services cannot be turned off on the Gemini Developer API; the Privacy page says so. Guaranteed zero retention
  would need Vertex AI.
- [The key's own budget does not see transcription spend] → the pass-through checks the key's budget on a transcription
  but charges nothing for it, so the key's spend runs below the monthly spend by the transcriptions, from about $0.0005
  for a short question to under a cent for a full minute. The app's monthly gate reads the spend rows and rejects with
  402 before any call.
- [A failed MP3 encode] → the WAV returns with its own content type and the failure is reported, so the paid call still
  plays.
- [A spoken room transcript that is wrong] → it posts as the member's message, which they can delete as any message.
- [Team's own room voice spend is not in the team spend view] → the voice rows set `teamId` with no `roomMessageId`,
  which the team spend query treats as private team chat. A topic room's rows count through the topic. The gap is noted
  in the subscription-billing delta and left for a kind column if a team view ever needs it.
- [Prompt drift until the sync] → bounded as above, deduped, and closed by `bun run prompts:sync:prd` after the deploy.
  - [A noisy room never reads as quiet, or a soft voice never reads as speech] → the silence threshold adapts to the
  room's ambient level above a fixed minimum, the send control sends early at any time, and the 60-second limit sends
  what was heard.

## Migration Plan

1. The migration adds two nullable-free boolean columns with defaults; it runs on deploy as every migration does.
2. The LiteLLM image stays on v1.94.0. The config's change is its comment, which the README's path rule redeploys with
   no effect, and `GEMINI_API_KEY` is already on that service.
3. Doppler prd gets nothing new: `CHAT_TRANSCRIPTION_MODEL` defaults to `gemini-3.5-transcribe`. A self-hosted instance
   sets it empty to stay off.
4. After the deploy: `bun run prompts:sync:prd`, then `bun run smoke:speech`, and the device check on carlnotes.com from
   a phone: mic prompt, container, the element playing a blob 10 seconds after its silence, the level after
   `track.stop()`, an episode pausing on the mic and the lock screen returning after Carl stops, the home-screen app,
   and a hidden page cancelling a recording.
5. Rollback is a revert: the columns stay with their defaults.

## Open Questions

- None open. The phone's LAN preview is http, and a browser opens the microphone only on https or localhost, so the
  device check runs on carlnotes.com after the deploy, where the play button covers silence that fails to play.
