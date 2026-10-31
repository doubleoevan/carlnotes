# mobile-voice Specification

## Purpose
Let a user on the phone talk to Carl in the private chat and ask Carl and Vienna about a Podcast Episode, with the web's
controls, words, and spoken answers, through the phone's microphone and speaker, and with no recording or private audio
left running or left behind.

## Requirements

### Requirement: The mobile composer shows the web's mic in the empty send slot
In the private chat and the Team room composers, the send button's slot SHALL hold the mic, labeled "Talk to Carl", at
the platform's 44 point touch size, while the box has no text and nothing streams, and only while the conversation
reports voice as configured. Typing SHALL bring the send button back. A tap SHALL close the keyboard and start a
recording. A spent budget SHALL show the chat's budget notice in the composer's place, so no mic shows.

#### Scenario: An empty box shows the mic
- **WHEN** a signed-in user opens a chat with nothing typed on an instance with voice on
- **THEN** the send slot holds the mic, labeled "Talk to Carl", and the slot is at least 44 points

#### Scenario: Typing brings the send button back
- **WHEN** the user types a character
- **THEN** the send button replaces the mic

#### Scenario: A tap closes the keyboard
- **WHEN** the user taps the mic with the keyboard open
- **THEN** the keyboard closes and the recording bar takes the composer's place

#### Scenario: Voice off, no mic
- **WHEN** the conversation reports voice as not configured
- **THEN** the send slot holds the send button alone and no reply has a play button

### Requirement: The microphone permission is asked on the first tap
The app SHALL ask for the microphone on the first mic tap, never at launch or on a screen open, and SHALL declare the
microphone's purpose in the app config in Carl's words. A denial SHALL leave the composer as it was and show "Carl can't
hear you. Type it, he reads fast." If the phone will not ask again, the notice SHALL offer "Open settings", which opens
the app's system settings. A later tap after a grant in the settings SHALL record with no new prompt.

#### Scenario: The first tap asks
- **WHEN** a user whose phone was never asked taps the mic
- **THEN** the system microphone prompt shows, and a grant starts the recording at once

#### Scenario: A denial leaves the composer
- **WHEN** the user denies the prompt
- **THEN** the composer is unchanged and the notice reads "Carl can't hear you. Type it, he reads fast."

#### Scenario: A phone that will not ask again offers the settings
- **WHEN** the user taps the mic after the phone stopped asking
- **THEN** the notice shows Carl's line with an "Open settings" action that opens the app's system settings

#### Scenario: Launch asks nothing
- **WHEN** the app launches or a chat opens
- **THEN** no microphone prompt shows

### Requirement: Recording is the web's bar over the phone's recorder
While recording, the composer SHALL become the web's bar: "Cancel", a level meter, a running timer, and "Send". The
phone SHALL record AAC audio in an MPEG-4 file, in one channel, and SHALL feed its level readings into the shared
silence rules, so a recording sends itself 1.5 seconds after speech stops, cancels with "Carl didn't catch that. Please
try again." after 8 seconds with no speech, and sends at 60 seconds. The meter SHALL redraw only when its level moves a
twentieth of its width.

#### Scenario: The bar replaces the box
- **WHEN** a recording starts
- **THEN** the composer shows Cancel, the level meter, the timer, and Send, and the keyboard stays closed

#### Scenario: Stopping talking sends
- **WHEN** the user speaks and then stays under the silence threshold for 1.5 seconds
- **THEN** the recording sends on its own

#### Scenario: Silence cancels
- **WHEN** nothing rises above the silence threshold in the first 8 seconds
- **THEN** the recording cancels, the composer returns, and the notice reads "Carl didn't catch that. Please try again."

#### Scenario: A minute sends itself
- **WHEN** a recording reaches 60 seconds
- **THEN** it sends as if the user had tapped Send

#### Scenario: The recorder writes a file the api reads
- **WHEN** a recording ends
- **THEN** the file posts under the name `recording.mp4` with the type `audio/mp4`, and the transcription route reads it

### Requirement: The silence threshold is calibrated on hardware and recorded
The silence rule's minimum, ambient ratio, and margin SHALL be set from recordings on a real iPhone and a real Android
phone, in a quiet room and a noisy one, through the built-in microphone and a Bluetooth headset, and the measured
levels, the chosen values, and whether metering was enough or an on-device voice activity detector is needed SHALL be
recorded in the mobile guide. Until the check runs, the guide SHALL name the values as unverified.

