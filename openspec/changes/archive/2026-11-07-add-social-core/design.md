# Design

## Context

See `proposal.md` for why. This section holds only what the code and the living specs say today, because several
decisions below follow from it.

- **Ratings and feedback.** `findings.rating` is `up` or `down`, gated by `topic:rate`. `finding_feedback` holds a
  user's own words, up to 2,000 characters, insert-only, and nothing reads it. `finding_views` is written on open and
  dismissal and read for viewer counts.
- **The preference signal.** `loadScoreExamplePages` in `packages/pipeline/review/scoreExamplePages.ts` lists bookmarked
  pages, then thumbs-up pages, then thumbs-down pages, as title and host lines in the scoring prompt's Topic context.
  `filterTopicFindings` deletes Findings past `max_results` and spares bookmarked and rated ones.
- **A Finding has no page.** It opens as a popover on the Topic page (`?finding=<id>`) and as a sheet on mobile.
- **Note comments.** `packages/core/components/NoteComments.tsx` is shared by both apps through `NoteCommentsElements`.
  The route applies a 30 a minute limit, the terms check, and the classification, then inserts. It has no edit.
- **Mentions.** Team rooms parse `@username` with `CHAT_MENTION_PATTERN` and store `room_mentions`. Nothing renders a
  mention as a link. A person's text in a room renders as plain text.
- **Reports.** `reports` stores a subject kind and id, the text at report time, and a resolution of `removed` or
  `cleared`. The email goes to `SUPPORT_EMAIL` with a link that opens the admin console on that report. The daily limit
  is 10, counted in Redis.
- **Blocks.** `user_blocks` is one row per pair. `toNotUserBlockedAuthorFilter` hides the blocked person's text from the
  blocker only. No site-wide block exists.
- **Edge.** A rendered page for a request with no session is shared at the edge for 60 seconds. Only a release purges
  it. Nothing purges a page after a Scan.
- **Email.** `signUnsubscribeToken` signs `{ userId, topicId }` with no expiry. `users` holds push switches only. The
  web account page has no notifications section.
- **Analytics.** `trackEvent(event, userId, properties)` is the user event function. It does nothing without
  `POSTHOG_API_KEY`, which is how a self-hosted install sends nothing.
- **Fencing.** `toUntrustedFence()` wraps text in `untrusted-data-<nonce>` tags, and `toUntrustedPromptText` strips
  forged tags.

## Decisions for approval

The owner approved the first design on 2026-11-06, with one change: difference 9 takes its alternative, so the topic
scan email's `digest` names are renamed in this change. The owner approved the Hot takes redesign later the same day.
The redesign replaces every earlier decision about reaction text and the flat thread. What follows is written to
both approvals, and the specs and tasks match it.

### Hot takes redesign, approved 2026-11-06

The redesign drops Open Mic. One discussion component remains, which copy calls Hot takes: a comment thread with one
visible reply level, where every Comment takes reactions. A Reaction is a type alone. A Topic's editors share chosen
Comments with Carl and Vienna, and only shared Comments reach a CarlNotes model.

The seven choices the owner approved, with two amendments:

1. **The composer's switch sets the share.** An editor's Comment or reply starts shared if a shared comment slot is
   free, unless the composer's switch is off. Any Comment, a reply included, can also be shared by hand.
2. **The shared comment slot count frees up as the script reads.** The count covers the next Podcast Episode. A shared
   Comment leaves the count once that Podcast Episode's script reads it, a few minutes before the Podcast Episode airs,
   so a Comment shared during a recording waits for the next Podcast Episode. A failed Podcast Episode gives its
   Comments back.
3. **Everyone sees a lit flame on a shared Comment, and mugs once it aired.** Only a user who may edit the Topic can
   press it. The count stays editors only.
4. **The Hot takes group in the Personal sources section is editors only**, like the count.
5. **The topic chat reads no shared Comment in this change.** Amended: row 60 adds shared Comments to both the
   podcast chat and the topic chat.
6. **A reply is in the daily email of the Comment's author.**
7. **The read field is `isSharedWithCarl`.** Amended: it is derived from `comments.shared_with_carl_at` and is never
   stored as its own column.

### 1. Domain words

| Thing | Domain word | Identifiers | Copy |
| --- | --- | --- | --- |
| A positive type on a social target | Reaction | `reactions`, `Reaction`, `reactionType` | reaction |
| One entry in a thread, top-level or a reply | Comment | `comments`, `Comment`, `commentThread` | hot take |
| What either one hangs on | social target | `SocialTarget`, `socialTargetKinds` | none |
| A Comment an editor shared | shared Comment | `shared_with_carl_at`, `isSharedWithCarl` | shared with Carl and Vienna |
| An admin's block of a person everywhere | admin block | `users.admin_blocked_at`, `admin:setAdminBlock` | Block |
| The daily email | notifications email | `notifications-email.tsx`, `notifications_email_sends` | notifications email |

Cleared against the domain model:

- **Reaction** is unused today. The Note Comment row's "no reactions" stays true of notes.
- **Comment** is new as a bare noun. A Note Comment keeps its full name in every identifier (`noteComments`,
  `NoteComment`), so no identifier holds both.
