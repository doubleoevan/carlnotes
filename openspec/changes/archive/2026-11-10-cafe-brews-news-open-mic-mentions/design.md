# Design

## Context

See proposal.md for the motivation. The Social design page in Notion ("Social design: the feed") holds the product
design, and this document adds the technical decisions. The survey of the code found these facts, some of which differ
from the request's summary.

- **Profile.** `apps/web/src/pages/ProfilePage.tsx` and `apps/mobile/app/profiles/[userId].tsx` each build their own
  header and render the shared tables. `GET /profiles/:userId` returns `profileResponse`. A profile has no bio and no
  private switch. Its head has no structured data, and the sitemap leaves profiles out.
- **Home.** The Brews News card is the updates list: `UpdatesList` and `UpdatesButton` from core, fed by
  `POST /updates`, which marks the shown Findings read. Carl's daily summary is the updates opener,
  `loadUpdatesOpener`, cached per user per UTC day. `UPDATES_TITLE` titles both the home card and the updates MCP view.
- **Home picks.** `topics.homeOrder` and `podcastEpisodes.homeOrder` are stored in `feature_order` columns. The admin
  sets them from the Topic page's and the Podcast Episode page's action menu through the web-only `HomeRankDialog`. No
  limit exists on pins, and the home takes twelve. The home's card sections are web and mobile components, not core
  ones.
- **Comments.** `comment_mentions` already stores one row per mentioned user, written in `postComment` and rewritten in
  `editComment`, with no seen column. The flag a read returns is `isSharedWithPodcast`. `comments` and `reactions` each
  have a `post_id` text column with no foreign key, and `loadSocialTarget` returns null for the `post` kind. Neither
  table stores the Topic of its social target. No link to a single Comment exists.
- **Badges.** The header badge already sums chat mentions, note changes, invitations, and open reports, polled every 45
  seconds. The web header shows the avatar. The mobile header shows a menu icon with the same badge and no avatar.
- **Notes.** The editor is `NoteEditor` in core on `react-native-enriched-html`, on both apps. Its comments are a thread
  beside the note, switched by `canComment`. `sanitizeNoteHtml` runs on the server at every save.
- **Podcast.** One script call per segment, `recordSpeech` for two voices, and one ffmpeg pass that mixes the theme. The
  talk plays alone only if both theme files are missing. Calls run on the billed user's LiteLLM key, and
  `isSharedCommentSpeakable` screens a shared Comment and its username before speech.
- **Chat.** The podcast chat is a Topic chat request that names a chapter. Shared Comments reach no chat context today.
- **Images.** A Podcast Episode's image is the precedent for a second image owner: columns on its own row, a nullable
  reference on `topic_image_renders`, and one entry per kind in `IMAGE_WRITES`.

## Goals / Non-Goals

**Goals:**

- One component per piece of UI in `packages/core`, rendered by web, mobile, and the MCP views through adapters.
- One index-backed query per news group, one cached query per user for unseen Comment Mentions, and no timer for
  either.
- Every public page keeps its full content in the server's HTML.
- No new model reads user text outside a fence, and no flagged text is spoken.

**Non-Goals:**

- Following a person. Only Topics are followed.
- A push notification for a Comment Mention.
- Publishing a Topic Post, or a Topic Post Chat, through MCP.
- A profile bio, a private profile, profile structured data, or profiles in the sitemap.
- Home picks in the mobile app. The admin keeps the web's dialog.
- Topic Posts in `llms.txt` or in a Topic's RSS.

## Decisions for approval

These thirteen decide what the specs and tasks say. The first eight are the ones the request listed. The last five came
out of the survey and need the same approval. The user approved all thirteen, unchanged, on 2026-11-09.

### 1. Domain words

