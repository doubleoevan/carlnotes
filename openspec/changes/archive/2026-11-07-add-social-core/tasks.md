# Tasks

Sections 1 to 15 are the first build. Each task there is worded to what still holds after the Hot takes redesign,
and the parts the redesign replaced are in sections 16 to 32.

## 1. Decisions and vocabulary

- [x] 1.1 Confirm the owner approved every default under "Decisions for approval" in `design.md`. If one changed, run
      `/opsx:update` on the delta specs it names before any other task. Verify: `openspec validate add-social-core
      --strict` passes after the edit.
- [x] 1.2 Add Reaction, Comment, social target, admin block, and notifications email to the entity table in
      `.agents/skills/domain-model/SKILL.md`, and add "Digest" for an email to the rejected terms. Verify: each noun
      has one row and `bunx biome check .` passes.

- [x] 1.3 Rename the topic scan email's `digest` identifiers to `TopicScanEmail` names, reword the comments, docs,
      and customer copy that say digest for an email, and list the old names in `.agents/commands/audit-structure.md`.
      Verify: `bunx tsc -b` and the notify, scan email, and workflow tests pass, and a grep for digest finds only
      the hash sense, the analytics event, and quoted sample mail.

## 2. Contracts

- [x] 2.1 Add `reactionTypes`, `socialTargetKinds`, the new `reportSubjectKinds`, and the `blocked` resolution to
      `packages/contracts/enums.ts`, and the length and edit-time constants beside `NOTE_COMMENT_MAX_CHARS`. Verify:
      `bunx tsc -b` passes.
- [x] 2.2 Add the social text normalizer (reject control characters, strip markup and forged fence tags) and the
      comment mention parser on `CHAT_MENTION_PATTERN`. Verify: unit tests cover a null character, an html tag, a
      forged closing tag, a line break, and a mention beside punctuation.
- [x] 2.3 Add the zod payloads and the `Reaction`, `ReactionSummary`, `Comment`, and `SocialTarget` types, and add the
      optional summary and first thread page to the Topic page, Podcast Episode page, and `TopicFinding` contracts.
      Verify: `bun scripts/check-contract-freeze.ts` passes with no snapshot change.
- [x] 2.4 Add the signal constants to `packages/contracts/sourceScoring.ts` and the social events to
      `packages/contracts/analyticsEvents.ts`. Verify: the contract tests pass. `MCP_VIEW_VERSION` is raised by
      `bun run mcp-views:freeze`, which is the owner's release step under Workflow follow-up.

## 3. Schema, gate, and limits

- [x] 3.1 Add `packages/db/schema/social.ts` (`reactions`, `comments`, `comment_mentions`) and
      `notificationsEmailSends.ts`, the `reaction_type` enum, the three `users` columns, and the enum values. Run
      `bun run db:generate`. Verify: the migration sets a lock timeout, changes no existing row, applies to the dev
      database, and the schema test passes.
- [x] 3.2 Add the two-direction block filter and the admin block filter to `packages/db/contentFilters.ts`. Verify:
      unit tests cover each direction, no block, and an admin-blocked author.
- [x] 3.3 Add `social:post`, `social:moderate`, and `admin:setAdminBlock` to `packages/db/authorization.ts`. Verify: the
      gate tests cover a follower, the owner, an admin, a user without access, a blocked pair, and an admin-blocked
      user.
- [x] 3.4 Extract `toAccountSignalWeight` in `packages/db/inviteLimits.ts`, have the invite limit call it, and add the
      reaction and comment daily counters on `countRateLimitHit`. Raise `DAILY_REPORT_LIMIT` to 50. Verify: the
      existing invite limit tests pass unchanged and new tests cover the 201st save and a save after a delete.
- [x] 3.5 Name the new schema files, filters, and capabilities in `packages/db/AGENTS.md`. Verify: every path the
      doc names exists.

## 4. Reactions api

- [x] 4.1 Add `apps/api/social/socialTargets.ts`, which resolves a social target to its Topic, owner, and path and
      rejects a post and an unreadable target alike. Verify: unit tests cover each kind and both rejections.
