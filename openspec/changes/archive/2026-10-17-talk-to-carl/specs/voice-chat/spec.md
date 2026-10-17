## ADDED Requirements

### Requirement: Voice is on only with a transcription model and a speech model
`CHAT_TRANSCRIPTION_MODEL` SHALL name Google's model that transcribes a recording, defaulting to
`gemini-3.5-transcribe`, and set empty SHALL turn voice off. Voice SHALL be on only if that model and
`PODCAST_SPEECH_MODEL` are both set, so a self-hosted instance runs without a Google key. The api SHALL report the gate
as `isVoiceChatConfigured` on the chat conversation every private chat page loads and on the chat room's message page,
and the ui SHALL render the mic and the play buttons only with it, and SHALL load the recorder's code only on a mic
tap.

#### Scenario: A self-hosted instance has no mic
- **WHEN** `CHAT_TRANSCRIPTION_MODEL` or `PODCAST_SPEECH_MODEL` is set empty
- **THEN** every composer shows its send button alone, no reply has a play button, and nothing for voice is fetched

#### Scenario: The default instance has the mic
- **WHEN** neither setting is set
- **THEN** the conversation and the room page report voice as configured, and the mic renders

### Requirement: The mic takes the send slot of an empty composer
In `ChatComposer` and `ChatRoomComposer`, the mic button SHALL render in the send button's slot, at the same 44 pixel
touch size, with the accessible name "Talk to Carl", while the box has no text and no attachment and nothing streams,
and the send button SHALL return as soon as there is text or an attachment. A tap SHALL start a recording, which sends
itself once the speaker stops, and a tap on the bar's send control SHALL send it early; there is no hold-to-talk. The
tap SHALL let the question box lose focus, so a phone keyboard closes. A visitor's mic tap SHALL route to signup the
way the send button does, and SHALL never ask for the microphone. A spent budget SHALL show the existing upgrade
notice instead of the private composer.

#### Scenario: An empty box shows the mic
- **WHEN** a signed-in user opens a chat with nothing typed
- **THEN** the send slot holds the mic, labeled "Talk to Carl", at the send button's size

#### Scenario: Typing brings the send button back
- **WHEN** the user types a character or adds an attachment
- **THEN** the send button replaces the mic

#### Scenario: A visitor's tap is the signup funnel
- **WHEN** a visitor taps the mic
- **THEN** the browser goes to signup with the chat call to action, and no permission prompt appears

### Requirement: Recording is a bar that fits a phone
A tap on the mic SHALL ask for the microphone then, never on page load, and SHALL load the recorder's code only then.
While recording, the composer SHALL become a recording bar that fits a 375 pixel wide screen: a cancel control named
"Cancel", a live level meter, a running timer, and a send control named "Send". The level meter SHALL redraw only when
its level moves a twentieth of its width. The recorder SHALL use `MediaRecorder` in the first container the browser
supports of `audio/webm;codecs=opus` and `audio/mp4`. The silence threshold SHALL adapt to the room's ambient level,
sampled when the recording starts, above a fixed minimum. A recording SHALL send itself after 1.5 seconds under the
silence threshold once speech has started, and at 60 seconds whatever was recorded. A recording SHALL cancel with the
toast "Carl didn't catch that. Please try again." if nothing rises above the silence threshold in its first 8 seconds. A
page hidden mid-recording SHALL cancel it. If the browser rejects the microphone, or the recorder's code fails to load,
the composer SHALL stay as it was and toast "Carl can't hear you. Type it, he reads fast." Every microphone track SHALL
stop at send and at cancel.

#### Scenario: The bar replaces the box
- **WHEN** a recording starts
- **THEN** the composer shows cancel, the level meter, the timer, and send, and the keyboard stays closed

#### Scenario: A minute sends itself
- **WHEN** a recording reaches 60 seconds
- **THEN** it sends as if the user had tapped send

#### Scenario: Stopping talking sends
- **WHEN** the user speaks and then stays under the silence threshold for 1.5 seconds
- **THEN** the recording sends on its own

#### Scenario: Silence cancels
- **WHEN** nothing rises above the silence threshold in the first 8 seconds
- **THEN** the recording cancels, the composer returns, and the toast reads "Carl didn't catch that. Please try again."

#### Scenario: A rejected microphone request leaves the composer
- **WHEN** the browser rejects the microphone request
- **THEN** the composer is unchanged and the toast reads "Carl can't hear you. Type it, he reads fast."

#### Scenario: A hidden page cancels
- **WHEN** the page is hidden while recording
- **THEN** the recording cancels and nothing is sent