- **Social target** uses target as invites do ("exactly one target per row"). Subject is taken by reports, and page
  means a Topic or a Team only. A Comment hangs on four kinds, `commentTargetKinds`: `finding`, `podcastEpisode`,
  `topic`, and `post`. A Reaction hangs on five, `socialTargetKinds`, which adds `comment`. `GET /api/comments`
  rejects the kind `comment`, since a reply names its parent and never a thread of its own.
- **Hot take** stays copy. Identifiers, comments, and change docs say Comment. The names a customer or an analyst
  reads are the exceptions: the MCP tools `read_hot_takes` and `post_hot_take`, the analytics names that hold
  `hot_take`, and the label constants.
- **Open Mic** is retired and joins the rejected terms everywhere, copy included.
- **Digest** joins the rejected terms for an email. Difference 9 below renames the names that hold it.

### 2. `finding_feedback` stays separate

Neither new table replaces it.

| | `finding_feedback` | `comments` | `reactions` |
| --- | --- | --- | --- |
| Who reads it | nobody today, kept for Carl | everyone who can open the social target | counts only |
| Sentiment | either | either | positive only |
| Rows | many per user per Finding | many per user per social target | one per user per social target |
| Length | 2,000 | 2,000 | no text |
| Who writes | a user who may rate (`topic:rate`) | any signed-in user who can open the target | the same |

Folding feedback in would publish words a user wrote for Carl, or need a visibility column that makes one table hold
two records. The popover then shows two text boxes, so their labels differ: "Feedback for Carl" stays, and the new
button reads "Hot Take".

### 3. The type set and its icons

Six types, in LinkedIn's order. Icons come from Lucide, which both apps already use, and pass through the adapters.

| Type | Label | Icon |
| --- | --- | --- |
| `like` | Like | `ThumbsUp` |
| `celebrate` | Celebrate | `PartyPopper` |
| `support` | Support | `HeartPlus` |
| `love` | Love | `Heart` |
| `insightful` | Insightful | `Lightbulb` |
| `funny` | Funny | `Laugh` |

An icon is muted until it is the user's own, which uses the primary color with a light fill and no pill behind it.
No new token. Emails and MCP text results say the label. The share toggle has three states: Lucide's `Flame` on an
unshared Comment, the `Flame` lit while it waits, and `Coffee` twice, one mirrored so the mugs face each other, once
it aired, with the tooltip "Shared with Carl and Vienna" and no press. It sits with the row's actions under its body,
apart from the reaction types.

### Where the first request differed from the code or the living specs

These defaults were approved with the first design and still hold.

| # | The request says | The code or spec says | Default here | Alternative |
| --- | --- | --- | --- | --- |
| 1 | Everything posts at once | `content-moderation`: text others read is classified first | Classify, as note comments do | Exempt it |
| 2 | Blocks hide both directions | `user-blocking`: one direction, and no sign of the block | Both directions for Comments | One direction |
| 3 | Admin may block anyone | `user_blocks` is a pair, with no site-wide block | Add the admin block | Close the account |
| 4 | Debounce the page purge | Nothing purges a page after a Scan or a post | No purge, 60 second edge copy | Tags and a debounced purge |
| 5 | A signed, expiring, single-use link | `content-reporting`: the link has no token | Keep the link without a token | Add the token |
| 6 | A post is a social target | No post exists until the Café row | The kind and a column now | The column with the Café row |
| 7 | A thread on the finding page | A Finding has no page | Mount in the popover and the sheet | A finding page |
| 8 | One tool reads and posts | `mcp-server`: each tool's annotations are accurate | Two tools | One tool marked as a write |
| 9 | Never digest in code | The scan email's identifiers say digest | Rename them here (approved) | Leave the old names |

1. **Classification.** `content-reporting` already says a new free-text field "is a reportable subject kind, its text
   is classified before it posts, and its author can be blocked". The rejection shows beside the composer only after a
   confirmed violation, through the existing `ChatRejectionNotice`. No standing notice, warning, or guideline text is
   added. Changes `content-moderation`.
2. **Blocks.** The default follows the request for Comments, and adds that neither person posts on a thing the other
   owns. Without that, a Topic's owner who blocks someone stops seeing that person's Comments on the owner's own
   Topic and so cannot delete them. Rooms, notes, and invites keep today's one-way rule. The cost is stated in the
   delta: a blocked person can tell, by comparing with the signed-out page. Changes `user-blocking`.
3. **Admin block.** It hides the person's reactions and Comments from everyone, rejects new ones, and leaves them out
   of the signal, the email, and every model context. It is reversible. Closing the account already exists and
   deletes everything, which is too much for one press on a report. Changes `authorization` and `user-blocking`.
4. **Purge.** A rendered page already leaves the edge 60 seconds after it was cached, and the edge may serve it stale
   for 60 more while it revalidates. A Comment reaches a visitor inside that time with no purge. A signed-in request
   never reads the edge copy. No spec changes.
5. **Report link.** Nothing is deleted on a click, a forwarded email grants nothing, and the admin's own session is
   required, since Remove and Clear are POST actions in the console. `content-reporting` gains Block and keeps its
   link rule.
6. **Posts.** Both tables get a nullable `post_id` with no foreign key. The api rejects a post target as not found.
   The components and their stories accept one. The Café row adds the table, the foreign key, the post owner's delete
   rule, and the pages.