| Thing | Code and docs | Customer copy |
|---|---|---|
| Long-form writing on a Topic by its owner or team members | **Topic Post**: `topicPost`, `topic_posts` | post, in the Open Mic section |
| One thing that happened on a Topic inside a window | **News Event**: `NewsEvent`, with no table | a row of Brews News |
| The list of News Events for a window | **news**: `readNews`, `NewsList`, `newsWindow` | Brews News |
| A Comment's stored mention of a user | **Comment Mention**: `comment_mentions`, unseen until `seen_at` is set | mention, Mark all seen |
| One recording of the two hosts on a Topic Post | **Topic Post Discussion**: `topicPostDiscussion` | Coffee Break Discussion, never shortened |
| A chat turn about a Topic Post | **Topic Post Chat**: `topicPostChat`, chat turn kind `topic_post` | the post's chat |
| A Topic or Podcast Episode its owner pins on their profile | **Profile Topic**, **Profile Podcast Episode**: `profileOrder` | Featured Topics, Featured Podcasts |
| The distinct people who opened a profile or a Team page | **profile viewers**, **team viewers** | Visitors |
| The profile page | **profile** | Café, "Evan Café" |

- A bare `post` stays the verb for a Comment (`social:post`, `postComment`) and the released social target kind `post`,
  whose id is now a Topic Post's id. Every other identifier says `topicPost`. A Topic Post is **published**.
- **News** is the code word because Feed is a Topic's stream of Findings, Activity is the page of subscriptions and
  invites, and Updates is the updates list. Brews News is branding, as Coffee Talk is for chat.
- "Open Mic" returns as customer copy for the Topic Posts section. The domain model retired it as the old name for
  Comments, and that line changes.
- Identifiers say `profile`, never `featured`, for the pins, as the home's say `home`.
- The Notion names `cafe` and `userHomepage` for code are dropped. The page is the profile.

### 2. A Comment Mention is its own record

Yes, and it already is: `comment_mentions`. This change adds `seen_at` and a partial index on `mentioned_user_id` where
`seen_at` is null, as `room_mentions` has. An edit keeps the `seen_at` of a user the new body still mentions, so an
edit never badges a person twice. Deleting the Comment deletes its rows by the existing cascade. The migration marks
every mention written before the column as seen, so nobody is badged for old Comments.

*Alternative:* parse bodies at read time. It cannot hold a seen time, and the count would scan Comments.

### 3. Brews News reads the existing records

The news is a query over `episodes`, `topic_posts`, `comments`, `reactions`, and `findings`, with no event table. Each
group is one query: a `UNION ALL` of five arms, each a range read on a Topic and time index, ordered and limited
together, with the group's total from a window count in the same query.

Findings, Podcast Episodes, and Topic Posts store their Topic. Comments and reactions do not, so reading a Topic's
Comments on its Findings would join through every Finding. This change adds `target_topic_id` to `comments` and
`reactions`, the Topic the social target belongs to, set at write, backfilled by the migration, and indexed with
`created_at`. The column stays nullable, so a replica still on the release before it can insert during a rolling
deploy. A row written that way has no target topic and is absent from the news.

*Alternative:* a stored `news_events` table. Every writer in five places would insert into it, including the Scan
pipeline and the podcast worker. A read would still join each event to its record to drop a deleted Comment, a Finding
rated thumbs down, a blocked author, or a Topic that turned private. It adds a second copy that can drift and saves no
join.

### 4. Featured picks sit beside the home picks

`topics.profile_order` and `episodes.profile_order`, beside the two `feature_order` columns. A Topic has one owner, and
a person pins only their own Topics and those Topics' Podcast Episodes, so a column holds it. `packages/db/homeOrder.ts`
gains a scope: every row for the home, one owner's rows for a profile. A profile order is limited to twelve, set by the
Topic's owner through `profile:setProfileOrder`, held only by a public Topic, and released as a home order is.

The owner picks from the **profile page's action menu**, where "Featured topics" and "Featured podcasts" open the rank
dialog. The home's dialog opens from a Topic's page and places that Topic. The profile's dialog has no Topic of its own,
so it lists the pins and offers the person's other public Topics for a position. Both are one core `RankDialog`.

*Alternative:* a `profile_picks` join table. It is needed only if a person pins what they do not own.