#### Scenario: A quiet room ends the recording
- **WHEN** a user on each platform asks a short question in a quiet room and stops talking
- **THEN** the recording sends within 1.5 seconds of the last word, and the end is logged with its levels

#### Scenario: A noisy room still ends the recording
- **WHEN** a user on each platform asks a short question beside a running fan or a conversation and stops talking
- **THEN** the recording sends without cutting the question short, or the guide records that metering was not enough
  and names the detector the next change adds

#### Scenario: The values are written down
- **WHEN** the hardware check finishes
- **THEN** the mobile guide names each platform's measured ambient and speech levels and the constants chosen from them

### Requirement: An interruption cancels a recording quietly
A phone call, another app taking the audio session, a removed headset or other route change the platform stops the
recorder for, and the app leaving the foreground SHALL each cancel the recording with no notice and send nothing. No
recording SHALL continue once the recorder reports it stopped, and the microphone SHALL be released at every send,
cancel, and failure.

#### Scenario: A call arrives mid-recording
- **WHEN** a phone call interrupts a recording
- **THEN** the recording cancels, nothing is sent, and the composer returns with the mic idle

#### Scenario: The app leaves the foreground
- **WHEN** the user switches apps or locks the phone while recording
- **THEN** the recording cancels and nothing is sent

#### Scenario: The headset comes off
- **WHEN** a Bluetooth headset disconnects while recording through it
- **THEN** the recording cancels and the microphone is released

### Requirement: A recording is transcribed over the configured api
The transcription post SHALL go to the app's configured api base url with the session cookie and the device headers
every other request sends, as a file part beside the page, with the web's one retry. An empty transcript SHALL send
nothing and show "Carl didn't catch that. Please try again.", and a failed one SHALL show "Carl lost his train of
thought. Please try again." The recording file SHALL be deleted once the post ends, however it ends.

#### Scenario: The post reaches the configured api
- **WHEN** a recording is sent
- **THEN** the request goes to the configured base url with the Cookie and device headers, and the transcript returns

#### Scenario: A busy route is retried once
- **WHEN** the transcription route returns 503 with `Retry-After: 5`
- **THEN** the app posts the same recording once more after five seconds

#### Scenario: The recording file does not linger
- **WHEN** the post returns, fails, or is cancelled
- **THEN** the recording's file is gone from the app's cache

### Requirement: Listen mode works on the phone
A mic tap SHALL start listen mode: the transcript's reply, played with no tap, SHALL reopen the mic when it finishes,
with no prompt and no tap, and the idle mic SHALL show a ring while it waits. Listen mode SHALL end on the web's
endings, when the app leaves the foreground, and when another screen covers the chat. A reopened recording that hears
nothing in its first 8 seconds SHALL end listen mode with no notice.

#### Scenario: One tap is a conversation
- **WHEN** the user taps the mic, asks, and Carl finishes his spoken answer
- **THEN** the mic reopens on its own and the bar returns, with no prompt

#### Scenario: Going quiet ends the conversation
- **WHEN** a reopened recording hears no speech for 8 seconds
- **THEN** it cancels with no notice and the composer returns with the mic idle

#### Scenario: Backgrounding ends listen mode
- **WHEN** the app leaves the foreground while listen mode waits for Carl
- **THEN** listen mode ends and the mic does not reopen when the app returns

#### Scenario: Leaving the chat ends listen mode
- **WHEN** the user opens a teammate's profile or a cited link while Carl's spoken answer plays
- **THEN** listen mode ends and the mic does not reopen under the screen on top

#### Scenario: A typed question ends listen mode
- **WHEN** the user types and sends while listen mode waits
- **THEN** listen mode ends and the typed reply stays quiet

### Requirement: Carl speaks a reply through a native player over transient files
A spoken question's reply SHALL play as it streams, one spoken part at a time, in the answering host's voice, through a
player of its own beside the Podcast Episode's. A spoken part's audio SHALL stay in memory for the session, up to 8
megabytes with the least recently played dropped first, and SHALL be written to a cache file only to play. A 402 SHALL
stop the reply, and any other failed part SHALL be skipped.

#### Scenario: A spoken question is answered aloud
- **WHEN** a spoken question's reply streams
- **THEN** its first spoken part plays while the rest is still being written

#### Scenario: A typed question stays quiet
- **WHEN** a typed question's reply streams
- **THEN** nothing plays until the user taps its play button