7. **Finding.** The reaction row mounts below the domain and podcast button in the Topic Finding popover on the web
   and the sheet on mobile, and a Finding's card is titled the same. Reactions arrive with the feed payload. The
   thread loads as the popover opens, so it is not rendered on the server. A Topic's and a Podcast Episode's first
   page are.
8. **Tools.** `read_hot_takes` is read-only and `post_hot_take` is a write, so a host asks for approval only on the
   write.
9. **Digest.** The scheduled Scan's email is the topic scan email, as its template and email kind already say. Its
   six identifiers take that name (`planTopicScanEmail`, `sendTopicScanEmailBatch`,
   `toTopicScanEmailSubscriberIdsQuery`), and comments, docs, and customer copy follow, where copy says brew report.
   A hash digest (`toHmacDigest`) is a different word and stays. The `email_digest_toggled` analytics event keeps
   its name, because PostHog's history and the living event taxonomy are stored under it.

Smaller defaults:

- The daily flag limit goes from 10 to 50.
- Mentions work in Comments, top-level and reply alike.
- The notifications email is a template. No model reads the quoted text.
- A flag mails `SUPPORT_EMAIL` as today.
- Top-level Comments read newest first, so the server-rendered page always holds the latest words. Replies read
  oldest first under their Comment, so a conversation reads in order.
- Limits are flat. They do not scale by account age.

## Goals / Non-Goals

**Goals:**

- One record for reactions and one for Comments, each working on every social target with one code path.
- One component set for the web, the mobile app, and the MCP view, with each platform difference named below.
- One visible reply level under a top-level Comment.
- Besides the classification before it posts, other people's text reaches a CarlNotes model only if a Topic's editor
  shared it. Everything else counts as a weighted number.
- No new model call beyond the classification that every posted text already gets.

**Non-Goals:**

- Posts, their pages, and their owner's delete rule. The Café row adds them.
- A count on the collapsed Finding row. Add it if reactions prove hard to find.
- A second reply level, and collapsing or sorting replies.
- Shared Comments in the podcast chat and the topic chat. Row 60 adds both.
- Push for social activity. It waits for row 53.
- Delete, share, and flag as MCP tools. The MCP parity row adds them.
- An "edited" label on a changed Comment.
- Telling an author by email that their Comment was shared. The lit flame on the Comment says so.

## Decisions

### D1. Data model

```
reactions
  id, user_id (cascade), created_at, updated_at
  finding_id | podcast_episode_id | topic_id | post_id | comment_id      exactly one is set
  reaction_type (enum, not null)
  one partial unique index per target column on (user_id, <target>)
  one partial index per target column on (<target>, created_at desc)

comments
  id, author_user_id (nullable, cascade), created_at, updated_at
  finding_id | podcast_episode_id | topic_id | post_id                    exactly one is set
  chapter_position (nullable, only with podcast_episode_id)
  parent_comment_id (nullable, self reference, cascade)
  body (2,000)
  shared_with_carl_at (nullable)
  shared_topic_id (nullable, cascade)            set exactly if shared_with_carl_at is
  aired_podcast_episode_id (nullable, set null)  the Podcast Episode whose script read it
  one partial index per target column on (<target>, created_at desc)
  an index on (parent_comment_id, created_at)
  a partial index on (shared_topic_id, shared_with_carl_at desc) for shared rows

comment_mentions
  comment_id (cascade), mentioned_user_id (cascade), username as written
  primary key (comment_id, mentioned_user_id), index on mentioned_user_id

comment_links
  id, comment_id (cascade), topic_id (cascade), url, considered_at (nullable, null while pending)
  a unique index on (comment_id, url), an index on (topic_id) for pending rows

notifications_email_sends
  user_id (cascade), sent_day, activity_end_at      primary key (user_id, sent_day)

users
  is_notifications_email_enabled (default false), admin_blocked_at, admin_blocked_by_user_id
```

- **Exactly one target** uses a check constraint, as `notes` does for its page. The alternative, a `target_kind` and
  `target_id` pair, loses the foreign keys and their cascades.
- **A Reaction holds no text.** Its type is required, and removing a Reaction deletes the row.
- **A reply stores its parent and its parent's target.** The parent is always a top-level Comment, so the one-target
  check and the target indexes hold for replies too. A top-level read filters to rows with no parent. Deleting a
  Comment deletes its replies by the cascade.
- **Sharing is one timestamp.** `isSharedWithCarl` on a read is `shared_with_carl_at is not null`. No boolean column
  exists. `shared_topic_id` names the Topic the Comment's target belongs to, so the shared comment slot count and the
  context read are one indexed query each, with no join through Findings and Podcast Episodes.
- **Text is stored plain.** A Comment is published on its social target's page, and `note_comments.body` is plain for
  the same reason.
- **Closing an account deletes its reactions and Comments**, by the cascade `account-closing` already requires. A
  Comment with no author is therefore Carl's, as a room message with no author is. Nothing in this change writes one.
- **Removing a Podcast Episode deletes its reactions and Comments**, since the row stays as `removed`.
- **A mention stores the user id and the name as written.** A username changes freely, so a link resolved by name at
  read time would point at whoever took the old name.
