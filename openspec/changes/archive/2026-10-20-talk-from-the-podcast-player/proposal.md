## Why

A listener's question about an episode comes up while it plays, often with their hands busy, and today the only way to
ask it is to stop, open the chat, and type. Talk to Carl proved voice works in the chat. Talking with Carl and Vienna
from the docked player lets a listener ask about what they just listened to and get it answered out loud by the host who
fits the question, then go back to the episode. The chat turn table also needs a kind column before a fifth kind of row
joins the four it tells apart only by which columns are null. And while the change is in the chat's turn paths, it
closes a hole in team chat rooms, where one member can get Carl to save a topic edit that another member never
confirmed.

## What Changes

- A mic button sits beside play in the docked podcast player, at the play button's 44 pixel size, and after the speed
  button in the topic page's podcast card, in the card's own control shape, with "Talk with Carl and Vienna" as its
  tooltip and its accessible name. The row still fits a 375 pixel screen with play whole. A visitor's tap routes to
  signup, a spent budget toasts the chat's upgrade line, and the button hides if voice is not configured, which the api
  reports on the Podcast Episode the player loads.
- A tap pauses the episode and records a question through the chat's recorder and transcription route. Here the
  recording ends itself after about 1.5 seconds of silence once speech has started, detected on the device by
  `@ricky0123/vad-web` (Silero VAD on `onnxruntime-web`), whose code, model, and runtime are self-hosted and loaded on
  the first tap only. If it cannot start, the chat's level-based end of speech takes over. Send ends early, X cancels,
  and the 60-second limit and the 8-second no-speech cancel apply.
- The transcript posts to the topic's private chat through the chat turn route, after loading that conversation's
  history, with the episode id and the chapter at the playback position. The server checks that the episode is a
  published episode of that topic and the chapter one of its chapters, then gives the hosts the chapter's title and
  script lines and, if its Finding is still kept, the Finding's summary, relevance explanation, and stored resource
  content, all fenced as untrusted.
- The question picks who answers. One structured model call returns the answer and its speaker, `host` or `cohost`,
  validated with Zod, streaming the speaker first so choosing adds no wait. A question that names a host goes to that
  host. A question about what a source said, a fact, a number, or what a line meant goes to Carl. A question about why
  it matters or what she thinks or would do goes to Vienna. Anything else goes to Carl. Only a podcast chat turn can be
  answered by Vienna. A podcast chat turn takes no tools, so it stays one quick step.
- `recordSpokenAnswer` takes the speaker and records Vienna's answers in the co-host voice. The speech route takes the
  speaker, and the session's audio cache keys by speaker and text.
- The player's chapter line shows Listening, Thinking, then "Carl's answering" or "Vienna's answering", and a stop takes
  the skip buttons' place while a question is in progress. When the host finishes, the episode resumes where it paused
  after a short beat. Stopping or cancelling resumes it too. A pause or a seek while a host talks stops the answer and
  leaves the episode paused. The lock screen names the answering host, then the episode again.
- The exchange is saved in the topic's private chat as a spoken turn, with a note on the stored question naming the
  episode, the chapter, and who answered. The chat shows the note as a small tag that plays the episode from that
  chapter. Vienna's replies show her avatar and name. A chat panel showing that conversation gets the turn live, and the
  panel never opens on its own.
- **BREAKING (schema)**: `chat_turns` gains a `kind` column (`private`, `podcast`, `chat_room`, `transcription`,
  `speech`) with no default, which every insert names. Player rows also store the episode id, the chapter position,
  and the answer's speaker. Check constraints hold each kind's shape. Generated migrations add the columns, a
  backfill sets `chat_room` where a room message id is set and `private` everywhere else, and a last migration drops the
  backfill's default and adds the checks. Reads that inferred a kind from null columns read `kind`: the team chat
  room spend and the conversation load and clear. Every spend total stays the same.
- A team chat room applies a topic edit only through the proposal rule. Today a room turn binds the saving tools and
  the model decides when a yes counts, reading the whole room transcript. So a member could say yes to a preview
  shown to someone else, or steer an editor's turn into saving their request, with no confirmation from the editor.
  Now a room turn gets the preview tools alone. The server records the preview for the member it was shown to, in
  `chat_proposals` beside the private chat's, and applies it only if that member's next message to Carl agrees, read
  by the private chat's agreement check over their own words alone. `chat-edit-topic.md` and the room's saving tools
  are removed.
- A private chat turn's stored answer becomes the text of every step, not only the final step's. The SDK's `text`
  returns only the final step, so a turn that wrote text before a tool call lost that text on reload.
- `chat_turn_sent` and `spoken_question_sent` name the chat turn's kind, and a podcast chat turn's `chat_turn_sent`
  names its speaker.
