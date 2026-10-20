## 1. The chat turn kind

- [x] 1.1 Add `chatTurnKinds = ["private", "podcast", "chat_room", "transcription", "speech"] as const` to
  `shared/enums.ts`, and the `chatTurnKind` (`chat_turn_kind`) and `podcastEpisodeSpeaker` (`episode_speaker`) pgEnums
  to `db/schema/columns.ts`
- [x] 1.2 Add `kind` (not null, temporary `.default("private")`), `episode_id` (references `episodes`, on-delete
  cascade), `chapter_position` (integer), and `podcast_answer_speaker` (`episode_speaker`) to `chatTurns` in
  `db/schema/chat.ts`, then `bun run db:generate`
- [x] 1.3 Write the custom migration with `bunx drizzle-kit generate --custom --name backfill_chat_turn_kinds`. It runs
  `UPDATE chat_turns SET kind = 'chat_room' WHERE room_message_id IS NOT NULL`, under a comment saying why
- [x] 1.4 Drop the default and declare `chat_turns_chat_room_shape`, `chat_turns_podcast_shape`, and
  `chat_turns_spend_shape` as in the design, then `bun run db:generate` again
- [x] 1.5 Name the kind at every insert, then run `bunx tsc -b`, which fails on any insert left without one:
  - `toChatTurnRow` writes `private`, or `podcast` with the three podcast columns
  - `recordChatSpendRow` takes `kind: "transcription" | "speech"` from `recordPaidModelCall`
  - `recordChatRoomTurn` writes `chat_room`
  - `api/chat/roomSmokeFixtures.ts` writes `private`
- [x] 1.6 Read `kind` instead of null columns:
  - `toSpendByTeamId` in `api/team/helpers.ts` checks `eq(chatTurns.kind, "chat_room")`
  - `toPageFilter` in `api/chat/chatTurns.ts` adds the conversation's kinds, `private` and `podcast` on a topic and
    `private` elsewhere, for both `loadChatTurns` and `clearChatTurns`
- [x] 1.7 Test the kind each writer stores in `api/chat/chatTurns.test.ts`, and the team room spend's `kind` predicate,
  and pin the enum, the dropped default, and each check's SQL in `db/schema.test.ts`
- [x] 1.8 Add `db/chatTurnShapes.smoke.ts` and a `smoke:chat-turns` script under Doppler, listed in the README's
  Development section. Inside one rolled-back transaction it inserts a valid row of each kind, then each mismatched
  shape, expecting SQLSTATE `23514`:
  - a podcast row with no episode
  - a private row with a room message id
  - a speech row with a question
  - a room row with text
  - a podcast row on a team
  - a chat room proposal with a digest and no topic edit
- [x] 1.9 Name the five kinds and the podcast chat turn in the domain-model skill's Chat Turn entry

## 2. The stored answer and the reply line

- [x] 2.1 Store every step's text in `toCompletion` (`worker/chat/index.ts`), joined with the break that
  `breakTextAroundToolCalls` streams, and test a two-step reply with a tool call between its texts
- [x] 2.2 Add the `{ type: "speaker"; speaker }` `ChatReplyLine` in `shared/contracts/chat.ts`, write it from
  `writeReplyStream`, and read it in `ui/src/clients/chatClient.ts` through an `onSpeaker` callback
- [x] 2.3 Add `withPodcastEpisodeNote` and `toPodcastEpisodeNoteParts` to `shared/contracts/chatQuestionNotes.ts`,
  beside the attachment note moved there from `shared/contracts/chat.ts`, with tests: the format, the 120-character
  chapter title cut, both host names, and the round trip
- [x] 2.4 Add `speaker` and `podcastEpisodeChapter` to `ChatTurnRow`, read by `loadChatTurns` from
  `podcast_answer_speaker`, `episode_id`, and `chapter_position`, with `host` and null on a private row

## 3. The chapter context and the podcast reply

- [x] 3.1 Add `topicChatTurnPayload` in `shared/payloads.ts`: `chatTurnPayload` with an optional
  `podcastEpisodeChapter: { podcastEpisodeId, chapterPosition }`, refined to require `isSpoken` and no attachments. Use
  it on the topic chat route only