- **Migration.** One more migration follows the change's earlier ones, which are uncommitted and applied only to the
  dev database. It copies each stored reaction text into a Comment on the same social target, then drops
  `reactions.text` and `reactions.text_saved_at`, deletes the rows left with no type, makes the type required, and
  adds the Comment target, the sharing columns, and `comment_links`. Nothing shipped, so production has no row to
  move.

### D2. Social target and the gate

One resolver in `apps/api/social/socialTargets.ts` turns a `SocialTarget` into its Topic, its owner, and its path.
A Finding and a Podcast Episode resolve to their Topic. A Comment resolves through its own social target. A post
resolves to not found until posts exist. The resolver rejects a target the caller cannot open in the same words as
one that does not exist.

`isAllowed` gains three capabilities:

- `social:post`: signed in, may `topic:view` the Topic, not under an admin block, and no block in either direction
  with the Topic's owner. A post, a Reaction, and an edit of a Comment each check it.
- `social:moderate`: the Topic's owner or an admin. It deletes any Comment on that Topic's social targets.
- `admin:setAdminBlock`: an admin.

The author's own delete is checked by authorship, as a note comment's is. Sharing checks the existing `topic:edit`,
which grants the owner and the owning team's members, and adds no capability.

On a Topic with unconverted Personal sources, a user other than its owner, a team member included, reads no Finding,
thread, or reaction summary and posts nothing. `GET /api/topics/:topicId/shared-comments` needs `topic:view` as well
as `topic:edit`.

### D3. Writes and the edit time

- **A Reaction** is one `insert ... on conflict (user_id, <target>) do update` of the type. A save with no type
  deletes the row. A Reaction has no edit time, so its type changes at any age.
- **A Comment** is an insert. A reply names a parent. If the parent is itself a reply, the new row takes that
  reply's parent, so one level shows. A parent on another social target is rejected as not found, as a missing
  parent is.
- **A Comment's edit** is a `PATCH` inside 15 minutes of `created_at`. The time starts at creation, so editing never
  extends it. An edit after it answers 409. Delete stays allowed after the time. An edit needs `social:post` and
  counts against the daily Comment limit, and an edit that changes nothing makes no classification call.
- **A Comment on a Finding rated thumbs down** shows in no thread. Its author, the Topic's owner, and an admin can
  still delete it, and an editor can still unshare it. It cannot be newly shared.

A Comment tells the client `isAuthor`, `isEditable`, and `canDelete`, so no client reads a clock or a role. Past the
edit time the author's Edit shows disabled with its reason.

### D4. Reads

- **Summary.** `ReactionSummary` is `{ counts, ownReactionType }`, and each entry of `counts` holds a type, its count,
  and the newest eight users who chose it. The Topic page, the Podcast Episode page, each `TopicFinding` in the feed,
  and each Comment include one. A page of Findings and a page of Comments each cost one grouped pass on the partial
  indexes, never one read per row.
- **Thread.** `GET /api/comments` takes a social target and a cursor and returns 20 top-level Comments, newest
  first. Each includes its `replyCount` and its first `COMMENT_REPLY_PREVIEW_COUNT = 3` replies, oldest first.
  `GET /api/comments/:id/replies` pages the rest in the same order.
- **Shared comment slots.** The thread response includes `sharedCommentSlots: { usedCount, slotCount }` only for a
  caller who may edit the Topic.
- **Server rendering.** The Topic page and Podcast Episode page payloads include the first page of their thread, so
  the server render and the first client render read the same data.
- **Counts.** A summary's counts and names leave out admin-blocked authors and anyone in a block with the caller.
  Listed Comments leave out the same people.
- Counts are grouped at read time. A counter table waits until a social target passes about 10,000 reactions.

`GET /api/reactions/summary` reads one target's summary, for a list that came without one. `PUT /api/reactions`
saves. The paged reaction list and the delete by id are gone, since a Reaction lists nobody and a save removes it.

### D5. Shared components and each platform difference

`packages/core/components` holds, each with an elements adapter as `NoteComments` has:

- `ReactionRow`: the six types with their counts and the caller's own marked, through `ReactionPicker`.
- `CommentThread`: the composer button, the shared comment slot count for an editor, the Comments with their replies,
  each Comment's reaction row, its Reply, Edit, and Delete actions, its share toggle, the report flag, and paging.
- `TextComposer`: the draft, the length limit, the pending guard, mention suggestions, and the rejection notice.
  `NoteComments` uses it too.
- `SocialSection`: the card that holds a target's `CommentThread`, with the week's count beside its title.

`packages/core/hooks` holds `useReactions`, `useCommentThread`, and `useCommentThreadViewEvent`.
`packages/client/socialClient.ts` holds the calls. The copy lives in `packages/core/lib/socialLabels.ts`, and the
elements type both components render through, `SocialElements`, in `packages/core/lib/socialElements.ts`.