Topic Posts follow the same design: `topic_posts.home_order` and `topic_posts.profile_order`. A post's profile order
sits among its **author's** pins, since the Café lists a person's posts by author, and a team member writes on a Topic
they do not own. The author sets it, on a published post of a public Topic, with no limit. A deleted post and a
Topic that stops being public release both orders. The home's Featured Posts section lists the pins, then the newest
post of each Topic with none shown, as Featured Podcasts lists one Podcast Episode per Topic. The Café's lists the
pins, then every other post of the person, and the Featured posts dialog's picker reads its candidates from it. The
team page's follows the Café's over the Topics the reader may open: their authors' pins in the profile order, then
every other post newest first, from one read of the posts in `apps/api/team/teamPage.ts`, which the user asked for
on 2026-11-10. Decision 14 has the reason. The home's dialog opens from the home page's action menu with a
picker. It also opens from the action menu of a published post's own page on a public Topic, where it offers that
post a place, as the author's Featured posts dialog does there.

### 5. Who edits and deletes a Topic Post

The author edits a published Topic Post for 15 minutes from publishing, on `SOCIAL_EDIT_MS`, and an edit does not extend
the time. The author, the Topic's owner, and an admin delete one at any time, after a confirmation. A draft is edited
freely. Deleting a Topic Post deletes its Comments, reactions, discussions, image files, and audio.

### 6. A Topic Post is as private as its Topic

Whoever may open the Topic reads its Topic Posts, by the Topic's own check at read time, so a visibility change moves
every post at once. Only a public Topic's posts appear on someone else's profile, in someone else's news, in the
sitemap, and to a visitor through MCP.

### 7. A Topic Post has a draft

Yes. A draft is a `topic_posts` row with no `published_at`, readable by its author alone, saved through the Note save
flow: a `version`, a conditional write, and a 409 conflict. Publish is a separate request that checks the 300 words,
sets `published_at`, and starts the workflow.

The reason is the 300 word minimum together with the 15 minute edit time. Writing spans sittings and devices, and after
publishing the draft is the only place left to revise.

*Alternative:* keep unsent text on the device only. It is less to build, and it loses a long post on a second device.

### 8. The Topic Post route

`/topics/<topicId>/<topicSlug>/posts/<topicPostId>/<postSlug>`, built by `toTopicPostPath` beside
`toPodcastEpisodePath`. The id resolves the post, the slug is its title through `toTopicSlug`, and a missing or stale
slug redirects, as a Topic's does. The mobile route is `topics/[topicId]/posts/[topicPostId]`. An unpublished post's
route shows its author the editor and answers anyone else as not found.

### 9. The Topic Post Discussion's length

Two to seven minutes on every plan, by the post's length and the shared Comments the hosts read. The post alone gets
half as many spoken words as it has, between 300 and 600, which is two to four minutes. Each shared Comment read, up to
six, adds a 75 word exchange, which is half a minute. A script never runs past seven minutes. A Podcast Episode runs 10
or 30 minutes over many Findings, and a discussion covers one post, so it stays shorter than either.

Regenerations are limited per person per month by plan, as image regenerations are: 2 on Free, 10 on Plus, 20 on
Premium, shown as "X of Y used this month", with the button absent at the limit. The limit is separate from the image
limit because a recording costs more than an image.

### 10. The home card keeps the opener and drops the updates list

The request keeps Carl's daily summary exactly as it is and makes the card the news. The summary is the updates opener,
which today is written while an updates list is built. So:

- The card shows the opener, then the news with its Week, Day, Hour picker. The 5, 15, and 30 minute button and the
  unread Findings rows leave the web and mobile home.
- `GET /updates/opener` returns the day's opener through the same `loadUpdatesOpener`, the same cache key, prompt, and
  budget rule, and marks no Finding read.
- `read_updates` and its MCP view stay, since a reading list and a record of what happened are different jobs. Its
  heading returns to "Brew Updates", the name the domain model records, so only the news is titled Brews News.
- The opener shows on the home and above the news on the person's own profile page. Someone else's profile has
  none, since the opener is written from the reader's own unread Findings.

