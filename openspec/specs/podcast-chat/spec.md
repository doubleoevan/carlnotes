# podcast-chat Specification

## Purpose
TBD - created by archiving change talk-from-the-podcast-player. Update Purpose after archive.
## Requirements
### Requirement: The docked player and the podcast card have a mic
The docked podcast player SHALL show a mic button beside its play button, at the play button's 44 pixel size, with
"Talk with Carl and Vienna" as both its accessible name and its tooltip. The topic page's podcast card SHALL show the
same mic after its playback speed button, in the card's own control shape, while its episode is the one loaded, and
both mics SHALL ask about the loaded episode. On a 375 pixel wide screen the row SHALL fit with the play button whole,
and the title and the chapter line SHALL truncate instead. The api SHALL report `isVoiceChatConfigured` on every Podcast
Episode it returns, and the mic SHALL render only if it is true. A visitor's tap SHALL route to signup with the
`podcast-question` call to action, and SHALL never ask for the microphone. A tap SHALL load the topic's private
conversation first, and if the user's monthly budget is spent, SHALL toast "Carl is staring at an empty mug." with a
"Pick up more coffee" action that opens the plans page, ask for no microphone, and leave the episode as it was. A tap
SHALL load nothing for voice until then.

#### Scenario: The mic sits beside play
- **WHEN** a signed-in user has an episode loaded in the docked player on a 375 pixel wide screen
- **THEN** the mic is beside play at the same size, its tooltip reads "Talk with Carl and Vienna", and play is whole

#### Scenario: The podcast card has the mic beside its speed button
- **WHEN** a listener plays the episode on a topic page's podcast card
- **THEN** the card shows the mic after the 1x speed button, and a tap on it asks about the playing chapter

#### Scenario: No voice, no mic
- **WHEN** `CHAT_TRANSCRIPTION_MODEL` or `PODCAST_SPEECH_MODEL` is set empty
- **THEN** neither the docked player nor the podcast card shows a mic

#### Scenario: A visitor's tap is the signup funnel
- **WHEN** a visitor taps the mic in the docked player
- **THEN** the browser goes to signup with the `podcast-question` call to action and its toast, and no permission
  prompt appears

#### Scenario: A spent budget toasts the upgrade line
- **WHEN** a user whose monthly budget is spent taps the mic
- **THEN** the toast reads "Carl is staring at an empty mug." with a "Pick up more coffee" action, and no microphone
  prompt appears

### Requirement: A question ends itself once the listener stops talking
A tap SHALL pause a playing episode and start a recording through the chat's recorder and transcription route. The
recording SHALL end itself 1.5 seconds after the listener stops talking once speech has started, as decided on the
device by `@ricky0123/vad-web`. The VAD code, its Silero model, its worklet, and its WebAssembly runtime SHALL be served
from the app's own `/assets/` path and loaded on the first tap only, never with the page. A speech blip shorter than
the VAD's minimum SHALL not count as speech. The recording SHALL start at once, without waiting for the VAD to load.
Until the VAD has loaded, and for the whole recording if it fails to start, the recording SHALL end on the chat's
level-based silence instead. Send SHALL end the recording early, and cancel SHALL drop it. The chat's 60-second limit
SHALL send whatever was recorded. Nothing heard in the first 8 seconds SHALL cancel with the toast "Carl didn't catch
that. Please try again.", the same as an empty transcript. A podcast question SHALL never reopen the mic after its
answer.

#### Scenario: Going quiet sends the question
- **WHEN** a listener asks a question and then says nothing for 1.5 seconds
- **THEN** the recording sends without a tap

#### Scenario: The VAD loads only on a tap
- **WHEN** a page with the docked player loads
- **THEN** no VAD file is fetched until the mic is tapped

#### Scenario: A VAD that fails to start still ends the recording
- **WHEN** the VAD cannot start on the device
- **THEN** the recording still sends itself 1.5 seconds after the listener's level drops under the silence threshold

#### Scenario: Silence cancels
- **WHEN** the VAD hears no speech in the first 8 seconds
- **THEN** the recording cancels with "Carl didn't catch that. Please try again." and the episode resumes

### Requirement: A podcast question reads the chapter it was asked during
The transcript SHALL post to the private chat on the episode's Topic through the topic chat turn route, as a spoken
turn, with the episode's id and the position of the chapter at the playback position when the mic was tapped, after
loading that conversation's history the way the chat panel does. The route SHALL reject the turn with 404, before
any model call, unless the episode is a published Podcast Episode of that Topic and the position is one of its
chapters. A podcast chat turn SHALL send no attachment. A Team's or the new-topic chat SHALL ignore a turn's
podcast episode, and only a Topic's chat SHALL read it.

