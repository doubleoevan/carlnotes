## Context

Talk to Carl (archived 2026-10-17) added voice to the chat:
- `useVoiceRecording` with `ui/src/lib/voiceRecorder.ts` records, and the end of speech comes from an `AnalyserNode`
  level loop with an adaptive silence threshold.
- `POST /api/chat/transcription` transcribes on the user's key with storage off.
- A transcript posts as a chat turn with `isSpoken`, which splices `chat-spoken.md`.
- `spokenAnswerStore` speaks the reply in spoken parts through `POST /api/chat/speech`, which calls
  `recordSpokenAnswer` in Carl's voice alone.
- The podcast player store and the spoken answer store keep one voice at a time.
- Two events measure it: `spoken_question_sent` and `spoken_answer_played`.

Where the player change touches the code today:
- **The docked player.** `PodcastEpisodeAudio.tsx` renders the row: cover, title, chapter line, `SkipPlaybackButtons`,
  play. The chapter line reads from `toChapterIndexAt(chapters, positionSeconds)`.
- **Chat state.** The private chat's conversation is hook-local state in `useTopicChat`, mounted only while
  `PrivateChatPanel` shows that chat. No store outside the panel can append a turn.
- **Chapters.** `episode_chapters` keys a chapter by `(episode_id, position)`. The episode's stored script keeps the
  turns, and `toChapterTurns(script)[position]` returns exactly the turns that play during that chapter's time,
  including the cold open, a segment's transition, and the sign-off. A filtered-out Finding is hard-deleted, so the
  chapter's `finding_id` goes null while its `resource_id`, title, and source url stay.
- **The finding fields.** There is no finding summary column. The podcast script writer labels the Resource's
  `snippet` as the summary and limits the stored content with `toLimitedWords(content, MAX_RESOURCE_WORDS)`.
- **The model call.** `streamChatReply` calls `streamText` with tools. `toCompletion` stores `replyStream.text`, which
  in `ai` 7.0.137 is the final step's text only.
- **The chat turn row.** `chat_turns` has no kind. Five writers decide the shape by which columns they fill:
  `saveChatTurn`, `recordChatSpendRow` (twice), `recordChatRoomTurn`, and the room smoke fixture. Readers infer the
  kind the same way: `toSpendByTeamId` checks `roomMessageId is not null`, and `loadChatTurns` and `clearChatTurns`
  check text nulls under `toPageFilter`.
- **The voice gate.** `isVoiceChatConfigured` reaches the ui only on the chat conversation and the room page.
- **Vienna.** Her avatar is staged at `ui/src/assets/vienna-avatar.png`, unused. `PODCAST_EPISODE_SPEAKER_NAMES` in
  `shared/podcastEpisodes.ts` maps `host` and `cohost` to the names transcripts show.
- **The CSP.** `api/index.ts` sets no `script-src`, `worker-src`, or `connect-src`, so WebAssembly, an AudioWorklet,
  and same-origin fetches load as they are.

## Goals / Non-Goals

**Goals:**

- Ask about what is playing without leaving the player, hands-free once the mic is tapped, and get back to the episode
  on its own.
- The right host answers in their own voice, with the choice made inside the answer's own model call.
- The exchange lives in the topic's private chat, and a later turn knows the context and who answered.
- Every chat turn row names its kind, enforced by the database, with every spend total unchanged.

**Non-Goals:**

- Talking over a host to interrupt. As in the chat, the phone's speaker feeds the mic.
- Both hosts answering one question.
- Vienna in the typed chat or from the chat mic.
- Asking from a third-party podcast app.
- Listen mode in the player. One tap is one question, then the episode resumes.
- Switching the chat mic to the VAD. The chat is used with the phone in hand, usually somewhere quiet enough for the
  level loop. Its first mic tap would download 16.5 MB, and the player's device check is the evidence to decide on
  later.
- Counting a Team's own room voice spend in the team's chat spend total. Every voice row already bills the member who
  spoke or tapped play, on their own monthly budget. Only the team page's chat spend figure leaves it out, and that is
  fractions of a cent a question.

## Decisions

### The question rides the topic chat turn route with a chapter field

`topicChatTurnPayload` extends `chatTurnPayload` with an optional `podcastEpisodeChapter: { podcastEpisodeId,
chapterPosition }`, used only by `POST /topics/:id/chat`. A refine requires `isSpoken` and no attachments when the field
is set. The team and new-topic routes keep the base payload, so zod strips the field there and a podcast episode chapter
can never reach those chats.