| Component | Platform | What differs | Reason |
| --- | --- | --- | --- |
| `TextComposer` | web | Opens in a dialog | The card stays its size while a user writes |
| `TextComposer` | mobile | Opens in a bottom sheet (`Sheet`, `BottomSheetTextInput`) | The keyboard covers an inline box |
| `CommentThread` | mobile | The chapter choice is a native choice sheet in place of a select | The platform's own control |
| `CommentThread` | mobile | A tap on a disabled Edit opens a dialog with the reason, where the web shows a tooltip | A phone has no hover |
| `ReactionRow` | MCP view | A save calls `callMcpViewTool("save_reaction")`, which returns the summary in `_meta` | The frame allows no network call |
| `ReactionRow` | MCP view | Mounted in the findings view only | The search and updates results come without summaries |
| `CommentThread` | MCP view | Not mounted | The tools read and post, and the view shows reactions only |
| `CommentThread` on a Finding | web, mobile | Loads as the popover or sheet opens | A Finding has no page |
| `ReactionRow` on a Finding | web, mobile | Reads its summary as the popover or sheet opens, where the list came without one | The home feed and search reads do not load summaries |

Mounts: `TopicResourceInfo` on both apps and `McpViewFindingDetails` for a Finding. On a Topic and a Podcast Episode,
`ReactionRow` sits beside the byline, and `SocialSection` is one collapsible card titled "Hot takes 🔥", below Topic
findings on the Topic page and screen and under the player on the Podcast Episode page and screen. The card stays
mounted while closed, so a draft and a posted Comment survive. The thread's composer row, at the card's top right,
shows "X of Y for Carl and Vienna" to a user who may edit the Topic. `CommentThread` never mounts on a Team page. A
visitor sees counts and text, and a press on a type or the composer's button opens sign-up.

The composer holds no reaction types. A Comment's Reply, Edit, and Delete are buttons under its body, and Delete asks
first. The share toggle sits with them: a lit flame on a shared Comment for everyone, a button for an editor, with the
tooltip "Share with Carl and Vienna" on an unshared Comment and "Don't share with Carl and Vienna" on a shared,
waiting one. At the shared comment slot limit the toggles of unshared Comments are disabled. No notice or explanatory
text is added anywhere.

`TopicResource`, `TopicFindingRating`, and `ReportIssueDialog` stay in `apps/mobile/parity.md` as they are.
`ReactionRow`, `CommentThread`, and `SocialSection` need no row there, because both apps render the core one. Each
app's `socialElements.tsx` has a `platform API` row, as `personalSourcesElements` has.

### D6. Text

One function in `packages/contracts` normalizes on write: it rejects control characters, strips markup and forged
`untrusted-data` tags, and trims. A Comment keeps its line breaks. The route then runs the terms check and the
classification that note comments run, and stores the result.

Text renders as text. React and React Native escape it, which is how a person's room message renders today. The one
link is a stored mention, to that user's profile. A url in the text stays text.

Where a model reads a Comment, it is fenced with a per-call nonce through `toUntrustedFence` or `writePrompt`. That
is the scoring prompt, which reads shared Comments inside its Topic context, the segment podcast prompt, which reads
them as their own untrusted variables, and the MCP results, text and structured content alike, which a host's model
reads.

### D7. Blocks and the admin block

`packages/db/contentFilters.ts` gains a filter that hides an author in a block with the caller in either direction,
beside today's one-way filter. Comment reads and reaction summaries use the new one. Every reaction and Comment
read, the signal, the email, and every model context also leave out an author whose `admin_blocked_at` is set.

An admin sets and clears the admin block from the admin console's users table and from Block on a report.

### D8. Reports

`reportSubjectKinds` gains `finding`, `podcastEpisode`, and `comment`. A Reaction is not reportable, since it holds a
type and no words. `comment` is a removable kind, so Remove deletes it through the same delete an owner uses. A
reported Comment stays in its reporter's reads with its flag filled. Each Comment read includes `isReported`.

Clearing a report drops its text and keeps `cleared_text_hash`, an HMAC under the auth secret, so a repeat report can
tell changed text from the same text without storing it. Changed text reopens the report. Pressing a filled flag
removes the report: an open one is deleted, and a resolved one sets `withdrawn_at`, so removing and reporting again
cannot reopen unchanged text.

`reportResolutions` gains `blocked`. Block removes the subject if its kind is removable, sets the admin block on its
author, and closes the report. The report email quotes the text escaped, as it does today, and writes a url in it
with its dots bracketed, so no mail client turns it into a link.

### D9. The signal

`packages/db/inviteLimits.ts` computes an age factor (one fifth under seven days) and a reputation factor (one half
under a one-fifth accepted share of invites) in one exported `toAccountSignalWeight`, which the invite limit calls too.

A Finding's **reaction signal** is the sum of that weight times 2 for each distinct author with at least one Comment on
the Finding, plus the weight times 1 for each Reaction on the Finding. A user who writes fifty Comments counts once.
Reactions on a Comment do not count toward a Finding. The signal leaves out admin-blocked authors and authors in a block
with the Topic's owner. The constants live in `packages/contracts/sourceScoring.ts`.

- **Scoring examples.** `loadScoreExamplePages` orders the liked pages as bookmarked, then pages whose signal is at
  least 2 by signal, then thumbs up. One Comment from an established account qualifies. Ten Reactions from accounts
  under a week old do too, and five do not. Only the page's title and host are listed. No Comment's text is on an
  example line.