- [x] 4.2 Add the save route in `apps/api/social/reactions.ts`, with the rate limiter, the terms check, and the daily
      limit. Verify: route tests cover a save, a second save, and a visitor, and a smoke test sends two saves at once
      and finds one row.
- [x] 4.3 Add the batched summary loader and include it in the Topic page, Podcast Episode page, and feed payloads.
      Verify: a test proves a 40 Finding feed makes the same query count as a 1 Finding feed, beside the existing
      query budget test.
- [x] 4.4 Delete a Podcast Episode's reactions and comments in its removal. Verify: the removal test finds none left.
- [x] 4.5 Add the `social/` folder to `apps/api/AGENTS.md` and a reactions and comments row to the root routing
      table. Verify: every path the docs name exists.

## 5. Comments api

- [x] 5.1 Add the post, edit, delete, and paged list routes in `apps/api/social/comments.ts`, with stored mentions
      and the chapter position check. Verify: route tests cover a post, an edit inside and after the edit time, each
      delete, a chapter on a Topic, and paging.
- [x] 5.2 Add `GET /api/usernames` for mention suggestions and the per-caller read limiter in `apps/api/rateLimit.ts`,
      and apply the limiter to the list routes. Verify: tests cover the prefix, the eight result limit, a blocked
      pair, a visitor, a fixed page size, and the address limit.
- [x] 5.3 Include the thread's first page in the Topic page and Podcast Episode page payloads. Verify: the page
      render test finds a Comment's text in a public Topic's html and in a public Podcast Episode's html.

## 6. Reports and the admin block

- [x] 6.1 Add the Finding, Podcast Episode, and Comment subject kinds to `apps/api/report/reportSubjects.ts`, keep a
      reported Comment in its reporter's reads with its flag filled, and make `comment` removable in
      `adminReports.ts`. Verify: tests cover a flag of each kind and Remove on a Comment.
- [x] 6.2 Add the admin block routes and the `blocked` resolution, which deletes a removable subject, sets the block,
      and closes the report. Verify: tests cover Block on a Comment, Block on a Finding, a non-admin, and a GET of
      the report link that changes nothing.
- [x] 6.3 Write quoted urls with bracketed dots in `packages/emails/report-email.tsx` through one shared helper.
      Verify: the email test finds no anchor built from subject text.
- [x] 6.4 Add Block to `AdminReportsTable` and a block control to the admin console's users table. Verify: stories
      cover a report with and without an author, and the browser preview blocks and unblocks a seeded user.

## 7. Shared components

- [x] 7.1 Extract `TextComposer` from the note thread's composer into `packages/core/components` and have
      `NoteComments` use it on both apps. Verify: the note comment tests and stories pass unchanged.
- [x] 7.2 Add `packages/client/socialClient.ts`, `useReactions`, `useCommentThread`, and
      `packages/core/lib/socialLabels.ts`. Verify: hook tests cover a save, a delete, paging, and a failed post that
      keeps its draft.
- [x] 7.3 Add `ReactionPicker` and `ReactionRow` with their elements types. Verify: component tests cover counts
      with the people who chose each type, the caller's own type marked, and a visitor's press.
- [x] 7.4 Add `CommentThread` with its elements type. Verify: component tests cover a mention link, a chapter tag,
      Carl's name for no author, the delete and Flag controls by `canDelete`, the delete confirmation, and the
      disabled Edit with its reason past the edit time.
- [x] 7.5 Name the components, the hooks, and the client in `packages/core/AGENTS.md` and
      `packages/client/AGENTS.md`. Verify: `bun scripts/check-client-parity.ts` passes.

## 8. Web

- [x] 8.1 Add the web adapters with the six Lucide icons and mount `ReactionRow` in `TopicResourceInfo`, on the
      Topic page, and on the Podcast Episode page. Verify: a story per mount, and the browser preview saves a type
      on one Finding and shows one Reaction.
- [x] 8.2 Mount `CommentThread` on the Topic page, the Podcast Episode page, and in `TopicResourceInfo`, with the
      Topic's and the Podcast Episode's in one collapsible card that stays mounted while closed, and confirm no Team
      page mounts it. Verify: the browser preview posts on each, and a signed-out load of a public Topic shows the
      Comment in the html.
