# Proposal

## Why

A public Topic has followers and visitors and no way for them to respond. A follower who likes a Finding, disagrees
with it, or wants to talk about a Podcast Episode has nowhere to say so, and the Topic's owner learns nothing from
them. This change adds one discussion component, which customer copy calls Hot takes: a comment thread with one
level of replies, and positive reactions on a Finding, a Podcast Episode, a Topic, and each Comment. It ships with
the moderation, limits, email, and analytics that public text needs. A Topic's editors pick which Comments Carl and
Vienna may read, so other people's words reach a model, besides the classification before they post, only by an editor's
choice.

The first design held two components, reactions with text and a flat thread named Open Mic. The owner approved a
redesign on 2026-11-06 that drops Open Mic, moves all text into the thread, and adds sharing with Carl and Vienna.
`design.md` lists the approved choices first.

## What Changes

- **Comments (copy: hot takes).** A comment thread per social target: a Finding, a Podcast Episode, a Topic, or a
  post. A user writes as many Comments as they like, each up to 2,000 characters, editable for 15 minutes, with
  `@username` mentions. A Comment on a Podcast Episode can name a chapter. A reply names a top-level Comment, and a
  reply to a reply joins the same top-level Comment, so one reply level shows. A Topic's and a Podcast Episode's
  first page renders on the server with the page.
- **Reactions.** One `reactions` row per user per social target, holding one of six positive types and no text. A
  Comment is a social target too, so each Comment takes reactions. A press on the user's own type removes it. There
  is no negative type.
- **Share with Carl and Vienna.** A Comment holds the time it was shared, or none. Only a user who may edit the Topic
  shares or unshares one, through a flame toggle that turns to two mugs once it airs. A Topic has 3 shared comment slots
  if its owner gets short Podcast Episodes and 5 if full ones. The count covers the next Podcast Episode and frees up
  once that Podcast Episode's script reads the shared Comments. An editor's own Comment or reply starts shared if a
  shared comment slot is free, unless the composer's share switch is off. An author who may not edit the Topic takes a
  waiting share back by editing the Comment. A shared Comment is left out while its Finding is rated thumbs down, or
  while its author is under an admin block or in a block with the Topic's owner, and it returns if that changes.
- **What a model reads.** Only shared Comments reach a CarlNotes model: the five most recently shared in the Scan's
  scoring context, and the next Podcast Episode's shared Comments in the podcast script, each fenced with a per-call
  nonce. Besides the classification before it posts, unshared text reaches no CarlNotes model and counts only as a
  weighted number. A link in a shared Comment is scored as a Personal sources link is.
- **One set of shared components.** `ReactionRow`, `ReactionPicker`, `CommentThread`, and `TextComposer` live in
  `packages/core/components` with platform adapters. The web and the mobile app render the same thread, and the
  findings MCP view renders the same reaction row.
- **Who may do what.** Sign-in is required to write. Reading follows the social target's own view rule. Everything
  posts at once. The author deletes their own Comment, the Topic's owner deletes any Comment on their Topic, its
  Findings, and its Podcast Episodes, and an admin deletes any. No automated process deletes. All of it goes through
  `isAllowed`. On a Topic with unconverted Personal sources, a user other than its owner, a team member included,
  reads no Finding, thread, or reaction summary and posts nothing.
- **Blocks.** A block hides both people's Comments from each other, leaves each out of the other's reaction
  summaries, and stops either posting on a thing the other owns. An admin block removes a person's reactions and
  Comments from every page and stops new ones.
- **Flags.** Findings, Podcast Episodes, and Comments become reportable subjects, with Report issue on each one. The
  Reports view gains Block beside Remove and Clear. The daily flag limit goes from 10 to 50.
- **Responses as a number.** A Finding's reaction signal counts each distinct author of a Comment on it and each
  Reaction. It places the Finding's page among the scoring prompt's liked examples, above a thumbs up. The weight
  uses account age and invite reputation. A Finding with a Comment is spared from the max-results prune.
- **Personal sources popover.** The Topic's shared Comments show as a Hot takes group in the Personal sources
  section, for editors only, outside the 10 Source limit.
- **Plan cards.** Free reads "3 hot takes per podcast". Plus and Premium read "5 hot takes per podcast".
- **The daily notifications email.** One email a day per person, only if something happened to their things:
  reactions and Comments on their Topics, Findings, and Podcast Episodes, reactions and replies on their Comments,
  and mentions of them. It is a template in Carl's voice with no model call, and it is off until a user turns it on.
  It names a Finding only if the person may see that Finding.
- **Limits.** 200 reactions, 200 Comments with edits included, and 50 flags a day per account, flat. Public reads are
  paged at a fixed size and limited by address. A cursor that does not parse reads as a first page, a chapter position
  has a maximum, and a NUL in a path, a query, or an id is a 400.
- **Safety.** A Comment is stored as plain text with markup and forged fence tags stripped and control characters
  rejected, classified before it posts, rendered as text with links on stored mentions only, and fenced with a
  per-call nonce wherever a model reads it.