*Alternative:* retire `read_updates` too. It removes a registered tool from connected clients for no gain here.

### 11. Someone else's profile leaves out the Topics its person follows

The living spec says a profile never lists what its owner follows, since that leaks reading habits. A news group of
"topics they follow" would break that. On someone else's profile the news holds the person's own group, and their
teams' group for public Teams where their membership is shown. The followed group shows to the person alone.

### 12. One share with Carl and Vienna, post Comments included

A Comment on a Topic Post is shared by the same toggle, into the same shared comment slots, as any Comment. The Topic's
next Podcast Episode, the scoring context, and the link queue read it as they read the others. The Topic Post Discussion
and the Topic Post Chat also read the post's shared Comments, waiting or aired. The only new rule is that a Comment on a
Topic Post never starts shared.

*Alternative:* a separate share for posts with its own limit. Four readers would need to leave post Comments out, and
the toggle would mean two things.

### 13. The first recording waits for the edit time to end

Publishing starts one workflow. It draws the image and writes the summary at once, then waits until 15 minutes after
publishing and records the discussion from the text as it then stands. Recording at once would speak a text its author
may still correct, and the correction would then cost a Regenerate. An edit inside the time rewrites the summary and
keeps the image.

No discussion row exists during the wait, so the page shows what a post with no discussion shows: no card to a
reader, and the card with "Not recorded yet." and Regenerate to a user who may publish. A Regenerate pressed during
the wait is the only recording, since the publish starts none once the post has a discussion.

### 14. The Café has one Topic Posts section, and the home pairs each Featured section with its week

The Café showed two Topic Post sections: Featured Posts, with the pins and the newest post of each other Topic, and
Open Mic, with every post newest first. A person with a few posts read the same cards twice. The Café now has Featured
Posts alone, and it lists every published post the reader may open: the pins in their order, then the rest newest
first. An author's pins have no limit, since the section already lists every post and a pin only moves one up. The
payload's `profileTopicPosts` holds the whole list from the one read that already loaded every post, so the count in
the section's title is the list's length and no count query runs. The section pages six cards in the browser with
every card in the HTML, as the other Café sections do. The profile's `topicPosts` field is removed, which no released
app reads. Open Mic stays the name of the section on a Topic's page. The open change
`home-and-profile-topic-podcast-episode-videos` adds Featured Films right before Featured Podcasts on the Café and
the team page, under its own `topic-podcast-episode-video-featuring` capability.

The home orders its sections Featured topics, Featured films, New films this week, Featured podcasts, New podcasts
this week, Featured posts, New posts this week, Your topics, so each week's cards sit right after their Featured
cards. New posts this week lists the Topic Posts of public shown Topics published in the last seven days, newest
first. A pinned post that is new this week shows in both sections, as a pinned Podcast Episode does. Its ids are a
seventh list in the `home-card-ids` Redis entry, optional so an entry cached before the list reads as an empty week,
and one read loads the cards of both post sections. A week's section is absent while it is empty, by the card
section's own rule. A publish on a public Topic now clears the home's caches and purges its author's Café at the edge,
as a published post's delete does.

*Alternative:* keep twelve pins and list the rest under a second title. It keeps two sections for one list.

## Decisions

### Schema

- `topic_posts`: `topic_id` and `author_user_id` (both cascade), `title`, `html`, `word_count`, `version`,
  `published_at`, `edited_at`, `summary`, `cost`, and the image columns a Podcast Episode has (`image_hash`,
  `image_origin`, `image_prompt`). Indexed on `(topic_id, published_at)` and `(author_user_id, published_at)`.
- `topic_post_discussions`: the Topic Post, the billed user, a `kind` (`publish`, `regenerate`), a status
  (`recording`, `published`, `failed`), the script, the audio's object key, byte size, and duration, and the cost. The
  post's discussion is its newest published row. A regeneration's hint goes with the workflow's input and is never
  stored, as an image's hint is.