- [x] 8.3 Add Flag to the Finding's and the Podcast Episode's menu and to a Comment's row through
      `ReportIssueDialog`. Verify: the preview flags a Comment and its flag fills.
- [x] 8.4 Send a view event through `captureVisitEvent` as a thread first shows. Verify: a test finds one event per
      page load with no text property.
- [x] 8.5 Read every web screen and story of the first build for notice, warning, or guideline text. Verify: none is
      present except the rejection after a violation.

## 9. Mobile

- [x] 9.1 Add the mobile adapters and mount `ReactionRow` and `CommentThread` in the Topic Finding sheet, the Topic
      screen, and the Podcast Episode screen, with the composer in a bottom sheet. Verify: on-device stories render,
      and the iOS simulator saves a type and posts a Comment.
- [x] 9.2 Add Flag and delete to the mobile rows through the existing sheet form. Verify: the simulator flags and
      deletes a Comment.
- [x] 9.3 Compare each mobile mount of the first build with its web counterpart at phone width and at the largest
      text size, and record the result and any adaptation in `apps/mobile/parity.md`. Verify:
      `bun scripts/check-component-parity.ts` passes.

## 10. MCP

- [x] 10.1 Register the reaction save tool, the thread read tool, and the post tool in `apps/api/mcp/` with titles,
      annotations, and descriptions that name Carl and CarlNotes. Verify: the annotation contract test passes with
      twenty-two tools.
- [x] 10.2 Add each Finding's reaction counts to the `read_topic_feed` result. Verify: a test reads the result with
      the version 9 fixture bundle and with version 10.
- [x] 10.3 Mount `ReactionRow` in `McpViewFindingDetails` with a tool-call adapter. Verify: stories with and without
      reactions, a test host assertion for the `save_reaction` call, and `bun run smoke:mcp-views` passes.
- [x] 10.4 Add the three tools to the MCP section of the privacy policy and to `apps/docs`. Verify: the policy keeps
      every existing section, and `bun run build:docs` passes.

## 11. Scoring and the prune

- [x] 11.1 Add the signal loader in `packages/pipeline/review`, weighted by `toAccountSignalWeight` and leaving out
      blocked and admin-blocked authors. Verify: unit tests cover five and ten new accounts and a blocked author.
- [x] 11.2 Order `loadScoreExamplePages` as bookmarked, then by signal, then thumbs up. Verify: tests cover the order
      and a thumbs down with a high signal.
- [x] 11.3 Spare a Finding with a Comment in `filterTopicFindings`. Verify: tests cover a Finding with a Comment past
      the cut.
- [ ] 11.4 Run the relevance scoring eval before and after, once the redesign's scoring context change in section 20
      is in. Verify: the eval's pass rate does not drop, and the result is recorded in `evals/results`. The owner
      runs it, since it makes paid model calls.

## 12. Notifications email

- [x] 12.1 Add `packages/emails/notifications-email.tsx` with the quote helper (escape, 140 characters, bracketed
      urls) and the ten quote limit, and add it to `previewEmails.ts`. Verify: template tests cover a url, an html
      tag, 14 Comments, and no anchor outside CarlNotes.
- [x] 12.2 Add the second unsubscribe token payload and handle it in `apps/api/unsubscribe.ts` for the page link and
      the one-click header. Verify: tests cover both entry points, a forged token, and an unchanged Topic email
      setting.
- [x] 12.3 Add `sendNotificationsEmails` to the sweep under a job lease, with the activity query, the exclusions,
      the insert-then-send row, and the retry on a failed send. Verify: tests cover one email a day, a quiet day, a
      second sweep, a failed send, a blocked author, and a deleted Comment, and a test proves no model call is made.
- [x] 12.4 Add the switch to the shared `NotificationsSection`, mount the section on the web account page, and add
      the preference route. Verify: stories on both apps, and the preview turns the switch off and on.
- [x] 12.5 Name the sweep step and the template in `apps/worker/AGENTS.md` and `packages/emails/AGENTS.md`. Verify:
      every path the docs name exists.

## 13. Analytics

- [x] 13.1 Send the server events from the reaction, comment, delete, and flag paths through `trackEvent`. Verify: a
      test per event asserts its ids, its owner flag, and that no property holds text or a username.