- [x] 3.2 Add `worker/chat/retrievePodcastEpisodeChapter.ts` with `loadPodcastEpisodeChapterContext`. It returns null
  unless a published episode of the topic has that chapter, and returns:
  - the episode's title, the chapter's title, and `toChapterTurns(script)[position]`
  - if the Finding is kept, the Resource's snippet, the relevance explanation, and the stored content limited by the
    script writer's reader and `MAX_RESOURCE_WORDS`
- [x] 3.3 Respond 404 from the topic chat route before the key or any model call if the context is null, and test: an
  episode of another topic, an unpublished episode, a missing position, and a filtered-out chapter that still loads with
  its title and turns
- [x] 3.4 Add `worker/prompts/chat-podcast-episode.md` (version 1, model tier chat) with the who-answers rules, the
  chapter's pronouns, the hosts' own voices, and no tools this turn. Splice in `podcast-episode-hosts.md` through
  `toPodcastEpisodeHostsBlock` in `worker/podcast/podcastEpisodeHosts.ts`, which the episode script uses too, with each
  host's speaker value from `toPodcastEpisodeSpeakersSentence` (hosts prompt version 4, segment prompt version 5)
- [x] 3.5 Change `chat-topic.md` to version 23 (9.12 raises it to version 25):
  - add the untrusted `{{podcastEpisodeChapterBlock}}` in the fenced material
  - add the trusted `{{podcastQuestionBlock}}` above `{{spokenBlock}}`
  - add the note line beside the attachment note paragraph
  - fill both blocks in `buildTopicChatPrompt` from a `podcastEpisodeChapter` option, rendering the turns as `Carl:`
    and `Vienna:` lines through `PODCAST_EPISODE_SPEAKER_NAMES` and `toTranscriptText`
- [x] 3.6 Test that the chapter's lines, summary, relevance explanation, and content reach the prompt inside the fence,
  that a filtered-out chapter brings no Finding fields, and that a typed turn's prompt has both blocks empty
- [x] 3.7 Add `podcastReplySchema` and `streamPodcastReply` in `worker/chat/`:
  - `streamText` with `Output.object`, no tools, and the spoken block
  - retrieval against the chapter title and the question
  - a speaker part once the speaker closes, or `host` if invalid, then text deltas from the answer's growth
  - a completion that reads `streamText`'s `output`, which validates the finished json with `podcastReplySchema`, and
    keeps the streamed text and the sent speaker if validation fails
- [x] 3.8 Pass the context through `answerChatTurn` and `saveFinishedChatTurn`:
  - write `kind: "podcast"` with the episode, the position, and the speaker, or `host` if no speaker line came
  - store the noted question
  - add `chatTurnKind` and `speaker` to `chat_turn_sent`
  - test all four

## 4. The voices

- [x] 4.1 Add `speaker` (default `host`) to `recordSpokenAnswer` and `toSpokenAnswerRequestBody` in `worker/speech.ts`.
  Read both voices from one `toSpeakerVoice(speaker)` for both request shapes, and test that `cohost` names
  `Laomedeia` and the default names `Alnilam`
- [x] 4.2 Add `speaker: z.enum(podcastEpisodeSpeakers).default("host")` to `spokenAnswerPayload` and pass it through
  the speech route. Add `chatTurnKind` (default `private`) to the spoken question event, sent on to
  `spoken_question_sent`
- [x] 4.3 Add a co-host case to `worker/speech.smoke.ts`

## 5. The room's proposal rule

- [x] 5.1 Add `team_id` (references `teams`, on-delete cascade, indexed) and `topic_edit` (text) to `chatProposals`,
  make `digest` nullable, widen `chat_proposals_page_unique` to `(user_id, topic_id, team_id)`, and add
  `chat_proposals_shape`, in the same generated migration as task 1.2. Point the private chat's upsert and take at a
  null `team_id`
- [x] 5.2 Bind only `toTopicEditPreviewTools` in `runModelChatRoomTurn`. Delete `toChatTopicTools`, the room branch of
  `toEditTopicBlock`, `worker/prompts/chat-edit-topic.md` and its fetch entry, and their tests. Add the file name to the
  drift list in `.agents/commands/audit-structure.md`
- [x] 5.3 Add `recordChatRoomProposal` and `answerChatRoomProposal` in `api/chat/roomProposals.ts`:
  - store the standing preview encrypted for the billed member with the room's `team_id`, after `recordChatRoomTurn`
    returns its row id
  - take it at that member's next turn in the same team's room, before the stream
  - resolve it through `resolveChatProposal` over the member's own prompt message without its `@carl` mention
  - pass the server tool calls and the outcome to `streamChatReply`, and the agreement tokens to the room's spend row