#### Scenario: A played part leaves no file
- **WHEN** a spoken part finishes, is stopped, or fails to play
- **THEN** its file is gone from the cache, and a replay writes a new one from memory with no speech request

#### Scenario: A spent key stops the queue
- **WHEN** the speech route returns 402 mid-reply
- **THEN** the queue stops, the text stays, and the play button remains

#### Scenario: The launch sweeps leftovers
- **WHEN** the app launches after a crash left a spoken part's file behind
- **THEN** the file is deleted before anything plays

### Requirement: Every host reply has a play button
Every Carl reply in the private chat and in a Team room, and every reply Vienna gave, SHALL show a play button beside
its copy button, labeled "Play message", which speaks the reply from the start in that host's voice and becomes "Stop"
while it plays. Starting a recording SHALL stop a reply that is playing, and starting a reply SHALL pause a playing
Podcast Episode.

#### Scenario: Play becomes stop
- **WHEN** the user taps play on a reply
- **THEN** the host speaks it from the start, the button reads "Stop", and a tap on Stop ends it

#### Scenario: Vienna's reply is in her voice
- **WHEN** the user taps play on a reply Vienna gave
- **THEN** each speech request names `cohost`

#### Scenario: The mic stops the reply
- **WHEN** the user taps the mic while a reply plays
- **THEN** the reply stops and the recording starts

### Requirement: A spoken room message is the asker's alone to hear
In a Team room a spoken transcript SHALL post with Carl's mention in front, as the member's message, and Carl's reply
SHALL play on its own only on the phone that asked, once. A teammate's phone SHALL show the reply with its play button
and play nothing. A reply that arrives while the asker records or transcribes a follow-up SHALL not play. A reply the
stream replays after a reconnect SHALL not play again.

#### Scenario: Only the asker's phone plays it
- **WHEN** Carl's reply reaches every member's stream
- **THEN** the asker's phone speaks it and a teammate's shows a play button

#### Scenario: A reconnect replays nothing
- **WHEN** the room stream reconnects and delivers Carl's reply again
- **THEN** the reply does not play a second time

#### Scenario: A reply waits while the asker records
- **WHEN** Carl's reply arrives while the asker records a follow-up
- **THEN** nothing plays and the reply shows its play button

### Requirement: The cutoff and a spent budget say the web's words without a plans link
A mic tap past the spoken questions cutoff SHALL show "Speak with Carl again on the 1st." in a chat and "Speak with Carl
and Vienna again on the 1st." from the podcast player, with no plans link and no upgrade line, since the app sells
nothing. A spent budget on a podcast mic tap SHALL show "Carl is staring at an empty mug." with no action. Text chat
SHALL stay available past the cutoff.

#### Scenario: The cutoff names the 1st
- **WHEN** a user whose spoken questions are paused taps the chat mic
- **THEN** the notice reads "Speak with Carl again on the 1st." and nothing records

#### Scenario: A spent budget on the player
- **WHEN** a user whose monthly budget is spent taps the podcast mic
- **THEN** the notice reads "Carl is staring at an empty mug.", no microphone prompt appears, and the Podcast Episode is
  as it was

### Requirement: The podcast player has the question controls
The docked player SHALL show "Talk with Carl and Vienna" beside its play button at the play button's size, and the
player card after the speed button in the card's control shape, only while the Podcast Episode reports voice as
configured and has a Topic. While a question records, every podcast mic slot SHALL be "Send", and one control, "Cancel"
while listening and "Stop" after, SHALL take the skips' place. A visitor's tap SHALL open sign-up with the podcast
question's prompt.

#### Scenario: The mic sits beside play
- **WHEN** a signed-in user has a Podcast Episode loaded in the dock
- **THEN** the mic is beside play at the same size, labeled "Talk with Carl and Vienna"

#### Scenario: The card has the mic after its speed button
- **WHEN** a user opens the player card on a Topic or a Podcast Episode screen
- **THEN** the mic sits after the speed button in the card's control shape

#### Scenario: A visitor's tap is the sign-up funnel
- **WHEN** a visitor taps the mic
- **THEN** sign-up opens with the podcast question's prompt and no permission prompt appears

#### Scenario: The stop control replaces the skips
- **WHEN** a question records, then waits, then a host answers
- **THEN** the skips give way to Cancel, then Stop, and the mic slot reads Send while recording