The hosts SHALL be given, fenced as untrusted, the episode's title, the chapter's title, and the chapter's script lines
with each speaker's name. If the Topic still shows the chapter's Finding, they SHALL also be given the Finding's
summary, which is its Resource's snippet, the Finding's relevance explanation, and the Resource's stored content,
limited the way the episode's script writer reads it. A chapter whose Finding was filtered out or rated down SHALL still
give its title and its script lines. Retrieval SHALL rank the Topic's Findings against the chapter's title and the
question together. The turn SHALL splice the spoken fragment, so the host answers short and out loud, and SHALL use no
tools.

#### Scenario: A vague question is answered from the chapter
- **WHEN** a listener asks "what did he mean by that" during chapter 3
- **THEN** the turn's prompt includes chapter 3's script lines and its Finding's summary, relevance explanation, and
  content, and the answer is about that Finding

#### Scenario: An episode of another topic is rejected
- **WHEN** a podcast chat turn names an episode that belongs to a different Topic, or a chapter position the episode
  lacks
- **THEN** the route responds 404 and no model is called

#### Scenario: A filtered-out chapter keeps its lines
- **WHEN** a listener asks during a chapter whose Finding a Scan filtered out
- **THEN** the turn's prompt includes the chapter's title and script lines, and no Finding fields

#### Scenario: The chapter's material is fenced
- **WHEN** the chapter's stored content includes an instruction
- **THEN** it reaches the prompt inside the untrusted fence, and the host does not follow it

### Requirement: The question picks the host who answers
A podcast chat turn SHALL be one model call with structured output whose speaker comes first: `host` for Carl or
`cohost` for Vienna, validated with Zod, and the answer. The api SHALL stream the speaker to the browser as its own
reply line before the answer's text, so choosing adds no wait. A question that names Carl or Vienna SHALL go to that
host. Otherwise, a question about what a source said, a fact, a number, or what a line meant SHALL go to Carl. A
question about why it matters, what Vienna thinks, or what she would do SHALL go to Vienna, who is in the topic
follower's place. When neither fits, Carl SHALL answer. Each host SHALL answer in the voice that the podcast hosts
prompt gives them. If the speaker fails validation, Carl SHALL answer, and a turn stopped before its speaker arrived
SHALL be stored as Carl's. Only a podcast chat turn SHALL be answered by Vienna. A typed chat turn and a chat mic turn
SHALL always be Carl's.

#### Scenario: A question that names Vienna gets Vienna
- **WHEN** a listener asks "Vienna, would you try this?"
- **THEN** the speaker line is `cohost` and Vienna answers

#### Scenario: A why-it-matters question gets Vienna
- **WHEN** a listener asks why this chapter matters to them
- **THEN** Vienna answers

#### Scenario: A what-did-it-say question gets Carl
- **WHEN** a listener asks what the article said about the price
- **THEN** Carl answers

#### Scenario: An unclear question gets Carl
- **WHEN** a listener's question fits neither host
- **THEN** Carl answers

#### Scenario: The speaker arrives before the words
- **WHEN** a podcast chat turn streams
- **THEN** the speaker line is written before the first text line

### Requirement: The answering host speaks in their own voice
The browser SHALL speak a podcast chat turn's answer as spoken parts through the chat's spoken answer queue, with the
speaker on every speech post, so `recordSpokenAnswer` records Carl's answer in the host voice and Vienna's in the
co-host voice. A play tap on a Vienna reply in the chat SHALL replay it in her voice.

#### Scenario: Vienna's answer is in her voice
- **WHEN** Vienna answers a podcast question
- **THEN** each speech post names `cohost`, and the speech request uses the co-host voice

### Requirement: The answering host takes the question like a call-in
The answer SHALL open the way a live show's host takes a listener's call: a few words of the answering host's own, such
as a quick word to the listener, an aside to the other host, or a beat of surprise, before the answer itself. The
prompt SHALL set the rule and never give the words, so the opening is worded differently each time. It SHALL never
call the listener by a name, greet them, or praise the question, and it SHALL stay within a short sentence.

#### Scenario: Vienna takes the question, then answers
- **WHEN** a listener asks Vienna why a finding matters
- **THEN** her answer opens with a few words of her own that take the question, then says why it matters

#### Scenario: No name and no praise
- **WHEN** any podcast question is answered
- **THEN** the opening neither names the listener nor calls it a great question

