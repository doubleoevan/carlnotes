# Design

## Context

See proposal.md for why. What is already here, and shapes the approach:

- Reporting is `flagContentPayload` (topic, profile, team, free-text reason), `sendFlagContent`, the
  `POST /api/flag-content` route in `apps/api/flagContent.ts` with its visibility check and ten-a-day Redis limit, an
  inline html email to `SUPPORT_EMAIL`, and `ReportIssueDialog` on both apps, opened from the page action menu that
  `packages/core/components/PageActionMenu.tsx` composes. Nothing is stored. There is no admin view of reports.
- Room messages live in `room_messages` with an application-encrypted `content`, are listed by
  `loadChatRoomMessages`, streamed over SSE from Redis pub/sub by `streamChatRoomEvents`, and counted into a cached
  mention badge. Comments live in `note_comments`, listed and posted by `apps/api/note/noteComments.ts`. Both bubbles
  are shared compositions in `packages/core/components/` with a footer of inline buttons on each app.
- Invites already have a recipient setting, `users.inviteAccess`, enforced by `isInviteRejected` with the sender told
  "not accepting invitations". Account settings on both apps compose sections from
  `packages/core/components/AccountFields.tsx`.
- The only text screening is llm-guard on attachments, which fails open and is off in production. LiteLLM routes
  Fireworks models only, through `createOpenAI` in `packages/models/models.ts`; traces go to Langfuse with no
  redaction. Prompts are versioned markdown under `packages/models/prompts/` with fenced untrusted text.
- The Terms and Privacy pages are inline markdown in `apps/web/src/pages/`, linked from the shared footer and the
  mobile Settings screen. There is no terms version and no acceptance column. Sign-up is Better Auth with email and
  password, Google, GitHub, and Apple, plus the app's attestation gate. The contact address everywhere is
  support@carlnotes.com.
- The store rules read on 2026-10-29: App Store 1.2 requires a filtering method, a report mechanism with timely
  responses, blocking abusive users, and published contact information. Google Play's UGC policy requires accepted
  terms that prohibit objectionable content before a user posts, in-app reporting and blocking, and action on reports.
  Google's child safety policy, which applies to an app with social chat, requires a published prohibition of child
  sexual abuse material and a designated contact. Neither store sets a response time in hours.

## Goals / Non-Goals

**Goals:**

- One report path, one block table, one classification call, and one terms version, each shared by web and mobile.
- Every store requirement above mapped to a requirement in the specs, so submission needs no further code.
- The blocked person learns nothing. The reporter stops seeing the content before the admin acts.

**Non-Goals:**

- An appeal flow, a strike system, or automated suspension. The admin acts by hand from the console.
- Screening attachments, images, or podcast audio beyond the llm-guard path that exists.
- A native admin screen. Mobile keeps opening the web console.
- Hiding a blocked person's published Topics, episodes, or profile. A block is about what reaches the blocker.

## Decisions

### Reports are stored rows, and the reporter's hiding is a read filter on them

A `reports` table: id, subject kind, subject id, the subject's author user id when it has one, the reporter, the
reason, the subject's text at report time (bounded to the comment limit, with a note body cut to that length), the
page that holds the subject for the console's links (topic, team, note, or room), created at, reminded at, resolved
at, resolved by, and a resolution of removed or kept. One unique index on reporter, kind, and id makes a second
report of the same thing a no-op. One partial index on open reports serves the console and the sweep.

Hiding for the reporter is a `NOT EXISTS` against the reporter's open-or-kept reports in the comment list, the note
lists, the note read, and the mention rows and count. A room's message page and its deltas load once for every member,
so a member's reported messages and blocked people are filtered from the loaded batch instead. The SSE stream reads
the member's blocked people as it opens and on each heartbeat, and filters each delta by that set with no query.
Alternatives: a per-user hidden set in Redis, rejected because it would be a second copy of the report row that could
drift from it, and a client-side filter, rejected because it leaves the text in the payload.

The existing route, client, dialog, limit, and refund stay. The subject kind enum grows by `chatMessage`, `note`, and
`noteComment`, and `toFlaggedSubject` gains three visibility arms that reuse `loadChatRoom` and `canSeeNote`. The
inline html moves into a `packages/emails` template, since the sweep reminder needs the same body.

### The console link carries no token

The email links to `/admin?report=<id>`. The admin route is already gated by `isAllowed(user, "admin:console")`, and
a signed link would only add a second way to reach a page the session already guards, plus a secret in a mailbox.
The signed-token helpers in `packages/server/hmac.ts` stay for the flows that have no session.

### The response workflow is the console's open list, a count in the header, and one reminder