After `authorizeChatTurn`, the handler calls `loadPodcastEpisodeChapterContext({ topicId, podcastEpisodeId,
chapterPosition })` from a new `worker/chat/retrievePodcastEpisodeChapter.ts`. It returns null unless the episode row's
`topic_id` is the route's topic, its status is `published`, and a chapter row has that position. The route then
responds 404 `{ error: "not found" }` before loading the key or calling a model. The topic's view rule already governs
the episode, since a published episode of a topic is visible wherever the topic is.

The context holds the episode's title, the chapter's title and position, and the chapter's turns from
`toChapterTurns(script)[position]`. If the chapter's `finding_id` is set, it also holds the Resource's snippet as the
summary, the Finding's relevance explanation, and the stored content read through the same reader and
`MAX_RESOURCE_WORDS` limit that the script writer uses. That way the host answers from what they read when writing
the chapter. A chapter whose Finding is gone has its title and turns only.

Retrieval ranks against `${chapterTitle}\n${question}` through the existing `retrievalQuestion` input, so "what did
he mean by that" still pulls the chapter's neighbors.

Alternative: a new `/podcast/questions` route. It would duplicate the rate limit, the signed-out rejection, the
authorization, the budget event, the stream writer, and the row write that the chat route already has.

### One structured call picks the speaker, streamed first

A podcast chat turn calls `streamText` with `output: Output.object({ schema: podcastReplySchema })`, where
`podcastReplySchema = z.object({ speaker: z.enum(podcastEpisodeSpeakers), answer: z.string() })`, with speaker first. It
calls no tools: web search would add a second step and seconds of dead air while the episode waits, and a Topic Tool
proposal needs the chat's card, which the player does not show. The provider's JSON schema decoding writes the keys in
schema order, so the speaker is complete within the first tokens.

`streamPodcastReply` in `worker/chat/podcastReply.ts` reads the stream's text deltas, the reply's json as the model
writes it, through `parsePartialJson`:
- It yields one `{ type: "speaker" }` part as soon as the partial's speaker is a whole host value. A speaker that is
  neither host becomes `host` once the answer has started, and a reply that never names one is `host`.
- An answer the model writes before its speaker waits for the speaker, since the provider is asked for schema order
  but not bound to it, so a Vienna answer is never spoken in Carl's voice.
- It then yields `text-delta` parts from each partial answer's growth.

`writeReplyStream` writes the speaker part as a new `ChatReplyLine`, `{ type: "speaker"; speaker }`, ahead of any text
line. The completion reads `streamText`'s own `output`, which validates the finished json against `podcastReplySchema`:
the completion's text is the validated answer, and its speaker is the speaker line already sent, or the validated
speaker if none was. If validation fails, the completion keeps the streamed answer and the speaker line already sent,
so the turn is not failed.

The prompt is the topic chat's. `chat-topic.md` (version 25) gains two placeholders:
- an untrusted `{{podcastEpisodeChapterBlock}}`, inside the fenced material under "## The podcast episode the reader is
  listening to". It is "None." on every other turn, the way `attachmentContext` is.
- a trusted `{{podcastQuestionBlock}}` above `{{spokenBlock}}`, which is "" on every other turn.

On a podcast chat turn the trusted block is the new fragment `worker/prompts/chat-podcast-episode.md` with
`podcast-episode-hosts.md` spliced in through `toPodcastEpisodeHostsBlock` in `worker/podcast/podcastEpisodeHosts.ts`,
the builder the episode script uses too. The hosts prompt (version 4) takes each host's speaker value as
`{{podcastEpisodeSpeakers}}`, a sentence `toPodcastEpisodeSpeakersSentence` builds from
`PODCAST_EPISODE_SPEAKER_NAMES`, so neither prompt hand-types `host` and `cohost`, and
`write-podcast-episode-segment.md` (version 5) drops its own copy of that line. The fragment says:
- The reader is listening to this episode and asked during this chapter, so "that", "he", and "she" point into the
  chapter's lines.
- Who answers: the named host. Otherwise Carl for what a source said, a fact, a number, or what a line meant, and Vienna
  for why it matters, what she thinks, or what she would do. Carl when neither fits.
- The chosen host answers in their own voice from the hosts prompt.
- This turn has no tools.
- The answering host first takes the question the way a live show's host takes a call, in a few words of their own,
  with no name, greeting, or praise, and then answers. NotebookLM's interactive mode has a host call on the listener
  at the tap, before the question. Here the acknowledgement opens the answer instead, which costs no extra model or
  speech call, and the mic never opens over a host's voice.

