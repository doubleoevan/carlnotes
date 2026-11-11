# Tasks

## 1. Approval

- [x] 1.1 Get the user's approval of decisions 1 to 13 in design.md, and fold any change into the design, specs, and
      tasks before task 2.1. Verify: the user's approval is in the conversation and `openspec validate
      cafe-brews-news-open-mic-mentions --strict` passes.

## 2. Domain model, schema, and contracts

- [x] 2.1 Add the rows and rules of design decision 1 to `.agents/skills/domain-model/SKILL.md`: Topic Post, News Event,
      Comment Mention with unseen, Topic Post Discussion, Topic Post Chat, Profile Topic and Profile Podcast Episode,
      profile and team viewers, the `post` social target as a Topic Post, and Open Mic as customer copy only. Verify:
      the Social target, Comment, Home Topic, and rejected terms rows agree with the new rows.
- [x] 2.2 Add `packages/db/schema/topicPosts.ts` with `topic_posts` and `topic_post_discussions`, and give
      `comments.post_id` and `reactions.post_id` a cascading foreign key. Verify: `bunx tsc -b` passes and
      `packages/db/schema.test.ts` finds each cascade in the migration.
- [x] 2.3 Add `comment_mentions.seen_at` with a partial index on `mentioned_user_id` where it is null, and mark the
      mentions from before the column as seen. Verify: the schema test finds the index and the backfill.
- [x] 2.4 Add a nullable `target_topic_id` to `comments` and `reactions` with a `(target_topic_id, created_at)` index,
      set it in `apps/api/social/comments.ts` and `reactions.ts`, and backfill it in the migration. Verify:
      `bun run smoke:social` posts a Comment and a reaction to it and reads the Topic back from both rows.
- [x] 2.5 Add `topics.profile_order` and `episodes.profile_order` beside the `feature_order` columns, each indexed.
      Verify: `bunx tsc -b` passes with the Drizzle property `profileOrder` on both.
- [x] 2.6 Add `users.profile_viewer_count`, `teams.viewer_count`, and the `profile_user_id` and `team_id` references on
      `viewer_counters`, with the check widened to exactly one of four. Verify: the schema test finds the check that
      counts the four references.
- [x] 2.7 Add the `topic_post` chat turn kind with `chat_turns.topic_post_id` and its check constraint, which holds
      after the post is deleted, and `topic_image_renders.topic_post_id`. Verify: `bun run smoke:chat-turns` keeps a
      `topic_post` row with and without its post, and rejects one on a team and a private row that names a post.
- [x] 2.8 Run `bun run db:generate`, apply the migration in dev, and regenerate it at ship time if another worktree's
      migration holds a newer timestamp. Verify: both smokes pass against the dev database.
- [x] 2.9 Add the enums the schema needs to `packages/contracts/enums.ts`: the `topic_post` chat turn kind and the
      Topic Post Discussion kinds and statuses. Every other contract lands with its first consumer in groups 3 to 11,
      since knip fails an export that nothing uses: the viewer count shapes in 3.3, the profile order payloads and the
      new `profileResponse` fields in 4.1 and 4.5, `news.ts` in 5.1, `commentMentions.ts` in 6.2, `topicPosts.ts`,
      `toTopicPostPath`, and the `topic_post` analytics target in 7.2 and 7.3, and `discussionRegenerationLimit` in
      8.5. Verify: `bunx knip` and `bunx tsc -b` pass.

## 3. Profile and team viewers

- [x] 3.1 Add the `profile` and `team` kinds to `packages/db/viewerCounts.ts` and their copy and rebuild to
      `apps/worker/syncViewerCounts.ts`. Verify: the sweep's tests cover a profile and a Team, including a Redis
      restart.
- [x] 3.2 Add `POST /profiles/:userId/view`, `POST /teams/:id/view`, `GET /counts/profiles/:userId`, and
      `GET /counts/teams/:id` to `apps/api/counts/`, with the Team access check. Verify: route tests cover a crawler, a
      private Team, a rate limited sender, and Redis down.
- [x] 3.3 Add the client calls, widen `packages/core/lib/topicViews.ts` into `pageViews.ts` for the three page kinds,
      and add one shared `ViewerCountLine` in `packages/core/components/` with a web and a mobile adapter, on the
      profile and team pages of both apps. Verify: both web pages end with "Visitors: N" on the built ui, a counted
      view raises both count reads, and `Common/ViewerCountLine` has a story for a profile, a team, and the empty line.
- [x] 3.4 Add the Café, Topic Post, and visitor count paragraphs to `apps/web/src/pages/PrivacyPage.tsx` without
      changing the existing policy. Verify: the privacy page test finds the new paragraphs and the existing ones.
- [x] 3.5 Device checks run once, in 13.2, after all the other work, so the machine keeps its memory. The home,
      profile, and team screens' checks are listed there.

## 4. Profile featuring and the cards section

- [x] 4.1 Move the home order's write and release into `packages/db/pinnedOrder.ts` with a scope and a limit, add
      `packages/db/profileOrder.ts` on it, add `profile:setProfileOrder` to `packages/db/authorization.ts`, and add
      `PATCH /topics/:id/profile-order` and `PATCH /podcast-episodes/:id/profile-order` in `apps/api/profileOrder.ts`.
      Verify: the home order tests pass unchanged, and tests cover a non-owner, a private Topic, a thirteenth pin, and
      a move.
- [x] 4.2 Release a profile order where a home order is released: a Topic leaving public or deleted, and a removed
      Podcast Episode. Verify: a test releases a pinned Topic with its pinned Podcast Episode and finds each gap closed.
- [x] 4.3 Extract `CardsSection` into `packages/core/components/` from the home's card sections and render the home's
      sections through it on web and mobile. Verify: the built web home shows its three sections with every card in
      the page and the off-page ones hidden, as before.
- [x] 4.4 Extract `RankDialog` into `packages/core/components/` from `HomeRankDialog`, keep the home's use on the web,
      and add the profile's use on web and in a mobile `Sheet`. Save stays enabled whether or not a row moved, as the
      home's dialog now is. Verify: the web stories cover the first pin, pinning, moving, and a confirmed drop, the
      built web profile pins and clears a Topic, and the mobile stories cover the pinned list and the empty one. The
      mobile sheet's on-device check is in 13.2.
- [x] 4.5 Load the profile's Topic cards and Podcast Episode cards in `apps/api/profileCards.ts`, pins first, then the
      home's order, filtered to what the reader may open, and show them as the two Featured sections on the web page
      and the mobile screen. Verify: tests cover no pins, a visitor's public-only read, the person's own read, and two
      pins of one Topic, and the built web profile shows both sections above the tables.
- [x] 4.6 Tag a profile page and its payloads at the edge, purge the tag on a profile order change and on a release,
      and send `social_profile_order_change`. Verify: the route test's owner pin runs the purge of `profile:<userId>`,
      and the event holds the kind, the id, and the position.

## 5. News

- [x] 5.1 Write `readNews` in `apps/api/news/` as design decision 3 and "The news read" describe, with its cursor.
      Verify: `bun run smoke:news` covers, against the dev database, the three groups' order, ties, the reaction
      grouping, a thumbs down Finding, an invite Topic's activation, blocks in both directions, someone else's
      profile, and the pages, and unit tests cover the cursor, a page across the groups, and each row's link.
- [x] 5.2 Add `GET /news` and `GET /profiles/:userId/news` behind `socialReadRateLimiter`, with pages of 20 and the
      window's total. Verify: route tests cover the window, the cursor, a missing profile, and the 121st read in a
      minute, and the smoke reads a 45-row week in pages of 20.
      *Replaced by 5.10: a page holds five rows, and the smoke reads the week in pages of five.*
- [x] 5.3 Add `GET /updates/opener` over `loadUpdatesOpener` with no Finding marked read. Verify: a test reads the
      opener and finds the unread count unchanged and the cache key shared with `POST /updates`.
- [x] 5.4 Build `NewsList` in `packages/core/components/` with its window picker and `MoreButton`, the web and mobile
      adapters, and stories for a full week, a quiet hour, and a profile's title. Verify: the web stories' play steps
      pass in Storybook. The accessibility check at the largest text size runs on the device in 13.2.
      *Replaced by 5.10: the search results' page buttons stand where `MoreButton` did.*
- [x] 5.5 Replace the home's updates list on web and mobile with the Brews News card: the opener, then `NewsList`.
      Delete the home wrappers of `UpdatesList` and `UpdatesButton` with the hooks, the client call, and the
      `POST /updates` route only they used, render the updates MCP view through core's `UpdatesList`, set its heading
      to "Brew Updates", and add the news title constant. Verify: `bunx knip` passes, the updates MCP view's story
      shows the new heading, and the built web home shows the card. The MCP view smoke runs in 13.1 and the device
      check in 13.2.
- [x] 5.6 Send `social_news_window_change` and `social_news_expand` from both apps. Verify: a hook test finds each event
      with its place and no text.
- [x] 5.7 Draw a news row through the search results' `SearchResultRow` with the row's image: the Podcast Episode's
      own, else the Topic's, else the kind's icon. Verify: a test covers the three images, and the built web home
      shows the thumbnails.
- [x] 5.8 Open the Topic's note from a click on a news row and on a Topic's search result row, through a shared
      `TopicNotePopover` that loads the Topic on open, with the title and the image opening the event or the Topic.
      Verify: on the built web home a row click opens the Topic roast popover and the page stays. The search row and
      the mobile sheet are checked in 13.2.
- [x] 5.9 Keep the day's stored opener for a user with no unread Finding, with no model call. Verify: tests read the
      stored opener with no Finding and find nothing written.
- [x] 5.10 Page the news as the search results page: five numbered rows a page under the window's cursor, the search
      results' page buttons in place of the more toggle, and `social_news_page_open` in place of the expand event.
      Verify: the smoke reads a week in pages of five with and without the cursor, the hook test passes the cursor
      back, and the built web profile shows rows 1 to 5 over five page buttons.
- [x] 5.11 Return each page's Podcast Episodes, show a Podcast Episode's play button on its row with no Topic note,
      and a narrated Finding's chapter play button on its row. Verify: a test picks the episode each kind of row
      plays, and the built web profile shows both buttons.
- [x] 5.12 Open and close the list from its heading's caret, title the list "Brews News" on a profile too, and show
      the day's opener on the person's own profile. Verify: the hook test closes the list and reopens it from the
      picker, and the web story does the same.
- [x] 5.13 Open a search result's page from its Topic or Podcast Episode image on both apps. Verify: the web search
      tests pass. The click itself is checked in 13.2.

## 6. Comment Mention badges

- [x] 6.1 Change `editComment` to keep the `seen_at` of a mention its new body keeps, and store a mention of a
      Comment's own author as seen, so the name still links and never badges. Verify: the social smoke covers a kept,
      an added, and a dropped mention.
- [x] 6.2 Add `GET /comment-mentions/unseen` and `POST /comment-mentions/seen` in `apps/api/social/`, with the cached
      read and the cache clears design "Unseen Comment Mentions" lists. Verify: tests cover a blocked author, an admin
      block, a private page, a deleted Comment, a thumbs down Finding, Mark all seen, and a second read with no query.
- [x] 6.3 Let the thread read take a Comment id and return that Comment's top-level Comment first, and add the
      `?comment=<id>` link to `toSocialTargetPath`. Verify: a test reads a thread by a Comment older than the first
      page, and by a deleted one.
- [x] 6.4 Build `commentMentionStore`, `CommentMentionBadge`, and `CommentMentionList` in `packages/core`, read on a
      page load and after the user's own Comment write, with no timer. Verify: a store test finds no read between two
      page loads, and the stories cover an empty and a full list.
- [x] 6.5 Add unseen Comment Mentions to `toUpdateCount` and to the header's and each page title's combined tooltip, add
      the badge to `SocialSection`, the Mentions row to the web user menu, and the list's popover on web and `Sheet` on
      mobile. Verify: one mention on a Finding shows on the header, the Topic's title, and that Finding's section, on
      web and in the simulator.
- [x] 6.6 Open a linked Comment in `CommentThread`: open the section and the replies, scroll, highlight, and mark the
      mention seen as its row enters the view. Verify: a functional UI test follows a mention to a reply, and the badge
      counts drop on both apps.
- [x] 6.7 Cut a mention's quote to the Comment's first line in `apps/worker/notificationsEmailRows.ts`. Verify: the
      email's test quotes one line of a three line Comment.
- [x] 6.8 Send `social_mention_badge_open` and `social_mention_seen`. Verify: tests find each event with ids and no
      text. The server sends `social_mention_seen`, with its test, and each badge and menu row sends
      `social_mention_badge_open` with its place alone.

## 7. Topic Posts

- [x] 7.1 Add `topicPost:publish` to `packages/db/authorization.ts`, resolved as `topic:edit`, and count Topic Post
      writes in `packages/db/socialLimits.ts`. Verify: gate tests cover the owner, a team member, a follower, and a
      visitor.
- [x] 7.2 Move `sanitizeNoteHtml` where the note and Topic Post routes both import it, and add the Topic Post routes in
      `apps/api/topicPost/`: create a draft, save with the version check, publish, edit, delete, read one, and list a
      Topic's. Verify: tests cover a conflict, 299 words, a flagged text, an edit at 16 minutes, a member's draft read
      by the owner, and each delete role.
- [x] 7.3 Resolve the `post` social target to a published Topic Post in `apps/api/social/socialTargets.ts`, start its
      Comments unshared in `postComment`, and report its events as `topic_post`. Verify: the social tests cover a
      Comment, a reply, a reaction, and a share on a post, and a draft's thread is not found.
- [x] 7.4 Extract `RichTextEditor` from `NoteEditor` in `packages/core`, keep `NoteEditor` on it, and build
      `TopicPostEditor` with the word count and the disabled Publish. Verify: the note editor's tests pass unchanged,
      and stories cover a short draft, a ready draft, and a conflict on both apps.
- [x] 7.5 Build `TopicPostCard` and `TopicPostPage` in `packages/core` with their adapters, the byline then the
      reactions in one row, the info popup, and the image editor's `topicPost` kind. Verify: stories cover a card, a
      draft's card, a page with and without a summary, and the largest text size.
- [x] 7.6 Add the Open Mic section below `SocialSection` on `TopicPage.tsx` and `TopicPageContent.tsx` through
      `CardsSection`, with the author's drafts first and the button for an editor. Its title is the section title
      standard of group 14: the `sectionTitle` role at the left, the count at the far right, and no count at zero.
      Verify: a visitor, a follower, and an editor each see the spec's section on web and in the simulator.
- [x] 7.7 Add the web route `topics.$topicId_.$topicSlug_.posts.$topicPostId.$postSlug.tsx` with its id-only redirect
      and the mobile route `topics/[topicId]/posts/[topicPostId].tsx`. Verify: a route test redirects a stale slug and
      answers a draft as not found to anyone but its author.
- [x] 7.8 Add `toTopicPostPageHead` beside the page head routes, with the post's own image as the share image, a
      `BlogPosting` builder beside `apps/api/jsonLd.ts`, the first thread page in the server render, and the public
      Topic Posts in `toSitemapXml`. Verify: the head test finds the description, the image, and the structured data,
      and the sitemap test leaves an invite Topic's post out.
- [x] 7.9 Add the `topicPost` kind to the Topic image pipeline: the scene from the post's fenced text, the storage
      prefix, the serve route, and the render at publish. Verify: a published post's render stores an image whose
      url names the post and its hash.
- [x] 7.9a Add `topicPost:editImage` to `packages/db/authorization.ts` for the Topic Post's author and whoever holds
      `topic:edit` on its Topic, and the regenerate route on `loadEditorImageRegenerationQuota` with the render row's
      `topic_post_id`. Verify: tests count a Topic's and a Topic Post's regenerations as one quota, let a team member
      regenerate another member's post image, never limit an admin, and reject a follower.
- [x] 7.9b Add the upload route on `readUploadedImageOriginal` with the subject kind `topicPostImage`, storing the
      upload as the post's image with `image_origin` uploaded. Verify: tests reject a wrong type, a file over the
      size limit, and an objectionable image with the Topic image's own errors, and an accepted upload counts toward
      no limit.
- [x] 7.9c Read the row's current hash on the card, the page, and the share image, schedule the replaced files for
      deletion, and purge the Topic Post page's edge tag on a regenerate and an upload. Verify: a test finds the
      purge of the post's tag after each write, and the share image test reads the new hash.
- [x] 7.9d Add `topicPostImage` to `reportSubjectKinds`, its label, its loader in `reportSubjects.ts`, its image on
      the admin's row, and Report image to the Topic Post page's menu, and handle it in `removeReportedSubject` as
      `topicImage` is: remove an upload, start an `admin` render with no user, and resolve the report as removed.
      Verify: tests regenerate a reported upload on the platform's budget, skip a deleted post, and hide a reported
      image from its reporter until the hash changes.
- [x] 7.9e Show the Topic image editor on the Topic Post page for whoever holds `topicPost:editImage`, through the
      shared `TopicImageEditor` with both apps' adapters. Verify: stories cover the count, the limit with no
      Regenerate button, an upload's rejection, and an admin with no count.
- [x] 7.10 Add `packages/models/prompts/summarize-topic-post.md` with its thin builder and an eval in `evals/`, and
      write the summary on publish and on an edit. Verify: the builder's test fences the post, and the eval runs
      locally.
- [x] 7.11 Add `publishTopicPostWorkflow` in `apps/worker/workflows/` for the summary, the image, the wait to the end of
      the edit time, and the discussion's start. Verify: `bun scripts/check-workflow-bundles.ts` passes and a workflow
      test finds each step best effort.
- [x] 7.12 Add published Topic Posts to `buildTopicScanContext` in `packages/pipeline/attach.ts`, cut and fenced as the
      design says. Verify: a test finds a post's text inside the fence, a long post cut and marked, and no draft.
- [x] 7.13 Name a Topic Post in the notifications email's rows and send a Topic Post's author the Comments and reactions
      on it once. Verify: the email's tests cover a member's post and an owner's own post.
- [x] 7.14 Send the five `social_topic_post_*` write events, the image's regenerate and upload among them. Verify:
      route tests find each with ids and no text.

## 8. Topic Post Discussions

- [x] 8.1 Add `packages/models/prompts/write-topic-post-discussion.md` with its thin builder, the hosts block, and an
      eval in `evals/`. Verify: the builder's test fences the post, the Comments, and the hint.
- [x] 8.2 Write the script check and the screen in `packages/pipeline/podcast/`: two speakers, the word limit, each read
      Comment's username spoken, and `isSharedCommentSpeakable` on each Comment and on the author's username. Verify:
      tests cover a flagged Comment, a flagged author, an uncredited Comment, a script past seven minutes, and the
      length a post and its Comments ask for.
      *The script check is `packages/pipeline/topicPosts/topicPostDiscussionScript.ts`. Only `isSharedCommentSpeakable`
      is in `packages/pipeline/podcast/`, in `podcastEpisodeSharedComments.ts`.*
- [x] 8.3 Make the theme mix an explicit option of `toJoinArguments` and record a discussion with it off. Verify: the
      audio test finds no theme input in a discussion's ffmpeg arguments and an unchanged Podcast Episode mix.
- [x] 8.4 Add `recordTopicPostDiscussionWorkflow` on the `episode-recordings` queue, billed to the starting user's key
      and summed in `loadSpendSince`, failing its row alone on a spent budget or a passed cutoff. Verify: the workflow
      bundle check passes and tests cover a spent budget and a deleted post.
- [x] 8.5 Add `POST /topic-posts/:id/discussion/regenerate` with the hint's classification and the monthly quota, and
      the gated audio route. Verify: tests cover the limit on each plan, a team member's billing, a flagged hint, and a
      private Topic's audio.
- [x] 8.6 Play the discussion in `PodcastPlayer` on `TopicPostPage`, with the recording state and the Regenerate control
      reading "X of Y used this month". Verify: stories cover recording, playing, no discussion, and the limit, and a
      discussion plays on web and in the simulator.
- [x] 8.7 Send `social_topic_post_discussion_play` and `social_topic_post_discussion_regenerate`. Verify: tests find
      each with ids and no hint.

## 9. Topic Post Chat

- [x] 9.1 Accept a Topic Post in the Topic chat request in `apps/api/chat/privateChat.ts`, rejecting a draft, a deleted
      post, and another Topic's post before any model call. Verify: route tests cover each rejection.
- [x] 9.2 Add `packages/models/prompts/chat-topic-post.md` and its context loader in `packages/pipeline/chat/`: the post
      and its shown shared Comments, fenced, with no Topic Tool bound. Verify: tests find an unshared and a blocked
      author's Comment absent, and an eval covers a credited answer.
- [x] 9.3 Store the turn with the `topic_post` kind and show it in the Topic's private chat with a tag naming the post,
      from one shared tag component. Verify: the exchange shows with its tag after a reload on web and in the
      simulator.
- [x] 9.4 Open the chat from `TopicPostPage` on both apps and send `social_topic_post_chat`. Verify: a visitor is sent
      to sign-up, and the event holds ids and no question.

## 10. The Café page

- [x] 10.1 Build `ProfileHeader` in `packages/core/components/` with the avatar at the Topic image's height, the
      "<username> Café" heading, and the summary line, and render it on web and mobile. Verify: the avatar and a Topic
      page's image measure the same height at desktop and phone width. Already in place on both apps: the heading and
      the page title through `toCafeName`, the avatar at the height of a Topic's image on the Topics page, the summary
      line beside it, and the tables titled All Topics and All Teams with their counts. Still to do: the one shared
      `ProfileHeader`.
      *Nothing is still to do: `packages/core/components/ProfileHeader.tsx` is the one header, with an adapter in each
      app's `components/account/ProfileHeader.tsx`. 20.7 built its summary line on the details line.*
- [x] 10.2 Lay the profile page and screen out in the spec's order, with the news, the two Featured sections, the Open
      Mic section from the person's published Topic Posts, the tables, and the Visitors line. Verify: a full and a new
      person's page match the two layout scenarios on web and in the simulator. Already in place on both apps: the
      person's news above the two Featured sections. Still to do: the Open Mic section and the final order.
      *Replaced by 18.4 and 24.1: the page has Featured Posts and no Open Mic section, in the public-profiles spec's
      order, so nothing is still to do.*
- [x] 10.3 Render the first page of the week's news and every card in the profile's server HTML. Verify: a server
      render test finds the first five news rows and 14 Topic cards in the HTML of a fixture profile.
- [x] 10.4 Change the user menu's entry in `packages/core/components/UserMenuItems.tsx` to the user's name followed
      by Café beside their own avatar, and replace every customer string that says profile, the head title and the
      share image included. Verify: a search of both apps' customer strings finds no profile, and the menu shows the
      avatar and the name on both apps.
- [x] 10.5 Update the Persona & Voice page in Notion with the Brews News row lines and empty lines, the Open Mic copy,
      and the Coffee Break Discussion copy. Verify: the page holds the three sections and the code's strings match
      them.

## 11. MCP

- [x] 11.1 Add `read_news`, `read_topic_posts`, and `read_topic_post` in `apps/api/mcp/`, with titles, read-only
      annotations, descriptions with their phrases, fenced text and structured content, and the page budget. Verify:
      the annotation check passes with twenty-five tools, and `mcp.smoke.ts` has a section for each tool on both
      routes.
      *The sections are in `apps/api/mcp/mcpTopicPostSmokeSections.ts`, added by 27.11.*
- [x] 11.2 Accept a Topic Post in `read_hot_takes`, `post_hot_take`, and `save_reaction`, and drop "A post is not
      available yet" from the input description. Verify: the social smoke section posts a Comment on a post, unshared.
      *The section is `checkTopicPostComment` in `apps/api/social/social.smoke.ts`, added by 27.11. Unit tests cover the
      same in `apps/api/social/comments.test.ts` and `socialTargets.test.ts`.*
- [ ] 11.3 Store version 9 of the MCP view bundle. `packages/contracts/mcpViewVersions.json` is `[]`, so a host that
      cached a version 9 uri reads the current build through the aliases in `apps/api/mcp/uiResources.ts`. This waits
      on the user's decision about freezing version 9, which `bun run mcp-views:freeze` would store. Everything else
      in this task is done: the `news`, `topic-posts`, and `topic-post` MCP views are in
      `packages/contracts/mcpViews.ts` and `apps/web/src/mcpViews/` with their routes, and `MCP_VIEW_VERSION` is 10.
      Verify: the manifest lists version 9 if it is frozen, and `bun run smoke:mcp-views` passes with a section for
      each view.
- [x] 11.4 Update `server.json` and the Add to AI docs page if either lists tools, and validate the manifest. Verify:
      `mcp-publisher validate server.json` passes.

## 12. Contracts, parity, and structure docs

- [x] 12.1 Add every new route the mobile app reaches to `packages/contracts/apiRouteContracts.ts` and run
      `bun run contract:freeze`. Verify: `bun scripts/check-contract-freeze.ts` passes against `0.1.0`.
- [x] 12.2 Update `apps/mobile/parity.md`: the page and action inventory for the Café, the Brews News card, the Topic
      Post screen, and the mention list, and the Separately built rows that are now shared or new. Verify:
      `bun scripts/check-component-parity.ts` and `bun scripts/check-client-parity.ts` pass.
- [x] 12.3 Update the root AGENTS.md module map and routing table, and the AGENTS.md of `apps/api`, `apps/worker`,
      `apps/web`, `apps/mobile`, `packages/core`, `packages/db`, and `packages/pipeline`, for the new folders, routes,
      workflows, and components. Verify: each new folder and entry point is named in its workspace's AGENTS.md.

## 13. Integration

- [x] 13.1 Run `bun run check`. Verify: Biome, the boundary, knip, parity, contract freeze, `tsc -b`, the workflow
      bundle check, the tests, and the MCP view tests all pass.
- [ ] 13.2 Walk the whole flow on the built ui and in the simulator as an owner, a team member, a follower, and a
      visitor: publish a post, wait for its discussion, comment with a mention, follow the badge to the Comment, pin a
      Topic, and read both news lists. Verify: each role sees what its spec scenarios say, in light and dark. On the
      device, Android first and then iPhone with never both booted, also verify: the profile and team screens end
      with "Visitors: N" at the web's spacing, read only while the screen is the active route, the home's card
      sections look as they did, the profile's two Featured sections line up with the page's insets, and the rank
      sheet pins, moves, and clears a Topic.
- [ ] 13.3 Compare the rendered web and mobile states of the Café, the Brews News card, the Open Mic section, the Topic
      Post page, and the mentions list, and record the web references and any gap in `apps/mobile/parity.md`. Verify:
      the Rendered comparisons section lists each with no open gap.

## 14. Section titles and the team page

- [x] 14.1 Add the `sectionTitle` type role to `packages/nightshift/typography.ts` and `toSectionCountLabel` to
      `packages/core/lib/labels.ts`, and use them in both apps' `AccordionSection` and `CollapsibleSection`. Verify: a
      section with a count of zero shows its title alone.
- [x] 14.2 Title the sections of the Teams, Activity, Admin, team, Café, Topic, and Podcast Episode pages with the
      standard on the web and in the mobile app, with counts on the full-width sections. Verify: the built site shows
      each title in the display font at text-xl with its count at the far right.
- [x] 14.3 Move the Brews News page buttons under the card, hidden while the list is closed, and set its title to
      text-xl. Verify: a closed list shows no page buttons.
- [x] 14.4 Give the team page the Café's header: the avatar at the Topics page image's height, the "<name> Franchise"
      heading from `toTeamPageTitle`, and the counts and description beside the avatar. Verify: both apps show them.
- [x] 14.5 Add `topicCards` and `podcastEpisodeCards` to the team page read through `loadTeamCards` in
      `apps/api/profileCards.ts`, in the owners' combined profile order, and show them under Featured Topics and
      Featured Podcasts on both apps. Verify: a test reads the shared order, and the built site shows the cards.
- [x] 14.6 Hold the admin console's mobile minimum version inputs to a field's width, and show the home's "How it
      works" title at the section title's size in the muted color. Verify: the built site shows both.

## 15. Topic Post popup

- [x] 15.1 Add `topicImage` and the discussion's `publishedAt` to `topicPostResponse`, from the post row's Topic image
      hash and the newest recording with audio. Verify: `apps/api/topicPost/topicPosts.test.ts` reads both, and a
      Topic with no image reads null.
- [x] 15.2 Rebuild core's `TopicPostInfo` after the Topic popup: it takes the post's id and title, reads the post
      through `fetchTopicPost` once it opens unless its page passes the post, and shows the Written by row with the
      reactions and Share, the post's image, the discussion's play button with
      `toTopicPostDiscussionInfoText`, the Topic, and Carl's Notes. Verify: `packages/core/lib/topicPostDiscussions.test.ts`
      words the recording's day, length, and hosts.
      *The order changed: the popup now shows the Written by row, the Topic, the post's image, the discussion, and
      Carl's Notes, as the topic-posts spec lists them. 20.8 added the Topic's viewers and followers under its name.*
- [x] 15.3 Adapt the popup in both apps, a popover on the web and a sheet in the mobile app, with `TopicPostInfoButton`
      under the notebook-pen tile for a row. `NoteIcon` takes the tile's icon. Both apps hold `TopicPost/TopicPostInfo`
      stories. Verify: the dev site's popup from a card and from a news row, at desktop and phone widths.
- [x] 15.4 Add `topicPostId` to a News Event, give a published Topic Post's row the post's own image, and open the
      post's popup from that row in both apps' `NewsList`. Verify: `apps/api/news/readNews.test.ts` reads the post's
      id and image, and a Comment on a post keeps its Topic's image.
- [x] 15.5 Read a person's own published Topic Posts into the own group of their news on every Topic the reader may
      open, an admin's included, and leave them out of the later groups. Verify: `bun run smoke:news` finds the
      person's post on a Topic outside the three groups, once on a followed Topic, and never on a Topic the reader
      may not open.
- [x] 15.6 Read a Topic Post through `read_topic_post` in `mcpViewFetch.ts`, and replace the popup's reactions, Share,
      and play button in the MCP views with `mcpViewTopicPostInfoElements.tsx`. Verify: `bun run smoke:mcp-views`
      opens the popup on the post's page with no tool call, and on a card and a news row through the tool.
- [x] 15.7 Name the popup, the row's button, and the news read's own posts in `apps/web/AGENTS.md`,
      `apps/mobile/AGENTS.md`, `apps/mobile/parity.md`, `packages/core/AGENTS.md`, `apps/api/AGENTS.md`, and the
      README's `smoke:news` line. Verify: each names `TopicPostInfo`.
- [x] 15.8 Show Share on every published post in the popup, and replace the post page's Copy link with Share in the
      actions menu of both apps, both through `copyTopicPostLink`. Verify: the dev site's post page menu holds Share
      and no Copy link, and the popup of a published post holds Share in its Written by row.
- [ ] 15.9 Compare the popup's sheet in the mobile app with the web popover at phone width, on a device, and record it
      in `apps/mobile/parity.md`.

## 16. Topic Posts in search

- [x] 16.1 Add the `topicPosts` result kind and the `topicPost` row to `packages/contracts/search.ts`, after podcast
      episodes in the kind order: the row's id, name, path, and date are the post's, with its Topic, its author, its
      summary, and its image. Verify: `packages/contracts/search.test.ts` parses a page with one row of every kind.
- [x] 16.2 Add `apps/api/search/topicPostSearch.ts`, the reader `searchSite` calls for the kind: published Topic Posts
      whose title, summary, or body text holds the query, under `toTopicViewFilter` and the tag filter, title matches
      first, each with its own image or its Topic's. Verify: `topicPostSearch.test.ts` finds a published post, never
      a draft, and reads a visitor, a user, and an admin under their own Topic rules.
- [x] 16.3 Add a Topic Post row to the search route's contract fixture in `apps/api/contractFixtures.ts`. Verify:
      `apps/api/search/search.test.ts` parses the route's post row with the results page's contract. The frozen
      snapshot accepts the row once `bun run contract:freeze` runs.
- [x] 16.4 Add Posts with the notebook-pen icon to the web Filters menu's kinds, name posts in the search bar's
      placeholder and label on the web and in the mobile app, and show a post in the typeahead with its Topic's name.
      Verify: on the dev site, turning Posts off leaves `topicPosts` out of the url and the post out of the results.
- [x] 16.5 Show a post's row in both apps' `SearchResultsList`: its image at the thumbnail size or the notebook-pen
      icon, its title linking to its page, and `Post · age · Topic`. `toSearchRowTitleAside` returns the control beside
      each kind's title, with none on a post's row. Verify: the dev site's search page shows the row, and both apps'
      `SearchResultsList` stories hold a post row.
- [x] 16.6 Return post rows from the MCP `search` tool with absolute image urls, name posts in its description, and
      show them in the search MCP view's table. Verify: `bun run smoke:mcp-views` finds the post's title link and its
      Topic's link in the table.
- [x] 16.7 Say that posts show up in search in `apps/docs/src/content/docs/feed/searching.md`, `feed/open-mic.md`, and
      `account/add-to-ai.md`, and name the reader and the rows in `apps/api/reading-and-chat-routes.md`,
      `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, and `apps/mobile/reading-and-parity.md`. Verify: each names posts.