The owner is whoever reads the `SUPPORT_EMAIL` inbox. The target is a response within one day. The
mechanisms: the report email at once, the open-report count in the admin header on every signed-in admin load, and a
sweep stage that mails one reminder for a report open past twelve hours, writing `reminded_at` so it never repeats.
Twelve hours leaves half the day to act after the reminder. A second reminder, a pager, or an escalation were
considered and left out: one person reads one inbox, and a repeated email is noise.

Remove goes through the content's own delete path so every cascade stays in one place: `deleteChatRoomMessage`, the
note delete, and the comment delete, which gains an admin arm. Keep closes the report and leaves the reporter's
hiding in place, since the reporter asked not to see it.

### Blocking is one table and one filter helper

`user_blocks`: blocker user id, blocked user id, created at, primary key on the pair, an index on the blocked side for
the cascade, both columns cascading on user delete. Routes: `POST /users/:id/block`, `DELETE /users/:id/block`,
`GET /users/me/blocks`. One helper returns the blocker's blocked ids as a subquery, and the reads that take it are:

- `loadChatRoomMessages` and `loadChatRoomDeltas`, so the transcript and live events skip the author. A reply to a
  hidden message keeps its reply marker with the quoted text replaced by "a hidden message".
- The mention count, which is computed with the filter and whose cache key is cleared by a block, as opening a room
  clears it.
- The comment list, and the comment count a note row shows.
- The pending invite lists and the invite badge, by the inviter, and `acceptInviteToken`, which treats a blocked
  inviter's link as unknown.
- People search, by user id.

