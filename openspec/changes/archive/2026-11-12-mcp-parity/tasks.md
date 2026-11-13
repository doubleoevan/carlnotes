# Tasks

## 1. Callable modules out of route handlers

- [x] 1.1 Move note rename, visibility, delete, and the version-checked body save (`saveNoteBody` with Terms,
  sanitizing, moderation, and the stale-version result) into `apps/api/note/noteWrites.ts`, with a context-free
  `loadVisibleNote(userId, noteId)`, and have `notes.ts` call them; the note route tests pass unchanged and a new
  module test covers a stale version
- [x] 1.2 Move topic image regenerate and upload into `apps/api/topic/topicImageEdits.ts` over bytes instead of a
  multipart context (`regenerateTopicImage`, `replaceTopicImageFromBytes`), with context-free `toImagePromptRejection`
  and image reading, and have `topicImagesRoute.ts` call them; the image route tests pass unchanged
- [x] 1.3 Add `setTopicImageFromUrl` beside them, fetching through `toFetchableUrl` and calling
  `replaceTopicImageFromBytes`; tests cover a non-image url, an oversized image, and a private address
- [x] 1.4 Move the team room read composition and the post's Terms, text moderation, and daily spend cutoff into
  `apps/api/chat/roomReads.ts` and `roomPosts.ts`, and have `roomRoute.ts` call them; the room route tests pass
- [x] 1.5 Export `loadProfile`, `loadActivity`, and `flagContent`, and move the report's analytics into
  `flagContent`; the profile, activity, and report route tests pass and a test shows the report event fires from the
  module
- [x] 1.6 Move the self-block and user-exists checks into `saveUserBlock`; the block route tests pass and a module
  test covers blocking oneself
- [x] 1.7 Move the `/topic-feed` quota merge into `apps/api/topic/topicFeedResponse.ts`, and have `api.ts` call it; the
  topic feed route test passes
- [x] 1.8 Run `toTopicSaveRejection` before `applyTopicEdit` for `edit_topic` and the chat's agreed edit; a test shows
  an objectionable name saves nothing in both
- [x] 1.9 Update `apps/api/AGENTS.md` for each new module

## 2. Annotation contract

- [x] 2.1 Set `destructiveHint: false` on `mark_finding_consumed`, `rate_finding`, `bookmark_finding`,
  `follow_topic`, `edit_topic`, `suggest_sources`, `create_topic`, `stop_scan`, and `save_reaction`, with the idempotent
  and open-world hints of design section 1
- [x] 2.2 Change `toMcpToolContractIssues` so the four irreversible writes must be destructive and any other write
  must not be; `tools.test.ts` fails on an additive write marked destructive and on an irreversible one that is not

## 3. Topic tools

- [x] 3.1 Add `team_id` (add or remove) to `edit_topic` through `addTopicToTeam` and `removeTopicFromTeam`; tests
  cover a leader adding a Topic and a non-leader's rejection
- [x] 3.2 Add `set_topic_image` (regenerate with an optional prompt, or `image_url`), with `destructiveHint: true`,
  returning the topic view; tests cover the monthly allowance, a non-editor, and a bad url, and a smoke section calls it
  on both routes
- [x] 3.3 Add `add_topic_attachment` (a url through `ingestUrlAttachment`, or text and a title through
  `ingestAttachment` as text/plain), owner only; tests cover both inputs and a non-owner, and a smoke section calls it
  on both routes
- [x] 3.4 Add the three tools' rows and phrases to `apps/docs/src/content/docs/account/add-to-ai.md`

## 4. Tasting note tools

- [x] 4.1 Add `read_notes` (a page's notes, or one note with html and version) with untrusted fences and the page-size
  limit; tests cover a visitor on a public topic, a team note for a member, and a long html cut at a block boundary
- [x] 4.2 Add `save_note` (create, rename, visibility, body with version) with `destructiveHint: true` through task
  1.1's module; tests cover a stale version, a visibility the page does not allow, moderation, and the Terms check
- [x] 4.3 Add `delete_note` with `destructiveHint: true`; a test shows a teammate's note is not deleted
- [x] 4.4 Add smoke sections for the three tools on both routes with a result-size check, and their docs rows

## 5. Team tools

- [x] 5.1 Add `list_teams` and `read_team` (header, members, topics, notes, and the room page for a member, fenced);
  tests cover a member, a non-member, and a visitor
- [x] 5.2 Add `request_to_join_team`, `send_invite`, and `respond_to_invite`; tests cover the email invite limit, a
  blocked recipient, the member limit on accept, and a decline
- [x] 5.3 Add `post_to_team_room` through task 1.4's module; tests cover a non-member, moderation, and a message to
  Carl past the daily spend cutoff
- [x] 5.4 Add smoke sections for the five tools on both routes with a result-size check on `read_team`, and their docs
  rows

## 6. Profile, activity, and account tools

- [x] 6.1 Add `read_profile` through `loadProfile`; tests cover another user seeing public items only and a visitor
- [x] 6.2 Add `read_activity` with each received invite's id; a test shows `respond_to_invite` accepts that id
- [ ] 6.3 Add regenerations left to the account read and to `AccountBudget` on the web and in the mobile app; a story
  shows the line, and the account page renders it at phone width on both apps
- [x] 6.4 Add `read_account` (plan, spend meter and cutoffs, the day's scans, regenerations left, plan and billing links
  to carlnotes.com); a test shows no purchase action in the result
- [x] 6.5 Add smoke sections for the three tools on both routes, and their docs rows

## 7. Social tools

- [x] 7.1 Add `report_content` through `flagContent`, taking the report dialog's kinds (`topicPostImage` for an Open
  Mic post); tests cover the daily report limit and blocking the author, and a smoke check finds the report in the
  admin console's open reports