The chapter block renders the turns as `Carl: …` and `Vienna: …` through `PODCAST_EPISODE_SPEAKER_NAMES` and
`toTranscriptText`, so the vocal tags never reach the chat. The host names stay in prompt copy and that shared map,
never in the schema.

`chat-topic.md` also gains a line beside its attachment note paragraph: an "[asked while listening to …]" note on an
earlier message names who answered it, a reply after a note naming Vienna was hers, and every other reply was Carl's.
The history replays the note fenced as untrusted data, under one nonce per model call, since a model wrote the podcast
episode and chapter titles in it, and the line says so.

Alternatives:
- A leading marker token in plain text is not validated, and Carl could write it into a typed reply.
- A first tool call that names the speaker costs a model round trip.
- A separate cheap classifier call costs one too, and splits the decision from the answer it governs.

### The stored answer joins every step's text

`toCompletion` stores the text of every step from `replyStream.steps`, joined with the same `\n\n` that
`breakTextAroundToolCalls` streams before text that follows a tool call. In `ai` 7, `StreamTextResult.text` is
"the full text that has been generated by the final step". A turn that wrote "Let me look that up", searched, then
answered stored only the answer, while the stream and the eval's `toStepsText` showed both. `usage` already sums every
step.

The podcast reply path never reaches this, since it stores the validated answer. The room turn reads the same
completion, so it gets the fix too.

### The kind column, its shapes, and its migrations

`shared/enums.ts` adds `chatTurnKinds = ["private", "podcast", "chat_room", "transcription", "speech"] as const`.
`db/schema/columns.ts` adds two enums:
- `chatTurnKind = pgEnum("chat_turn_kind", chatTurnKinds)`
- `podcastEpisodeSpeaker = pgEnum("episode_speaker", podcastEpisodeSpeakers)`, which the schema did not have.

`chat_turns` gains:
- `kind`, not null with no default in the final schema, so a missing kind is a type error at every insert
- `episode_id`, referencing `episodes` with on-delete cascade
- `chapter_position` integer
- `podcast_answer_speaker`, an `episode_speaker`. It is named for what it holds: the speaker of the answer, never the
  asker.

Cascade is safe. An episode row is deleted only with its owner's account, which deletes the owner's topics first, and
`chat_turns.topic_id` already cascades. A podcast row therefore never outlives its topic's rows, and the "always"
constraint holds.

The three checks follow the `notes_one_page` and `invites_target_xor` pattern:
- `chat_turns_chat_room_shape`:
  `(kind = 'chat_room') = (room_message_id is not null) and (kind <> 'chat_room' or (question is null and answer is
  null))`
- `chat_turns_podcast_shape`: `(kind = 'podcast' and episode_id is not null and chapter_position is not null and
  podcast_answer_speaker is not null and topic_id is not null and team_id is null) or (kind <> 'podcast' and episode_id
  is null and chapter_position is null and podcast_answer_speaker is null)`
- `chat_turns_spend_shape`: `kind not in ('transcription', 'speech') or (question is null and answer is null and
  tool_calls is null)`

The writers name their kind:
- `toChatTurnRow` writes `private`, or `podcast` with the three podcast columns when the turn has a chapter context.
- `recordChatSpendRow` takes `kind: "transcription" | "speech"` from `recordPaidModelCall`, whose model call name is
  already that string.
- `recordChatRoomTurn` writes `chat_room`.
- The room smoke fixture writes `private`.

The readers switch from null columns to `kind`:
- `toSpendByTeamId` counts a Team's own room by `eq(chatTurns.kind, "chat_room")` instead of
  `isNotNull(chatTurns.roomMessageId)`.
- `toPageFilter` adds `inArray(chatTurns.kind, conversationChatTurnKinds)`, `private` and `podcast`, on a topic
  page, and `eq(chatTurns.kind, "private")` on a team page and the new-topic chat. It serves both `loadChatTurns` and
  `clearChatTurns`.
- `loadChatTurns` keeps its text-not-null guard, because a cleared or unpersisted private row still has no text.

No spend sum gains a filter.

The migrations follow `0040_backfill_usernames.sql`'s precedent for a named custom migration:
1. `bun run db:generate` with `kind` temporarily at `.default("private")`. This creates both enums and adds the four
   columns, so every existing row reads `private`. The same migration adds `chat_proposals.team_id` and
   `topic_edit`, makes `digest` nullable, widens the unique key, and adds `chat_proposals_shape`, which every existing
   private row meets.
2. `bunx drizzle-kit generate --custom --name backfill_chat_turn_kinds` holds one commented
   `UPDATE chat_turns SET kind = 'chat_room' WHERE room_message_id IS NOT NULL`.