## 17. Topic Post chat from the chat launcher

- [x] 17.1 Open the chat about a Topic Post from the chat launcher: `toDefaultChatId` and `toPrivateChatId` in
      `packages/core/lib/chatConversations.ts` take the open post, the web's `AppChatPanel` picks it for a user before
      the chat rooms load, and the app's `toChatHref` sends the launcher to the Topic's chat with `privateChat=true` on
      the post's own screen. Verify: `chatConversations.test.ts` and `chatNavigation.test.ts` cover a post's page, a
      draft's, a screen above the post's, and every other page.
- [x] 17.2 Invite a question about the post in the question box: `TOPIC_POST_CHAT_PLACEHOLDER` and
      `toPrivateChatPlaceholder` in `packages/core/lib/chatCopy.ts`, read by both apps' `PrivateChatPanel`. Verify:
      `chatCopy.test.ts` finds the line only while the chat's page names a post.
- [x] 17.3 Remove the Ask Carl button: the `ChatButton` element and `onOpenChat` of core's `TopicPostPage`, both apps'
      elements and handlers, the `askCarl` labels, and the MCP view's empty element. Verify: `bunx tsc -b`, `bunx knip`,
      and `bun run smoke:mcp-views` pass.
- [x] 17.4 Name a private chat for what it is about with `toPrivateChatLabel` and `toPrivateChatIdLabel` in core: the
      web's row that names the open chat and its menu option, and the app's conversation choice, each on one line with
      the whole label as its title or accessible name. Verify: the tests put the post's title ahead of the Topic's
      name and the team's, and read "Private chat" for an unknown name.