### Requirement: A mic tap starts listen mode, which reopens the mic once Carl finishes
A mic tap SHALL start listen mode, so one tap is a whole conversation. Once the transcript sends, listen mode SHALL
wait for Carl's reply to the question, the one played for the asker with no tap, and that reply finishing SHALL reopen
the mic on its own, with no tap and no microphone prompt, on the audio context the first tap made, so the reopened
recording reads a live level on iOS. A reply with nothing to say, like a code block alone, SHALL reopen it at once. A
reply the user plays by its button SHALL never reopen the mic. A reopened recording that reads no speech above the
floor in its first 8 seconds SHALL end listen mode quietly, with no toast, since the speaker is done. Listen mode SHALL
end on the bar's cancel, on a rejected or empty transcript, on a rejected turn, on a reply that is stopped before it
finishes, on a
typed send, on a hidden page, when the composer unmounts, and if no reply ends within two minutes of the transcript
sending. While listen mode waits for Carl, the idle mic SHALL show a ring, and a tap on it SHALL interrupt him and
start a new recording. Listen mode SHALL never continue through a typed question, since a typed reply stays quiet.

#### Scenario: One tap is a conversation
- **WHEN** the user taps the mic, asks a question, and Carl finishes his spoken answer
- **THEN** the mic reopens on its own and the bar returns, with no prompt

#### Scenario: Going quiet ends the conversation
- **WHEN** a reopened recording reads no speech above the silence threshold for 8 seconds
- **THEN** it cancels with no toast, and the composer returns with the mic idle

#### Scenario: Stopping Carl ends listen mode
- **WHEN** the user stops Carl's reply before it finishes
- **THEN** the mic stays idle, and the next tap starts a fresh conversation

#### Scenario: A typed question ends listen mode
- **WHEN** the user types and sends a question while listen mode waits for Carl
- **THEN** listen mode ends, and the typed question's reply stays quiet

#### Scenario: A tap mid-reply interrupts
- **WHEN** the user taps the ringed mic while Carl is talking
- **THEN** Carl stops, and a new recording starts in a fresh listen session

#### Scenario: A reply with nothing to say reopens the mic
- **WHEN** Carl's reply to a spoken question is a code block alone
- **THEN** the mic reopens as soon as the reply finishes streaming

#### Scenario: An older reply played by its button changes nothing
- **WHEN** the user plays an older reply by its button while listen mode waits, and it plays to its end
- **THEN** listen mode keeps waiting for Carl's reply to the question

#### Scenario: A rejected turn ends listen mode
- **WHEN** the gate rejects the spoken question's turn
- **THEN** listen mode ends at once, and the composer shows the rejection as a typed turn would

### Requirement: One voice at a time
A mic tap SHALL pause a playing Podcast Episode through the podcast player store and SHALL never resume it; the docked
player SHALL show play as usual. Carl's spoken answer SHALL never play over an episode: starting one SHALL pause the
episode, and playing the episode SHALL stop Carl. Starting a recording SHALL stop a reply that is playing. Lock-screen
controls SHALL return to the episode once Carl stops.

#### Scenario: The mic pauses the episode
- **WHEN** an episode is playing and the user taps the mic
- **THEN** the episode pauses, the docked player shows play, and sending the recording does not resume it

#### Scenario: The episode stops Carl
- **WHEN** Carl is speaking a reply and the user plays the episode
- **THEN** Carl stops, and the episode plays

### Requirement: A recording is transcribed on the user's key with storage off and never kept
`POST /api/chat/transcription` SHALL take the chat page and the recording, under the per-caller rate limit and the
same authorization as a chat turn on that page, rejecting a signed-out caller before the body is read and a spent
budget with the chat's rejection. It SHALL transcode the recording with ffmpeg to 16 kHz mono WAV in memory, reading
only the containers a browser records (`matroska`, `webm`, `mov`, `mp4`, `m4a`, `ogg`) and the codecs in them (`opus`,
`aac`, `vorbis`), writing at most 61 seconds, and stopping the transcode after 10 seconds; a recording ffmpeg rejects
SHALL answer 422. It SHALL transcribe the WAV with the transcription model through Google's Interactions API on
LiteLLM's Gemini pass-through on the user's virtual key, with `store` set to false so Google saves no interaction in
the project. It SHALL record the call's cost from the response's token usage as a chat spend row, which is the only
meter of a transcription, since the pass-through charges the key nothing for it, and return the transcript. A WAV with
no samples SHALL call no model, write no spend row, and return an empty transcript. CarlNotes SHALL keep the audio only
in memory for the request. An empty transcript SHALL send nothing and SHALL toast "Carl didn't catch that. Please try
again." A failed transcription SHALL toast "Carl lost his train of thought. Please try again.", while the chat's own
failure notice keeps its retry button and no "Please try again."