3. `bun run db:generate` after the schema drops the default and declares the checks. This emits `DROP DEFAULT` and the
   three `ADD CONSTRAINT … CHECK`s, which validate the backfilled rows.

The voice spend rows written since 2026-10-17 read `private`, as the request says. `transcription` and `speech` start
with this deploy.

Alternatives:
- One hand-edited migration. The repo's rule is that migrations are generated, with a named custom file for data.
- Keeping the default. It hides a writer that forgot its kind, which is the bug this column exists to end.

### The constraint test is a smoke against a real database

Unit tests here stub the connection pool, so no unit test can see Postgres reject a row. `db/schema.test.ts` asserts
the generated SQL for the enum, the default drop, and each check, the way it already asserts `max_results`. A new
`db/chatTurnShapes.smoke.ts` is run by `bun run smoke:chat-turns` under Doppler against the dev database:
- inside one transaction that it rolls back, it inserts a valid row of each kind
- it then inserts each mismatched shape, each in its own savepoint so one rejection never aborts the transaction, and
  expects SQLSTATE `23514`: a podcast row with no episode, a private row with
  a room message id, a speech row with a question, a chat room row with text, a podcast row on a team, and a
  chat room proposal with a digest and no topic edit

The README's Development section lists the script.

### The speaker reaches the voice through the speech route

`recordSpokenAnswer({ text, speaker = "host", litellmApiKey })` passes the speaker to `toSpokenAnswerRequestBody`,
which reads the voice from `toSpeakerVoice(speaker)`. It replaces `toHostVoice()` and the two-speaker request's inline
cohost lookup, so one function owns both voices. `spokenAnswerPayload` gains
`speaker: z.enum(podcastEpisodeSpeakers).default("host")`. Any page may name `cohost`, since the caller pays either way
and the voice is the only difference. The cost tier is unchanged.

In the browser, a spoken answer queue takes a `speaker` that every speech post sends. `spokenAudioCache` and
`pendingSpokenAudio` key by `${speaker}\n${text}`, so Carl's and Vienna's audio of the same words never collide. A
reply's play button sends the reply's own speaker.

### The browser's question flow is a store beside the player's

`ui/src/stores/podcastEpisodeQuestionStore.ts` is a module-scope store in the player store's shape. It holds:
- the phase: `idle`, `listening`, `thinking`, or `answering`
- the speaker once known
- the episode and chapter asked about
- whether the episode was playing and where it paused
- the turn's abort controller
- the recording's send and cancel, and whether it is recording, so every podcast mic slot shows Send while any podcast
  mic records

The topic page's podcast card shows the same `PodcastEpisodeQuestionButton` after its playback speed button while its
episode is loaded, in the card's `PLAYBACK_CONTROL_BUTTON_CLASS` shape, and the mic reads the session itself, so both
places route a visitor to signup the same way. `PodcastEpisodeAudio` renders a new `PodcastEpisodeQuestionButton` in the
mic slot and a `PodcastEpisodeQuestionStopButton` in the skip buttons' place while the phase is not `idle`. The chapter
line reads the phase's label from `toPodcastEpisodeQuestionLabel`.

A tap, in order:
1. A visitor is sent to `/signup?cta=podcast-question`, which toasts "Sign up to speak with Carl and Vienna".
2. The store saves `isPlayingAtTap` and the position, pauses the episode, and stops any spoken answer.
3. `useVoiceRecording.start()` runs, which creates and resumes the audio context and plays the unlock silence inside
   the gesture.
4. The new `canStartVoiceRecording` option loads the topic's conversation before the microphone is asked for.
   - If `isBudgetExhausted`, it toasts the budget line with its plans action and returns false. No microphone is asked
     for, and the episode resumes.
   - If the conversation cannot be loaded or chatted on, it toasts the chat's failure and returns false the same way.
5. The recording runs with `isPodcastEpisodeQuestion: true`, so it ends on the VAD, keeps the page's audio context,
   and never reopens the mic after an answer. Every ending with no transcript calls `onVoiceRecordingEnded`, which ends
   the question and resumes the episode.

The transcript calls `askPodcastEpisodeQuestion`, which:
- posts the turn through `sendChatTurn` with `toChatHistoryTurns` of the loaded conversation and the chapter field
- reads the speaker line through a new `onSpeaker` callback
- streams the answer's spoken parts through the speaker's queue

The chunk logic that cuts a reply into spoken parts moves out of `useTopicChat` into
`ui/src/stores/streamedSpokenAnswer.ts`, beside the spoken answer store it feeds, shared by both callers, so the
first-sentence cut and the paragraph packing exist once.