- `comments.post_id` and `reactions.post_id` gain a foreign key to `topic_posts`, cascading.
- `topic_image_renders.topic_post_id`, nullable, so one count covers a person's regenerations of both kinds.
- `chat_turns.topic_post_id` with the kind `topic_post` and a check constraint for its shape.
- `viewer_counters.profile_user_id` and `viewer_counters.team_id`, with the check widened to exactly one of four.

### The news read

`readNews({ profileUserId, userId, window, page, cursor, pageSize })` in `apps/api/news/`:

1. Load the three Topic id sets for the profile's person: owned, held by their active Teams, subscribed. Each later set
   leaves out the earlier ones.
2. Narrow them for the reader. The person themself keeps all three. Anyone else keeps public Topics, public Teams with a
   shown membership, and no subscribed set.
3. Read one group at a time from the cursor until the page is full: five rows on the site and in the apps
   (`NEWS_PAGE_SIZE`), and 20 in the `read_news` tool (`MCP_NEWS_PAGE_SIZE`). The own group adds two arms: replies
   and reactions to the person's Comments, and Comments and reactions on the person's Topic Posts, on any Topic the
   reader may open.
4. Each arm reuses the filters its own read uses: `toVisibleAuthorFilter` for authors, `toActivatedScanFilter` for an
   invite Topic's Findings, and the thumbs down filter of the Topic's Feed.

Reactions on a Comment group in SQL by Comment, with the count and the newest time in the window. The route is
`GET /news` for the user's own and `GET /profiles/:userId/news` for a profile, both behind `socialReadRateLimiter`. The
profile page's server render reads the first page of the Week window, and the browser reads each later page under
the window's cursor as its page button is pressed.

### Unseen Comment Mentions

`GET /comment-mentions/unseen` returns the user's unseen mentions, newest first, each with the Comment's id, author,
first line, social target, and page. One query joins `comment_mentions` to `comments` with `toVisibleAuthorFilter`, the
Topic's access filter, and no row for the user's own Comments. `cacheJson` holds the result per user for five
minutes. `clearUnseenCommentMentions` in `packages/db/unseenCommentMentions.ts` deletes the key of each user a write
affects: a Comment's post or edit that mentions them, a seen mark, a user block in either direction, an admin block
set or cleared on an author who mentions them, and every delete of a Comment that mentions them. Those deletes are
the comment route's, an admin's report removal, the removal or replacement of a Podcast Episode, and the delete of a
Topic or a Topic Post. A Finding's rating, a Topic's visibility change, and a closed account change the read without
clearing it, so the read is at most five minutes stale after one of them.

`commentMentionStore` in core holds the list. The client reads it as a page loads and after the user's own Comment
write, and never on a timer. The three badges derive their counts from the one list. `POST /comment-mentions/seen`
takes Comment ids, or all, and sets `seen_at`.

A link to a Comment is its page's path with `?comment=<id>`, and a Finding's adds it to `?finding=<id>`. The thread
read takes that id and returns the linked Comment's top-level Comment first with the replies up to the linked one, so
an old Comment is reachable without paging.

### Topic Post publishing

`topicPost:publish` resolves as `topic:edit` does: the owner, and the active leaders and members of a holding Team. The
same capability regenerates the discussion. `publishTopicPostWorkflow` in `apps/worker/workflows/` runs
the summary on `cheapModel` from a new `summarize-topic-post.md`, starts the image render with a new `topicPost` kind in
the Topic image pipeline, sleeps to the end of the edit time, and runs the discussion. Each step is best effort, and a
failure leaves the post published.

### Topic Post images

The image is generated at publish, as a Topic's is at create. After that, a new capability `topicPost:editImage`
decides who changes it: the Topic Post's author, and whoever holds `topic:edit` on its Topic, which is the owner and
the active members of a holding Team. An admin passes through the usual override. The author is named apart because an
author who has since left the Team keeps their own post's image.