#### Scenario: A recording becomes a transcript
- **WHEN** a signed-in user sends a recording on a page they may chat on
- **THEN** the route returns the transcript, and a chat spend row names the user and the page

#### Scenario: The transcription asks Google to store nothing
- **WHEN** the api transcribes a recording
- **THEN** its request to the Interactions API sets `store` to false and includes the WAV inline

#### Scenario: A silent recording calls no model
- **WHEN** the transcode returns a WAV with no samples
- **THEN** the route returns an empty transcript, no model is called, and no spend row is written

#### Scenario: A recording in another container is rejected
- **WHEN** a recording is posted in a container no browser records, such as a WAV or a playlist
- **THEN** ffmpeg rejects it and the route answers 422

#### Scenario: An empty transcript sends nothing
- **WHEN** the model returns no words - **THEN** no chat turn is sent, the composer returns empty, and the toast reads
           "Carl didn't catch that. Please try again."

#### Scenario: A spent budget transcribes nothing
- **WHEN** a user whose monthly spend is exhausted sends a recording
- **THEN** the route answers 402 with the chat's rejection, and no model is called

### Requirement: A spoken question is a chat turn with a flag and a prompt line
A transcript SHALL send through the chat turn's path with `isSpoken` true, SHALL show in the question bubble as soon as
it returns, and Carl SHALL reply under it as usual. A spoken turn SHALL splice the `chat-spoken` fragment into Carl's
system prompt: the reader said this out loud and will listen to the reply, so answer the way he would say it across the
table, in a few short sentences, with no tables, lists, headings, or links read aloud, offering more only if asked.
Topic Tools SHALL work on a spoken turn with the same propose, confirm, and toast flow. While a transcript is on its
way, the private composer's box SHALL be read-only and its send SHALL do nothing, and a spoken question SHALL send no
attachment and leave the draft and its attachments as they were. A transcript that returns after its composer closed
SHALL be dropped, and closing the chat panel SHALL silence the reply it was speaking.

#### Scenario: The transcript is the question
- **WHEN** the transcript returns
- **THEN** the question bubble shows it, the turn posts with `isSpoken`, and the reply streams under it

#### Scenario: A spoken turn reads the spoken fragment
- **WHEN** a chat turn is built with `isSpoken`
- **THEN** its system prompt includes the spoken fragment once, above the closing rules, and a typed turn's does not

#### Scenario: A draft survives a spoken question
- **WHEN** a user has a draft with an attachment, clears the text, and asks a question out loud
- **THEN** the spoken question sends without the attachment, and the attachment is still in the composer

### Requirement: Carl speaks a reply one spoken part at a time through one element unlocked by silence
`POST /api/chat/speech` SHALL take the chat page and one spoken part of text, under the speech rate limit and the chat
turn's authorization, speak it as a single-speaker `gemini-3.8-flash-tts` request on the standard tier in the podcast
host voice through LiteLLM's Gemini pass-through on the user's key, record the spend as chat spend, and return the
audio as a 64 kbps mono MP3 with `Content-Type: audio/mpeg`. If the MP3 encode fails after the paid call, the route
SHALL return the WAV with `Content-Type: audio/wav` and report the failure. Speech SHALL read a cleaned copy of the
text, with markdown, code, urls, and link cards stripped and link text kept.

The browser SHALL speak a reply as spoken parts, queued, through one audio element unlocked in the user's own tap: the
send tap for a spoken question, the play tap for a replay. A reply's first spoken part SHALL end at the first sentence
end in its first paragraph at or past 60 characters, so Carl starts talking as soon as that sentence is written, and the
rest SHALL split per paragraph, packed to at most 500 characters a spoken part. A spoken part with no letter or digit
SHALL be dropped and never spoken. While a spoken part plays, the next one SHALL be fetched. A spoken question SHALL
auto-play its reply; a typed one SHALL not. Every Carl reply in the private chat and in a chat room SHALL have a play
button that speaks it from the start and becomes stop while it plays.

The browser SHALL retry a 503 or a network failure once, after the response's `Retry-After` seconds at most 5, or 1
second without one, on the transcription post and on each speech post. A 402 SHALL stop the reply, and any other failed
spoken part SHALL be skipped while the reply goes on. Spoken audio SHALL be cached in memory for the session, keyed by
the spoken part's text, limited to 40 megabytes with the oldest spoken parts dropped first, and never stored.