The player's chapter is the one `toChapterIndexAt` names at the tap. It is the chapter line's own rule, so the cold open
counts as chapter 1, matching where `toChapterTurns` puts its lines.

### One pure function decides whether the episode resumes

`toPodcastEpisodeResume({ questionEnding, isPlayingAtTap })` maps how the question ended to `resumeAfterBeat`,
`resumeNow`, or `unchanged`:
- a host finishing resumes after the beat
- a stop, a cancel, an empty or rejected transcript, a rejected or failed turn, and an answer with nothing to speak
  resume at once
- a media-session pause, a seek, a chapter skip, and the chat mic stay paused
- an episode that was not playing stays paused whatever the ending
- a play tap plays at once through the episode's own handler

`RESUME_BEAT_MS` is 600, a breath between the host's last word and the episode's next one. Unit tests cover the whole
table. A resume calls `audio.play()` outside a gesture. WebKit allows that on an element the user already started, and
a rejected `play()` leaves the row showing play.

The endings arrive from their sources:
- The answer's end comes from `subscribeToSpokenAnswerEnd` for the question's key.
- `seekPlaybackTo`, `skipPlaybackBy`, and `skipChapter` in the player store end the question as `skipped`, in
  any phase, so a seek while the mic listens cancels the recording too.
- The episode's `play` handler ends it as `played`.
- `useVoiceRecording.start()` from a chat composer ends it as `chatMic`.
- While a podcast answer plays, the spoken answer store's media session pause handler ends it as `paused`.

The circular import between the two player stores already exists for `stopSpokenAnswer` and `pausePodcastEpisode`.

### The lock screen names the host

The spoken answer queue takes optional lock-screen metadata. A podcast answer passes the speaker's name as the title,
`PODCAST_NAME` as the artist, and the episode's cover artwork. The existing end of a spoken answer already calls
`refreshPodcastEpisodeMediaSession()`, which restores the episode. A chat reply keeps its `title: "Carl"` metadata.

### The VAD is self-hosted, loaded on the first tap, and kept for the page

`@ricky0123/vad-web` 0.0.31 (2026-09-12) is added, which brings `onnxruntime-web`, resolved to 1.30.0. A
`startVoiceActivity` in `ui/src/lib/voiceActivity.ts` wraps `MicVAD.new`. It is imported with `await import(...)` only
from the player's recorder path, so no page or chat chunk includes it. The recorder gains an `endOfSpeech` option:
- `level`, the chat's default and the fallback
- `voiceActivity`, which starts the recorder at once on the level loop and hands the decision to the VAD once
  `MicVAD.new` resolves

With the VAD deciding:
- `onSpeechStart` marks speech started.
- `onSpeechEnd` sends.
- `onVADMisfire` is a blip shorter than `minSpeechMs` and counts as no speech.
- The 8-second cancel and the 60-second send stay in `toRecordingDecision`.

The options are:
- `model: "v5"`, 32 ms frames
- `redemptionMs: 1500`, which floors to 46 frames or 1,472 ms
- `getStream` returning the recorder's own stream, with no-op `pauseStream` and `resumeStream`, so the VAD never stops
  or reopens the microphone
- `audioContext`, the player's own context
- `baseAssetPath` and `onnxWASMBasePath` at the versioned asset folder

The player keeps its first tap's `AudioContext` and its one `MicVAD` for the page's life. Each question suspends the
VAD and the context, and the next tap resumes the context inside its gesture. The reasons:
- vad-web issue #227 reports an out-of-memory failure on iOS when a VAD is destroyed and created again in one page.
- A context made outside a gesture starts suspended on iOS, the same reason the chat's listen mode keeps its context.

A failed `MicVAD.new` is logged, the level loop keeps deciding for the rest of the page, and the next question does not
retry it.

The files are served from the app itself, never a CDN. `ui/voiceActivityAssetsPlugin.ts` is a Vite plugin of about
seventy lines and no new dependency:
- On build, it emits `vad.worklet.bundle.min.js`, `silero_vad_v5.onnx`, `ort-wasm-simd-threaded.wasm`, and
  `ort-wasm-simd-threaded.mjs` from `node_modules` at fixed names under `assets/voice-activity-<vad version>-<ort
  version>/`.
- In dev, its `configureServer` serves the same path from `node_modules`.

Being under `/assets/`, they get the existing immutable year-long cache, and a version bump changes the folder. The
first tap downloads about 16.5 MB uncompressed. The build check confirms that Vite emits no second copy of the wasm
through onnxruntime's own `new URL(..., import.meta.url)`, and that the api serves `.mjs` as `text/javascript` and
`.wasm` as `application/wasm`.