- **MCP.** Three tools: `save_reaction`, `read_hot_takes`, and `post_hot_take`. The two writes reject an account with
  outdated Terms, and a connection bound to a Topic reaches that Topic's social targets alone. The findings MCP view
  shows each Finding's reaction counts through the shared `ReactionRow`. The MCP view version goes to 10.
- **Analytics.** Events named `social_<object>_<action>` with ids and an owner flag, never text.
- **Docs.** The domain model gains Reaction, Comment, social target, admin block, and notifications email, and
  rejects Open Mic. The privacy policy's user content section and the docs site gain the new copy.

Not in this change: posts and their pages, a person's Café, follows of a person, shared Comments in the podcast chat
and the topic chat (row 60), chapter links in a url, share images, push for social activity, and the MCP
delete, share, and flag tools.

## Capabilities

### New Capabilities

- `reactions`: the Reaction record, its six types, one per user per social target with a Comment among the targets,
  who saves one, the summary, and the shared reaction row on the web, the mobile app, and the findings MCP view.
- `comment-threads`: the Comment record and its thread on a Topic, a Podcast Episode, and a Finding, with replies,
  mentions, the chapter reference, the edit time, sharing with Carl and Vienna and its shared comment slots, paging, the
  server-rendered first page, and the shared thread component.
- `notifications-email`: the daily notifications email, what it includes and leaves out, its one send a day, its
  account switch, and its unsubscribe link.

### Modified Capabilities

- `authorization`: adds the capabilities that decide who posts and who deletes a Reaction or a Comment, the Topic
  edit check on sharing, and the admin capability that blocks a user.
- `user-blocking`: a block hides Comments in both directions and stops posting on the other person's things, which
  changes the rule that a blocked person sees no sign of the block. Adds the admin block, the avatar link and
  confirmed Unblock in the Blocked people section, and the Blocked link on a blocked profile.
- `content-reporting`: adds three reportable subject kinds and the Block resolution in the Reports view.
- `content-moderation`: a Comment is classified before it posts.
- `injection-defense`: a Comment reaches a model only as fenced data, and only a shared Comment reaches a CarlNotes
  model.
- `curation`: the max-results prune spares a Finding with a Comment, the scoring examples order pages by a weighted
  signal above a thumbs up, and a link in a shared Comment is reviewed with the Personal sources bonus.
- `request-capacity`: adds the daily limits on reactions and Comments, the address limit on their public reads, and
  the input bounds on social routes.
- `mcp-server`: adds the `save_reaction`, `read_hot_takes`, and `post_hot_take` tools, which brings the annotated
  tool count to twenty-two.
- `personal-sources`: the Personal sources section lists a Topic's shared Comments, and the MCP documentation covers
  twenty-two tools.
- `mcp-views`: the findings MCP view shows a Finding's reactions.
- `monitoring-analytics`: adds the social events.
- `podcast-episode-rendering`: the script reads the Topic's shared Comments for the next Podcast Episode.
- `subscription-billing`: each plan card states its hot takes per podcast.
- `ai-agent-sends`, `teams`, `team-chat`: the confirmations and the API key changes made beside this work.

## Impact

- **Database.** Five new tables (`reactions`, `comments`, `comment_mentions`, `comment_links`,
  `notifications_email_sends`), a `reaction_type` enum, three `users` columns, one `topics` column
  (`is_podcast_comments_enabled`), two `reports` columns (`cleared_text_hash`, `withdrawn_at`), three new
  `report_subject_kind` values, and one new `report_resolution` value. One more migration on top of the change's earlier
  ones drops the reaction text, after moving any stored text into Comments, and adds the sharing columns and
  `comment_links`.
- **Api.** `apps/api/social/` holds the reaction, comment, reply, share, and mention routes. The Topic page, Podcast
  Episode page, and feed payloads gain optional fields. `apps/api/report/`, `apps/api/admin.ts`,
  `apps/api/unsubscribe.ts`, and `apps/api/mcp/` change.
- **Packages.** `packages/contracts` (payloads, enums, the shared comment slot and context counts, analytics events, MCP
  view version), `packages/client` (a social client), `packages/core` (the components, hooks, labels, and the plan card
  line), `packages/db` (schema, gate, quotas, content filters), `packages/emails` (one template, the unsubscribe token),
  `packages/pipeline` (scoring examples, the prune, the shared Comments in the scoring prompt and the podcast script,
  the Comment links), `packages/models/prompts` (the podcast segment prompt and the moderation prompt).
- **Worker.** The sweep gains the notifications email step. A failed Podcast Episode releases its shared Comments.
- **Apps.** The Topic page, the Topic Finding popover and sheet, the Podcast Episode page and screen, the Topic info
  popover, the account page, the plan cards, the admin console, and the findings MCP view.
- **Released mobile apps.** Every payload change is an added optional field. `bun scripts/check-contract-freeze.ts`
  confirms it.
- **Model spend.** One classification call per Comment on the operator's key, as note comments make today. The
  scoring context and the podcast prompts grow by a few short Comments. No other new model call.
- **Release steps the owner runs.** The version 10 MCP view freeze, and `prompts:sync:prd` for the podcast segment
  prompt and the moderation prompt.
