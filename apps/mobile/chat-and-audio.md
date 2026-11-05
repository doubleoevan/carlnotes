# Native chat and audio

## Chat

`app/chat.tsx`, `app/topics/[topicId]/chat.tsx`, and `app/teams/[teamId]/chat.tsx` render `components/chat/ChatScreen`.
`chat/useChatPage.tsx` is its page-state hook: it reads page access, loads the rooms, selects the initial
conversation, and builds the conversation choices.
`AppChatPanel` mounts once in `_layout` and puts the shared `ChatPill` at the bottom right of every signed-in screen,
above the safe area. `ChatPanelWidget` supplies native Nightshift elements to the core launcher and the conversation's
keyboard-safe frame. Room stories use that same frame for device checks. `branding/CoffeeCup`
draws the same Nightshift cup paths as web. The pill hides while the keyboard or conversation is open and in Storybook.
Footer padding and note-screen clearance keep the final controls reachable. `hooks/useIsKeyboardVisible` is shared
by the launcher and note layout. `chatNavigation` retains Topic/Team context on their note routes and delegates default
selection to core. Profile routes retain the web's shared-Team and preferred-Topic context through
`toProfileChatContext`. Other screens open the web default: a room, else the new-topic chat. Accounts without rooms
can also choose a private Topic from their loaded Feed. `toNewTopicChatHref` opens `/chat` straight on the new-topic
chat, with a Team screen's team, and Home opens it by itself once per launch for an empty Feed
(`stores/newTopicChatWelcome`, core's `isUserTopicFeedEmpty`). The conversation selector
uses `ChoiceSelect`'s full-width sheet presentation, with Carl's private chat first, alphabetized rooms, Team avatars,
and a checked selection. Its shared `Sheet` opts into `ScrollIndicator` for orange overflow. Compact form and reply
choices retain anchored dropdowns; the Select primitive bounds long menus to the safe viewport. Close
returns to the prior screen. Account identity is activated in `_layout`.
`PrivateChatPanel` and `ChatRoomPanel` wire core state to native lists and composers. The latter exports
`ChatRoomContent` so stories exercise the connected room's presentation with local fixtures. `ChatMessageList` uses FlatList,
preserves older messages, and retries quoted-message jumps after native row measurement. `ScrollDownButton`
shares the web's centered position, arrow, label, and Nightshift styling through core composition, with native touch
targets. `ChatComposer` bounds its draft and scrollable header to the remaining keyboard-safe space.
`ChatRoomComposer` adapts native caret selection to shared mention/reply helpers. Its reply controls occupy
`ChatComposer`'s padded header below the divider. Mention suggestions temporarily replace the reply selector
while choosing a name, keeping both the suggestion and Send reachable on small phones with enlarged text.
`ChatOptionsMenu` confirms clearing.
`ChatRoomComposer` clears a message reply through the @all selector choice, preserving draft text without a separate
cancel icon. `ChatRoomMessageBubble` confirms deletion with the native alert and core's shared wording.

`common/ThinkingLine` adapts core's shared phrase component to native text. Its decorative highlight uses native
transforms, stops while the app is inactive or unmounted, and remains static with Reduce Motion. It shares the web's
phrase deck and sits beside `branding/CoffeeMug` in Carl's waiting bubble. Its stories cover narrow text and the bubble.
Its props compose core's `ThinkingLineProps` through `Pick`, and the `ShimmerText` adapter keeps its module-level
identity. This component is the native example enforced by `bun run check:components`; other feature modules remain
in the report-only inventory. The shared phrase selection, native motion, and Nightshift contracts stay unchanged.

The native `ChatAuthor`, `ChatTurnBlock`, `ChatRoomMessageBubble`, `ChatRejectionNotice`, and `TopicDraftCard` reuse
core composition with native elements. Retain matching names, field order, Nightshift fonts/colors, Lucide icons,
spacing, and shared rejection wording. `ChatMessageParts` supplies native copy, previews, and the history's
attachment-name chips (`ChatMessageAttachmentChips`). `ChatAttachmentChips` is the composers' pending chips, as on
web: an image thumbnail or a kind icon, the truncated name, a pasted text's length, and Delete. `ChatComposer` takes
the chips and an `attachmentActions` slot beside the draft, and Send is enabled with files alone.
`ChatComposerAttachments` holds the paperclip (`ChatAttachButton`) and the private Topic chat's kept files
(`KeptAttachmentsButton`, a "Chat files" sheet whose rows open through `toChatAttachmentUrl` and delete through
core's `removeKeptAttachment`, which drops a row only after the server accepts). A room message's files render through
`ChatRoomAttachments`, which opens each through `toChatRoomAttachmentUrl` and shows Delete to the author and the
room's leaders. Room images show as named rows, not inline as on web. `ChatRoomComposer` uses the attachments hook in
room mode, which keeps nothing, and clears the files only after an accepted post.
`branding/HostAvatar` draws Nightshift's shared host portraits for both message authors and the private-chat choice.
Draft cards preview all current settings with the proposed overlay;
accepted tool results clear it and reread the Topic. Replies confirm edits through the same API as web.

Reporting and blocking share core's rules. `common/ReportIssueDialog.tsx` takes the subject and, for a chat message, a
note, or a comment, its author, and offers the author's block in the same sheet, as the web's switch does.
`chat/ChatRoomMessageBubble.tsx`, `note/NoteComments.tsx`, `note/NoteManagement.tsx`, and the profile screen's action
menu open it. A reply to a message the member cannot see shows core's hidden quote. `account/AccountFields.tsx`
supplies the Blocked people rows under core's `BlockedUsersSection`. `session/TermsAcceptanceSheet.tsx` renders core's
`TermsAcceptanceNotice` in a sheet at the root for a stale account, and `session/TermsAgreementText.tsx` is the
sign-in and sign-up screens' acceptance line. The sheet fails open: Not now closes it until the next write the api
rejects for the Terms, and a session without a version field, from an api that predates the column, asks for nothing.

`PrivateChatPanel` adds native activity cancellation to the core hook and the existing client `sendChatTurn`. Expo 58's
default fetch is `expo/fetch`; its streaming body reader is required. Do not opt into buffered legacy RN fetch.
`mobileApiRequestSettings.ts` supplies the same session/device headers and revoked-session handling to API requests
and `chatRoomEvents.ts`. The latter adapts `react-native-sse@1.2.1`; its patch fixes the CommonJS export and emits
`done` only on clean XHR completion; its regression test rejects a completion during LOADING. Library polling is disabled; core owns cursor/backoff/recovery. Native
`useChatRoomStream` resolves current headers for each connection. `hooks/useIsScreenActive` combines route focus and AppState:
background/close closes SSE and aborts private sends, foreground reloads history, and a POST is never replayed.

`ChatMarkdown` uses `react-native-enriched-markdown@1.1.1`, compatible with React Native 0.88. It requires a rebuilt
native client, not an OTA update to an old binary. Core's parsed safety adapter keeps HTML literal and images as
safe link labels. Press and long-press both accept HTTP(S) only; automatic previews/task editing are disabled.
Generated tables become labeled row cards with incomplete rows withheld. Native streaming honors reduced motion.
The new-topic invitation links to `NEW_TOPIC_CHAT_HREF`, as on web, and that exact href opens the new-topic chat in
place; every other href still passes `isSafeHref`. Stories beside the adapters use shared fictional fixtures in
light/dark.

Room members can reply, mention, copy, and delete their own messages; leaders/admins can moderate and clear the room.
Only the opened room's mentions are acknowledged. Local delete/clear reloads accepted state; server SSE currently has
no deletion event, so other clients reconcile when reopened. Voice, podcast chat, pricing links, and broad live badge
subscriptions remain outside native text chat.

`PrivateChatPanel` runs the new-topic chat with core's `useNewTopicDraft` through `chat/useNewTopicDraft`, which opens
the created Topic's screen, uploads each picked file through `uploadTopicAttachment`, and deletes each file's cached
copy once the draft releases it. A new-topic pick keeps its copy for that upload. The panel shows core's new-topic
placeholders and opening line (`NEW_TOPIC_CHAT_COPY`), the draft card with its removable files, or
`ChatTopicLimitNotice`, which passes no plans link.

Monitoring retains existing PostHog/Sentry platform/device context and redaction. Never log message text, prompts,
tool/attachment payloads, session headers, or authenticated URLs from the new transports. Client/server analytics
must not double-count a posted chat turn.

## Coffee Break audio

`components/podcast/PodcastEpisodeAudio` owns one Expo audio instance across navigation. The platform adapter in
`podcastEpisodeAudioAdapter.ts` supplies source readiness, status, interruption/pause, system metadata, and release
to core. `podcastEpisodeCheckpoint.ts` stores only account-owned episode ID, position, completion, rate, and time;
restoration is paused and fetches the authorized episode without resolving an audio source. Session exit pauses
immediately; successful sign-out retires queued listens and removes the checkpoint. Foreground return, resume,
and a one-minute foreground interval recheck current episode access. Buffered media cannot be revoked instantly.
`audioPlayerTestFixtures.ts` is the fake expo-audio player that the podcast adapter's and `spokenAnswerAudio.ts`'s tests
drive.

Expo audio 58.0.10 and `patches/expo-audio@58.0.10.patch` add single-file system chapter commands. The small patch adds
ordered chapter targets and metadata updates on iOS and Android; timed skips remain 15/30 seconds. The audio config
plugin enables iOS background audio and the Android playback service. The Voice section covers the microphone
permission. The fingerprint changes, so this needs a rebuilt development/store client; an EAS Update alone is
insufficient.


`app/topics/[topicId]/episodes/[season]/[episodeNumber].tsx` renders `podcast/PodcastEpisodeScreen.tsx`.
`platformPath.ts` recognizes canonical episode links, including stale slugs, before the generic Topic matcher;
`sessionReturnPath.ts` retains a gated episode's requested route through sign-in. The screen scopes protected queries
to the account, refetches on focus, and retains no persisted episode-page payload. It uses the existing Finding reader,
Topic actions, reporting, and team/share sheets. The listener display takes the existing count response without a new polling loop.

The actual compositions in core are `PodcastEpisodePlayerCard`, `UnpublishedPodcastEpisodeCard`,
`PodcastEpisodeDetails`, `PodcastEpisodePlayButton`, `PodcastEpisodePill`, `PlaybackControlButtons`,
`PodcastEpisodeSeekBar`, `PodcastEpisodeChapters`, `PodcastEpisodeRow`, `PodcastPlayer`, `PodcastEpisodeTranscript`,
`PodcastThemeSongCredits`, `PodcastFeedDialog`, `RemovePodcastEpisodeDialog`, `PodcastEpisodesCard`, and
`PodcastEpisodeChapterTag`. Their counterparts here supply platform
View/Text, Nightshift controls, images, sheets, and links. `PodcastEpisodePlayer` supplies the route parameter to core's
`useShownPodcastEpisode`; `PodcastEpisodesCard` supplies account-scoped requests and routing to shared season tabs and pagination. `PodcastEpisodesSection`
and the wide-screen `PodcastEpisodeChaptersTable` reuse the existing DataTable and shared column/total rules.
Phone episode pages hide the extra cover and chapter table, as web does.

The root dock reserves layout height below the navigator; Coffee Talk stays inside the remaining area. The dock hides
on authentication screens and in Storybook. Playback continues independently. While an episode is loaded, the root
owns keyboard avoidance for the navigator and dock together. Chat and note screens disable their inner avoidance;
the composer remains above the player, which remains above the keyboard. Without a player, those screens retain their
own keyboard handling. While typing, the dock omits its progress strip and bottom device inset; its title, skips, and
play/pause remain visible. Chat hides its duplicate context line and limits the choice trigger to one line while typing;
the choice sheet retains the full label. Note body editing hides the brand header and note metadata until Done.
Name editing retains its focused field. These adaptations keep the composer and editor reachable on the iPhone SE
at increased text sizes. Opening a sheet dismisses the previous screen's keyboard.
Its progress control reserves its full 44-point touch height inside the dock, keeping page and playback buttons outside
the seek target. This makes the phone dock taller than the web's pointer-sized progress strip.
`PodcastEpisodeSeekBar` overlays the SDK-compatible system slider on shared chapter segments for touch. Its accessible
wrapper supplies bounded 30-second forward and 15-second backward actions through the shared playback rules.
`PodcastEpisodeTranscript` uses a bounded platform ScrollView, orange scrollbar, theme-aware
fade, and the shared expansion state. `PodcastThemeSongNote` opens the shared credits and full lyrics in a sheet.
A chapter's source opens the current Finding reader; an eligible missing Finding exposes chapter ratings in a sheet.
`chat/PodcastEpisodeChapterTag` adapts the same shared tag as web, so earlier podcast questions retain chapter playback.
The bottom player's linked cover and title open the loaded episode's screen without restarting audio. Its accessibility
label includes the full episode title even when the visible title truncates. Topic and episode screens use the same
player card and segmented seek control.
Episode titles and theme-song credit buttons use sibling elements. React Native text grouping otherwise hides the
embedded button from screen readers; each heading and credit button remains independently accessible. Credits and
feed sheets receive concrete trigger refs so closing them returns screen-reader focus to the opener.

`PodcastFeedDialog` uses core's account-scoped request hook and composition. `podcastFeedActions.ts` adapts only
supported podcast schemes; app config declares iOS `podcast` and Android `pcast` queries. Copy is always available.
Reset requires confirmation in both apps. Closing, changing account/Topic/link, or denied access retires private link
work. Feed tokens and signed audio URLs stay out of logs and telemetry. `RemovePodcastEpisodeDialog` confirms the same
copy as web, unloads matching playback, removes that episode's checkpoint, and refreshes affected lists/pages.
`common/ConfirmDialog` supplies the platform alert for these shared confirmations.

Checkpoint writes occur at playback start, every 30 seconds of playing progress, seek, speed change, pause, replacement,
background transition, completion, and orderly exit. Storage holds no audio URL, title, transcript, or session header.
Forced termination can lose progress since the last completed checkpoint; network progress remains best effort.
Confirmed episode access loss clears playback, metadata, and the checkpoint. A transient check failure pauses and
retains retry. A signed stream can remain buffered until a later access check; this is not instant remote revocation.

The audio patch and configuration change the runtime fingerprint and require a new development/store build; an OTA
update cannot add them to an old binary. See `patches/README.md` for the patch boundary and upgrade checks.
Stories exercise playback, buffering/error, long titles, missing Findings, recording/failure, transcript, credits,
feed states, reset confirmation, and the dock. Device QA for this change uses only the existing iPhone SE simulator.

`common/ShimmerText.tsx` shares the existing foreground-only, reduced-motion-aware highlight across Coffee Talk,
recording cards, and feed loading. `ThinkingLine` supplies its shared phrase; no JavaScript frame loop is added.

## Voice

The web's spoken questions and answers over the phone's microphone and a second audio player. Core owns the state:
`useVoiceRecording`, `useListenMode`, `useChatRoomSpokenAnswer`, the spoken answer store and queue, the audio cache, and
the notice store. The app supplies the platform pieces:

- `voicePermission.ts` asks for the microphone on the first mic tap. A denial that the phone will not ask about again
  adds "Open settings" to Carl's line.
- `voiceRecorder.ts` records mono AAC at 16 kHz and 32 kbps in an `.m4a` per recording, reads the metering every 100 ms
  into core's silence rules, and deletes the file on every end but a send. A development build logs one level trace per
  recording, which the hardware check reads to set `NATIVE_SILENCE_THRESHOLD_SETTINGS`.
- `voiceAudioMode.ts` is the one audio mode the podcast player and the recorder share, with the microphone allowed only
  while a recording runs, so spoken answers and podcast episodes play on the playback category over Bluetooth.
- `spokenAnswerAudio.ts` plays each spoken part from a `spoken-part-*` cache file, deletes it once the part ends or
  stops, reads a system stop from `playing: false`, and names the host on the lock screen.
- `voiceCacheFiles.ts` writes those files and sweeps every `spoken-part-*` and `voice-recording-*` file. Each file, like
  each picked copy, is deleted through `cacheFiles.ts`'s `deleteCacheFile`.
- `components/chat/SpokenAnswerAudio.tsx`, beside `PodcastEpisodeAudio` in the root layout and restarted for each user
  id, registers the player and the notices, sweeps at launch, and stops the answer, drops its audio, and sweeps when the
  account ends. The root layout sets the voice client to read a part as its bytes, and limits core's spoken audio cache
  to 8 MB. The phone holds those bytes in the app's own memory.
- `components/chat/useVoiceRecording.ts` wraps core's hook with the recorder. The app leaving for the background ends a
  recording and listen mode. iOS's inactive state does not end them, and the microphone prompt itself makes the app
  inactive. Its `useLeaveVoiceRecordingOnBlur` does the same once a chat screen loses focus, so the mic never reopens
  under a profile or a link pushed on top. Each composer owns its recording, so the meter re-renders the composer alone.
- `voiceSession.ts` is the voice's part of the session exit: a podcast question ends without resuming the podcast
  episode, recordings end and the answer stops at once, and an accepted sign-out drops the spoken audio from memory.
- `components/chat/chatNotice.ts` is the chat's alert, the app's counterpart of the web's transient toast.
- `components/chat/MicButton.tsx`, `RecordingBar.tsx`, and `SpokenAnswerButton.tsx` are the web's controls of the same
  names. The mic takes `ChatComposer`'s send slot, the bar its recording bar slot, and the play button sits beside the
  copy button in the `ChatTurnBlock` and `ChatRoomMessageBubble` footers. `SpokenAnswerControl` draws the play button
  for a state, which its stories render. `voiceRecordingStoryFixtures.ts` is the stories' voice recording.
- `components/podcast/PodcastEpisodeQuestionControls.tsx` is the web's podcast mic and stop. The dock's controls show
  the stop in the skips' place while a question runs and the mic beside it, the card's controls add the mic after the
  speed button in `MOBILE_PLAYBACK_CONTROL_BUTTON_CLASS`, and the dock reads each phase aloud through
  `announceForAccessibility`. The stories render `PodcastEpisodeQuestionControl` and
  `PodcastEpisodeQuestionStopControl`. The button state rule, the label, and the visibility rule are core's, in
  `podcastEpisodeQuestionRules.ts`, and both apps' podcast adapters register core's
  `PODCAST_EPISODE_QUESTION_AUDIO_CALLBACKS`, which end a question on a play or a seek.

The answer player reads interruptions from the player's status. A pause while a part plays, not buffering and more than
a quarter second before its end, is a system stop: a call, a removed headset, or the lock screen's pause. Core then
stops the answer as a media session pause, which leaves a podcast episode paused. A finished or failed part moves the
queue on. Once an answer ends, core gives the lock screen back to the loaded podcast episode through the podcast
adapter's `updateMetadata`.

Every private audio file is a cache file with a known prefix. A spoken part's file is written before it plays and
deleted when it ends, on a stop, on a newer part, and on a stop during its write. A recording's file is deleted once
sent and on every other end. `SpokenAnswerAudio` sweeps both prefixes at launch and when the account ends, and its
cleanup releases the player.

Unverified values, until the hardware check below runs: `NATIVE_SILENCE_THRESHOLD_SETTINGS` in `src/voiceRecorder.ts`
(`minimum` 0.03, `ambientRatio` 2, `margin` 0.01), and the 300 ms ambient sample and the shared 1.5 s end of speech and
8 s no-speech waits in `packages/core/lib/voiceRecordingDecisions.ts`. Whether metering is enough without an on-device
voice activity detector is unmeasured.

The hardware check runs on a real iPhone and a real Android phone, each on a development build of the current native
config, signed in, with Metro's log open. Each recording logs one `voice level trace` line with the platform, the
ambient level, the silence threshold, the peak level, and how the recording ended.

1. In a quiet room, through the built-in microphone, ask three short questions in the private chat. Each recording
   ends as `send` about 1.5 s after the last word.
2. Repeat in a noisy room, such as a TV at conversation volume. A recording that ends mid-sentence means the threshold
   is too low for the room, and one that never ends means it is too high.
3. Tap the mic and stay quiet. The recording ends as `noSpeech` after 8 s with Carl's line.
4. Repeat the first two steps through a Bluetooth headset, then play Carl's answer. It plays through the headset.
5. Take a phone call during a recording and again during an answer. The recording ends as `interrupted`, the answer
   stops, and the app's cache holds no `voice-recording-*` or `spoken-part-*` file afterwards. On Android,
   `adb shell run-as com.carlnotes.app ls cache` lists the cache.
6. Remove the headset during an answer. The answer stops and does not move to the speaker.
7. Ask Vienna a question from the podcast dock and lock the phone while she answers. The lock screen names Vienna, then
   shows the podcast episode again, which resumes on its own.

Record each room's and route's ambient and peak levels, the chosen `minimum`, `ambientRatio`, and `margin`, and whether
metering was enough in this section, then replace the guess comment on `NATIVE_SILENCE_THRESHOLD_SETTINGS` in
`src/voiceRecorder.ts`. Anything not run stays listed as unverified.

The iOS simulator records through the Mac's input. If the Mac has not let the Simulator use the microphone, the
recorder's prepare never returns, and the mic shows its spinner until Cancel. Expo runs async native calls on one
shared queue, so every later `expo/fetch` request waits behind the stuck prepare too, and screens stay loading until
the app restarts. A real iPhone never waits on the Mac, so this is a simulator limit, not an app state.

Reuse, with the web references in `apps/web/src/components/chat/` and `apps/web/src/components/podcast/`:

- Shared composition: `ChatTurnBlock`, the bubble footers, and core's `PodcastPlayer` and `PodcastEpisodePlayerCard`,
  which take the mic through their element slots.
- Shared logic: core's `useVoiceRecording`, `useListenMode`, `useChatRoom` with `useChatRoomSpokenAnswer`,
  `useTopicChat`'s spoken answers, the spoken answer store, queue, and audio cache, the notice store, the question store
  and rules, `isMicShown`, the spoken questions paused copy (`spokenQuestionsPaused.ts`), and the rejection copy.
- Native replacements: the recorder, the permission, the answer player and its cache files, the audio mode, the
  notices as system alerts, and the controls above, each drawn with mobile Nightshift primitives. The app has no
  visitor mic in the chat, and its paused mic says when speaking comes back on every plan, since the app sells nothing.

The app config declares the microphone's purpose in Carl's words through both the audio and the image picker plugins,
since a `false` in either removes it, and allows Android's `RECORD_AUDIO`. Background recording stays off. This
changes the runtime fingerprint, so it needs a new development and store build; an EAS Update cannot add it.