- **Regenerate.** `POST /topic-posts/:id/image/regenerate` takes the optional image prompt, checks it with
  `toImagePromptRejection`, and reads the count from `loadEditorImageRegenerationQuota`. The render row holds
  `topic_post_id`, so one monthly count covers a person's Topic and Topic Post regenerations under the plan's
  `imageRegenerationLimit`. An admin reads no count and is never limited.
- **Upload.** `PUT /topic-posts/:id/image` reads the file through `readUploadedImageOriginal` in
  `apps/api/topic/imageEdits.ts`, the path a Topic's and a Podcast Episode's uploads take, with the subject kind
  `topicPostImage`. So the size limit, the decoded type, the crop, and the image moderation are the Topic image's own
  with no second copy. A stored upload sets `image_origin` to `uploaded` and counts toward no limit.
- **Replacing.** Either write stores a new content hash on the row. The card, the page, and the share image all read
  the row's hash, so each shows the new image, and the old files are scheduled for deletion as a Topic's are. The write
  purges the Topic Post page's edge cache tag.
- **Reporting.** `topicPostImage` joins `reportSubjectKinds`, with its row in `REPORT_SUBJECT_KIND_LABELS`, its loader
  in `apps/api/report/reportSubjects.ts`, and its image on the admin's row. It joins
  `REMOVABLE_REPORT_SUBJECT_KINDS`, and `removeReportedSubject` handles it as it handles `topicImage`: skip a post that
  is gone, remove an upload, and start a render with no user and the `admin` kind, which bills the platform's budget.
  The console's button on an image report reads Regenerate and resolves the report as removed. The reporter stops
  seeing the image through `toUnreportedFilter` until the hash changes.

*Alternative:* let only `topicPost:publish` change the image. It would lock an author out of their own post's image
once they leave the Team, while they may still delete the post.

`sanitizeNoteHtml` moves to where both the note and the Topic Post routes import it and runs on every save, so pasted
markup is cleaned on the server. `classifyUserText` runs on the title and the text at publish and on a published edit,
as it does on a Note.

`buildTopicScanContext` adds each published Topic Post after the attachments as `[topic post: <title>]` and its text,
newest first, each cut at `MAX_EXTRACT_CHARS` with the cut marked, inside the existing review context limit and fence.
No model call is added for it.

### The Topic Post Discussion

`recordTopicPostDiscussionWorkflow` on the `episode-recordings` queue:

1. Load the post's text and its shared Comments that `isSharedCommentShown` keeps.
2. Screen each Comment's text and username, and the author's username, with `isSharedCommentSpeakable`. A flagged
   Comment is left out. A flagged author is called the author.
3. One `scoreModel` call on a new `write-topic-post-discussion.md` with the hosts block, the post, the Comments as
   `username: body` lines, and the hint, each fenced.
4. Check the script in code: two speakers, the word limit, and each read Comment's username spoken as a whole word.
5. One `recordSpeech` call, then the encode with the theme mix off, which becomes an explicit option of
   `toJoinArguments` instead of depending on missing files.
6. Store the audio under `topic-post-discussions/<topicPostId>/<discussionId>.mp3` and publish the row.

Calls run on the billed user's LiteLLM key, the cost is summed into their monthly spend, and the `podcastEpisodes`
budget cutoff applies. A spent budget fails the row and nothing else.

### Sharing a Topic Post

A Topic Post is shared through its Topic's own share options, not a second dialog. `ShareTopic` on the web and in the
mobile app takes the post as a `topicPost` prop, from core's `toTopicPostShare`, and shares the post's page link and
title in the Topic's place. It leaves out the Topic's RSS feed and its report options. The post page's actions menu
opens it as a dialog or a sheet, and the info popup's Share opens it as a popover or a sheet. The post page has no top
row of two buttons, a plain one at the left and the one highlighted call to action at the right, so it gains no Share
button of its own.

- **The card.** `share/topicPostImage.ts` draws `/api/topic-posts/<id>/preview.png` with the helpers the Topic's and
  the Podcast Episode's cards use, cached under a key of what it draws, and the page head names it at that key's
  version. A public Topic's post shows its own image, or the Topic's until it is drawn, its title, its author, and the
  Topic's name. A private or invite Topic's card already shows the Topic's name, image, and owner to anyone, so its
  post's card shows those with the post's title, which the post's head already shows, and never the post's own image
  or its author. The `BlogPosting` image stays the post's own image.