- [x] 7.2 Add `block_user`; tests cover blocking, unblocking, and blocking oneself
- [x] 7.3 Add `delete_hot_take` with `destructiveHint: true` through `deleteComment`; tests cover the author, the
  topic's owner, and another user
- [x] 7.4 Add the post image url to `read_topic_post`'s text result; the topic post tool test reads it
- [x] 7.5 Add smoke sections for the three new tools on both routes, and their docs rows

## 8. Topic sections and similar topics

- [x] 8.1 Add `section` (yours, followed, featured, popular) and `similar_to_topic_id` to `list_topics` through task
  1.7's module and `loadRelatedTopics`; tests cover a visitor's popular section and a topic's similar topics
- [x] 8.2 Extend the `list_topics` smoke section with both inputs and a result-size check, and update its docs row

## 9. Components into packages/core

- [x] 9.1 Move `NoteDetails` and `NotesList` into core with their `…Elements` types; the web note dialog, the team and
  topic pages, and the mobile note screen render them, with stories on both apps
- [x] 9.2 Move `TopicsTable` (with `TopicInfo` behind an element), `TeamMembersTable`, `OwnerTopicsTable`, and
  `TeamsMembershipTable` into core; both apps render them, and their rows leave `apps/mobile/parity.md`
- [x] 9.3 Move `TeamHeader` onto core `AvatarHeader`, `TeamSections`, and `ChatRoomMessageList` into core; the web
  team page and the mobile team screen render them
- [x] 9.4 Move `ProfileSections` into core; the web profile page and the mobile profile screen render it
- [x] 9.5 Move `ActivitySections`, `TopicSubscriptionsTable`, and `TopicInvitesTable` with `SentInvitesTable` into
  core; the web activity page and the mobile activity screen render them
- [x] 9.6 Move `SpendMeter` with its meter parts into core; the web and mobile account pages render it
- [x] 9.7 Move `RelatedTopicsSection` into core; the web topic page and the mobile topic screen render it
- [ ] 9.8 Compare every changed web page and mobile screen at phone width, in light and dark and at the largest text
  size, on iOS and then Android, and record the references and any adaptation in `apps/mobile/parity.md`;
  `bun scripts/check-component-parity.ts` passes
- [x] 9.9 Update `packages/core/AGENTS.md`, `apps/web/AGENTS.md`, and `apps/mobile/AGENTS.md` for the moved components

## 10. The new MCP views

- [x] 10.1 Gather the view element overrides that more than one view uses into
  `apps/web/src/mcpViews/mcpViewElements.tsx`, folding the existing per-view override files into it; the existing
  views' stories and smoke sections pass unchanged
- [x] 10.2 Add `note`, `team`, `profile`, `activity`, `account`, and `topics` to `MCP_VIEWS`, their descriptions,
  opening paths, and routes, and bump `MCP_VIEW_VERSION` to 12 with aliases 2 to 11; `uiResources.test.ts` counts
  sixteen views
- [x] 10.3 Build the note view on `NotesList` and `NoteDetails` with an edit-on-site link
- [x] 10.4 Build the team view on `TeamSections` and `ChatRoomMessageList` with the room cursor calling `read_team`
- [x] 10.5 Build the profile view on `ProfileSections`, the activity view on `ActivitySections`, and the account view
  on `AvatarHeader`, `AccountBudget`, and `SpendMeter`, with plan and billing links through the host
- [x] 10.6 Build the topics view on `CardsSection` and `TopicCard`, and similar topics on `RelatedTopicsSection`,
  with a card opening the findings view
- [x] 10.7 Point each tool at its view per design section 1; `tools.test.ts` pins the 22 tool-to-view pairs at `?v=12`
- [x] 10.8 Add a story for each new view for a visitor and a user with the fetch guard on, each naming its differences
  from its page; the component browser builds with no `/api` request
- [x] 10.9 Add a test host section for each new view that asserts each action, and add the views to the 320px check;
  `bun run smoke:mcp-views` passes
- [x] 10.10 Describe the new views in the add-to-ai docs page's "CarlNotes inside your AI app" section, and in
  `apps/web/AGENTS.md`

## 11. Films in the host

- [x] 11.1 Add `MCP_VIEW_FILM_PLAYBACK` to the env settings and `.env.example`, off by default, and keep the film's
  signed video and captions urls in `toMcpViewPodcastEpisode` while it is on; `mcpViewData` tests cover both states
- [x] 11.2 Add the view film adapter (an in-frame video, with no picture-in-picture or fullscreen request), and have
  the findings view's player render `TopicPodcastEpisodeVideoPlayer` while the setting is on and the Watch link while it
  is off; the findings view's test host section covers both, and the audio player plays in both
- [x] 11.3 Name the setting in `apps/api/AGENTS.md` and the deployment guide

## 12. Integration

- [x] 12.1 Update the annotation fixture with the 43 tools in registration order and their phrases, and the docs page's
  tool count and "Words that reach each tool" table
- [x] 12.2 Run `bun run smoke:mcp` under Doppler and `bun run smoke:mcp-views`; both pass
- [x] 12.3 Run `bash scripts/preflight.sh`; it passes
- [x] 12.4 Render each new view in the test host at desktop and 320px, and compare it with its web page for the same
  fixture; record the comparison and each named difference in the ship report

## Workflow follow-up

- Done before the deploy: `bun run mcp-views:freeze`, run from origin/main, stored version 11's bundle in prd
  storage and named it in `packages/contracts/mcpViewVersions.json`.
- After the deploy: the Notion row 64 manual checks, the Claude listing edit with the new names and screenshots, and
  `MCP_VIEW_FILM_PLAYBACK=true` in Doppler prd once mcp-review allows it.
- Update the Parity table on the CarlNotes MCP UI page in Notion.
