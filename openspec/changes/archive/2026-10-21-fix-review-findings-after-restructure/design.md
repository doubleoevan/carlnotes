## Context

The restructure's ship ran CodeRabbit over every folder and Gemini over the branch, and the ship report's section 7
lists the 59 findings with each one's outcome. The restructure fixed only what its own diff introduced; this change
takes the rest. Every finding below was read against the code before it was fixed, and a finding that turned out wrong
is struck from the tasks with the reason. The fixes change behavior, so each has a test where its module has tests, and
the captures the restructure diffed are not a proof here: the api tests, the web route tests, and the smokes are.

## Goals / Non-Goals

**Goals:**
- Fix every real finding: the thirteen majors and the minors that are bugs, gaps, or rule violations.
- Widen the single-gate test so the inline role and plan comparisons it missed cannot return.
- Keep each fix small and local, with its test beside it.

**Non-Goals:**
- The accent-surface contrast in `packages/tokens/tokens.css`: a palette decision for the Nightshift design tokens work.
- Migration 0051's deletion of audience-targeted subscriptions: it shipped long ago, and generated files are not edited.
- Renaming `dev:ui` / `build:ui` or the `UI_*` constants: the user's call, named in the restructure's ship report.

## Decisions

### 1. One immutable first-scan column on findings

`findings.scan_id` is the latest Scan that reviewed the row: `upsertFinding` writes it on every re-score, and a url
Source's page re-scores on every Scan. The digest and the podcast plan read `scan_id` to mean "first found by this
Scan", so a re-scored Finding re-enters every digest. A new `found_scan_id` column, not null, referencing `scans` with
`set null` on delete made nullable instead so a deleted Scan keeps the Finding, is written once on insert and never
updated; the migration adds it, backfills it from `scan_id`, and indexes it. `newFindingsForScan` in
`scanEmailContent.ts` and the podcast plan's first-found read select by it. `scan_id` keeps its meaning and its index
for the topic page's structured data, which wants the latest review.

Alternative: a boolean `is_first_review` on the row, cleared on re-score. It loses which Scan found the Finding, which
the digest's subject count and the podcast plan both read.

### 2. Role and plan checks route through the helpers, in the api and the web app

`isLeaderRole` moves from `apps/api/authorization.ts` to `packages/contracts/enums.ts` beside `isAdminRole`, with the
api re-exporting it so no api import changes, and a plan helper joins them: `isPaidPlan(plan)` for "not free" and
`isPremiumPlan(plan)` for the premium gate. The web app's `ChatRoomPanel.tsx`, `Header.tsx`, `TopicPage.tsx`,
`TeamHeader.tsx`, `TeamPage.tsx`, `TeamMembershipRows.tsx`, `InviteUserToTeamButton.tsx`, `spokenQuestionsPaused.ts`,
`AccountBudget.tsx`, and `PlansPage.tsx` call them; a table that counts leaders or admins for a footer label calls the
same helper inside its filter. The api's `chat/roomDeletes.ts`, `avatarsRoute.ts`, and `billing.ts` call
`isLeaderRole` and `isPaidPlan`. The single-gate test's grep becomes
`/\b\w*(role|plan|tier)\s*[!=]==|[!=]==\s*"(leader|admin|free|plus|premium)"/i`, which catches `teamRole === "leader"`,
`previousPlan !== "free"`, `.plan === plan`, and a role or plan literal compared with a call's result, over `apps/api`
and `apps/web/src` alike. The scan skips the gate module `authorization.ts`, the dev seed script, and the team topic
smoke section, whose comparisons are assertions; the helpers' own comparisons live in `packages/contracts/enums.ts`,
outside the scanned apps.

Alternative: a client-side `isAllowed` mirroring the api's capabilities. The web app has no resource rows to check
against, so it would wrap the same two helpers.

### 3. A private read the user may not see responds 404

`activity.ts` responds 404 to a non-admin's `?userId=<other>`, `chat/attachments.ts` responds 404 for a kept attachment
the user does not own, and `topic/topicsRoute.ts` responds 403 with the gate for an invite topic alone and 404 for a
private or team topic, matching the billing state route and the AGENTS rule.

### 4. The rest, each in one place

- `team/members.ts`: `deactivateTeamTopicSubscriptions` excludes the topics the leaving or deleting user owns, as
  `removeTopicFromTeam` already does.
- `share/pageHead.ts`: a non-public topic's episode head uses `topicPreview.description`; the invite-topic test asserts
  it.
- `activity.ts`: `loadInvitedTopicSubscriptions` matches by email only for a user whose `emailVerified` is true, as
  `isInviteRecipient` does.