- [x] 17.5 Say it in `apps/docs/src/content/docs/feed/open-mic.md`, `feed/chat.md`, `feed/reading-your-feed.md`, and
      `feed/making-a-topic-in-chat.md`, in `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, `packages/core/AGENTS.md`,
      and `apps/mobile/parity.md`, and in the `topic-post-chat` and `team-chat` deltas. Verify:
      `openspec validate cafe-brews-news-open-mic-mentions --strict` passes.
- [x] 17.6 Check the web in the dev site: as a user the launcher on a post's page opens "Private chat about" the
      post's title with the post's line in the question box and no Ask Carl button, the label keeps to one line with
      an ellipsis at phone width, and the Topic's page opens its chat room as before. As a visitor the launcher shows
      the sign-up panel, and Sign up returns to the post. Verify: each read from the running dev site.
- [ ] 17.7 Check the app on Android and iPhone: the launcher on a post's screen, the sign-up sheet and the return to
      the post, the choice's one-line label, and the page without the button. Verify: each matches the web, and
      `apps/mobile/parity.md` records the result.

## 18. Featured posts

- [x] 18.1 Add `topic_posts.home_order` and `topic_posts.profile_order` with their partial indexes, widen
      `packages/db/pinnedOrder.ts` to Topic Posts, add `setTopicPostProfileOrder` and `releaseTopicPostProfileOrder`
      scoped to the author with `PROFILE_TOPIC_POST_LIMIT`, add `releaseTopicHomeOrders`, and release a Topic's posts
      with it in `releaseTopicProfileOrders` and the api's `releaseHomeOrder`. Verify: `bun run db:generate` writes one
      migration, and `packages/db/profileOrder.test.ts`, `homeOrder.test.ts`, and `schema.test.ts` pass.
      *Replaced by 24.3: `PROFILE_TOPIC_POST_LIMIT` is gone, and `setTopicPostProfileOrder` passes no limit.*
- [x] 18.2 Add `PATCH /topic-posts/:id/profile-order` for a published post's author on a public Topic in
      `apps/api/profileOrder.ts`, and `PATCH /topic-posts/:id/home-order` with `GET /home/topic-posts` for an admin in
      `apps/api/topicPost/topicPostHomeOrder.ts`. A deleted post releases both orders, and a published post's delete
      clears the home's caches and purges its author's profile. Verify: `apps/api/profileOrder.test.ts`,
      `topicPost/topicPostHomeOrder.test.ts`, `topicPost/topicPosts.test.ts`, and `topicPostsRoute.test.ts` pass.
- [x] 18.3 Return the Featured Posts cards: `profileTopicPosts` with `pinnedTopicPostCount` on the profile payload,
      `topicPostCards` on the team page, and `homeTopicPosts` on the home payload from the cached home card ids, each
      the pins first and then the newest post of each other Topic. Verify: `apps/api/profileCards.test.ts` and
      `home/homeCardIds.test.ts` pass, and the dev api's home and profile payloads hold the cards.
      *Replaced by 24.2 and 24.10 for the profile and the team page: each lists the pins and then every other
      published post, newest first. The home still lists the newest post of each other Topic.*
- [x] 18.4 Show Featured Posts right below Featured Podcasts on the web and mobile home, Café, and team page through
      `CardsSection` over `TopicPostCard`, from `HOME_SECTIONS`, `PROFILE_SECTIONS`, and `TEAM_SECTIONS`. Verify: the
      dev site's home and Café show the section to a visitor, and a page with no post shows none.
- [x] 18.5 Offer "Featured posts" under the notebook-pen icon in the Café's action menu on both apps, and "Home posts"
      to an admin in the web home page's action menu through `HomeTopicPostRankDialog`, with the posts words in
      `packages/core/lib/rankDialog.ts`. Verify: `packages/core/lib/profileSections.test.ts` passes and both apps'
      `Common/RankDialog` stories hold a posts story.
- [x] 18.6 Register `topicPostClient.sendTopicPostProfileOrder` in the route contracts, list the two admin calls as
      web only in `apps/mobile/parity.md`, and describe featuring a post in `apps/docs/src/content/docs/feed/open-mic.md`
      and each workspace's AGENTS.md. Verify: `bun scripts/check-client-parity.ts` and
      `bun scripts/check-component-parity.ts` pass.
- [x] 18.7 Offer "Home posts" to an admin and "Featured posts" to the author in a Topic Post page's action menu, with
      the page's post offered a place, as a Topic's and a Podcast Episode's page do. Verify: both apps' Topic Post page
      opens the dialog of that name.
- [ ] 18.8 Compare the rendered web and mobile Featured Posts sections and the Featured posts sheet on a device, and
      refreeze the contract. Verify: the `apps/mobile/parity.md` row names the date and the result.

## 19. Sharing a Topic Post

- [x] 19.1 Draw a published Topic Post's preview card in `apps/api/share/topicPostImage.ts` with the shared card
      helpers, cache it through `share/preview.ts`, and serve it at `GET /api/topic-posts/:id/preview.png` from
      `topicPost/topicPostsRoute.ts`. A private or invite Topic's post shows the Topic's image and owner with the
      post's title. Verify: `apps/api/share/topicPostImage.test.ts` passes, and the dev api returns a PNG for a public
      Topic's post and for an invite Topic's post.
- [x] 19.2 Point `topicPostPageHead.ts` at the card, with the post's own image kept as the `BlogPosting` image.
      Verify: `apps/api/topicPost/topicPostPageHead.test.ts` passes, and the dev api's head names the card's url.
- [x] 19.3 Take an optional `topicPostId` in `inviteCreatePayload` and `createTopicInvite`, a published post of that
      Topic, store it in `invites.topic_post_id`, and reuse a post's link apart from the Topic's own. Verify:
      `apps/api/invite/invites.test.ts` covers a valid post, another Topic's post, a draft, and a post that is gone.
- [x] 19.4 Return the published post's id and path on the `joined` status of both accept routes, and fall back to the
      Topic for a deleted post or a draft. Verify: `apps/api/invite/inviteAcceptance.test.ts` passes, and
      `bun run smoke:invites` passes its section 3c against the dev database.
- [x] 19.5 Show the post's card and title in an invite link's page head and `/api/invites/:token/preview.png` while
      the post is published. Verify: `apps/api/share/pageHead.test.ts` and `topicPostImage.test.ts` pass, and the dev
      api's head of a link created for a post reads the post's title with the post's card.
- [x] 19.6 Add `topicVisibility` to `topicPostResponse`, `toTopicPostShare` and the Share post title to
      `packages/core/lib/topicPosts.ts`, `topicPostId` to `sendCreateTopicInvite`, and the `topicPost` destination to
      `toInviteDestination`. Verify: `packages/core/lib/topicPosts.test.ts` and `inviteRejections.test.ts` pass.
- [x] 19.7 Give the web's `ShareTopic` and `useShareTopicActions` a `topicPost`, open it from the post page's actions
      menu and the info popover's Share in place of the link copy, and open the post from `InvitePage`. Verify: the dev
      site's post page at 390 by 844 opens the Share post dialog, and the popover's Share lists the post's link.
- [x] 19.8 Give the mobile `ShareTopic` and `ShareTopicSheet` a `topicPost`, open the sheet from the post screen's
      actions menu and the info sheet's Share, and open the post's screen from `app/invite/[token].tsx`. Verify:
      `bunx tsc -b`, `bun scripts/check-purchase-paths.ts`, and `bun scripts/check-package-boundaries.ts` pass.
- [x] 19.9 Add the `Share/ShareTopic` stories for a shared post on the web and in the mobile app, and describe the
      change in `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, `packages/core/AGENTS.md`,
      `apps/mobile/parity.md`, and `apps/docs/src/content/docs/feed/open-mic.md`. Verify:
      `bun scripts/check-component-parity.ts` and `bun scripts/check-client-parity.ts` pass.