- **Prune.** `filterTopicFindings` also spares a Finding with a Comment, so nobody's words are deleted by a re-score.
  A Reaction does not spare, because it says nothing and the owner cannot remove it. An owner who deletes the
  Comment lets the Finding prune again.
- **Podcast.** The planner is unchanged. A Reaction or a Comment never removes a Finding from it.

### D10. The notifications email

The sweep gains `sendNotificationsEmails` under a job lease. It runs once the UTC hour passes a fixed constant, 15.
`users` holds no timezone, so one hour serves everyone. The email is opt-in: the switch is off for every account,
existing and new, until the user turns it on.

1. One query finds the people with activity since their last window: reactions and Comments on social targets of
   Topics they own, reactions on their Comments, replies to their Comments, and mentions of them. Work is bounded by
   the day's activity, never by the count of users.
2. It leaves out the person's own actions, authors in a block with them in either direction, admin-blocked authors,
   and people whose switch is off. It names a Finding only if the person may see that Finding.
3. It inserts the `notifications_email_sends` row for the day first, then sends. A second sweep the same day finds the
   row and sends nothing. A failed send deletes the row, so the next sweep retries.
4. The window runs from the last row's `activity_end_at` to now, and 24 hours for a first email. A deleted Reaction
   or Comment is never mailed, because the query reads live rows.

The template quotes at most ten texts, each escaped, cut to 140 characters, and with urls bracketed, then counts the
remainder. Every link opens a CarlNotes page. The unsubscribe token gains a second payload shape for this email, with
no expiry, and `apps/api/unsubscribe.ts` turns the switch off for both the page link and the one-click header.

The switch joins the shared `NotificationsSection`. The web account page mounts that section and shows the email
switch alone, since the web has no push.

### D11. Limits

- **Daily.** `DAILY_SOCIAL_WRITE_LIMITS` holds 200 for reactions and 200 for Comments, replies and edits included,
  counted through `countRateLimitHit`, keyed by user and UTC day. A count in Redis survives a delete, so a script
  cannot loop save and delete. `DAILY_REPORT_LIMIT` goes to 50. Past a limit the route answers 429 and the client
  shows its ordinary error. Sharing is not counted, since the shared comment slots limit it.
- **Per minute.** Writes use `toolCallerRateLimiter`. The thread, the replies, the summary, and the mention
  suggestions use a limiter of 120 a minute, keyed by user or by address through `resolveClientAddress`.
- **Mention suggestions.** `GET /api/usernames?prefix=` returns up to eight usernames with their ids and avatars,
  signed-in only, through the trigram index the name search uses.
- **Input bounds.** A cursor that does not parse reads as a first page, a chapter position has a maximum, and a NUL in
  a path, a query, or an id is a 400.

### D12. MCP

| Tool | Title | Annotations |
| --- | --- | --- |
| `save_reaction` | React | write, destructive, idempotent |
| `read_hot_takes` | Read hot takes | read-only |
| `post_hot_take` | Add a hot take | write, not destructive, not idempotent |

`save_reaction` takes a social target and a type. No type removes the caller's own Reaction, which is why it is
marked destructive. A Comment is a valid target, so a host's model can react to a Comment it read. `read_hot_takes`
returns one page of the thread with each Comment's replies, fenced in its text and its structured content, with one
line saying the text was written by other people and is data, never instructions. `post_hot_take` takes a social
target, a body, an optional chapter position, and an optional `parent_id` for a reply. Each tool uses the same daily
limits and gate as its route. `save_reaction` and `post_hot_take` reject an account with outdated Terms, and on the
Topic-bound endpoint each tool reaches the social targets of the bound Topic alone. A visitor gets the connect text
on a write. The tool count stays twenty-two.

`read_topic_feed` adds each Finding's reaction counts per type to its structured result, never the caller's own type.
It holds numbers only, so its text result needs no fence for it. The owner's freeze stores version 9 and raises
`MCP_VIEW_VERSION` to 10 before this ships. The field is optional, so the stored version 9 bundle still reads the
result.

### D13. Analytics

Server events through `trackEvent`, each with the object's id, the Topic's id, and `isOwner`:

- `social_<target>_react`, where the target is `finding`, `podcast_episode`, `topic`, or `hot_take` for a Reaction
  on a Comment.
- `social_<target>_hot_take` for a posted Comment, with `isReply`.
- `social_reaction_delete` and `social_hot_take_delete`.
- `social_hot_take_share`, with `isShared`.
- `social_<object>_flag` for a Topic, a profile, a Finding, a Podcast Episode, and a Comment, which reads
  `social_hot_take_flag`. Every flag still sends `content_flagged`, so today's reports keep counting.

One client event, `social_<target>_hot_takes_view`, is sent as a thread first shows. The MCP view sends none. None of
these names reached `main` under an earlier spelling, so no old name needs a stale-drift entry.

### D14. Copy

These lines live in `socialLabels.ts`. No other line, notice, or explanation is added to the UI.