- [x] 5.4 Test in `roomTurns.test.ts` and `roomProposals.test.ts`:
  - the editor's own yes applies the preview
  - another editor's yes applies nothing and leaves the first preview standing
  - a non-editor's request never saves in an editor's turn
  - the room and private previews on one Topic stay apart
  - a room turn binds no saving tool
- [x] 5.5 Move the `topic-chat-tools` eval's room cases onto the agreement path with stand-ins for the database
  writes, and add the case of another member's yes. Run it with `--repeat 3`
- [x] 5.6 Rewrite the Topic Tool and Chat Turn entries in the domain-model skill and the fragment list in the
  prompt-authoring skill for the room's proposal rule

## 6. The ui's spoken answers and chat

- [x] 6.1 Give the spoken answer queue a `speaker` sent with each speech post and optional lock-screen metadata, with
  the media pause handler reporting a pause. Key `spokenAudioCache` and `pendingSpokenAudio` by speaker and text, and
  test both in `spokenAnswerStore.test.ts`
- [x] 6.2 Move the streaming spoken-part cutting out of `useTopicChat` into `ui/src/stores/streamedSpokenAnswer.ts`,
  used by the chat and the player, with its tests
- [x] 6.3 Replace `CarlAvatar` with `HostAvatar`, one avatar per speaker over `ui/src/assets/carl-avatar.png` and
  `ui/src/assets/vienna-avatar.png`. `ChatTurnBlock` shows Vienna's avatar and name
  for a `cohost` reply, and its play button passes the reply's speaker
- [x] 6.4 Add `PodcastEpisodeChapterTag` under a question that has a note, labeled from the note. A tap loads the
  episode and plays it from that chapter. Test it in `ChatMessages.test.tsx` along with the stripped question text
- [x] 6.5 Have `useTopicChat` mirror a matching topic's podcast question turn from
  `subscribeToPodcastEpisodeQuestionChatTurn`, upserted by its key, without speaking it or opening the panel

## 7. The player

- [x] 7.1 Add `isVoiceChatConfigured` to the `podcastEpisode` contract and set it in `toPodcastEpisode`
- [x] 7.2 Add `isPodcastEpisodeQuestion`, `canStartVoiceRecording`, and `onVoiceRecordingEnded` options to
  `useVoiceRecording`, and an `endOfSpeech` option (`level` or `voiceActivity`) to `startVoiceRecording`, with the level
  loop deciding until the VAD takes over
- [x] 7.3 Add `@ricky0123/vad-web@0.0.31` with `bun add`, `ui/src/lib/voiceActivity.ts` wrapping `MicVAD.new` with the
  design's options and one instance per page, and `ui/voiceActivityAssetsPlugin.ts`, registered in `ui/vite.config.ts`.
  Check the build for a single wasm copy and the served content types at :3000
- [x] 7.4 Add `ui/src/stores/podcastEpisodeQuestionStore.ts`:
  - the phases
  - the tap flow: signup, saving the pause, the conversation load and budget toast, the question post with history and
    chapter, the speaker, and the spoken answer
  - the turn snapshots
  - `toPodcastEpisodeResume` with `RESUME_BEAT_MS`
  - the endings from seeks, skips, the episode's play, the chat mic, and the lock-screen pause
- [x] 7.5 Test `toPodcastEpisodeResume` across every ending and both `isPlayingAtTap` values, and the phase labels
- [x] 7.6 Add `PodcastEpisodeQuestionButton` beside play and `PodcastEpisodeQuestionStopButton` in the skip buttons'
  place in `PodcastEpisodeAudio.tsx`, with the chapter line reading the phase. Check the row at 375 pixels with play
  whole
- [x] 7.7 Share the budget toast's line and the notice's "Pick up more coffee" link text with `ChatBudgetNotice`
- [x] 7.8 Show the same mic after the podcast card's speed button while its episode is loaded, in the card's control
  shape, with the session read by the mic itself

## 8. The eval

- [x] 8.1 Add `evals/podcast-chat/` with its cases, providers, rubrics, and eval:
  - the six cases from the eval-harness delta
  - code checks for the speaker and no markdown
  - one rubric for the vague question, on a different grader model
  - a 90 percent gate