- **The invite.** The owner's invite option creates a Topic invite link with `invites.topic_post_id` set, checked to
  be a published post of that Topic. A post's link is a separate row from the Topic's own link, so reuse never hands
  out a link that opens something else. Accepting it is a Topic invite's acceptance unchanged, and the `joined`
  response adds the post's id and path while the post is published. `toInviteDestination` in core then opens the
  post's page on the web and the post's screen in the app. The column clears when the post is deleted, which leaves
  the Topic. The join page's head and card show the post's card and title for such a link.
- **User invites.** The share options hold no email or username field, on a Topic or on a post, so only a link names
  a post. The invite email, the received invites list, and the badge are unchanged. Both accept routes return the
  post for any invite that names one.

*Alternative:* a `post` invite target beside `topic` and `team`. It would need its own subscription rule, its own
limits, and its own rows on every invite list, to grant what a Topic invite already grants.

### Topic Posts in search

`topicPosts` is a search result kind, after `podcastEpisodes` in the kind order. `apps/api/search/topicPostSearch.ts`
finds published Topic Posts whose title, summary, or body text holds the query, under the Topic's view rules and the
tag filter, title matches first, and never a draft. The web's Filters menu lists Posts, a row shows the post's image
or the notebook-pen icon with `Post · age · Topic`, and the MCP `search` tool takes the kind.

### The Topic Post chat opens from the chat launcher

The post's page holds no chat panel and no Ask Carl button. `topicPostChatStore` in core names the open published
post, and the chat launcher opens the Topic's private chat about it, ahead of every chat room, with the post's own
question line. `toPrivateChatLabel` names a private chat for what it is about: the post, else the Topic, else the
team. In the mobile app the launcher on the post's screen opens the chat screen with `privateChat=true`, the post's
screen names its post again each time it takes focus, and a chat screen asks about the post only if that screen
opened it, since a post's screen stays mounted under the screens opened above it.

### Details lines

`DetailsLine` in core is a wrapping row of small muted details under a page's byline, with a count of zero left out.
The topic page counts its sections on it, the Topic Post page shows its date, reading time, comment count, and
edited mark, and the Café's and the team page's summary lines are built on it. The Topic Post popup shows its Topic's
viewers and followers from the optional `topicCounts` of the post's response, so it makes no second request.

### The discussion's transcript and the header without JavaScript

The post's read includes its newest recording's transcript, each turn's speaker and words with no vocal tag. The
discussion card's name opens and closes it, closed on every visit: a details element on the web, so the server's
HTML holds every turn and opens with no script, and a button in the mobile app. A turn draws through core's
`PodcastEpisodeTranscriptTurns`, as a podcast episode transcript's does. The narrow header's menu button shows only
once a script has run, and without JavaScript a visitor's links show as plain anchors at every width.

### One size for a top row's buttons

A page's top row holds a plain button at the left, with its icon alone in the highlight color, and the one
highlighted button at the right. Both draw 36 pixels tall with a 44 pixel tap area, and the row keeps 16 pixels
above and below it, through `PAGE_BUTTON_ROW_CLASS` and the two button classes in each app.

### Thumbnails open their pages

An image of a topic, a podcast episode, or a Topic Post opens that thing's page through core's `TopicImageLink`, with
each app's adapter. Beside a title that opens the same page it adds no tab stop and no second announcement. The open
page's own image opens nothing, and an upload control or a film's poster keeps what it opens.

### The topic page's read

A topic page's independent reads start together, so a signed-in read's statements start in six rounds where they
started in fourteen, and its ready films are read once. A signed-in web topic page asks for `related=separate` and
loads Similar topics from `GET /api/topics/:id/related-topics`, while a visitor's server-rendered page keeps the list
inline. `apps/api/queryBudgets.test.ts` holds the page's query maximums.