### Requirement: The chapter line and the lock screen name the question's state
While a question is in progress, the dock's chapter line SHALL read "Listening", "Thinking", then "Carl's answering" or
"Vienna's answering", and SHALL announce each change to the screen reader. While a host answers, the lock screen SHALL
show that host's name as the title, the podcast's name, and the Podcast Episode's cover, and SHALL show the Podcast
Episode again once the answer ends.

#### Scenario: The chapter line shows the state
- **WHEN** a question records, then waits, then Vienna answers
- **THEN** the chapter line reads "Listening", then "Thinking", then "Vienna's answering", each announced

#### Scenario: Vienna is on the lock screen while she talks
- **WHEN** Vienna answers with the phone locked
- **THEN** the lock screen shows "Vienna" with the Podcast Episode's cover, and the Podcast Episode once she finishes

### Requirement: A podcast question pauses and resumes the Podcast Episode by the web's rules
A tap SHALL pause a playing Podcast Episode and record. When the host finishes, the Podcast Episode SHALL resume where
it paused after 600 milliseconds. A stop while listening, thinking, or answering, an empty or rejected transcript, a
failed turn, and an answer with nothing to speak SHALL resume it at once. A lock-screen pause or a removed headset while
a host talks, a seek, or a chapter skip SHALL stop the answer and leave the Podcast Episode paused, as SHALL a sign-out.

#### Scenario: The Podcast Episode comes back after the answer
- **WHEN** Carl finishes answering a question asked while the Podcast Episode played
- **THEN** after 600 milliseconds the Podcast Episode plays from where it paused

#### Scenario: Cancelling the recording resumes the Podcast Episode
- **WHEN** the user taps Cancel while listening
- **THEN** nothing is sent and the Podcast Episode plays from where it paused

#### Scenario: A lock-screen pause stays paused
- **WHEN** the user pauses from the lock screen while Carl is answering
- **THEN** Carl stops and the Podcast Episode stays paused

#### Scenario: A paused Podcast Episode stays paused
- **WHEN** the user taps the mic while the Podcast Episode is paused, and Carl finishes
- **THEN** the Podcast Episode stays paused

#### Scenario: A sign-out during a question
- **WHEN** the user signs out while Carl is thinking or answering a question asked while the Podcast Episode played
- **THEN** the question ends, the Podcast Episode stays paused, and the next account's podcast mic works

### Requirement: The system's audio events stop an answer by platform rules
A phone call, another app taking the audio, and a removed headset SHALL stop a playing answer and end listen mode, and
the Podcast Episode SHALL stay paused. Leaving the foreground SHALL let an answer finish through background audio and
reopen no mic. The chat mic SHALL pause a playing Podcast Episode and never resume it, and playing the Podcast Episode
SHALL stop a reply. Recording and answers SHALL use the system's current audio route, built-in or a headset, with no
picker of the app's own.

#### Scenario: A call stops the answer
- **WHEN** a phone call arrives while Carl answers
- **THEN** Carl stops, listen mode ends, and the Podcast Episode stays paused

#### Scenario: The answer finishes in the background
- **WHEN** the user locks the phone while Carl answers a podcast question
- **THEN** the answer plays to its end, the Podcast Episode resumes after it, and no recording starts

#### Scenario: The headset is the microphone and the speaker
- **WHEN** a Bluetooth headset is connected
- **THEN** the recording reads its microphone and the answer plays through it

### Requirement: Private audio stays out of logs and leaves with the session
No transcript, recording, spoken part, or audio file path SHALL reach error reporting or analytics. Sign-out and an
account switch SHALL stop any recording and any answer, drop the session's spoken audio from memory, and delete every
transient audio file. Recordings and spoken parts SHALL live only in the app's cache directory, which the platform
excludes from backups.

#### Scenario: Sign-out clears the audio
- **WHEN** a user signs out while a reply plays
- **THEN** the reply stops, the cache holds no spoken part and no recording, and the memory cache is empty

#### Scenario: An error report names no content
- **WHEN** a speech or transcription request fails and is reported
- **THEN** the report includes the route and the status and no transcript, audio, or file path

### Requirement: Stories cover the voice states
The on-device Storybook SHALL show the mic idle, ringed, and in the send slot, the recording bar at each level, the
play button playing and stopped, and the podcast question controls in each phase, each story naming its web reference,
in both palettes and at enlarged text.

#### Scenario: A reviewer compares a state with the web
- **WHEN** the reviewer opens the recording bar story at the largest text size
- **THEN** Cancel, the meter, the timer, and Send fit a 375 point width, and the story names the web component