- `chat/room.ts`: `postChatRoomMessage` rejects a `replyToChatMessageId` outside the room (same team, same topic or
  team-room null topic), `toChatRoomMessages` in `roomQuestion.ts` filters replied-to rows by team, the stream's
  heartbeat is cleared when the catch-up throws, and `after` parses to a safe positive integer or zero.
- `chat/roomAttachments.ts`: `recordPendingObjectDeletionBeforeUpload` before the upload and
  `clearPendingObjectDeletion` in the row's transaction, as the other upload paths do.
- `note/noteCommentThreads.ts`: zod payloads in `@carlnotes/contracts/payloads` for the thread, comment, edit, and
  reaction bodies, attached with `zValidator`.
- `topic/subscriberCounts.ts`: `select ... for no key update` on the topic row before the recount, the strength a
  subscription insert's foreign key share does not block.
- `mcp/tools.ts`: the `list_topics` description says "you", never `toolCaller`.
- `content.ts`: the date sort breaks a tie by slug.
- `EditTopicModal.tsx`: a ref holds the id a failed Save created, and the retry updates that topic.
- `EditTeamModal.tsx`: the invite-link create sends no topics; the final Save attaches the selection once.
- `TeamMembershipRows.tsx`: leader controls are off in read-only mode, and `isReadOnly` reaches `TeamMembersTable`.
- `ChatComposer.tsx`, `ChatRoomComposer.tsx`: Enter sends only when `event.nativeEvent.isComposing` is false.
- `TopicsTable.tsx`: the footer renders the Emails cell when the column shows.
- `PodcastFeedDialog.tsx`: `copyToClipboard` from `@/lib/utils`.
- `chatRoomClient.ts`: a rejected link-preview read reads as no cards, so the hook's loading ids clear.
- `useTopicPagePayload.ts`: a reload response for a topic the page left is dropped; `useTopicScan.ts`: a poll does not
  start while the previous response is in flight.
- `installDeeplinks.ts`: `vscode:mcp/install?` with `type: "http"`, and the test expects it.
- `lib/utils.ts` tooltips, `topic-invite-email.tsx`, `topic-scan-email.tsx`: follow, not subscribe, in client-facing
  copy, per the domain-model skill's rule; identifiers keep subscribe.
- `InvitePage.tsx`: a network failure shows as a failed load, not an unknown invitation. `McpConsentPage.tsx`: a missing
  `client_id` is an explicit error. `ProfilePage.tsx`: `isProfileMissing` clears on a new load, and the follower count
  pluralizes. `TopicPage.tsx`: no success toast after a failed subscribe. `pageActionsStore.ts`: a menu item calls the
  handler the current page registered.
- `client/teamClient.ts`: `sendUpdateTeam` returns `"name-taken" | "failed" | null` and `sendCreateTeam` returns the
  taken-name reason for a 409, the daily limit for a 429, and a failure otherwise; the callers show an error for a
  failure.
- `contracts/seo.ts`: `toPodcastEpisodePath` takes published numbers.
- `core/lib/chromeIntentUrl.ts`: the intent path drops the page url's fragment.
- `models/guard.ts`: the threshold is the configured value only if it is a finite number in (0, 1].
- `models/litellm.ts`: the replacement update matches the old key too, and a lost race deletes the new key.
- `models/prompts/chat-topic.md`: the settings sentence names `proposeTopicEdit`; the prompt syncs to prd after the
  deploy.
- `pipeline/attach.ts`: only a host rejection becomes `AttachmentValidationError`; anything else is rethrown.
- `server/envSettings.ts`: an empty dollar setting reads as the default. `server/hmac.ts`: byte lengths are compared.
- `apps/worker/docsSync.ts`: a repeated heading gets an ordinal, so the `(page, heading)` key stays unique.

## Risks / Trade-offs

- [The `found_scan_id` backfill on a large findings table] → one `update ... set found_scan_id = scan_id` in the
  migration; the column is nullable with `set null` on delete, so no constraint can fail the backfill.
- [A role helper moved out of the api changes an import] → the api re-exports `isLeaderRole` from `authorization.ts`,
  so every existing import keeps working.
- [The widened grep finds a comparison that is not an authority check] → the allowed homes are the two helper modules;
  anything else routes through a helper or renames the variable, which is the rule's point.
- [The prompt change goes live before the sync] → the bundled template is the fallback until `prompts:sync:prd`
  promotes it, and a wording drift is logged once per process.

## Migration Plan

Ship with `/ship`. The migration runs in `release-main`'s migrate job before the app deploys. After the deploy: run
`bun run prompts:sync:prd`, poll the MCP `tools/list` for the new `list_topics` description, and send a message to a
team chat room to confirm the room stream still opens. Rollback is reverting the commit; the new column stays and is
harmless.
