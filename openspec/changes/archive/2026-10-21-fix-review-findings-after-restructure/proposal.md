## Why

The apps-and-packages restructure shipped on 2026-10-21 with a no-behavior-change contract, so its ship-time review ran
over the whole repo and left every real finding in pre-existing code for a fix change. CodeRabbit reported 59 findings,
13 of them major: a team owner loses their own subscription when they leave or delete the team, a private topic's
episode description leaks through the public head route, an unverified email matches pending invitations, a chat room
accepts a reply id from another room, a retried Save creates a duplicate topic, a new team's topics attach twice, a
read-only profile shows leader controls, role and plan checks sit inline in the web app, a failed team update reads as
a success, and a digest can re-list Findings a re-score touched. The minors are rejection statuses that say 403 where
the rule says 404, inline role checks the single-gate test misses, unvalidated note comment bodies, an upload with no
pending-deletion record, a stream heartbeat that outlives a failed catch-up, a stale subscriber count under concurrent
writes, IME composition sends, a shifted table footer, unhandled rejections, a stale reload, a wrong VS Code deeplink,
"subscribe" in client-facing copy, an empty dollar setting read as zero, a guard threshold parsed as zero, a LiteLLM key
replacement race, duplicate docs section keys, an Android intent url broken by a fragment, and an attachment fetch that
hides infrastructure faults as user errors.

## What Changes

Every finding that is real is fixed in this change, each with a test where the module has tests, and the review's own
grep widens so the inline role and plan checks it missed cannot return. Two findings are left out on purpose: the
accent-surface contrast change in `packages/tokens/tokens.css` is a palette decision, and the audience-targeted
subscriptions in migration 0051 shipped long ago. A slug tiebreak joins the blog's date sort so two posts with one date
order the same on every filesystem, and the `list_topics` MCP description drops the internal `toolCaller` name.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `teams`: a member who leaves or a leader who deletes the team keeps the subscription to a topic they own; a new team
  is created without topics and the final Save attaches the selection once; a failed team update or create is reported
  as a failure; a 409 names a taken name and a 429 the daily team limit.
- `podcast-episode-pages`: a private or invite topic's episode head has the sanitized topic description, never the
  episode's model-written summary.
- `invitations`: a pending invitation matches a user by email only if the address is verified.
- `team-chat`: a reply names a chat message in the same room, and the room's question reads replied-to rows filtered by
  team; the stream heartbeat ends with a failed catch-up and the `after` cursor is parsed; an uploaded room attachment
  is recorded as pending before the upload, and its unknown id responds 404.
- `topic-editing`: a retried Save after a failed attachment upload updates the topic the first attempt created; the
  topic rate-limit and subscriber recount lock the topic row.
- `public-profiles`: another user's profile shows no leader controls on its team subtables; the follower count
  pluralizes; a missing profile flag clears when a new profile loads.
- `authorization`: every role and plan comparison in the api and the web app routes through the gate or the role and
  plan helpers, and the single-gate test matches `!==` and camelCase names; a private read the user may not see
  responds 404 in the activity, attachment, and topic gate routes.
- `tasting-note-comments`: the thread, comment, edit, and reaction bodies validate with zod payloads.
- `topic-scan-email`: a digest lists the Findings the Scan first found, by an immutable first-scan column, never the
  Findings a re-score touched.
- `mcp-install`: the VS Code deeplink is `vscode:mcp/install?` with an http transport.
- `topic-chat`: a composer never sends while an IME composition is active; a rejected link-preview read ends the
  loading cards; the topic page's prompt names the preview flow instead of a removed tool; the spoken-questions gate
  reads the plan through the plan helper.
- `injection-defense`: an empty or invalid `LLM_GUARD_INJECTION_THRESHOLD` falls back to the default.
- `monthly-budget-cutoffs`: an empty dollar setting reads as unset, and a LiteLLM key replacement stores only if the
  old key is still the stored one.
- `docs-site`: the docs embed gives a repeated section heading an ordinal, so the upsert's key stays unique.
- `topic-attachments`: a url attachment's fetch rethrows an infrastructure fault and shows the user only a host
  rejection.
- `social-sharing`: the Android intent url strips the page url's fragment; the topic feed dialog copies through the
  shared clipboard helper; the Follow tooltips and the invite and digest emails say follow.
- `blog`: posts with one date order by slug.
- `topic-tools`: the `list_topics` description names no internal identifier.

## Impact

- `apps/api`: `team/members.ts`, `share/pageHead.ts`, `activity.ts`, `chat/room.ts`, `chat/roomQuestion.ts`,
  `chat/attachments.ts`, `chat/roomAttachments.ts`, `chat/roomDeletes.ts`, `avatarsRoute.ts`, `billing.ts`,
  `authorization.test.ts`, `note/noteCommentThreads.ts`, `topic/subscriberCounts.ts`, `topic/topicsRoute.ts`,
  `mcp/tools.ts`, `content.ts`, and their tests.
- `apps/web`: the topic and team modals, `TeamMembershipRows.tsx` and its subtables, `ChatRoomPanel.tsx`,
  `Header.tsx`, `spokenQuestionsPaused.ts`, `AccountBudget.tsx`, the two composers, `TopicsTable.tsx`,
  `PodcastFeedDialog.tsx`, `useTopicPagePayload.ts`, `useTopicScan.ts`,
  `installDeeplinks.ts`, `lib/utils.ts`, `InvitePage.tsx`, `McpConsentPage.tsx`, `ProfilePage.tsx`, `TopicPage.tsx`,
  `pageActionsStore.ts`, and their tests.
- `packages`: `client/teamClient.ts`, `client/chatRoomClient.ts`, `contracts/payloads.ts`, `contracts/seo.ts`,
  `contracts/enums.ts` (a plan helper beside `isAdminRole`), `core/lib/chromeIntentUrl.ts`, `models/guard.ts`,
  `models/litellm.ts`, `models/prompts/chat-topic.md`, `pipeline/attach.ts`, `pipeline/scanEmailContent.ts`,
  `server/envSettings.ts`, `server/hmac.ts`, `emails/topic-invite-email.tsx`, `emails/topic-scan-email.tsx`,
  `db/schema/scans.ts` with one migration that adds `findings.found_scan_id`, backfilled from `scan_id`, and
  `apps/worker/docsSync.ts`.
- After the deploy: `bun run prompts:sync:prd` for the changed prompt, and the MCP probe for the changed description.