### Requirement: The player shows the question's state and resumes the episode
While a question is in progress, the docked player's chapter line SHALL read "Listening" while it records or
transcribes, "Thinking" until the first spoken word plays, and "Carl's answering" or "Vienna's answering" while that
host talks. One stop control SHALL take the place of the skip buttons, named "Cancel" while listening and "Stop"
after. While recording, every podcast mic slot on the page SHALL be the send control, named "Send", whichever mic was
tapped. While the microphone is asked for, while the transcript is on its way, and while thinking, it SHALL show a
spinner. While a host answers, it SHALL show the mic, disabled.

When the host finishes, the episode SHALL resume where it paused after a beat of 600 milliseconds. A stop while
listening, thinking, or answering SHALL resume it at once. So SHALL an empty or rejected transcript, a rejected or
failed turn, and an answer with nothing to speak. A lock-screen or headphone pause while a host talks, or a seek or a
chapter skip, SHALL stop the answer and leave the episode paused. A tap on play SHALL end the question and play the
episode. A chat mic tap SHALL end a podcast question and leave the episode paused. An episode that was paused when the
mic was tapped SHALL stay paused after the answer. If the browser does not resume, the player SHALL show play.

#### Scenario: The episode comes back after the answer
- **WHEN** Carl finishes answering a question asked while the episode played
- **THEN** after a short beat the episode plays from where it paused

#### Scenario: Stopping the answer resumes the episode
- **WHEN** the listener taps stop while Vienna is answering
- **THEN** she stops and the episode plays from where it paused

#### Scenario: Cancelling the recording resumes the episode
- **WHEN** the listener taps cancel while listening
- **THEN** nothing is sent and the episode plays from where it paused

#### Scenario: A pause while a host talks stays paused
- **WHEN** the listener presses pause on the lock screen while Carl is answering
- **THEN** Carl stops and the episode stays paused

#### Scenario: A seek while a host talks stays paused
- **WHEN** the listener seeks while Vienna is answering
- **THEN** she stops, and the episode stays paused at the new position

#### Scenario: A paused episode stays paused
- **WHEN** the listener taps the mic while the episode is paused, and Carl finishes
- **THEN** the episode stays paused

#### Scenario: The chapter line shows the state
- **WHEN** a question records, then waits, then Vienna answers
- **THEN** the chapter line reads "Listening", then "Thinking", then "Vienna's answering", each beside a stop

### Requirement: The lock screen names the answering host
While a host answers a podcast question, the lock screen SHALL show that host's name as the title, the podcast's name
as the artist, and the episode's cover. Once the answer ends, it SHALL show the episode again.

#### Scenario: Vienna is on the lock screen while she talks
- **WHEN** Vienna answers a podcast question with the phone locked
- **THEN** the lock screen shows "Vienna" with the episode's cover, and the episode once she finishes

### Requirement: The exchange is saved in the topic's private chat with a tag
A podcast chat turn SHALL be stored in the Topic's private chat as a spoken chat turn of kind `podcast`, with the
episode's id, the chapter's position, and the answer's speaker. The stored question SHALL end with a note naming the
episode, the chapter, and who answered, the way an attachment note ends a question, so later turns' history includes it.
The note SHALL read `[asked while listening to "<episode title>", chapter <n>, "<chapter title>"; <host> answered]`,
with the chapter title cut to 120 characters. Later turns' history SHALL replay the note fenced as untrusted data,
since a model wrote the titles in it. The chat SHALL show the note as a tag under the question instead of as
text, and a tap on the tag SHALL play the episode from the start of that chapter. The tag SHALL survive a reload from
the row's episode id and chapter position. A reply Vienna gave SHALL show her avatar and name, and every other reply
SHALL stay Carl's. If the chat panel shows that Topic's private chat, the turn SHALL appear there live. Otherwise it
SHALL be there the next time it opens. The panel SHALL never open on its own.

#### Scenario: A podcast chat turn reloads with its tag and its host
- **WHEN** a user asks Vienna a question from the player and later opens the topic's chat
- **THEN** the question shows a tag naming the episode and the chapter, and the reply shows Vienna's avatar and name

#### Scenario: The tag plays the moment
- **WHEN** the user taps the tag
- **THEN** the episode plays from the start of that chapter

#### Scenario: An open panel shows the turn live
- **WHEN** the chat panel shows the topic's private chat while a podcast question streams
- **THEN** the question and the streaming reply appear in it

#### Scenario: A closed panel stays closed
- **WHEN** a podcast question is answered while the chat panel is collapsed
- **THEN** the panel stays collapsed, and the turn is there when it opens

#### Scenario: A later turn knows who said what
- **WHEN** the user types a follow-up after Vienna answered from the player
- **THEN** the history sent with it includes the note, fenced as untrusted data, saying that Vienna answered