Reads left alone, on purpose: topic feeds, public topics and their bylines, podcast episodes, notes (they are page
documents with team edit rights, and hiding one would silently change a team's shared material), and the visitor
caches, which hold none of the filtered content. Redis caches that do hold it are per user, so the filter runs before
the cache write.

The invite rejection for a blocked sender reuses `isInviteRejected`'s "not-accepting" result, so the sender's response
is byte-for-byte the one the setting produces. The block itself is never in any response the blocked person gets.

Alternatives: a `mute` that hides without stopping invites, rejected because the stores ask for blocking abusive
users and one concept is simpler to explain in the Terms. A two-way block that also hides the blocker's content from
the blocked person, rejected because it reveals the block.

### Block and Report sit where the web puts actions, with no new context menu

The web message and comment footers hold inline buttons today, so Report joins them as a flag button, and the report
dialog for an authored subject adds a "Block @name" checkbox so one submission reports and blocks. The profile page's
action menu gets Block or Unblock beside Report. Mobile mirrors the footer and the menu. A long press or a native
action sheet is not introduced: the web has no context menu, both apps already share the footer composition, and a
hidden gesture would make the control harder to find in review.

### Classification runs on the existing cheap tier

Three options were compared for the per-post check:

- The LiteLLM cheap tier with a schema-locked prompt. Cost per post: about 600 input and 30 output tokens, a few
  hundredths of a cent. Coverage: semantic, multilingual, context-aware, and tunable by prompt. Cost in the stack:
  nothing new, since the route, key, budget, telemetry, and prompt conventions exist.
- A hosted moderation endpoint. Cost per post: free or near free. Coverage: good on English, fixed categories. Cost
  in the stack: a new vendor, a second data path for user text outside LiteLLM, and new secrets and monitoring.
- A word list. Cost per post: nothing. Coverage: misses obfuscation, context, and other languages, and flags names and
  quotes. Cost in the stack: a list to maintain, and the stores treat it as thin.

The cheap tier wins: one new prompt file, `moderate-user-text.md`, built by a thin builder that fences the text as
data and asks for a schema-locked verdict `{ isViolation, category }`, called through `generateObject` on the master
key with a four-second timeout, under the posting route's own rate limit. The call registers no input or output in
its trace, so Langfuse never holds private text. Cost at today's volume is under a dollar a month, and it scales with
the posting limits that already exist.

What is checked and when: a room message and a comment at post, a note name at create and rename and a note body at
save with the html's markup stripped by the note sanitizer's text pass, a username at save, a Team name and
description at create and update, and a Topic name and prompt at create and update when the Topic is invite or
public, including the update that changes a private Topic to either. A private Topic's prompt is read by its owner
and Carl alone, so it is not checked. Topic edits made through chat and MCP tools go through `saveTopic`, so they are
covered by the same arm.

### The fail-open rule stays, and here is how it squares with the stores

The stores ask for a method for filtering objectionable material. They do not ask that posting stop when the method
is down. The app keeps the rule the other screens use: an unset, unreachable, timed-out, erroring, or off-schema
classification lets the post through and reports the failure with the subject's kind and id, never the text. The
other three safeguards, reporting, blocking, and removal, do not depend on the model. Failing closed was considered
for public Topic names alone and rejected: a partial fail-closed rule is harder to state in the Terms than one rule,
and an outage would then stop topic creation for every user. The development stack runs with the route unset and
reports nothing per post, as the scanner rule already says.

### The rejection is shared copy in Carl's voice, not a model call

A rejection is a 422 with the category. Both apps show one shared line from `packages/contracts/` that names the
category in Carl's voice and never quotes the text, next to the composer, with the draft untouched. A model-written
rejection was considered and rejected: it would cost a second call, could echo the text, and the existing rejections
(spent budget, failed turn, attachment errors) are static copy already.

### Terms acceptance is a version on the account, written by the server

`TERMS_VERSION` is a date string in `packages/contracts/`, matching the date on the Terms page's first line.
`users.terms_accepted_version` and `users.terms_accepted_at` are nullable. Better Auth's user-create hook writes the
current version on every sign-up path, so a client never sends a version. `POST /users/me/terms-acceptance` writes it
for an existing account from the shared dialog, which the root layout of each app shows when the session's version is
stale. The write routes for user-readable content call one `requireTermsAccepted` that answers 403 with a
`termsOutdated` rejection, and the api client turns that into the dialog and re-sends the kept draft on accept.

The dialog fails open. Not now and the close control put it off for that user until the next rejected write, so a
failed acceptance route never traps anyone behind a dialog with no way out. A session whose user has no version field
at all, from an api that predates the column, counts as current, so a client build ahead of its api asks for nothing.
The server-side gate stays the one hard rule, read from the row, where a missing version is a never-accepted account.
Reads and private writes are not gated, so a stale account can still read and still keep its own private topics.

The published wording is drafted in `terms-draft.md` beside this design and is published only after the owner
approves it. The version date changes only when the agreed terms change, so a wording fix never re-prompts every
account.

### Contact is one address in four places

support@carlnotes.com is the one published address: the Terms and Privacy pages already name it, and it becomes a
Contact entry in the shared footer and a row on the mobile Settings screen, each a `mailto:` through the existing
link component. No other address is published. `SUPPORT_EMAIL` stays the report inbox setting.

### The store checklist, mapped

| Store rule | Where it is met |
| --- | --- |
| App Store 1.2 filtering method | content-moderation |
| App Store 1.2 report mechanism and timely responses | content-reporting: stored reports, console, one-day target |
| App Store 1.2 block abusive users | user-blocking |
| App Store 1.2 and 1.5 published contact | terms-acceptance: the contact entries |
| Play UGC: accepted terms before posting | terms-acceptance: sign-up record, dialog, write gate |
| Play UGC: in-app report and block of content and users | content-reporting and user-blocking |
| Play child safety: published prohibition and a contact | terms-draft, the contact entries |
| Play UGC: monetization must not encourage objectionable content | nothing paid rewards posting, so no change |

## Risks / Trade-offs

- [A classification outage lets objectionable text post] → the failure is reported as an incident, reports and blocks
  still work, and the admin removes what gets through.
- [The cheap model over-rejects, for example a quoted insult in a note] → the prompt asks for a violation only when
  the text itself does the harm, the rejection keeps the draft, and the category tells the user what to change. A
  rejection rate above a few percent of posts is a prompt bug, visible in the span count.
- [The reporter's hiding leaks the report to the author] → the author sees nothing: their content stays, and the
  reporter is never named outside the admin console and the email.
- [A blocked person infers the block from an invite rejection] → the rejection is the same as the "nobody" setting,
  which any account can have.
- [The terms gate blocks a user mid-post] → the dialog keeps the draft and re-sends on accept, and the gate covers
  only writes others read.
- [Stripping note html for the check drops meaning in links] → link text is kept and urls are dropped, which is what
  a reader sees too.
- [One more call on every post adds latency] → the four-second timeout bounds it, and a room message's post was
  already a model-adjacent request with a rate limit.

## Migration Plan

1. One Drizzle migration adds `reports`, `user_blocks`, and the two `users` columns, with the lock timeout the
   migration rules require. Existing accounts start with a null version and get the dialog on their next load.
2. The moderation prompt ships with the api; `LITELLM_BASE_URL` is already set in production, so the route is live on
   deploy. The development stack keeps it unset unless a developer sets it.
3. The Terms section publishes only after the owner approves `terms-draft.md`, as its own task with the version date
   set in the same commit. Until then `TERMS_VERSION` keeps the page's current last-updated date, so no account is
   prompted before the wording is live.
4. Rollback is a redeploy: the tables are additive, and the gate and dialog read the version constant.

## Open Questions

- The version date for the Terms, set in the commit that publishes the approved wording in `terms-draft.md`.