- A new promptfoo eval, `podcast-chat`, checks the chapter context and who answers. The podcast and chat docs pages
  describe talking with the hosts.
- The signup page toasts what the action that sent a visitor there needs, such as "Sign up to speak with Carl and
  Vienna" for the podcast mic, from one map in `ui/src/components/session/signupPrompts.ts` that every such action goes
  through. The chat mic and the podcast mic get their own calls to action.
- The docs pages read in short, factual sentences, with the places they disagreed with the code corrected.
- Comments, docs, and specs say "running" for a Scan, a task, or an activity, and "in progress" for a request, a
  post, or a render, where they said "in flight". `inFlight` counters in the concurrency tests are `runningCount`.
- Each plan stops its extras at monthly budget cutoffs, so Scans are paid for last. Speaking with Carl and Vienna
  pauses at 15, 40, or 50 percent of the budget on free, plus, or premium, and the mics open the plans page with an
  upgrade toast. Podcast Episodes go short at 60 percent on plus and 70 on premium, and pause at 20, 75, or 85 percent.
  Daily Topics scan weekly past a cutoff that moves with the daily Scans left this month, and manual Scans pause at 90
  percent. The account page's spend meter marks each cutoff with a circle above the bar, a tooltip, and a list, and
  the plans page shows every plan's cutoffs in a feature windows table.
- A Stripe subscription event reissues the user's LiteLLM key only if it changes the plan or the key's max budget no
  longer matches the user's budget. Every event used to reissue it, so each renewal reset the key's spend in the middle
  of the month, and scheduled Scans, which check that key, ran again for a user whose budget was spent.

## Capabilities

### New Capabilities

- `podcast-chat`: the player's mic button, the question's end of speech, the chapter context, who answers, the
  spoken answer in each host's voice, the player's states and resume rules, the lock screen, and the saved exchange
  with its tag and Vienna's bubble.

- `monthly-budget-cutoffs`: each plan's cutoffs for spoken questions, full Podcast Episodes, Podcast Episodes, daily
  Scans, and manual Scans, and what each one stops.

### Modified Capabilities

- `domain-schema`: Chat Turn gains its kind, the podcast columns, and the shape checks, and a chat proposal keeps a
  room's encrypted preview beside a private chat's digest, with their migrations.
- `topic-tools`: a room turn gets the preview tools alone, and the server applies a room preview only on the next
  message from the member it was shown to.
- `voice-chat`: the speech route speaks in the answering host's voice and the audio cache keys by speaker. The chat
  mic's pause rule names the chat mic, beside the player's resume rules.
- `speech-model-routing`: the single-speaker request uses the answering host's voice.
- `podcast-episode-player`: the docked row gains the mic, and the stop takes the skip buttons' place while a question
  is in progress. The never-resume rule is narrowed to the chat's mic and chat replies.
- `topic-chat`: a stored answer keeps the text of every step.
- `monitoring-analytics`: the chat turn and spoken question events name the kind, and a podcast chat turn names its
  speaker.
- `eval-harness`: the podcast chat eval, and the room cases of the topic chat tools eval run the proposal rule.
- `team-chat`: Carl reads a room's summary, shared files, and chat messages as untrusted data, and acts only on the
  last message that addressed him.
- `activity-page`: the spend meter marks each monthly budget cutoff, and its state line names the next one.
- `podcast-episode-rendering`: the free short Podcast Episode rule covers a paid Topic past its full Podcast Episodes
  cutoff, and the one share at which Podcast Episodes paused moves to the monthly budget cutoffs.
- `subscription-billing`: a subscription event that keeps the plan, such as a renewal, keeps the LiteLLM key.
- `user-auth`: the signup page toasts what the action that sent a visitor there needs, from one map of calls to
  action.
- `curation`, `durable-scans`, `scheduled-scans`, `request-capacity`, `scan-stopping`, and `tasting-notes`: "in flight"
  becomes "running" or "in progress", and the touched `curation` requirements say review for curation and limit for cap.
  `curation`'s spend limit requirement and `durable-scans`' one-Scan requirement take new names, since a scenario
  heading in each changes.

## Impact

- `shared/`:
  - `enums.ts`: `chatTurnKinds`.
  - `payloads.ts`: the podcast episode chapter on the topic chat turn, the speaker on the speech payload, and
    `chatTurnKind` on the spoken question event.
  - `contracts/chat.ts`: the speaker reply line and the speaker and chapter on `ChatTurnRow`, with the podcast episode
    note helpers beside the attachment note in `contracts/chatQuestionNotes.ts`.
  - `contracts/podcast.ts`: `isVoiceChatConfigured` on the Podcast Episode.
- `db/`:
  - `schema/columns.ts`: the `chat_turn_kind` and `episode_speaker` enums.
  - `schema/chat.ts`: `kind`, `episode_id`, `chapter_position`, `podcast_answer_speaker`, and three checks.
  - Three migrations: two generated, one custom backfill.
  - `schema.test.ts` and a new smoke script, `smoke:chat-turns`, that proves the checks reject mismatched rows.