Alternatives:
- The chat's level loop alone needs no download, but in a car or a kitchen ambient noise reads as speech.
- A CDN would need `script-src` and `connect-src` entries once a script policy exists, and it would send every
  listener's IP to a third party on each tap.
- Loading the VAD with the page puts 16 MB on every visit.

### The exchange in the chat: a note in the text, a tag on screen, Vienna's bubble

`shared/contracts/chatQuestionNotes.ts` adds `withPodcastEpisodeNote(question, { podcastEpisodeTitle, chapterPosition,
chapterTitle, speaker })`. It writes `[asked while listening to "<title>", chapter <n>, "<chapter title>";
<name> answered]` with the chapter title cut to 120 characters. Its inverse, `toPodcastEpisodeNoteParts(question)`,
returns the question without the note and the note's parts.

The server writes the note on the stored question at save time, when the speaker is known. A turn stopped before the
speaker line is stored with `host`, since the row's check requires a speaker. The live client turn writes the same note
once its speaker line arrives, so the history of the next turn, typed or spoken, includes who answered.
`CHAT_HISTORY_QUESTION_CHARS` already allows 1,000 characters for a note.

`ChatTurnRow` and the ui's `ChatTurn` gain:
- `speaker`: the row's `podcast_answer_speaker`, or `host` for a private row
- `podcastEpisodeChapter`: `{ podcastEpisodeId, chapterPosition } | null`

`QuestionBubble` shows the question without the note and a `PodcastEpisodeChapterTag` under it, labeled from the note. A
tap loads the episode by id and plays it from that chapter's `startSeconds` through the player store. `ChatTurnBlock`
renders Vienna's avatar and "Vienna" for a `cohost` reply, and Carl's otherwise.
`ui/src/components/branding/HostAvatar.tsx` replaces `CarlAvatar` and picks each speaker's picture, `vienna-avatar.png`
for Vienna, with the speaker's name as its alt text.

Live delivery: the question store publishes the turn's snapshots through
`subscribeToPodcastEpisodeQuestionChatTurn(topicId, listener)`:
- the sent question
- the speaker
- the answer as it grows
- the finish

`useTopicChat` subscribes on a topic page whose id matches and upserts the turn by its spoken answer key, so the
open panel shows it streaming without speaking it twice. A collapsed or other panel ignores it and loads it from the
server next time. Nothing calls `setChatPanelState`.

Alternative: moving the private chat's turns into a store, so the player could append directly. That rewrites the
panel's state for one subscriber.

### A team room applies a topic edit only through the proposal rule

Today `runModelChatRoomTurn` binds `toChatTopicTools` for a member with `topic:edit`, and `chat-edit-topic.md` tells
Carl to save only after a yes. The model reads the whole room window that `buildModelRoomQuestion` composes, and
`toConsentStep` never fires in a room, since a room turn sends no history. So the only guard is the model's judgment of
whose yes it read:
- A second editor's "@carl yes" saves the first editor's preview in the second editor's turn.
- A non-editor's "@carl make it public" earlier in the window can lead Carl to save during an editor's unrelated turn.

The room takes the private chat's rule:
1. A room turn binds only `toTopicEditPreviewTools` for an editor, and `toEditTopicBlock` gives it the private chat's
   `chat-propose-topic-edit.md`. `toChatTopicTools`, the room branch of `toEditTopicBlock`, and `chat-edit-topic.md`
   are deleted, so no room turn can call a save.
2. After the reply posts, `recordChatRoomProposal` in `api/chat/roomProposals.ts` stores the standing preview for the
   billed member and the Topic, with the room's `team_id` and the room's chat turn row. `recordChatRoomTurn` returns the
   row's id for this.
3. The room has no browser history to rebuild a preview from, so the row stores the preview itself through
   `encryptChatJson`, instead of the digest that a private chat keeps so that an unpersisted conversation stays
   unreadable. Room messages are always stored, so this keeps nothing new readable.
4. At the start of that member's next room turn, before the stream, `answerChatRoomProposal` takes the member's room row
   and decrypts the preview. It calls the shared `resolveChatProposal` with the member's own prompt message, decrypted
   and stripped of its `@carl` mention.
5. An agreed preview applies through `applyTopicEdit`'s save paths under the member's binding, which check `topic:edit`
   again. The serverToolCalls and the proposal outcome go to `streamChatReply` the way the private chat's do. The saves
   reach the room's toasts through `toChatRoomToolCalls`, and the agreement tokens join the room turn's spend row.