- [ ] 19.10 Compare the mobile share sheet's post states with the web dialog at phone width on a device, accept an
      invite link that names a post in the app, and refreeze the contract. Verify: the `apps/mobile/parity.md` row
      names the date and the result.

## 20. Details lines on the post and topic pages

- [x] 20.1 Add `packages/core/lib/detailsLine.ts` (`toCountDetails`, `toDetailText`, `toTopicDetails`,
      `toTopicCountsDetails`) and `packages/core/components/DetailsLine.tsx`, with the web and mobile adapters at
      `components/common/DetailsLine.tsx`. Verify: `bun test packages/core/lib/detailsLine.test.ts` passes, covering
      the order, the plurals, and the zeros left out.
- [x] 20.2 Move a Topic Post page's date, reading time, and edited mark from the byline to a details line under the
      row of the byline and reactions, through `toTopicPostDetails` and a `DetailsLine` element of `TopicPostPage`,
      and reserve the line in the post's skeleton. Verify: the dev site's post page at 390 and 1280 wide shows the
      line under the row, and the `TopicPost/TopicPostPage` story asserts it.
- [x] 20.3 Count a comment thread's Comments and replies: `loadCommentCount` in `apps/api/social/commentRows.ts`, the
      optional `commentCount` on `commentThreadResponse` and the delete's response, and `onCommentCountChange` through
      `useCommentThread`, `CommentThread`, and `SocialSection`. Verify: `apps/api/social/comments.test.ts` and
      `apps/web/src/components/social/CommentThread.test.tsx` pass, and `bun scripts/check-contract-freeze.ts` stays
      compatible.