- [x] 8.2 Add the rubric's grader calibration cases. Add `eval:podcast-chat` under Doppler to `package.json` and
  `.github/workflows/evals.yml`, and to the README and `evals/README.md` tables. Run it with `--repeat 3`

## 9. Docs and guides

- [x] 9.1 Add a "Talk with Carl and Vienna" section to `docs/src/content/docs/feed/coffee-break.md`. Mention the tag and
  Vienna's replies in `docs/src/content/docs/feed/chat.md`. In `docs/src/content/docs/teams/group-chat.md` and
  `docs/src/content/docs/feed/editing-a-topic-in-chat.md`, say that in a group chat only the member Carl proposed a
  change to can say yes to it. Run `bun run docs:embed` once all four pages are done
- [x] 9.2 Update `ui/AGENTS.md`, `api/AGENTS.md`, `worker/AGENTS.md`, and `db/AGENTS.md` for the new files and the
  plugin, and list `chat-podcast-episode.md` in the prompt-authoring skill
- [x] 9.3 Replace "in flight" with "running" for a Scan, a task, or an activity, and "in progress" for a request, a
  post, or a render, across code comments, `.env.example`, `ci.yml`, the README, and the living specs' deltas, and add
  the old wording to the audit-structure drift list
- [x] 9.4 Have the answering host take the question like a live show's call-in, in a few words of their own, with no
  name, greeting, or praise, as a rule in `chat-podcast-episode.md`, checked by a call-in rubric on every
  `podcast-chat` case and calibrated in the grader calibration eval
- [x] 9.5 Add `ui/src/components/session/signupPrompts.ts` with each call to action's toast, `toSignupNavigation`, and
  `toSignupHref`. Route every action that sends a visitor to signup through it, give the chat mic `chat-voice` and the
  podcast mic `podcast-question`, toast the prompt on the signup page, mount the one toaster in the root route, and test
  the map
- [x] 9.6 Fence a chat room turn's summary, shared files, and chat messages as untrusted in `toModelRoomQuestion`, with
  the rule in `chat-room-turn.md` (version 4), and rerun the topic chat tools eval's room cases
- [x] 9.7 Reissue the LiteLLM key in `api/billing.ts` only if a subscription event changes the plan or the key's max
  budget is stale (`isUserLiteLLMKeyBudgetStale`), so a renewal at each billing date keeps the key's spend for the
  month, retry a reissue three times before responding 500, and test each case in `api/billing.test.ts`
- [x] 9.8 Replace each plan's `podcastEpisodeBudgetShare` with `monthlyBudgetCutoffShares` and
  `toMonthlyBudgetCutoffs` in `shared/plans.ts`, and `isPodcastEpisodeBudgetShareExhausted` with
  `isMonthlyBudgetCutoffPassed` and `loadMonthlyBudgetCutoffs` in `db/monthlyBudgetCutoffs.ts`
- [x] 9.9 Gate the transcription route and add `GET /chat/spoken-questions`, have every tapped mic read it before it
  asks for the microphone and a reopened mic read it beside its recording, and open the plans page with an upgrade
  toast through `spokenQuestionsPaused.ts` and `useCtaPromptToast`
- [x] 9.10 Record short Podcast Episodes past the full Podcast Episodes cutoff, pause them past the Podcast Episodes
  cutoff, hold daily Topics to once a week past the daily Scans cutoff in the sweep, and pause manual Scans at 90
  percent, a Topic's first Scan included, with `isManualScanPaused` on the topic payload
- [x] 9.11 Mark each cutoff on the account page's spend meter in `SpendMeter.tsx`, add the feature windows table to the
  plans page in `MonthlyBudgetCutoffTable.tsx`, and keep its copy in
  `docs/src/content/docs/account/plans-and-limits.md`, checked cell for cell by a test
- [x] 9.12 Fence the podcast episode note in the chat history in `worker/chat/chatMessages.ts`, and say so in
  `chat-topic.md` (version 25)
- [x] 9.13 Read the monthly spend once per request through the request memo, wrap the podcast episode planner and the
  sweep's limit reads in it, and cache each owner's daily Scans cutoff for the sweep in Redis for an hour
- [ ] 9.14 Run `bun run check`, then after the deploy run `bun run prompts:sync:prd` and the device check from the
  design's migration plan