#### Scenario: A spoken question is answered aloud
- **WHEN** a spoken question's reply streams
- **THEN** its short first spoken part is spoken while the rest is still being written

#### Scenario: A typed question stays quiet
- **WHEN** a typed question's reply streams
- **THEN** nothing plays until the user taps its play button

#### Scenario: Play becomes stop
- **WHEN** the user taps play on a reply
- **THEN** Carl speaks it from the start, the button reads stop, and a tap on stop ends it

#### Scenario: A spent key stops the queue
- **WHEN** the speech route answers 402 mid-reply
- **THEN** the queue stops, the text stays, and the play button remains

#### Scenario: A failed spoken part is skipped
- **WHEN** the speech route answers 502 for one spoken part of a reply
- **THEN** that spoken part is skipped and Carl speaks the next one

#### Scenario: A busy route is retried once
- **WHEN** the transcription or speech route answers 503 with `Retry-After: 5`
- **THEN** the browser posts the same request once more after five seconds

#### Scenario: A replay reuses the audio
- **WHEN** the user plays a reply whose spoken parts were already spoken this session
- **THEN** each spoken part plays from the cache and no speech request is sent

### Requirement: A spoken room message addresses Carl
In a chat room a spoken transcript SHALL post with `@carl` prefixed in place of the `@all` an unaddressed draft gets, so
it addresses Carl as a typed mention does and nobody says his name. It SHALL post as the member's message with
`isSpoken`, and Carl's reply SHALL post as text with `isSpoken`. Only the asker's browser SHALL auto-play
the reply, once; any other member's play tap SHALL spend on their own key. A reply that arrives while the asker's
composer is recording or transcribing SHALL not auto-play, and SHALL stay as text with its play button.

#### Scenario: A spoken message wakes Carl
- **WHEN** a member sends a spoken message
- **THEN** it posts with `@carl` in front, Carl's turn starts, no other member is badged, and his reply posts with the
  flag

#### Scenario: Only the asker's browser plays it on its own
- **WHEN** Carl's reply reaches every member's stream
- **THEN** the asker's browser speaks it and a teammate's shows a play button

#### Scenario: A reply waits while the asker records
- **WHEN** Carl's reply to a spoken message arrives while the asker records a follow-up
- **THEN** nothing plays, and the reply shows its play button

### Requirement: A spoken turn is stored as spoken and shows no mark
A spoken turn SHALL be stored as spoken on `chat_turns` and on `room_messages`, which splices the spoken prompt
fragment, prefixes a room message with Carl's mention, and names the turn in the spoken analytics. No chat message
SHALL show a mic mark: a mic means recording everywhere else in the app, so beside Carl's play button it reads as a
second control, and the transcript already reads as what was said.

#### Scenario: A spoken turn is marked in the row and not on the page
- **WHEN** a spoken conversation reloads
- **THEN** its rows are still stored as spoken, no message shows a mic icon, and Carl's reply shows its play button

### Requirement: A spoken event counts only where the user may use the page
`POST /api/chat/spoken-events` SHALL check the page's access alone: a topic the user may view, a team the user belongs
to, a chat room the user may use, or the new-topic chat for any signed-in user. It SHALL never read the monthly spend,
so a user whose budget is spent can still report a play. A page the user may not use SHALL count nothing, and a chat
room the user may not use SHALL answer 404.

#### Scenario: A spent budget still counts a play
- **WHEN** a user whose monthly spend is exhausted taps play on a cached reply
- **THEN** the spoken events route counts `spoken_answer_played` and reads no spend

#### Scenario: A stranger's event is not counted
- **WHEN** a user posts a spoken event naming a private topic they may not view
- **THEN** the route rejects it and nothing is counted

### Requirement: The Privacy page and the docs say what voice does
The Privacy page's Google Gemini row SHALL name what Google receives for voice: the recording of each spoken question,
transcribed with storage turned off and never kept by CarlNotes, and the text of the replies that are read aloud, which
are the replies to spoken questions and any reply a user taps play on. The row SHALL say that Google does not use any of
it to train or improve its models, and that Google may log it for a limited time only to detect abuse and make legally
required disclosures. The Coffee Talk docs page SHALL describe talking to Carl, and the group chat docs page SHALL say
a spoken message always reaches Carl.

#### Scenario: The Privacy page names what Google receives
- **WHEN** a visitor opens the Privacy page
- **THEN** the Google Gemini row names the spoken question's recording and the read-aloud reply text, says CarlNotes
  never keeps a recording, and states Google's training and abuse logging terms