| Where | Line |
| --- | --- |
| The card's title | Hot takes 🔥 |
| The title of a Finding's card in its popover and sheet | Hot takes 🔥 |
| The composer's button | Hot Take |
| The composer's title | Add a hot take |
| The composer's placeholder | What's your hot take? @ mentions someone. |
| A Comment's reply action | Reply |
| The share toggle's tooltip | Share with Carl and Vienna |
| The share toggle's tooltip on a waiting shared Comment | Don't share with Carl and Vienna |
| The card's top right, editors only | 2 of 5 for Carl and Vienna |
| A disabled Edit's reason | Hot takes can only be edited for 15 minutes after posting. |
| The Personal sources group | Hot takes |
| The Free plan card | 3 hot takes per podcast |
| The Plus and Premium plan cards | 5 hot takes per podcast |
| The account switch | Daily notifications email |
| The email's subject | Carl left you a note: 3 hot takes, 2 reactions |
| The email's first line | People had things to say about your topics. Carl wrote them down. |
| The email's last line | Notes don't nag. Turn this email off anytime. |

### D15. Sharing and its shared comment slots

`PUT /api/comments/:id/share` takes `{ isShared }`. It checks `isAllowed(userId, "topic:edit", topic)` on the Topic
the Comment's target belongs to.

- **Shared comment slots.** `SHARED_COMMENT_SLOTS = { short: 3, full: 5 }` in `packages/contracts`. A Topic has the full
  count if its owner passes `podcastEpisode:full`, which is `hasFullPodcastEpisodes`, and the short count otherwise. A
  Topic holds no Podcast Episode length of its own. The owner's plan decides it, so the shared comment slots read the
  same rule.
- **Used shared comment slots.** The Topic's Comments with `shared_topic_id` set and no `aired_podcast_episode_id`,
  without a left-out Comment. That is the Comments waiting for the next Podcast Episode, on every social target of the
  Topic.
- **Left out.** A shared Comment is left out while its Finding is rated thumbs down, or while its author is under an
  admin block or in a block with the Topic's owner. It stays shared, holds no shared comment slot, and stays out of the
  scoring context, the podcast script, the shared Comments list, and the Scan's link queue. It returns if that changes.
- **Sharing** sets `shared_with_carl_at` and `shared_topic_id` if a shared comment slot is free, and answers 409 if none
  is. The count and the write run in one transaction under an advisory lock on the Topic, so two shares at once cannot
  pass the limit. A Comment on a Finding rated thumbs down cannot be newly shared.
- **Unsharing** clears `shared_with_carl_at`, `shared_topic_id`, and `aired_podcast_episode_id`, and deletes the
  Comment's `comment_links` rows. Sharing it again is a new share.
- **An author's edit.** An edit by an author who may not edit the Topic clears a waiting share and deletes the
  Comment's pending `comment_links` rows, until an editor shares it again. An editor's edit keeps the share. An aired
  Comment stays aired.
- **Default.** A post by a user who may edit the Topic sends the composer switch's choice, and starts shared if the
  choice is on and a shared comment slot is free. A post with no choice, from an AI app, shares a top-level Comment and
  not a reply.
- **After the reset.** A Comment the script read keeps `shared_with_carl_at`, so it stays in the scoring context and
  shows its mugs. It no longer counts toward the shared comment slots.
- **Reads.** Everyone reads `isSharedWithCarl`. Only an editor reads `sharedCommentSlots`. `POST /api/comments` and
  `PATCH /api/comments/:id` each return `{ comment, sharedCommentSlots }`, `DELETE /api/comments/:id` returns the shared
  comment slots too, and the share route returns `{ isSharedWithCarl, sharedCommentSlots }`, so a client shows the new
  count with no second read.

### D16. The podcast script

`loadScriptInput` reads the Topic's shared Comments with no `aired_podcast_episode_id`, or with this Podcast Episode's
id, most reactions first, at most the Podcast Episode's shared comment slots. Taking them sets
`aired_podcast_episode_id` to the Podcast Episode, so a retried activity reads the same Comments as a first run that
took any. A retry after a first run that took none may take what is waiting. `failPodcastEpisode` clears the id on that
Podcast Episode's Comments, so they wait for the next one. Removing a published Podcast Episode leaves the id, since
those Comments were already read aloud.

`write-podcast-episode-segment.md` takes the Comments as two untrusted variables, each entry with the author's
username and the body. `chapterSharedCommentsBlock` lists the Comments on this segment's Findings by Finding number,
and each chapter raises them after the beat on why the Finding matters: Vienna for pushback a listener would raise,
Carl for added context, and the other host answers in a sentence or two. `closingSharedCommentsBlock` lists every
other Comment, on the last segment's call alone, and the closing turns sit between the last chapter and the sign-off
with Vienna asking and Carl answering. The turns run if and only if closing Comments exist: a draft without them, or
with them and nothing to close on, is rejected, and so is a draft that drops an author's username. A last draft that
leaves an author uncredited is not rejected. It releases that Comment back to waiting, since no host read it. The
closing turns join the script's sign-off, so the stored script and its contract keep their shape. The prompt sets the
placement and the rule and scripts no line. The sample hand-offs live on the Persona & Voice page in Notion.

The Podcast Episode takes the waiting Comments by reactions up to its own shared comment slots, 3 for a short Podcast
Episode and 5 for a full one, and both placements count. Before a Comment is taken, its text and its username go through
`classifyUserText` again. A flagged Comment, or one whose screen fails, is skipped, the next one takes its shared
comment slot, and the skipped Comment keeps waiting until an editor takes it back. A Comment that loses out on reactions
waits too. The owner's Hot takes switch, `topics.is_podcast_comments_enabled`, sits under the podcast switch, and off
leaves every Comment waiting. A left-out Comment (D15) is not read.