### Loading states

Core's `PageSkeleton` lays a loading page out in the loaded page's own elements and layout classes: the button row,
the header's image and title, each section's title row, and its first card or table. A block whose height depends on
data takes its most common case, so the loaded page arrives in place.

### Shared components and where a platform deviates

Every row is one core component with `…Elements` adapters. The MCP views render the web's elements.

| Component | Used by | Deviation, with its reason |
|---|---|---|
| `NewsList` | home, profile, `news` MCP view | MCP: links open through the host, since a frame cannot navigate the site |
| `ProfileHeader` | profile page and screen | none |
| `CardsSection` | the home's and the profile's card sections | mobile: `CollapsibleSection` in place of the web accordion, the existing platform difference |
| `RankDialog` | home picks on web, profile picks on both | mobile: a `Sheet` in place of a dialog, the native convention |
| `TopicPostCard` | Topic page, profile, `topic-posts` MCP view | none |
| `TopicPostPage` | post page and screen, `topic-post` MCP view | MCP: no editor, since publishing stays on web and mobile. No platform's page holds a chat: the chat launcher opens the post's chat |
| `TopicPostEditor` | post page and screen | none: it shares `RichTextEditor`, extracted from `NoteEditor`, with the native input adapter |
| `CommentMentionBadge` | header, the topic, podcast episode, and Topic Post page titles, the Comments section | mobile: the header badge sits on the menu icon, since the mobile header has no avatar |
| `CommentMentionList` | opened from any badge | web: a popover. mobile: the tap `Sheet`, since a phone has no hover and no anchored popover |
| `PodcastPlayer` | the discussion's player | none: a discussion is one more thing the shared player plays |
| `CommentThread`, `SocialSection`, `TopicCard`, `PodcastEpisodeCard`, chat panel | as today | none |

The header and page title badges are the existing summed badges, which now add unseen Comment Mentions, with one line in
the combined tooltip. The Comments section's badge is new and counts that thread alone. On the web the header's list
opens from a Mentions row in the user menu, since pressing the avatar opens the menu.

## Risks / Trade-offs

- [A busy profile's Week holds thousands of rows] → The news reads five rows a page under the window's cursor, the
  server's HTML holds the first page alone, the page is edge cached under the profile's tag, and a purge is already
  debounced.
- [The `target_topic_id` backfill touches every Comment and reaction] → Two joined updates in the generated migration,
  on tables a few weeks old. The column stays nullable, and both writers set it.
- [No discussion shows for the 15 minutes before the first recording] → A reader sees no card, and an editor sees
  "Not recorded yet." with Regenerate, which records at once. The card shows the recording state once one starts.
- [A profile's posts and cards all ride in one payload] → A person's Topics are limited by plan. Posts are not, and
  paging them on the server is a later change if a profile grows past a few hundred.
- [Summed badges hide which kind of thing waits] → The combined tooltip names each kind, and pressing a badge that
  counts a Comment Mention opens the list.
- [Removing the updates list from the home changes a habit] → The news carries new Findings as rows, and the list stays
  in MCP.
- [A draft is a new private record] → It is its author's alone in every read, admins included, and is deleted with the
  author's account and the Topic.

## Migration Plan

1. Ship the schema first: new tables, nullable columns, the backfill, then the not-null constraint. The deploy runs it.
2. The api and worker ship together. A worker without the new workflows would leave publishes waiting, so the worker
   deploys before the web shows the publish button.
3. `MCP_VIEW_VERSION` rises by one with the three new views, and the old version alias stays registered.
4. Refresh the contract freeze. `profileResponse` and the home payload only gain fields, so `0.1.0` still reads them.
5. Rollback is a revert. The new columns and tables are unused by the old code, and no stored value changes meaning.

## Open Questions

- The exact lines of the Brews News rows and the empty states are Persona & Voice copy, settled in that page's update.
- The three Regenerate limits in decision 9 are a first guess at cost and can change in `PLANS` without a spec change
  beyond the numbers.