- [x] 20.4 Show the thread's count on the post page's details line right after the reading time, above zero only,
      with edited last. Verify: `packages/core/lib/topicPosts.test.ts` passes, and the dev site's post page reads
      "1 hot take" beside a thread that lists one Comment.
- [x] 20.5 Show the topic page's details line under its byline and reactions on the web (`TopicPageHeader.tsx`) and
      in the mobile app (`TopicPageContent.tsx`): the latest season's films and podcast episodes, the listed
      findings, the thread's count, the Topic Posts, the notes its section reports, and the similar topics, with the
      line in both skeletons. Verify: the dev site's topic page reads the same number as each section at 390 and 1280
      wide, in light and dark.
- [x] 20.6 Keep a topic's Topic Posts across a scan's poll reload in `toPolledTopicPage`, so the section and its
      count stay while a scan runs. Verify: `packages/core/lib/scanPoll.test.ts` passes.
- [x] 20.7 Build the Café's summary line on the details line with the topic, podcast episode, and team counts of its
      sections, and the team page's with its podcast episode and note counts, through `ProfileSummaryLine`,
      `toProfileTopicCount`, and `toTeamDetails`. Verify: `apps/web/src/components/account/ProfileSummaryLine.test.tsx`
      passes, and the dev site's own Café, another person's Café, and a team page read their sections' numbers.