Another member's message takes only that member's own row, so it can never answer someone else's preview. The
`chat_proposals` unique key widens to `(user_id, topic_id, team_id)` and keeps `NULLS NOT DISTINCT`, so a private row,
whose team is null, still conflicts with the user's earlier private row on that Topic, and the private upsert targets
all three columns. A Topic has a chat room in each team it is shared with, so a room preview names its team, and a
member of two of those teams can agree to a preview only in the room that showed it. A private chat's row has no team,
so one editor's private and room previews on a Topic never replace each other. A `chat_proposals_shape` check holds a
digest on a private row and a proposal on a room row.

The `topic-chat-tools` eval's room cases move from saving-tool stand-ins to the agreement path, with stand-ins for the
database writes, as the solo cases already run. A new case checks that a different member's yes applies nothing.
`toConsentStep`, the worker's `isTopicEditProposed`, and `isConsent` are deleted. The new-topic chat's saving tools
never follow a `proposeTopicEdit`, so no chat is left where a consent could force a save.

Alternatives:
- Keeping the room's saving tools and checking in the tool that the yes came from the proposing member. That leaves
  the decision with the model, and the tool cannot know which message the model was answering.
- Restricting room edits to the Topic's owner. That narrows who may edit instead of fixing who may confirm.

### The voice gate reaches the player on the Podcast Episode

`podcastEpisode` gains `isVoiceChatConfigured`, set by `toPodcastEpisode` from `isVoiceChatConfigured()`. Every place
that loads an episode into the player already returns that shape, and the player needs the gate before any
conversation loads. The field is the same value on every episode of an instance, a few bytes per row.

### Analytics name the kind

`chat_turn_sent` gains `chatTurnKind` from the row, and a podcast chat turn's also gains `speaker`.
`spokenEventPayload`'s question event gains `chatTurnKind: z.enum(["private", "podcast"]).default("private")`, sent by
the browser, and the route passes it to `spoken_question_sent`. The player's question posts its measurements on the
first spoken word, as the chat does.

### Copy, docs, and vocabulary

The ui copy:
- the tooltip and name "Talk with Carl and Vienna"
- the chapter line's "Listening", "Thinking", "Carl's answering", and "Vienna's answering"
- the controls "Cancel", "Stop", and "Send"
- the budget toast, which reuses `CHAT_REJECTION_COPY.budget` and the notice's "Pick up more coffee" link text from one
  shared constant, so the notice and the toast never drift

The docs:
- The podcast docs page (`feed/coffee-break.md`) gains a "Talk with Carl and Vienna" section.
- The chat docs page (`feed/chat.md`) says that a question asked from the player shows a tag and may be answered by
  Vienna.
- The editing-in-chat and group chat pages say that in a group chat only the member Carl proposed a change to can say
  yes to it.
- `bun run docs:embed` runs after all four.
- The Privacy page needs no change: a podcast question is a spoken question, and its answer is a reply read aloud,
  which the Google Gemini row already names.

The skills:
- The domain-model skill's Chat Turn entry names the five kinds and a **podcast chat turn**: asked from the podcast
  player, answered by either host, with its note.
- The prompt-authoring skill lists `chat-podcast-episode.md`.

### The monthly budget cutoffs

One share per plan, at which Podcast Episodes stopped, let Podcast Episodes spend most of a busy user's budget before
anything else gave way. Each Podcast Episode costs about $0.40 and each Scan about $0.08 in the dev database, so a plus
user with three daily Topics ran out of Scans around the 22nd. Each plan now sets a ladder of cutoffs in
`shared/plans.ts`, in the order the extras give way: spoken questions, then full Podcast Episodes, which turn short,
then Podcast Episodes, then manual Scans at 90 percent. Premium's podcast lines sit 10 points above plus's, since its
daily Scans take a smaller share of its budget. The moving daily Scans cutoff keeps Scans paid for to the 1st whatever
the fixed shares are. One pure function, `toMonthlyBudgetCutoffs`, returns a user's cutoffs, and
`isMonthlyBudgetCutoffPassed` in `db/monthlyBudgetCutoffs.ts` is the one check every gate calls, against the same
monthly spend sum the meter shows. An admin with no override has no cutoffs.

The daily Scans cutoff moves. A fixed share either stops daily Scans weeks early or never helps, since how much a month
can still afford depends on the day. It sits where the rest of the budget covers the daily Scans left this month, at the
user's own mean cost of the Scans not started by hand, with a weekdays Topic charged only for the weekdays left, so
it starts low and climbs each day. Past it, the sweep holds a daily Topic to once a week.
The sweep reads each owner's cutoff through a Redis cache that holds the result for an hour within the UTC month, since
a sweep runs many times a day and the cutoff moves by a day's Scans at a time.

