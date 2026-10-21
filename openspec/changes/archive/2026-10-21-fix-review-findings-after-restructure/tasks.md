## 1. Shared helpers and the schema

- [x] 1.1 `packages/contracts/enums.ts`: `isLeaderRole` moved in beside `isAdminRole`, plus `isPaidPlan` and
      `isPremiumPlan`; `apps/api/authorization.ts` re-exports `isLeaderRole`
- [x] 1.2 `packages/db/schema/scans.ts`: `findings.found_scan_id`, nullable, `set null` on delete, indexed, with the
      `bun run db:generate` migration and a backfill from `scan_id`; `packages/db/schema.test.ts` covers the column

## 2. The api

- [x] 2.1 `team/members.ts`: the leaving or deleting user's own topics keep their subscription, with a test
- [x] 2.2 `share/pageHead.ts`: a non-public topic's episode head uses the sanitized topic description; the invite-topic
      test in `pageHead.test.ts` asserts it
- [x] 2.3 `activity.ts`: email matches need `emailVerified`, and another user's activity responds 404, with tests
- [x] 2.4 `chat/room.ts` and `chat/roomQuestion.ts`: a reply outside the room is rejected, replied-to rows filter by
      team, the heartbeat ends with a failed catch-up, and `after` parses safely, with tests
- [x] 2.5 `chat/attachments.ts` responds 404 for an attachment the user does not own; `chat/roomAttachments.ts` records
      the pending deletion before the upload and clears it in the row's transaction, with tests
- [x] 2.6 `chat/roomDeletes.ts`, `avatarsRoute.ts`, `billing.ts`: the inline role and plan comparisons call the helpers
- [x] 2.7 `note/noteCommentThreads.ts`: zod payloads in `contracts/payloads.ts` with `zValidator`, and a 400 test
- [x] 2.8 `topic/subscriberCounts.ts` locks the topic row before the recount; `topic/topicsRoute.ts` responds 403 for an
      invite gate alone and 404 otherwise, with tests
- [x] 2.9 `mcp/tools.ts`: the `list_topics` description; `content.ts`: the slug tiebreak, with a test
- [x] 2.10 `authorization.test.ts`: the grep matches `!==` and camelCase names over `apps/api` and `apps/web/src`, with
      `authorization.ts` as the one file it skips

## 3. The web app

- [x] 3.1 `EditTopicModal.tsx`: a retried Save updates the topic the first attempt created, with a test
- [x] 3.2 `EditTeamModal.tsx`: the invite-link create sends no topics, with a test
- [x] 3.3 `TeamMembershipRows.tsx` and its subtables: no leader controls in read-only mode, `isReadOnly` passed through
- [x] 3.4 Role and plan checks through the helpers: `ChatRoomPanel.tsx`, `Header.tsx`, `TopicPage.tsx`,
      `TeamHeader.tsx`, `TeamPage.tsx`, `TeamMembershipRows.tsx`, `InviteUserToTeamButton.tsx`,
      `spokenQuestionsPaused.ts`, `AccountBudget.tsx`, `PlansPage.tsx`, and the footer counts
- [x] 3.5 `ChatComposer.tsx` and `ChatRoomComposer.tsx`: no send during an IME composition, with tests
- [x] 3.6 `TopicsTable.tsx`: the footer's Emails cell; `PodcastFeedDialog.tsx`: `copyToClipboard`
- [x] 3.7 `chatRoomClient.ts`: a rejected read ends the loading cards; `useTopicPagePayload.ts`: a stale
      reload is dropped; `useTopicScan.ts`: polls do not overlap, with tests
- [x] 3.8 `installDeeplinks.ts` and its test: `vscode:mcp/install?` with `type: "http"`
- [x] 3.9 `lib/utils.ts`: the Follow tooltips say follow, with the test updated
- [x] 3.10 `InvitePage.tsx`, `McpConsentPage.tsx`, `ProfilePage.tsx`, `TopicPage.tsx`, `pageActionsStore.ts`: the
      five page and store fixes, with tests where the module has them
- [x] 3.11 The callers of `sendUpdateTeam` and `sendCreateTeam` show an error for a failure

## 4. The packages and the worker

- [x] 4.1 `client/teamClient.ts`: `"failed"` for a non-409 update, and for a create a 409 taken name, a 429 limit, with
      tests; `client/chatRoomClient.ts`: every error reads as no cards
- [x] 4.2 `contracts/seo.ts`: `toPodcastEpisodePath` takes published numbers; its callers narrow
- [x] 4.3 `core/lib/chromeIntentUrl.ts`: the fragment is dropped, with a test
- [x] 4.4 `models/guard.ts`: the threshold parse, with a test; `models/litellm.ts`: the conditional replacement, with a
      test; `models/prompts/chat-topic.md`: the preview flow's name
- [x] 4.5 `pipeline/attach.ts`: infrastructure faults rethrown, with a test; `pipeline/scanEmailContent.ts` and the
      podcast plan read `found_scan_id`, with tests
- [x] 4.6 `server/envSettings.ts` and `server/hmac.ts`, with tests; `emails/topic-invite-email.tsx` and
      `emails/topic-scan-email.tsx` say follow
- [x] 4.7 `apps/worker/docsSync.ts`: repeated headings get an ordinal, with a test

## 5. Ship

- [x] 5.1 `bun run check` green; `/ship`; commit
- [ ] 5.2 After the deploy: `bun run prompts:sync:prd`, the MCP `tools/list` probe, a team chat room message, and a
      digest's new-findings read on the next scheduled Scan