- [x] 20.8 Add the optional `topicCounts` to `topicPostResponse` from `loadTopicCounts`, and show the Topic's viewers
      and followers under its name in the Topic Post popup on the web, in the mobile app, and in the MCP view. Verify:
      `apps/api/topicPost/topicPosts.test.ts` passes, and the dev site's popup reads the topic page's own counts.
- [x] 20.9 Add the `Common/DetailsLine` stories on the web and in the mobile app (several counts, a wrap at phone
      width, some zero, all zero), update the `Account/ProfileSummaryLine`, `Account/ProfileHeader`,
      `TopicPost/TopicPostPage`, and `TopicPost/TopicPostInfo` stories, and describe the line in
      `packages/core/AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, and `apps/mobile/parity.md`. Verify:
      `bunx tsc -b`, `bunx knip`, `bun scripts/check-component-parity.ts`, and `bun scripts/check-client-parity.ts`
      pass.
- [ ] 20.10 Compare the details lines of the mobile topic, Topic Post, Café, and team screens and of the Topic Post
      sheet with the web at phone width on a device, at the default and the largest text size. Verify: the
      `apps/mobile/parity.md` paragraph names the date and the result.

## 21. Discussion script and the header without JavaScript

- [x] 21.1 Add the optional `transcript` to `topicPostResponse.discussion`, in `podcastEpisodeTranscriptTurn`s, and
      fill it in `loadTopicPostDiscussion` from the newest recording's script through `toTranscriptTurn`. Verify:
      `apps/api/topicPost/topicPosts.test.ts` and `apps/api/topicPost/topicPostsRoute.test.ts` pass, and
      `bun scripts/check-contract-freeze.ts` passes.
- [x] 21.2 Return the transcript a card opens from `toTopicPostDiscussionTranscript`, and list a transcript's turns in
      `packages/core/components/PodcastEpisodeTranscriptTurns.tsx`, which the podcast episode transcript and the
      discussion card both render with each app's one transcript Text and Strong, so a turn reads the same in both.
      Verify: `packages/core/lib/topicPostDiscussions.test.ts` passes, and on the dev site a discussion's turn and
      a podcast episode transcript's turn have the same computed font, size, weight, line height, and color at 390
      and 1280 wide, in light and dark.
- [x] 21.3 Open and close the transcript from the name of the shared `TopicPostDiscussionCard`, closed at first, with
      the news card's caret: a details element on the web, whose transcript stays in the html, and a button in the
      mobile app. Verify: on the dev site's post page at 390 and 1280 wide, in light and dark, the card is closed,
      its name opens the transcript, and play and Regenerate leave it as it is.
- [x] 21.4 Keep the server-rendered card closed with its transcript in the html and openable without JavaScript.
      Verify: `apps/web/src/routes/_layout/-topicPostRoute.test.tsx` passes, and with JavaScript off the dev site's
      card is closed and its name opens the transcript.
- [x] 21.5 Show the header's links at every width without JavaScript, wrapped onto a second row, and its menu button
      only under the `scripted` class. Verify: `apps/web/src/routes/_layout/-homeRoute.test.tsx` passes, and with
      JavaScript off at 390 wide the dev site's header shows Topics, Plans, Log in, and Sign up with no menu button.
- [x] 21.6 Add the `TranscriptOpen` story on the web and in the mobile app, the web's `TranscriptWithoutJavaScript`
      and `Layout/Header` `VisitorPhoneWithoutJavaScript` stories, and describe the card and the header in
      `packages/core/AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, `apps/api/AGENTS.md`,
      `packages/contracts/AGENTS.md`, and `apps/mobile/parity.md`. Verify: `bunx tsc -b`, `bunx knip`,
      `bun scripts/check-component-parity.ts`, and `bun scripts/check-client-parity.ts` pass.
- [ ] 21.7 Compare the mobile discussion card, closed and open, with the web at phone width on a device, at the
      default and the largest text size. Verify: the `apps/mobile/parity.md` row names the date and the result.

## 22. One size for the top row's buttons

- [x] 22.1 Add `PLAIN_PAGE_BUTTON_CLASS` and `HIGHLIGHTED_PAGE_BUTTON_CLASS` to `apps/web/src/lib/styleClasses.ts`,
      one size for both at every width: the New Topic button's 36px height, 12px side padding, 14px medium label,
      16px icon, and 8px corner, with a border on both and a pseudo-element that grows the touch target to 44px.
      Verify: `bun test apps/web/src/lib` passes, with the test that holds the pair to one size.
- [x] 22.2 Use the pair for every top row and titled header row on the web: the topic page (Team Up, Share, Join
      Team, Follow, Brew, New Topic), the Podcast Episode page (Subscribe), the Café (New team, Team Up), the team
      page (Add Member, Join Team, Add Topic), Topics and Search (New Topic), and the Home, Activity, Teams, Account,
      and Admin title rows. Verify: on the dev site at 390 and 1280 wide, signed in and signed out, each of these
      buttons measures 36px tall with a 14px medium label, a 16px icon, an 8px corner, and a 44px tall tap area.
- [x] 22.3 Give `PAGE_BUTTON_ROW_CLASS` the row's own margins, 16px above and 16px below, and use it for the topic
      page's action bar, the Podcast Episode page's row and its skeleton, the tags row of Topics and Search, the Café,
      and the team page. Verify: on the dev site at 390 and 1280 wide each row sits 16px under the search bar and
      16px over the page's header.
- [x] 22.4 In the mobile app, add `HIGHLIGHTED_PAGE_BUTTON_CLASS` and `PAGE_BUTTON_ROW_CLASS` to
      `apps/mobile/src/pageButtonClasses.ts`, give both buttons the web's 12 point side padding and a border, use
      the highlighted class for New Topic, Follow topic, Join Team, Brew, Add Topic, New team, and the plan button,
      and set each screen's row margins to 16 points above and below. Verify: `bunx tsc -b` and `bun test apps/mobile`
      pass.
- [x] 22.5 Show the pair in the `Patterns/Button` and `Patterns/Menu` stories, add the `PageButtonRow` story to
      `Patterns/PageFrame`, and describe the pair in `apps/web/AGENTS.md` and `apps/mobile/AGENTS.md`. Verify:
      `bunx tsc -b`, `bunx knip`, `bun scripts/check-component-parity.ts`, and `bun scripts/check-client-parity.ts`
      pass.
- [ ] 22.6 Compare the top row on a device with the web at phone width, on the topic, Podcast Episode, Café, team,
      Topics, and Search screens, at the default and the largest text size. Verify: both buttons are one height, and
      the gap above the row equals the gap below it.