A Topic's first Scan counts as manual. `startFirstScan` reads the key budget, the spent monthly budget, and the manual
Scans cutoff together, and a first Scan past the cutoff fails unstarted with a reason that reads as the paused label,
so deleting and creating a Topic cannot spend the reserve that the cutoff keeps for scheduled Scans.

A tapped mic reads `GET /api/chat/spoken-questions` before it asks for the microphone, loading the recorder beside the
read, so a user past the cutoff never records a question only to have it rejected. A mic that listen mode reopens
starts recording at once and reads the status beside the recording, so the hands-free loop adds no wait, and cancels
the recording on `budget` or `paused`. The transcription route checks again before any transcode. A paused mic opens
the plans page, whose toast comes from the same `cta` param hook the signup page uses.

A renewal keeps the LiteLLM key unless the plan changed or the key's max budget differs from the user's budget, so a
reissue that failed on a plan change is repaired by the next event. A reissue retries three times, then reports and
responds 500, so Stripe resends the event.

## Risks / Trade-offs

- [The chat model's structured output does not stream, or ignores the key order] → The `podcast-chat` eval runs the
  real provider and checks the speaker. If partials arrive only at the end, the speaker and the text still arrive in
  one burst, and only the first spoken word is later. The fallback is a first-step tool call, at one round trip's cost.
- [iOS out-of-memory in onnxruntime-web (vad-web #227), or no SIMD before Safari 16.4] → One VAD per page, never
  recreated. A rejected `MicVAD.new` leaves the level loop deciding, so a question still ends on its own.
- [16.5 MB on the first tap over mobile data] → The recording starts at once on the level loop while the files
  download, and the VAD takes over when ready. The files cache for a year. The device check measures the first tap on
  cellular and whether Cloudflare compresses the wasm.
- [Resume outside a gesture fails] → The row shows play, and the listener taps it. The device check covers iOS
  Safari and the home-screen app.
- [The VAD halves speaker volume on iPhone (vad-web #96)] → The tracks stop at send, and the context suspends between
  questions. The device check listens to the answer's level against the episode's.
- [A wrong host] → It costs nothing but the voice, and the eval gates its cases at 90 percent. Naming the
  host in the question always wins.
- [The prompt drifts until the sync] → `chat-topic.md` changes variables, so the bundled template serves with one
  deduped drift report until `bun run prompts:sync:prd` runs after the deploy, as with every prompt variable change.
- [A Team's own room voice spend stays outside the team's chat spend total] → A transcription in a team's own room
  and one in the team's private chat both read `transcription`, with a team and no topic, so `kind` cannot tell them
  apart, and the total counts `chat_room` rows as it did. The spend itself is never lost: it bills the speaker's own
  monthly budget. Room voice kinds would close the gap if the team figure ever needs it.
- [A room preview lapses when its member asks Carl something else first] → That is the private chat's rule too: only
  the next message answers a preview. Carl is told the outcome and can preview it again.
- [An editor agrees to a change a non-editor asked for] → The editor's own words agree to the preview on the card, so
  the save is that editor's decision under their rights, which is what the rule asks for.
- [A row with a note but an edited history] → The history is client-carried by design. A tampered note changes only
  the asker's own context, as a tampered question already can.

## Migration Plan

1. Deploy runs the three migrations in order: the columns with the temporary default, the room backfill, then the
   default drop and the checks. Each check validates the existing rows as it is added, and a failed validation fails
   the deploy before the new code serves.
2. After the deploy:
   - Run `bun run prompts:sync:prd`.
   - Run `bun run smoke:chat-turns` on dev and `bun run smoke:speech` with the co-host voice.
   - Do the device check on carlnotes.com from a phone:
     - the first tap's download and how long the VAD takes to arrive
     - an end of speech in a noisy room
     - the resume after Carl and after Vienna
     - the lock-screen pause staying paused
     - the lock screen naming the host
     - the tag playing its chapter
     - Vienna's bubble after a reload
     - iOS volume after a question
3. Rollback is a revert of the code plus one forward migration, generated at that time. It sets `kind`'s default back
   to `private` and drops the room check, since the old code inserts room turns without a kind. It deletes the room
   rows of `chat_proposals` and restores the `(user_id, topic_id)` unique key that the old upsert names. The columns
   stay.

## Open Questions

- None. The chat mic stays on the level loop, and the team's chat spend total keeps leaving out room voice, both for
  the reasons under Non-Goals.