## 14. Docs

- [x] 14.1 Rewrite the privacy policy's user content section to cover Reactions and Comments, who reads them, and how
      they are deleted, and follow the terms acceptance rule if it calls for a new version. Verify: the privacy page
      renders and its test passes.
- [x] 14.2 Add a docs page on reacting and writing in a thread under `apps/docs/src/content/docs`. Verify:
      `bun run build:docs` passes and the page reads at 120 columns.
- [x] 14.3 Add the first build's copy lines to the Persona & Voice page in Notion. Verify: the page's "Where Carl
      shows up" table holds each line.

## 15. Integration

- [x] 15.1 Run `bun run check` on the first build. Verify: every step is green.
- [x] 15.2 Walk the Prompt queue row's checks 2 to 8 in the browser preview, the iOS simulator, and a connected MCP
      client, with the changes that the approved decisions made to them. Verify: each check's result is recorded,
      and any check that did not run is named with the reason.

## 16. Redesign: migration and contracts

- [x] 16.1 Change `packages/db/schema/social.ts`: drop `reactions.text` and `text_saved_at` with their checks, make
      `reaction_type` required, add `reactions.comment_id` with its partial unique index, add
      `comments.shared_with_carl_at`, `shared_topic_id`, and `aired_podcast_episode_id` with the shared index and
      the check that the Topic is set exactly if the time is, add the index on `parent_comment_id`, and add the
      `comment_links` table. Verify: the schema test passes.
- [x] 16.2 Run `bun run db:generate` and edit the new migration so it copies each stored reaction text into a
      Comment on the same social target before the columns drop, deletes Reactions left with no type, and sets a
      lock timeout. Verify: it applies to the dev database, a Reaction that held text is now a Comment by the same
      user on the same target, and no Reaction has a null type.
- [x] 16.3 In `packages/contracts`: add `comment` to `socialTargetKinds` and add `commentTargetKinds` with the four
      kinds a Comment hangs on, remove `reaction` from `reportSubjectKinds`, remove `REACTION_TEXT_MAX_CHARS` and
      the reaction text schema, and add `COMMENT_REPLY_PREVIEW_COUNT`, `SHARED_COMMENT_SLOTS`, and
      `SHARED_COMMENT_CONTEXT_COUNT`. Verify: `bunx tsc -b` passes and no import of a removed name remains.
- [x] 16.4 Change the payloads: `ReactionSummary` is `{ counts, ownReactionType }` with the newest eight users on each
      count, the save payload is a target and a nullable type, `Comment` gains `parentCommentId`, `replyCount`,
      `replies`, `reactions`, and `isSharedWithCarl`, the post payload gains an optional parent, the thread response
      gains optional `sharedCommentSlots`, the share payload is `{ isShared }`, the post and the edit each respond
      `{ comment, sharedCommentSlots }`, and the share responds `{ isSharedWithCarl, sharedCommentSlots }`. Update
      `socialRouteContracts.ts` and `socialTestFixtures.ts`. Verify: `bun scripts/check-contract-freeze.ts` passes with
      no snapshot change.

## 17. Redesign: the type-only Reaction and reactions on a Comment

- [x] 17.1 Rewrite `saveReaction` as an upsert of the type, with a null type deleting the row, no classification,
      and no edit time. Remove the paged list route, the delete by id route, `deleteReportedReaction`, and the
      reaction report subject. Verify: route tests cover every scenario in `specs/reactions/spec.md` that names a
      request, and the two-saves-at-once smoke finds one row.
- [x] 17.2 Resolve a `comment` target in `socialTargets.ts` to the Topic its Comment's own target belongs to, and
      reject kind `comment` on `GET /api/comments` and on a post. Verify: tests cover a Reaction on a Comment of a
      public Topic, of an invite Topic the caller may not open, and a thread read with kind `comment`.
- [x] 17.3 Change `loadReactionSummaries` to return counts and the caller's own type, and attach a summary to every
      Comment and reply of a thread page in one grouped read. Verify: a test proves a page of 20 Comments with
      replies makes the same query count as a page of one.

## 18. Redesign: replies