## 23. Thumbnails open their pages

- [x] 23.1 Add `isCurrentPagePath` to `packages/core/lib/pagePaths.ts`, which compares a link's path with the open
      page's path without the query, the hash, and the end slash. Verify: `bun test packages/core/lib` passes, with
      a page's own path, another page's, and a page after the open one.
- [x] 23.2 Add core's `TopicImageLink`: the topic image inside each app's link to the page of what it shows, the
      plain image on that page itself, and a label only where no title beside the image opens the page. Verify:
      `bun test packages/core/components` passes, with the linked image, the labeled one, and the open page's own.
- [x] 23.3 Adapt it on the web in `apps/web/src/components/topic/TopicImageLink.tsx` over `AnchorLink`, with the
      open page from the router, out of the tab order and the accessibility tree unless it has a label, and dimmed
      under the pointer. Use it for the image of a search row, a news row, a Topics row, the admin's image report,
      and an MCP view's Topic header, the Topic's image in a Finding's and a Topic Post's popup, and the full-width
      image of a Topic's and a Topic Post's popup. Verify: `bun test apps/web/src/components/search` passes with the
      row's image linked and plain on its own page, and on the dev site at 390 and 1280 wide each image opens its
      page, the topic page's header image opens the Edit topic image dialog, the topic's image in its own note is
      plain, and Tab never stops on a row's thumbnail.
- [x] 23.4 Adapt it in the mobile app in `apps/mobile/src/components/topic/TopicImageLink.tsx` over its `AnchorLink`,
      with the image's path through `toPlatformPath` against the open route, and use it for the same images: the
      search and news rows, the Topics row, the Topic's image in the Finding and Topic Post sheets, and the
      full-width image of the Topic roast and Topic Post sheets, whose press also closes the sheet. Verify:
      `bunx tsc -b` and `bun test apps/mobile/src/components` pass.
- [x] 23.5 Add the `Topic/TopicImageLink` stories to both apps, and describe the link in `apps/web/AGENTS.md`,
      `apps/mobile/AGENTS.md`, `packages/core/AGENTS.md`, and `apps/mobile/parity.md`. Verify: `bunx knip`,
      `bun scripts/check-component-parity.ts`, and `bun scripts/check-client-parity.ts` pass.
- [ ] 23.6 Press each linked image on a device: a search row's, a news row's, a Topics row's, and the images in the
      Topic roast, Finding, and Topic Post sheets, and open a topic's own note on its screen. Verify: each press
      opens the screen its title opens, a sheet closes behind its image's press, the open screen's own image opens
      nothing, and a screen reader reads no second link beside a row's title.

## 24. Café and home sections

- [x] 24.1 Remove the second Topic Post section from the profile page: its entry in `PROFILE_SECTIONS`, its element on
      the web's `ProfilePage.tsx` and the mobile `profiles/[userId].tsx`, and the profile payload's `topicPosts`
      field. Verify: `bun test packages/core/lib apps/web/src/pages` passes, with the four card sections in order
      and no Open Mic title in the profile's render.
- [x] 24.2 List every published Topic Post of the person in the profile's Featured Posts: `loadProfileTopicPostCards`
      returns the pins in their order and then the rest newest first as `profileTopicPosts`, from its one read, and
      the rank dialog's picker reads its candidates from that list. Verify: `bun test apps/api/profileCards.test.ts`
      passes, with a visitor's read filtered to public topics, the person's read unfiltered, twenty posts listed, and
      a team's cards unchanged.
- [x] 24.3 Remove the limit on an author's pinned Topic Posts: `PROFILE_TOPIC_POST_LIMIT` leaves the contracts,
      `setTopicPostProfileOrder` passes no limit, the profile's rank dialog for posts has none, and a post's own page
      always offers its post a place. Verify: `bun test apps/api/profileOrder.test.ts packages/db/profileOrder.test.ts`
      passes, with a thirteenth pin set at position thirteen, and the topic, film, and podcast episode limits kept.
- [x] 24.4 Order the home's sections Featured topics, Featured films, New films this week, Featured podcasts, New
      podcasts this week, Featured posts, New posts this week, Your topics, in `HOME_SECTIONS` and in both apps' home.
      Verify: `bun test packages/core/lib/sectionOrder.test.ts apps/web/src/routes` passes, with the keys, both apps'
      elements, and the server render's titles in that order.
- [x] 24.5 Add New posts this week: `newestTopicPostIds` in the cached home card ids, the Topic Posts of public shown
      topics published in the last `NEW_TOPIC_POST_DAYS`, newest first, pinned or not, and the optional
      `newestTopicPosts` in the home payload, with one read of the cards of both post lists. Verify:
      `bun test apps/api/home` passes, with the seven-day filter, the public shown filter, the order, an empty week,
      a cache hit that sends no read, a cleared cache that reads again, and ids cached before the list.
- [x] 24.6 Clear the home's caches and purge the author's profile at the edge when a Topic Post publishes on a public
      topic. Verify: `bun test apps/api/topicPost/topicPostsRoute.test.ts` passes, with a public topic's publish
      clearing both and a private topic's clearing neither.
- [x] 24.7 Show each week's section only while it holds a card, on the web and in the mobile app. Verify:
      `bun test apps/web/src/routes` passes, with New films this week, New podcasts this week, and New posts this
      week absent from a render whose lists are empty.
- [x] 24.8 Update the web's `RankDialog` stories for posts with no limit, the docs pages `feed/open-mic.md` and
      `topics/topic-and-podcast-visions.md`, the Nightshift Layout page, `apps/mobile/parity.md`, the domain model's
      Home Topic Post and Profile Topic Post rows, and the AGENTS.md of `apps/api`, `apps/web`, `apps/mobile`,
      `packages/core`, `packages/contracts`, and `packages/db`. Verify: `bunx tsc -b`, `bunx knip`,
      `bun scripts/check-component-parity.ts`, `bun scripts/check-client-parity.ts`, and
      `bun scripts/check-package-boundaries.ts` pass.
- [ ] 24.9 Open the home and a Café on a device, signed in and as a visitor. Verify: the home's sections read in the
      order of 24.4 with their counts, a week with nothing new shows no "this week" section, the Café shows Featured
      Posts with every post and no Open Mic section, and Featured posts in the Café's action menu pins a thirteenth
      post.
- [x] 24.10 List every published Topic Post of a team's Topics that the reader may open in the team page's Featured
      Posts, their authors' pins first and then the rest newest first, from `apps/api/team/teamPage.ts`, with the
      spec, the design, the docs page `feed/open-mic.md`, the Layout page, `apps/mobile/parity.md`, and the domain
      model's Profile Topic Post row. Verify: `bun test apps/api/team/teamPage.test.ts` passes, with a member
      reading every Topic's posts, a visitor the public Topics' alone, the profile order, and twenty posts listed.

## 25. Topic page read performance

- [x] 25.1 Read a topic page's ready films once: `loadTopicPodcast` reads them for every published podcast episode
      and passes them to the latest podcast episode, the season's list, the scans' summaries, and Topic Cinema, whose
      podcast episode loads once with the latest one. Verify: `bun test apps/api/queryBudgets.test.ts` passes, with
      one film read on a page with two published podcast episodes.
- [x] 25.2 Start the topic page's independent reads together: the user's access beside the topic in
      `loadViewableTopic`, the editor's regeneration count, the chat mentions, and the admin's home topics among the
      page's reads, a Finding list's bookmarks, favicons, and reactions, the invites beside the scan checks, and a
      team's row beside its shares. Verify: `bun test apps/api/topic` passes, and one signed-in read's statements
      start in six rounds where they started in fourteen.
- [x] 25.3 Start the podcast episode page's reads together: the user's access beside the page's podcast episode, the
      related podcast episodes beside everything else, and the reactions, the favicons, the editor's fields, and the
      admin's home lists in one round. Verify: `bun test apps/api/podcast` passes.
- [x] 25.4 Add `related=separate` to `topicPageQuery`, which leaves a signed-in page's related topics empty, and
      `GET /api/topics/:id/related-topics` behind the page's gate and the social read limit, with
      `relatedTopicsResponse`, its route contract, and `fetchRelatedTopics`. Verify:
      `bun test apps/api/topic/topicsRoute.test.ts packages/client/topicClient.test.ts` passes, with the list equal
      to the page's, a visitor's page unchanged by the flag, and a hidden Topic's 403 gate and 404 from both reads,
      and `bun scripts/check-contract-freeze.ts` reports nothing for `topicClient.fetchTopicPage`.
- [x] 25.5 Load a signed-in web topic page with the flag in `useTopicPagePayload`, and add its related topics from
      their own read once they arrive, keeping the ones a reload replaces until then. Verify: a signed-in page asks
      for `related=separate` and `related-topics` and shows "Similar topics" with its count in the details line, and
      a visitor's server-rendered html holds the table with no related topics request.
