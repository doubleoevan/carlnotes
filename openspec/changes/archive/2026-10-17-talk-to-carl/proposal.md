## Why

Coffee Talk is typed only. On a phone, typing a question to Carl and reading three paragraphs back is the slow part of
the app, and the podcast already proves people like hearing him. Voice is the proof of concept: a mic in the chat
composers, spoken questions transcribed and sent like typed ones, and Carl's replies spoken back in his podcast voice,
built for the web on phones first.

## What Changes

- A mic button takes the send button's slot in `ChatComposer` and `ChatRoomComposer` while the box is empty. A tap asks
  for the microphone, records with `MediaRecorder`, and turns the composer into a recording bar: cancel, a live level
  meter, a timer, and send. A recording sends itself once the speaker stops, at 60 seconds at the latest, and cancels
  after 8 seconds with no speech.
- A new `POST /api/chat/transcription` route transcodes the recording to 16 kHz mono WAV with ffmpeg in memory, reading
  only the containers and codecs a browser records, at most 4 at a time per process, and transcribes it with
  `gemini-3.5-transcribe` through Google's Interactions API on LiteLLM's Gemini pass-through, on the user's virtual key,
  with `store: false` so Google saves no interaction. LiteLLM stays on v1.94.0. CarlNotes never stores the audio, and a
  silent recording calls no model.
- A spoken question sends through the chat turn path with an `isSpoken` flag, stored on `chat_turns.is_spoken`. A spoken
  turn splices one prompt fragment, `chat-spoken.md`, into Carl's system prompt: the reader said this out loud and will
  listen to the reply, so answer in a few short sentences with no tables, lists, headings, or links. - A new `POST
  /api/chat/speech` route speaks one spoken part of a reply as a single-speaker `gemini-3.8-flash-tts` request in Carl's
  podcast host voice, through the Gemini pass-through on the user's key, and returns it as an MP3. The browser speaks a
  reply as spoken parts, a short first one as soon as its first sentence is written and then a paragraph at a time,
  through one audio element unlocked in the user's own tap, retrying a busy route once and skipping a spoken part that
  fails. A spoken question auto-plays its reply. Every Carl reply gets a play button that becomes stop.
- One voice at a time: the mic and a spoken answer pause a playing Podcast Episode, the episode stops Carl, and a new
  recording stops a reply. Lock-screen controls return to the episode once Carl stops.
- In a chat room a spoken message always addresses Carl, prefixed with `@carl` in place of `@all`, so nobody says his
  name. It posts as the member's message with `room_messages.is_spoken`, Carl's reply posts as text with the same flag,
  only the asker's browser auto-plays it, and anyone else's play tap spends on their own key.
- Transcription and speech spend write text-less chat turn rows, so they count toward the monthly spend the way chat
  turns do, priced from a transcription rate beside the speech rates in `worker/budget.ts`. The pass-through charges the
  key nothing for a transcription, so its spend row is its only meter.
- A spoken turn is stored as spoken, which splices the spoken prompt fragment and names the turn in the analytics. No
  message shows a mic mark, since a mic means recording everywhere else in the app.
- Voice stays off, mic hidden, if no transcription or speech model is configured, through a new
  `CHAT_TRANSCRIPTION_MODEL` beside `PODCAST_SPEECH_MODEL`.
- Two user events through the hosted-only analytics: `spoken_question_sent` with the seconds recorded, the transcription
  time, and the time from send to Carl's first spoken word, and `spoken_answer_played` on a play tap.
- The Privacy page says what Google receives for voice, the spoken question's recording, sent with storage off and
  never kept by CarlNotes, and the text of every reply read aloud, with Google's training and abuse logging terms. The
  Coffee Talk docs page and the group chat page describe talking to Carl. The topic chat eval gets a spoken-question
  case.
- A voice model failure other than a spent budget is reported to Sentry under a fixed message per model call and
  outcome.

## Capabilities

### New Capabilities

- `voice-chat`: the mic, the recording bar, transcription, spoken questions and replies, one voice at a time, the voice
  mark, the configured gate, and the privacy and docs copy.

### Modified Capabilities

- `team-chat`: a spoken message addresses Carl; Carl's bubble shows a play button; transcription and
  speech bill the asker, a replay bills the listener.
- `topic-chat`: the voice routes reuse the chat turn's gate; transcription and speech spend meter against the monthly
  budget; the spoken flag persists and replays; a signed-out transcription post is rejected before its body is read.
- `topic-detail-page`: a visitor's mic tap is part of the signup funnel; the mic sits in the composer's send slot.
- `domain-schema`: `chat_turns` and `room_messages` gain `is_spoken`, and a chat turn row records transcription and
  speech spend.
- `speech-model-routing`: no transcription alias, a transcription rate that the app's spend row alone meters, and a
  single-speaker standard-tier request beside the two-speaker one.
- `podcast-episode-rendering`: voice shares the no-speech-model gate.
- `podcast-episode-player`: the mic and a spoken answer pause the episode; the episode has its own audio element and
  Carl's replies theirs; lock-screen controls return to the episode.
- `request-capacity`: the transcription route sets its own body limit and limits the process's transcodes, the speech
  route has its own per-caller limit and a per-user in-progress limit, and the spoken events route has its own limiter.
- `monitoring-analytics`: the two spoken events, `isSpoken` on `chat_turn_sent` and `room_message_sent`, and voice model
  failures reported to Sentry.
- `subscription-billing`: transcription and speech rows count as chat spend.
- `deploy-mechanics`: the api transcodes recordings and encodes spoken replies to MP3 with ffmpeg too.
- `eval-harness`: the topic chat eval checks a spoken question.

## Impact

- `litellm-config.yaml`: the comment on how speech and transcription go through the pass-through. The LiteLLM image is
  unchanged.
- `shared/`: `voiceChat.ts` (the gate and `CHAT_TRANSCRIPTION_MODEL`), `spokenText.ts` (the text speech reads),
  `payloads.ts`, `contracts/chat.ts`, `analytics.ts`.
- `db/schema/chat.ts` and a generated migration: `is_spoken` on both tables.
- `worker/`: `ffmpeg.ts` (one helper under the cover encode, the episode join, and the transcode), `transcription.ts`,
  the single-speaker request in `speech.ts`, the transcription rate in `budget.ts`, `prompts/chat-spoken.md`, the
  spoken block in `chat/chatPrompts.ts`, and the spoken cue in the room transcript.
- `api/chat/`: `voiceRoute.ts` (transcription, speech, spoken events), the spoken flag through `privateChat.ts`,
  `chatTurns.ts`, `room.ts`, `roomTurns.ts`, `roomQuestion.ts`, `roomMessages.ts`, and a spend row helper.
- `ui/src/`: the recorder, the recording bar, the mic button, the spoken answer store and audio element, the play
  button, the paragraph queue in `useTopicChat`, the room auto-play in `useChatRoom`, the widened room
  client, the configured flag on the conversation and room page, and a pause export on the podcast player store.
- Copy and docs: `PrivacyPage.tsx`, `docs/src/content/docs/feed/chat.md`, `docs/src/content/docs/teams/group-chat.md`,
  `.env.example`, `README.md`, the module guides, the domain-model and prompt-authoring skills.
- Evals and tests: a spoken case in `evals/topic-chat/` with its calibration cases, and unit tests across the gates,
  the budget, the empty transcript, the text cleanup, the flags, and the room rule.