- [x] 18.1 Accept a parent in `postComment`: require a parent on the same social target, store a reply to a reply
      under that reply's parent, and copy the parent's target columns. Verify: tests cover a reply, a reply to a
      reply, a parent on another target, and a parent the caller may not read.
- [x] 18.2 Change `loadCommentPage` to page top-level Comments only, newest first, each with its `replyCount` and
      first three replies oldest first, with blocked and admin-blocked authors left out of both. Add
      `GET /api/comments/:id/replies`, paged oldest first, behind the read limiter. Verify: tests cover every
      scenario under "A thread reads newest first in pages of 20, with replies oldest first".
- [x] 18.3 Confirm that deleting a top-level Comment deletes its replies, their mentions, and their reactions.
      Verify: a test deletes a Comment with three replies and finds none left.

## 19. Redesign: sharing and shared comment slots

- [x] 19.1 Add the shared comment slot helpers in `apps/api/social/`: the Topic's shared comment slot count from
      `hasFullPodcastEpisodes` and `SHARED_COMMENT_SLOTS`, and the used count from Comments with `shared_topic_id` set
      and no `aired_podcast_episode_id`. Verify: unit tests cover a free owner, a paid owner, an admin owner, and a
      Comment a script already read.
- [x] 19.2 Add `PUT /api/comments/:id/share`, gated by `isAllowed(userId, "topic:edit", topic)`. Sharing sets the
      time and the Topic inside one transaction under an advisory lock on the Topic, and answers 409 with no free
      shared comment slot. Unsharing clears the time, the Topic, and the aired Podcast Episode. Verify: tests cover the
      owner, a member of the owning Team, a follower, the fourth share on a free Topic, and a racing smoke where two
      shares take one shared comment slot.
- [x] 19.3 Share a Comment or a reply from a user who may edit the Topic as it is posted if a shared comment slot is
      free, unless the composer's switch is off. A post with no share choice shares a top-level Comment and not a reply,
      and anyone else's Comment starts unshared. Verify: tests cover each scenario under "An editor's own Comment starts
      shared".
- [x] 19.4 Derive `isSharedWithCarl` from `shared_with_carl_at` in `toComment`, and include `sharedCommentSlots` in the
      thread response and the page payloads only for a caller who may edit the Topic. Verify: tests cover an
      editor's read, a follower's read, and a visitor's read.
- [x] 19.5 Add `GET /api/topics/:topicId/shared-comments`, newest shared first, for a caller who may edit the Topic.
      Verify: tests cover an editor, a follower, and an admin-blocked author's Comment left out.

## 20. Redesign: scoring context and signal

- [x] 20.1 Change the signal in `reactionSignals.ts` to the weight times 2 per distinct author with a Comment on the
      Finding plus the weight per Reaction on the Finding, and remove the owner text read. Verify: unit tests cover
      fifty Comments from one author, a Comment from an established account, and Reactions on a Comment not
      counting.
- [x] 20.2 Remove the owner's text from the example lines in `scoreExamplePages.ts` and `topicContext.ts`, and
      change `loadFindingIdsWithComments` to read Comments only. Verify: tests cover an owner's Comment absent from
      the example line and the three prune scenarios the redesign reworded.
- [x] 20.3 Load the Topic's `SHARED_COMMENT_CONTEXT_COUNT` most recently shared Comments into `TopicContext`,
      leaving out admin-blocked authors, and append them to the Topic context text as a labeled section after the
      example pages, one `- username: text` line each. The scoring prompt file does not change. Verify: tests cover
      every scenario under "Only a shared Comment reaches a CarlNotes model" that names the scoring prompt, and a
      test finds the lines inside the Topic context's nonce delimiters.

## 21. Redesign: the podcast script

- [x] 21.1 In `loadScriptInput`, take the Topic's waiting shared Comments for this Podcast Episode, most reactions
      first, up to the Podcast Episode's shared comment slots, leaving out admin-blocked authors. Verify: tests cover a
      first read, a retry that reads the same Comments, a retry after a first run that took none, and a Comment shared
      after the read.
- [x] 21.2 Clear the mark in `failPodcastEpisode`. Verify: a test fails a Podcast Episode and finds its Comments holding
      shared comment slots again, and a removed published Podcast Episode's Comments stay marked.