- `api/chat/`:
  - `chatTurnAnswer.ts`, new: the answering path moved out of `privateChat.ts`, with the podcast episode chapter
    check. `privateChat.ts` reads the topic chat turn payload, and `chatTurns.ts` and `chatTurnStream.ts` save the kind
    on every write, the note, and the speaker line.
  - `voiceRoute.ts`: the speaker on speech and the kind on spend rows.
  - `roomTurns.ts` and the smoke fixture: the kind on their writes.
- `api/team/helpers.ts`: room spend reads `kind`.
- The room's proposal rule:
  - `api/chat/roomTurns.ts` takes and records the member's room preview.
  - `api/chat/roomProposals.ts` records and answers a room's stored preview beside the private chat's digest in
    `chatProposals.ts`.
  - `db/schema/chat.ts` gives `chat_proposals` `team_id`, `topic_edit`, and a nullable `digest`.
  - `toChatTopicTools`, the room branch of `toEditTopicBlock`, and `worker/prompts/chat-edit-topic.md` are removed.
  - `evals/topic-chat-tools/`'s room cases run the agreement check.
- `api/podcast/podcastEpisodeShapes.ts`: the voice flag.
- `worker/`:
  - `chat/`: the podcast reply with structured output, the chapter loader, the chapter block, and the joined step text.
  - `speech.ts`: the speaker's voice.
  - `prompts/chat-podcast-episode.md`: new.
  - `prompts/chat-search-web.md`: new, the web search paragraph that the topic and team room prompts shared.
  - `prompts/chat-topic.md` version 25, `chat-team.md` version 7, `chat-propose-topic-edit.md` and
    `chat-preview-topic-edit.md` version 2,
    `podcast-episode-hosts.md` version 4, `write-podcast-episode-segment.md` version 5, and
    `chat-room-turn.md` version 4, which fences the room's own words as untrusted. They need
    `bun run prompts:sync:prd` after the deploy.
  - `podcast/podcastEpisodeHosts.ts`: the hosts block, with each host's speaker value from
    `toPodcastEpisodeSpeakersSentence` in `shared/podcastEpisodes.ts`, for both the episode script and the podcast
    reply.
- `ui/`:
  - The player's mic and stop in `PodcastEpisodeQuestionControls.tsx`, and its states in `PodcastEpisodeAudio.tsx`.
  - Carl's avatar image, redrawn, beside Vienna's new one.
  - `podcastEpisodeQuestionStore.ts`: new.
  - The voice-activity module and the Vite plugin that self-hosts its files.
  - The speaker in `spokenAnswerStore.ts` and its cache.
  - `HostAvatar`, Carl's or Vienna's picture by speaker, over `ui/src/assets/vienna-avatar.png`.
  - The tag and Vienna's bubble in the chat.
  - The live turn in `useTopicChat`.
  - The streamed spoken parts shared between the chat and the player.
- New dependency: `@ricky0123/vad-web` 0.0.31, which brings `onnxruntime-web`.
  - The first tap downloads the 2.3 MB Silero v5 model and the 14.2 MB WebAssembly runtime, uncompressed, which then
    cache for a year under `/assets/`.
- Evals and docs:
  - `evals/podcast-chat/`, its grader calibration cases, `eval:podcast-chat`, and `.github/workflows/evals.yml`.
  - `docs/src/content/docs/feed/coffee-break.md`, `feed/chat.md`, `feed/editing-a-topic-in-chat.md`,
    `teams/group-chat.md`, and `account/plans-and-limits.md` for the feature and the cutoffs.
  - The readability pass: `account/add-to-ai.md`, `feed/making-a-topic-in-chat.md`, `feed/reading-your-feed.md`,
    `feed/tasting-notes.md`, `index.md`, `quickstart.md`, `teams/teaming-up.md`, `topics/adding-sources.md`,
    `topics/attachments.md`, and `topics/writing-a-prompt.md`.
- The monthly budget cutoffs: `shared/plans.ts`, `db/monthlyBudgetCutoffs.ts`, the gates in `api/chat/voiceRoute.ts`,
  `api/topic/scans.ts`, `worker/podcast/planPodcastEpisode.ts`, and `worker/scheduledTopicLimits.ts`, the spend meter in
  `ui/src/components/account/SpendMeter.tsx`, the feature windows table on the plans page, and the mics' plans page
  redirect.
- `api/billing.ts`: a subscription event reissues the LiteLLM key only if the plan changed or the key's max budget is
  stale.
- `api/seed.ts`: a free, plus, and premium user for local checks.
- `README.md` Development, the module guides, and the domain-model and prompt-authoring skills.