- [x] 25.6 Set the topic page's query maximums in `apps/api/queryBudgets.test.ts` to the page's own 21 reads, the
      related topics' four, and the related topics read's seven, and update `apps/mobile/parity.md` and the
      AGENTS.md of `apps/api`, `apps/web`, and `packages/client`. Verify: `bunx tsc -b`, `bunx knip`,
      `bun scripts/check-client-parity.ts`, and `bun scripts/check-package-boundaries.ts` pass.

## 26. Skeletons match their pages

- [x] 26.1 Lay out core's `PageSkeleton` in the loaded pages' own elements: the button row, a section with a
      placeholder title and count, the card, the news card, a row of cards, and a header's image and title, with
      `isLoading` on both apps' `AccordionSection`. Verify: `bunx tsc -b` passes, and a profile's, a team's, the
      teams', and the activity's first section title sit where the loaded page draws them at 390 and 1280 pixels.
- [x] 26.2 Match the Account page: the plan button's placeholder in the header row, and the budget's loading card in
      the loaded card's lines, with the cutoff list for every budget but an admin's own. Verify: the Settings title
      moves 0 pixels when the budget arrives at both widths, for an admin and for an admin's view of a user.
- [x] 26.3 Show the Activity page's profile link while it loads, with `UserProfileLinkSkeleton` on an admin's view of
      another user, and the Admin page's header over its loading animation. Verify: the first section's title moves
      0 pixels on Activity, and the Admin header moves 0 pixels.
- [x] 26.4 Lay out a Topic Post's loading state in the page's own header, byline row, and discussion card. Verify:
      the discussion card and the body's card move 0 pixels at 1280 pixels, and the discussion card 0 at 390.
- [x] 26.5 Lay out the podcast episode page's loading state in the loaded header's grid, with the film's section
      under the podcast's and the theme song's note after each title. Verify: the film's section moves 3 pixels at
      1280 pixels.
- [x] 26.6 Lay out a Topics row's loading state in the row's header grid with its image, load the news as a page of
      placeholder rows, and lay out the home's loading sections in the loaded accordion. Verify: a Topics row's
      card moves 0 pixels at both widths, and the home's first section moves 116 pixels where it moved 532.
- [x] 26.7 Make the same corrections in the mobile app: the page skeleton's elements, `AccordionSection`'s
      `isLoading`, `CollapsibleSectionSkeleton`, the news rows, the cards, the home's sections, the podcast episode
      screen, the Account's plan button placeholder, and the Activity's profile link from the session. Verify:
      `bunx tsc -b` and `bun scripts/check-component-parity.ts` pass.
- [x] 26.8 Update the `PageSkeleton` and `AccordionSection` stories on the web and in the mobile app, add the
      `UserProfileLinkSkeleton` story, and update the AGENTS.md of `apps/web`, `apps/mobile`, and `packages/core`.
      Verify: `bun test apps/web/src/components/stories.test.ts` passes.
- [x] 26.9 Match the topic page's loading state once its read's change lands: the left button of its row, the header
      in the loaded header's grid on a phone with the details line, the film's section over the podcast's with the
      theme song's note after each title, the count at the far right of a counted section's title, the empty
      section's card for the comment thread and the Topic Posts, and the films' list above the podcast episodes'.
      The topic page's player card keeps its podcast feed button, and the podcast episode page's has none. Make the
      same layout in the mobile app. Verify: on a topic with an open film, every block down to the first card of
      the columns moves 0 pixels at 390 and 1280 pixels, the podcast episode page's player card has the loaded
      card's height at both, and the Similar topics' arrival moves no block above it.
- [x] 26.10 Look at the team page's loading sections again once its Featured Films section lands: four sections of
      cards, the films right before the podcast episodes, over the three tables. Verify: the members' table moves
      44 pixels where it moved 1167 at 390 pixels, and 44 where it moved 1091 at 1280.
- [ ] 26.11 Check each changed loading state against its loaded screen on an iPhone and an Android phone.

## 27. Fixes from the verification

- [x] 27.1 Topic Post page: the topic-posts spec lists the page's order as the code draws it, with the discussion card
      above the body and no chat on the page.
- [x] 27.2 First discussion: the topic-post-discussions spec says what the page shows during the edit time's wait, to
      a reader and to an editor, and that an editor's Regenerate during the wait is the only recording.
- [x] 27.3 Title badges: the Topic Post page's title on both apps and the mobile podcast episode screen's title count
      the page's unseen Comment Mentions, through `usePageCommentMentions` and the apps' `CommentMentionBadge`.
- [x] 27.4 Mobile page badge: `PageUpdateCountBadge` opens the mentions list in a sheet if a Comment Mention waits and
      no chat mention does, as the web's does.
- [x] 27.5 Mobile linked Comment: the screen or sheet scrolls to the Comment a link names, and a mention is marked
      seen once half of its Comment's row is inside the window, at layout and at the end of a scroll, through
      `apps/mobile/src/hooks/useSectionTargetScroll.ts`. Not yet checked on a device.
- [x] 27.6 Cached unseen mentions: `packages/db/unseenCommentMentions.ts` holds the clear, which an admin's report
      removal, an admin block and its clear, a Podcast Episode's removal and replacement, and the delete of a Topic
      or a Topic Post now call.
- [x] 27.7 Empty Your topics: the home's section shows no count at zero on both apps.
- [x] 27.8 Profile order: the public-profiles spec says each table always shows, an empty one with its line in a
      card.
- [x] 27.9 Add Member: both apps read the label from `ADD_TEAM_MEMBER_LABEL` in `packages/core/lib/teamFields.ts`.
- [x] 27.10 Unchanged home order: `setTopicHomeOrder` writes nothing for a position the Topic already holds, so a Save
      with no move keeps its home podcast episodes' and films' pins. `apps/api/topic/homeOrder.test.ts` covers it.
- [x] 27.11 Smoke sections: `apps/api/mcp/mcpTopicPostSmokeSections.ts` calls `read_news`, `read_topic_posts`, and
      `read_topic_post` on both routes, and `checkTopicPostComment` in `apps/api/social/social.smoke.ts` posts a
      Comment on a Topic Post. Neither smoke was run, since both need the dev services.
- [x] 27.12 Visitors line and news paging: the viewer-counts spec names the mobile count's missing flash, and the
      news spec's long window reads the page buttons 1, 2, 3, a gap, and 7.
- [x] 27.13 Topic Post chat on mobile: the post's screen names its post again each time it takes focus, and a chat
      screen asks about the post only if the post's screen opened it.
- [x] 27.14 Design and proposal: the opener on the person's own profile, five news rows a page, the home posts dialog
      on a post's page, the page with no chat, the later groups, and the full list of modified capabilities.

## 28. Fixes from the security and performance audits

- [x] 28.1 A post's whole text is classified, in pieces of the classification's limit, and a publish publishes only
      the version that was classified. A draft's save holds only while the post is still a draft
- [x] 28.2 The card reads of a Topic Post select no body, and `read_topic_post` builds its one card from its row
- [x] 28.3 An edit's summary is one workflow per post that waits 30 seconds, and the publish workflow writes a last
      summary after the edit time if the post changed. A published post's editor saves after 10 seconds, an edit
      inside the edit time counts toward no daily limit, and an edit of the formatting alone writes no summary
- [x] 28.4 A discussion whose workflow fails to start leaves no row. The page's poll for a recording pauses in the
      background and stops after 45 minutes. A partial unique index allows one recording under way per post
- [x] 28.5 A post's author who can no longer read the post cannot change its image. A title with a control character
      is rejected, and `sanitizeNoteHtml` drops a NUL
- [x] 28.6 Indexes on `topic_posts.published_at`, `invites.topic_post_id`, the two new columns of
      `topic_image_renders`, and `topic_podcast_episode_video_sections.episode_id`, in migration 0163. Migrations
      0158 to 0163 open with the lock timeout

- [x] 28.7 The home's opener read returns a stored opener without reading Findings. A visitor's first page of a
      profile's news is cached for 60 seconds, and a cursor's time later than a day from now is an invalid cursor
- [x] 28.8 The profile read runs its independent reads together and reads the person's topics once, and the home
      reads its podcast episode cards once for all four lists. The profile read joins the query count test
- [x] 28.9 A pending team invitee's cards come from the team's public topics alone
- [x] 28.10 A Topic's visibility change, a member's removal, a Topic's removal from a team, and a leader's leaving
      clear the cached unseen Comment Mentions of the users they affect

## Workflow follow-up

- Ship through `/ship`, and archive with `openspec archive cafe-brews-news-open-mic-mentions --yes`.
- After the deploy, sync the prompts to production and check the stateless MCP tools list for the three new tools.