- [x] 21.3 Add the `chapterSharedCommentsBlock` and `closingSharedCommentsBlock` untrusted variables to
      `write-podcast-episode-segment.md` through its builder, the closing list on the last segment's call alone, with
      the rule from D16 and no scripted line, by the prompt-authoring skill with the version raised. Verify: builder
      tests find each chapter's Comments fenced in its segment's prompt, the closing Comments fenced in the last
      segment's prompt alone, and none if the Topic has no shared Comment.

## 22. Redesign: shared links

- [x] 22.1 Write one `comment_links` row per url in a Comment's body when it is shared, delete the Comment's rows
      when it is unshared, and replace its pending rows when a shared Comment is edited. Verify: tests cover a
      share, an unshare, an edit, a Comment with no url, and the same url twice in one body.
- [x] 22.2 Add the Topic's pending Comment links to a Scan's discovered Resources, marked as Personal sources links
      are, and give them `PERSONAL_SOURCE_SCORE_BONUS` in the review's bonus map. Verify: a pipeline test finds the
      page past the embedding gate with the bonus, scored by the ordinary scoring prompt, as a Finding with no
      sender-private explanation.
- [x] 22.3 Set `considered_at` once the review has considered the page. Verify: a test runs two Scans and finds the
      link in the first only.

## 23. Redesign: the Personal sources group

- [x] 23.1 Add the shared Comments call to `packages/client` and render a "Hot takes" group in
      `TopicPersonalSourcesSection` through the shared `ExpandableRow`, for a user who may edit the Topic, outside
      `MAX_TOPIC_SOURCES`. Verify: component tests cover two shared Comments, none, and a user who may not edit.
- [x] 23.2 Add stories for the group on the web and on mobile. Verify: both stories render, and the browser preview
      shows the group in Topic info after a share and not after an unshare.

## 24. Redesign: plan cards

- [x] 24.1 Add the hot takes line after the podcast line in `packages/core/components/PlanCard.tsx`, read from
      `SHARED_COMMENT_SLOTS`. Verify: the plan card test finds "3 hot takes per podcast" on Free and "5 hot takes
      per podcast" on Plus and Premium, and both apps' stories show it.

## 25. Redesign: MCP

- [x] 25.1 Rename the tools to `read_hot_takes` ("Read hot takes") and `post_hot_take` ("Add a hot take", with an
      optional `parent_id`), retitle `save_reaction` to "React" with no text and a Comment among its targets, and
      return each Comment's replies fenced in the read. Update `mcpContractTestFixtures.ts`. Verify: tool tests
      cover every scenario in `specs/mcp-server/spec.md`, and the annotation contract test passes with twenty-two
      tools on both routes.
- [x] 25.2 Remove `latestHotTakes` and its notice from the `read_topic_feed` result, and leave the counts per type
      alone, never the caller's own type. Verify: a test reads the result with the version 9 fixture bundle and with
      the current one.
- [x] 25.3 Reduce `McpViewReactionRow` to the picker with its tool-call client, and update the story, the fixtures,
      and the smoke section. Verify: `bun run smoke:mcp-views` passes.

## 26. Redesign: analytics

- [x] 26.1 Rename the events in `packages/contracts/analyticsEvents.ts` and at their call sites to
      `social_<target>_react` (with `hot_take` for a Comment target), `social_<target>_hot_take` with `isReply`,
      `social_hot_take_delete`, `social_hot_take_flag`, and the client's `social_<target>_hot_takes_view`, and add
      `social_hot_take_share` with `isShared`. Remove the reaction flag event. Verify: a test per event asserts its
      name, its ids, its owner flag, and that no property holds text or a username.

## 27. Redesign: the notifications email

- [x] 27.1 Add reactions on the recipient's Comments and replies to the recipient's Comments to
      `loadNotificationsEmailRows`, with the same exclusions. Verify: tests cover a reply on someone else's Topic, a
      Reaction on a Comment, the recipient's own reply, and a blocked author's reply.
- [x] 27.2 Reword `notifications-email.tsx`: the subject counts hot takes, reactions, replies, and mentions, an item
      says reacted, left a hot take on, or replied to, and no line says Open Mic. Verify: the template tests pass
      with the new lines, and the preview renders each item kind.

