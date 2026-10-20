## MODIFIED Requirements

### Requirement: One voice at a time
A chat mic tap SHALL pause a playing Podcast Episode through the podcast player store and SHALL never resume it; the
docked player SHALL show play as usual. Carl's spoken answer SHALL never play over an episode: starting one SHALL pause
the episode, and playing the episode SHALL stop Carl. Starting a recording SHALL stop a reply that is playing.
Lock-screen controls SHALL return to the episode once Carl stops. A question asked from the docked player SHALL pause
and resume the episode by its own rules, and a chat mic tap SHALL end such a question and leave the episode paused.

#### Scenario: The mic pauses the episode
- **WHEN** an episode is playing and the user taps the mic
- **THEN** the episode pauses, the docked player shows play, and sending the recording does not resume it

#### Scenario: The episode stops Carl
- **WHEN** Carl is speaking a reply and the user plays the episode
- **THEN** Carl stops, and the episode plays

#### Scenario: The chat mic ends a podcast question
- **WHEN** Vienna is answering a question asked from the docked player and the user taps the chat mic
- **THEN** Vienna stops, the episode stays paused, and the chat recording starts

### Requirement: Carl speaks a reply one spoken part at a time through one element unlocked by silence
`POST /api/chat/speech` SHALL take the chat page, one spoken part of text, and the speaker who answered, `host` by
default or `cohost`, under the speech rate limit and the chat turn's authorization. It SHALL speak the text as a
single-speaker `gemini-3.8-flash-tts` request on the standard tier, in the podcast host voice for `host` and the
co-host voice for `cohost`, through LiteLLM's Gemini pass-through on the user's key. It SHALL record the spend as chat
spend and return the audio as a 64 kbps mono MP3 with `Content-Type: audio/mpeg`. If the MP3 encode fails after the
paid call, the route SHALL return the WAV with `Content-Type: audio/wav` and report the failure. Speech SHALL read a
cleaned copy of the text, with markdown, code, urls, and link cards stripped and link text kept.

The browser SHALL speak a reply as spoken parts, queued, through one audio element unlocked in the user's own tap: the
send tap for a spoken question, the play tap for a replay. A reply's first spoken part SHALL end at the first sentence
end in its first paragraph at or past 60 characters, so Carl starts talking as soon as that sentence is written, and the
rest SHALL split per paragraph, packed to at most 500 characters a spoken part. A spoken part with no letter or digit
SHALL be dropped and never spoken. While a spoken part plays, the next one SHALL be fetched. A spoken question SHALL
auto-play its reply; a typed one SHALL not. Every Carl reply in the private chat and in a chat room SHALL have a play
button that speaks it from the start and becomes stop while it plays. A reply Vienna gave SHALL have the same button,
which speaks it in her voice.

The browser SHALL retry a 503 or a network failure once, after the response's `Retry-After` seconds at most 5, or 1
second without one, on the transcription post and on each speech post. A 402 SHALL stop the reply, and any other failed
spoken part SHALL be skipped while the reply goes on. Spoken audio SHALL be cached in memory for the session, keyed by
the speaker and the spoken part's text, limited to 40 megabytes with the oldest spoken parts dropped first, and never
stored.

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

#### Scenario: The same words in another voice are fetched again
- **WHEN** a spoken part Carl already spoke this session is spoken in Vienna's voice
- **THEN** the cache misses and one speech request names `cohost`