A Comment is already published on the page of the Topic its Podcast Episode belongs to, to the same people who can
play the Podcast Episode. This differs from an attachment, which stays its owner's alone and never reaches the script.

### D17. The scoring context

`TopicContext` gains the Topic's `SHARED_COMMENT_CONTEXT_COUNT = 5` most recently shared Comments, aired or not,
without a left-out Comment (D15). They are a labeled section appended to the Topic context text, after the
example pages, as one `- username: text` line each. The scoring prompt already reads that text as its one untrusted
variable, fenced with the call's nonce, so the scoring prompt file does not change. The Topic owner's own words on an
example line are gone with the reaction text.

Besides the classification before it posts, no other prompt reads a Comment. The topic chat and the podcast chat wait
for row 60.

### D18. Links in a shared Comment

The Personal sources link queue is tied to a sender's encrypted entries and is claimed through that sender's Source.
A shared Comment has neither, and its body is public, so its links get their own table, `comment_links`, with the
url stored plain.

- Sharing a Comment writes one row per url in its body, with `considered_at` null. Unsharing deletes that Comment's
  rows, and deleting the Comment deletes them by the cascade.
- An editor's edit of a shared Comment's body replaces its pending rows with the new body's urls. An edit that takes
  the share back deletes them.
- A Scan's ingest adds the Topic's pending rows as discovered Resources marked as Personal sources links are
  (`isFromPersonalSources`), so the review skips the embedding gate and applies `PERSONAL_SOURCE_SCORE_BONUS`, the
  deliberate send's bonus. A left-out Comment's rows wait until it returns.
- The review sets `considered_at` once it has considered the page, scored or rejected, so a link is read by one
  Scan.
- The page is scored by the Topic's ordinary scoring prompt, never by a sender's private context. The Finding is an
  ordinary Finding with no sender-private explanation.

### D19. The Personal sources group and the plan cards

`GET /api/topics/:topicId/shared-comments` returns the Topic's shared Comments, newest shared first, to a user who
may view and edit the Topic, without a left-out Comment (D15) or a Comment by someone in a block with the reader in
either direction. `TopicPersonalSourcesSection` renders them as a "Hot takes" group through the shared
`ExpandableRow`, one row per Comment with its author and its text. The group is outside `MAX_TOPIC_SOURCES`, as
Personal sources are, and shows nothing if no Comment is shared.

`PlanCard` gains one line after the podcast line: "3 hot takes per podcast" on Free and "5 hot takes per podcast" on
Plus and Premium, from `SHARED_COMMENT_SLOTS`.

## Risks / Trade-offs

- [A person writes a Comment on many Findings to keep them from pruning] → the daily limit bounds one account at 200,
  the owner deletes or blocks, and a blocked author's rows spare nothing.
- [Several real accounts react together to move the scoring examples] → the weight slows new accounts only. The
  examples are a list of at most `MAX_SCORE_EXAMPLE_PAGES` titles, and a thumbs down still removes a page.
- [An editor shares a Comment written to steer the model] → the text is fenced as data in every prompt, the
  classification ran when it posted, and sharing is an editor's own act on at most 5 Comments a Podcast Episode.
- [A stranger's words are read aloud on a public podcast] → only an editor shares, the lit flame shows the author
  that it was shared, the privacy policy says a shared hot take may be read on the podcast, and deleting the Comment
  before the script runs keeps it out.
- [A blocked person can tell they are blocked] → accepted in difference 2 and written into the delta.
- [A visitor sees a thread up to two minutes old] → accepted in difference 4.
- [Two extra queries on every feed read and one on every thread page] → each uses a partial index and one pass for
  the whole page. The task list holds a query-count test beside the existing feed budget test.
- [One fixed send hour is night for some people] → the email is not urgent. A timezone column is a later change.
- [A classification that cannot answer lets text through] → the existing rule, with Flag and delete behind it.
- [The released mobile apps read a payload with new fields] → each field is optional, and the contract freeze check
  proves it.
- [The scoring context grows and the podcast segment prompt and the moderation prompt change] → the relevance eval runs
  before and after, and the owner syncs the podcast segment prompt and the moderation prompt after the deploy.

## Migration Plan

1. The change's earlier migrations add the tables, the enum values, and the `users` columns. One more migration moves
   stored reaction text into Comments, drops the text columns, and adds the Comment target, the sharing columns, and
   the `comment_links` table. Each takes a lock timeout. They change no row that reached
   production, so the old api keeps working while they are live.
2. The api and worker deploy as usual. The notifications email sends nothing until a user turns it on and someone
   reacts or writes a Comment.
3. Rollback is the previous image. The new tables and columns stay unused.
4. Before the push, the owner freezes MCP view version 9, which raises the version to 10. After the deploy, the owner
   runs `prompts:sync:prd` for the podcast segment prompt and the moderation prompt.

## Open Questions

- Whether the privacy policy change needs a new terms version. The apply step reads the terms acceptance rule and
  follows it.