## 28. Redesign: shared components

- [x] 28.1 Reduce `ReactionRow` and `useReactions` to the picker and the summary: remove the composer, the listed
      Reactions, the Edit and Delete actions, and the report control. Verify: component tests cover a press, a press
      on the own type, a visitor's press, and a failed save.
- [x] 28.2 Extend `CommentThread` and `useCommentThread`: replies under their Comment with "more replies" paging, a
      Reply action that opens the composer, a `ReactionRow` on each Comment and reply, the share toggle, and the
      shared comment slot count in the composer row. Verify: component tests cover a reply, a reply to a reply, paging
      replies, a shared Comment for an editor and for a follower, and the toggles disabled at the limit.
- [x] 28.3 Change `socialLabels.ts` and `socialElements.ts` to the D14 copy and the new elements (the share toggle,
      the reply list), remove the labels and elements nothing renders, and change `signupPrompts.ts` to one hot take
      key. Verify: `bunx knip` passes.
- [x] 28.4 Give `SocialSection` the card title, the week's count, and the Finding heading, and show an editor the
      shared comment slot count in the thread's composer row. Verify: component tests cover an editor's count and a
      follower's card with none.

## 29. Redesign: web

- [x] 29.1 Update the web adapters: the share toggle with its tooltip and disabled state, the indented reply list, the
      shared comment slot count, and the card titled "Hot takes 🔥" in `TopicResourceInfo`. Remove the web thread's own
      heading. Verify: stories for a thread with replies, a shared Comment as an editor and as a follower, and the limit
      reached.
- [ ] 29.2 Walk the Topic page, the Podcast Episode page, and a Finding's popover in the browser preview as an owner
      and as a follower: post, reply, reply to a reply, react to a Comment, share to the limit, unshare, edit,
      delete with its confirmation. Verify: each step's result is recorded, in light and dark.
- [x] 29.3 Read every changed web screen and story for notice, warning, or explanatory text. Verify: none is present
      except the rejection after a violation and the disabled Edit's reason.

## 30. Redesign: mobile

- [x] 30.1 Update the mobile adapters to match the web: the share toggle, the reply list, the shared comment slot count,
      and the Finding sheet's heading, with the composer still in a bottom sheet. Verify: on-device stories render for
      the same states as the web's.
- [ ] 30.2 Compare each mobile mount with its web counterpart at phone width and at the largest text size, on one
      emulator at a time, and record the result and any adaptation in `apps/mobile/parity.md`. Verify:
      `bun scripts/check-component-parity.ts` passes.

## 31. Redesign: docs and vocabulary

- [x] 31.1 Update `.agents/skills/domain-model/SKILL.md`: a Comment's copy is hot take, a Reaction's copy is
      reaction, shared Comment joins the table, and Open Mic joins the rejected terms everywhere. Verify: a grep for
      Open Mic outside `openspec/` finds only the rejected terms entry.
- [x] 31.2 Rename the docs page to `hot-takes.md` and rewrite it: writing and replying, reacting, sharing with Carl
      and Vienna and the shared comment slots, the Personal sources group, the 15 minute edit, deleting, and reporting.
      Update `account/add-to-ai.md` and `account/reporting-and-blocking.md` for the tool names and for reports of a
      Comment only. Verify: `bun run build:docs` passes and each page reads at 120 columns.
- [x] 31.3 Update the privacy policy: a hot take an editor shares may be read by Carl and Vienna and said on the
      podcast, unshared text is read by no CarlNotes model, and the email covers replies. Follow the terms
      acceptance rule if it calls for a new version. Verify: the privacy page renders and its test passes.
- [x] 31.4 Update `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, `packages/core/AGENTS.md`,
      `packages/db/AGENTS.md`, `packages/pipeline/AGENTS.md`, and the root routing table for the new routes, the
      `comment_links` table, the shared Comments in the scoring context and the podcast script, and the removed
      reaction text. Verify: every path the docs name exists.
- [ ] 31.5 Replace the copy lines on the Persona & Voice page in Notion with the D14 lines. Verify: the page holds
      each line and no Open Mic line.

## 32. Redesign: integration

- [x] 32.1 Run `bun run check` and `bunx openspec validate add-social-core --strict`. Verify: every step is green.
- [x] 32.2 Run `doppler run -- bun apps/api/social/social.smoke.ts` with sections for a reply, a Reaction on a
      Comment, a share to the limit, and a share default. Verify: every check passes.
- [ ] 32.3 Write a Podcast Episode's script for a dev Topic with two shared Comments. Verify: the script's prompt
      held both, the shared comment slots read 0 afterward, and a failed run gives them back.

## 33. Comments woven into the script

- [x] 33.1 Rank waiting shared Comments by reactions and take up to the Podcast Episode's shared comment slots, 3 short
      and 5 full
- [x] 33.2 Screen each Comment's text and username before it is taken, skip a flagged one, and fill its shared comment
      slot
- [x] 33.3 Place a Comment in its narrated Finding's chapter, and every other one in closing turns before the sign-off
- [x] 33.4 Reject a draft with closing turns and nothing to close on, without them, or missing an author's username
- [x] 33.5 Add the owner's Hot takes switch to the podcast settings on web and mobile
- [ ] 33.6 Add the sample hand-offs to the Persona & Voice page in Notion
- [x] 33.7 Add the share switch to the new Comment, reply, and edit composers for a user who may share, off with no
      free shared comment slot
- [x] 33.8 Show five top-level Comments at first, with the standard more toggle under the card, on web and mobile

## 34. Verification fixes

- [x] 34.1 Keep delete and unshare working on a Comment on a Finding rated thumbs down, and reject a new share there.
      Verify: tests cover the author, the owner, an admin, an editor's unshare, and a rejected share.
- [x] 34.2 Leave a shared Comment out of the shared comment slots, the scoring context, the podcast script, the shared
      list, and the Scan's link queue while its Finding is rated thumbs down, or while its author is under an admin
      block or in a block with the Topic's owner, and bring it back if that changes. Verify: tests cover each cause,
      each place, and the return.
- [x] 34.3 Hide a shared list row by someone in a block with the reader in either direction, and require `topic:view`
      on that read. Verify: tests cover each direction and an editor who may not view the Topic.
- [x] 34.4 Clear a waiting share and its queued links on an edit by an author who may not edit the Topic. Verify: tests
      cover that edit, an editor's edit, an aired Comment, and sharing again.
- [x] 34.5 Gate a Comment's edit by `social:post`, count it against the daily Comment limit, and make no classification
      call on an edit that changes nothing. Verify: tests cover an admin-blocked author, the limit, and no call.
- [x] 34.6 Release a shared Comment whose author the last draft leaves uncredited. Verify: a test finds the Comment
      waiting with its shared comment slot held.
- [x] 34.7 Fence the structured content of `read_hot_takes`, reject outdated Terms in `save_reaction` and
      `post_hot_take`, and keep each social tool on the bound Topic. Verify: tool tests cover every new scenario in
      `specs/mcp-server/spec.md`.
- [x] 34.8 Close a Topic with unconverted Personal sources to everyone but its owner, team members included, for
      Findings, threads, reaction summaries, and posts. Verify: tests cover a team member on each.
- [x] 34.9 Read a cursor that does not parse as a first page, add a maximum to a chapter position, and reject a NUL in
      a path, a query, or an id with a 400. Verify: route tests cover each.
- [x] 34.10 Name a Finding in the daily email only if the recipient may see it. Verify: a test covers a Finding the
      recipient may not see.

## Workflow follow-up

- Run `/ship` for the pre-push ritual, which archives the change with `openspec archive add-social-core --yes`.
- Before the push, the owner runs `bun run mcp-views:freeze --bundle <a build of main>` under production credentials.
  It stores version 9, the bundle production serves today, and raises `MCP_VIEW_VERSION` to 10. Both files it writes
  are committed with this change, as `apps/docs/deployment.md` says.
- After the deploy, the owner runs `prompts:sync:prd` for the podcast segment prompt and the moderation prompt.
- The owner runs the relevance scoring eval in 11.4.
- The owner edits the Decisions list on the CarlNotes social page in Notion to the redesign, and checks Shipped on
  row 59.
