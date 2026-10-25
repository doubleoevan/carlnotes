---
description: Audit agent-tooling file structure for drift and ownership violations. Read-only; report before proposing fixes.
---

# Audit structure

Audit the agent-tooling file structure for drift risk and ownership
violations. Read-only first: produce the full findings report before proposing
any fix, and make no changes without approval.

The structure follows two rules. **Rule 1:** files we author have exactly one
canonical copy, symlinked where tools require their own path. Canonical homes:
`.agents/skills/` (hand-written and vendored skills), `.agents/commands/`
(ship ritual and other shared commands), `scripts/*.sh` (enforcement checks).
**Rule 2:** generated files stay where their generator puts them, untouched:
OpenSpec output (`.claude/commands/opsx/`, `.opencode/commands/opsx-*.md`,
`.claude/skills/openspec-*`, `.opencode/skills/openspec-*`, `openspec/`),
shadcn components (`apps/web/src/components/primitives/`), tool caches
(`.opencode/package.json`, `node_modules`).

Check for:

1. **Duplicate real files where one should be a symlink**: any authored skill
   or command existing as a regular file in more than one of `.agents/`,
   `.claude/`, `.opencode/`. Verify with `ls -la` that the hand-authored
   entries (the authored and vendored skills in `.claude/skills/`, plus
   `ship.md` and `audit-structure.md` in each tool's commands dir) are actual
   symlinks resolving to existing `.agents/` targets, not copies and not
   broken links. Generated entries (Rule 2 paths, `openspec-*`, `opsx*`) are
   real files by design; do not flag them.
2. **Redundant mirrors**: skills symlinked into a tool dir when that tool
   already reads `.agents/skills/` natively (OpenCode, Gemini, Codex do;
   Claude Code does not). Flag anything in `.opencode/skills/` that duplicates
   `.agents/skills/`.
3. **Legacy paths**: `.opencode/command/` (singular) must not exist; current
   is `commands/` (plural).
4. **Stale content drift**: grep all command files, skill files, `scripts/`,
   and `.coderabbit.yaml` for references to renamed or removed things. This
   list is append-only: when any tool flag, path, script, or file is renamed
   or removed in a change, add its old name here in the same change. Only
   names that reached `main` belong here. A name renamed within the branch
   that introduced it never shipped, so nothing can still reference it.
   - `--prompt-only` (now `coderabbit review --agent`)
   - `git diff --cached --name-status main` in the ship ritual's docs check (now
     `git diff --name-status <origin/main sha>` plus `git ls-files --others --exclude-standard`)
   - `coderabbit review --type all` and a separate `coderabbit auth login` (now `--include-untracked` beside
     `--base-commit <origin/main sha>` and an inline `--api-key`)
   - `src/` paths from before the `ui/` restructure: `frontend.tsx`,
     `index.css`, `styles/globals.css`, `build.ts`
   - `bun-plugin-tailwind`, `Bun.serve` HTML imports (removed Bun full-stack
     scaffold)
   - `use-ai-sdk` as a local skill name (we vendor it as `ai-sdk`). upstream still publishes it at
     `skills/use-ai-sdk/`, so the `skillPath` in `skills-lock.json` keeps the old name on purpose.
     `react-best-practices` is the same case: upstream publishes it there, we vendor it as
     `vercel-react-best-practices`, and the lock keeps the upstream path
   - `"recommended": true` in Biome config (deprecated in Biome 2.5+; the current form is
     `"preset": "recommended"`)
   - `bunx tsc --noEmit` (now `bunx tsc -b`; the old form silently checks nothing
     against a solution-style root)
   - `score.md` (now `summarize-resource.md`), `scan-report.md` (now
     `summarize-topic-scan.md`), `attachment-context.md` (now `attach-context.md`),
     `search-query.md` (now `search-topic.md`)
   - `render.ts`/`fill.ts` (merged into `write.ts`)
   - `worker/llm.ts` (now `worker/models.ts`)
   - `worker/review.ts` (now the `worker/review/` folder: `index.ts`, `filter.ts`,
     `score.ts`, `summarize.ts`, `track.ts`)
   - `api/topic/chat.ts` (now the `api/chat/` folder: `turns.ts`, `attachments.ts`,
     `encryption.ts`). `api/topic/attachments.ts` stays put and is a different table:
     topic attachments are owner-uploaded and topic-wide, chat attachments are per-reader
   - `ui/src/components/topic-feed/` (merged into `ui/src/components/topic/`)
   - `ui/src/components/auth/` (now `session/`), `AuthIcons.tsx` (now
     `OAuthProviderIcons.tsx`), `AuthPageShell.tsx` (now `SessionLayout.tsx`)
   - `PageLoading.tsx` (now `branding/CoffeeLoading.tsx`), `ScanNote.tsx` (now
     `topic/TopicScanRecap.tsx`)
   - `layout/SearchBar.tsx` (now `ui/src/components/search/`: `SearchBar.tsx`,
     `SearchFilters.tsx`, `SearchResults.tsx`)
   - `layout/AnchorLink.tsx`, `layout/ConfirmDialog.tsx`, `layout/FileDropZone.tsx` (now
     `ui/src/components/common/`). `layout/` keeps only page chrome: Header, Footer, UserMenu,
     ThemeToggle, Attribution. `common/` is shared components that are not chrome, and stays
     distinct from `primitives/`, which is reserved for shadcn
   - `worker/adapters/` and the short-lived `worker/ingesters/` (both now `worker/ingest/`),
     `adapter.ts` (now `ingester.ts`),
     `SourceAdapter`/`AdapterResult`/`sourceAdapters` (now `SourceIngester`/`IngestResult`/`sourceIngesters`,
     with `AdapterResult` passing through a short-lived `IngesterResult`),
     `<kind>Adapter` (now `<kind>Ingester`). "adapter" now means a third-party interface shim,
     as in Better Auth's `drizzleAdapter` and Hono's `serveStatic`, which keep the word, or the chat and MCP
     bindings of the Topic Tools (`apps/api/tool/chatTools.ts`, `apps/api/mcp/tools.ts`)
   - `adapter-authoring` skill (now `ingester-authoring`)
   - `worker/review/track.ts` held both the Scan's money and the review's tallies. The money moved out to
     `worker/budget.ts` (`Budget`/`StageCosts`/`charge`/`canSpend` and the cost constants), since ingest and
     telemetry need it too. `track.ts` keeps the review-only outcome types and `trackOutcomes`, and keeps its
     name: every file in `review/` is named for its primary export's verb. A short-lived `outcomes.ts` rename
     broke that pattern and was reverted
   - `REVIEW_SCAN_BUDGET_USD` (now `SCAN_BUDGET_USD`; the ceiling covers ingestion too, so the
     `REVIEW_` prefix named the wrong scope)
   - `worker/ingest/canonical.ts` (now `normalize.ts`), `canonicalUrl` (now `toCanonicalUrl`)
   - `keepChatAttachments` (now `storeTopicChatAttachments`); it stores every attachment a topic chat turn
     sent, not only the kept ones, and a team chat stores none
   - `runTopicScan`/`processTopicScan` (now `startTopicScan`/`startScanFor` in `worker/scan.ts`;
     the pipeline itself is `worker/workflows/runTopicScanActivities.ts`)
   - `toFilteredFindings` (now `toSortedFindings`)
   - `toOfferedUrls`/`OfferedUrlSources` (now `toPossibleSourceUrls`/`PromptSourceUrls` in `ui/src/lib/utils.ts`
     and `EditTopicModal.tsx`), `ScanNoteText` (now `SafeNoteText`), `loadScan` in the scan activities
     (now `requireScan`), `db:encrypt-chat` and `api/encryptChatBackfill.ts` (removed)
   - `SourceEditor.tsx` (now `TopicSourceEditor.tsx`)
   - "web scout" (now "web search", in UI copy and specs alike) — the built-in Source that
     searches the web, distinct from the `search` Source kind that names it in code
   - `emit` as the verb for what an ingester returns (now "find" for discovering a page,
     "return" for what the function gives its caller)
   - "reader" for the person using the app (now "user" everywhere in code). prompt markdown keeps
     "reader", since Carl addresses one — see the prompt-authoring skill for where that line falls
   - `refused` (now `rejected`, though the "refuses to <verb>" idiom stays), `ceiling` (now `limit`),
     "privately routable" / "not publicly routable" / "inside our own network" (all now "internal")
   - `scans.fallback_sources` / `fallbackSources` (now `problem_sources` / `problemSources`; the column holds
     both a Source that fell back and one that failed, so neither arm's name could stand for it. `fallbackMode`
     is a different thing and keeps its name). `degraded_sources` is the original name migration 0028 renamed
     away from, and is not to be returned to
   - `SORT_LABELS` (then `SORT_ROWS`, now `SORT_OPTIONS`), `TAG_MATCH_LABEL` (then `TAG_MATCH_ROWS`, now
     `TAG_MATCH_OPTIONS`); both map a mode to its label and its icon instead of to a label alone
   - `cap` in every form (now `limit`, `limited`, `limiting`, `unlimited`), extending the `ceiling` rename
     above. `recap`, `capture`, `capacity`, `capital` and `strokeLinecap` keep the letters and are not the word
   - a menu item is an `option`, never a `row`; a `row` comes from the database. `ROW_CLASS`/`MENU_ROW_CLASS`/
     `CHAT_MENU_ROW_CLASS`/`ACTION_ROW_CLASS` are now `*_OPTION_CLASS`, and `TeamMenuRow`/`NewTeamMenuRow`/
     `TeamUpMenuRow`/`TopicActionRow` are now `TeamOption`/`NewTeamOption`/`TeamUpMenuOption`/`TopicActionBar`
   - `TopicsTable` named the owner's table and now names the public one. the owner's is `OwnerTopicsTable`,
     so a grep for the old name lands on a different component with a different row type
   - `ActivityTopic` (now `OwnerTopic`) and `ProfileTopic` (now `Topic`); `permissions.ts` renamed its local
     `Topic` alias to `TopicRow` so the contract could take the bare name
   - `TABLE_CARD_CLASS` and `SECTION_CARD_CLASS` held the same string and are now one `CARD_CLASS`
   - `POPOVER_WIDTH_CLASS` (now `POPOVER_PANEL_CLASS`); it carries the panel's height and mobile-sheet marker
     now, not width alone
   - `isOwnersTable` is gone instead of renamed: it gated a visibility tooltip the Visibility column
     already stated, so the prop and the tooltip both went
   - `surface` as a noun for a page or a feature (now the page's own name: `/releases`, the team page,
     the webhook route). `content.ts`'s `Surface`/`SURFACES` are now `Section`/`SECTIONS`, since the value
     is the folder under `content/` a group of pages is read from. the verb (an error is surfaced) and the
     visual noun (a card on a sunken surface) are different words and stay
   - `hand` / `hands back` / `handed back` in a comment for what a function returns (now `return`). the word keeps
     its other senses: a Scan started by hand, one module handing a value to another, a hand-written skill
   - `carries` / `carrying` in comments (now `includes` when one thing holds another, `has` for an attribute,
     `sends` for something transmitted), `rather than` (now `instead of`), `rides with` (now `goes with`),
     `steers` (say what it sets or bounds), `lands in` (now `is included in`), `wears` (now `shows`),
     and em dashes in comments (use a comma or a second sentence). figurative words for a UI surface
     are out too: `chrome` and `furniture` both named the title bar and are now just what it is
   - `viewer` for the person on the page (now `user` when signed in, `visitor` when not; the
     domain-model skill owns the split). `viewerRole`/`viewerUserId`/`isViewerLeader`/`viewerId`/
     `isViewerMember`/`viewerTeams`/`viewerRequest`/`loadViewerRooms` are now `role`/`userId`/
     `isTeamLeader`/`userId`/`isMember`/`userTeams`/`joinRequest`/`loadChatRooms`, and `loadProfile`'s
     subject took the `profileUserId` name so `userId` could mean the signed-in caller
   - a bare `the client` for the code calling our own api (now `the api client`, matching the
     `ui/src/clients/*Client.ts` modules and the `apiClient` each one builds). a third-party client
     keeps the bare word, since it is that library's own name for the thing: the Temporal, Langfuse,
     Sentry, OTel, and database clients, and OAuth's client credentials grant
   - `stamp` as the verb for writing a value (now `save`: `stamped as edited by its creator`,
     `stamps the thread`, `what checkout stamped on it`). the noun `stamp` for a saved time is now
     `time`, so `the read stamp` is `the read time` and `the seen stamp` is `the seen time`. where it
     named a uniqueness suffix instead of a time it says what it holds: the smoke tests'
     `stamp`/`smokeTestStamp` are now `runId`, and `uploadAvatar`'s `stamp` parameter, a random uuid
     in the object key, is now `keyId`. `timestamp` is a different word and keeps it
   - a bare `message` for a chat message (now `chatMessage`), with every compound taking the
     qualifier: `isCarlMessage`, `isOwnMessage`, `onReplyMessage`, `onSendMessage`,
     `handleSendMessage`, `handleReplyMessage`, `scrollToMessage`, `toChangedMentionMessage`,
     `isMessageThread`, `messageBox`/`messageBoxRef`, `carlMessage`, `promptMessage`,
     `chatWindowMessages` (now `windowChatMessages`), and `VIRTUALIZE_FROM_MESSAGES`.
     `repliedMessage` held the whole list instead of a replied message and is now
     `currentChatMessages`. the database keeps every column name, so code writing one maps
     explicitly, as in `{ messageId: chatMessageId }`, and the SSE event name, the route paths,
     and the UI's own "Delete message" copy all keep the bare word. an Error's `.message`,
     `MessageEvent`, `EmailMessage`, and `toModelMessages` are other things entirely
   - a bare `turn` for a chat turn (now `chatTurn`): `isCarlTurn` and `HistoryTurn`, the latter
     now `ChatHistoryTurn`. `Turnstile`, `ReturnType`, and "turns X into Y" keep the letters
   - `ensureUsername` (now `saveDefaultUsername`, beside `saveDefaultUserTeam` at the one call
     site). `saveUsername` is the account-settings rename and stays a different function
   - names that said nothing: `ChatRoomState.send` (now `postChatMessage`, matching
     `postChatRoomMessage`), `useChatRoom.refresh` (now `reloadChatMessages`),
     `TopicFeedProvider.reload` (now `reloadTopicFeed`), and `loadUserAccess`'s local `access`
     (now `userAccess`). `useTopicChat.send` asks a question and keeps its name
   - `assertPublicHost` (folded into `resolvePublicAddress` in `worker/publicFetch.ts` when the fetch
     path went fail-closed; the check-only wrapper had no callers left)
   - `LINK_INVITE_MAX_USES` (now the per-plan `linkInviteMaxUses` in `shared/plans.ts`)
   - `inviteAcceptPayload`/`InviteAcceptPayload` (removed: accepting an invite takes a session and
     no body, since the bot check moved out of the acceptance route)
   - `SignOutDialog.tsx` (removed: sign-out is one click through `session/signOut.ts`), and with it
     the `primitives/alert-dialog.tsx` shadcn primitive and its `@radix-ui/react-alert-dialog`
     dependency; `primitives/card.tsx` is the same removed-unused case
   - the `integrations` table and `sources.integration_id` (dropped unused by migration 0081; the
     domain-model skill keeps Integration as a planned concept with no table)
   - `worker/scrape.ts` as the home of the public-fetch guard (`toFetchableUrl`, `isInternalAddress`,
     `fetchPublicUrl`, `readLimitedBody` are now `worker/publicFetch.ts`; scrape keeps the content
     and caption work)
   - `useChatRoomStream.ts`'s own `toReconnectDelayMs` with its `RECONNECT_*` constants and
     `useChatRoomStream.test.ts` (merged into the `noteProvider.ts` copy and its tests)
   - `reviewTopicInvites` and `InviteeReview` (now `checkTopicInvitees` and `InviteeCheck`; review is the
     scan pipeline's own stage name, so the invite path says check instead)
   - `tabular` in every form (now `table`): `isTabularAttachmentType`, `toTabularProjection`,
     `TABULAR_SCREEN_TIMEOUT_MS`, the `LLM_GUARD_TABULAR_TIMEOUT_MS` env var, and the
     `add-tabular-attachments` change with its `tabular-attachments` capability
   - every `refus*` spelling (now `reject*` throughout, extending the earlier `refused` rename to the
     whole word family): `InviteRefusal`, `toInviteRefusal`, `UserInviteRefusal`, `isInviteRefused`,
     `refusalReason`, `MODEL_CHAT_TURN_FAILED_REFUSAL`, `SPENT_BUDGET_REFUSAL`, `postModelRefusal`,
     `toChatRefusal`, `toTokenRefusal`, the `"attachmentRefused"` and `"inviteeRefused"` statuses, and
     `ui/src/pages/inviteRefusals.ts` (now `inviteRejections.ts`). the "refuses to <verb>" idiom is gone
     too: it reads "will not <verb>" now, since "rejects to" is not english
   - closing an invite link, removed whole in `remove-unnecessary-guards`: the `revoked` rejection
     reason, the `revoked_at` column dropped by migration 0084, and every `revok*` spelling. expiry
     and the use limit are the two ways a link ends now

   - the review pipeline's stage names, each renamed to say which test a Resource passed. the gate
     tests relevance, so `SurvivingResource` is `RelevantResource` and `survivor`/`survivors` are
     `relevantResource`/`relevantResources`; the second stage dedupes, so `admitResource`/`admitResources`
     are `dedupeResource`/`dedupeResources`, the `AdmittedResources` type is `DedupeKeys`, and
     `hasAdmittedNearDuplicate` is `hasNearDuplicateKey`. its output is what the Scan pays to score, so
     `admittedResources`/`admittedResourceIds` are `resourcesToScore`/`resourceIdsToScore` and the
     `admittedCount` span attribute is `toScoreCount`. `allowResource` was rejected for colliding with
     `isAllowed`, and `screenResource` for colliding with llm-guard's screening
   - `loadUnscoredResources`/`unscoredResources` (now `loadResourcesToReview`/`resourcesToReview`; the
     selector returns already-scored Findings whose context changed, so "unscored" named only some of them)
   - `maxResults` and `maxResultsOptions` (now `maxTopicFindings` and `maxTopicFindingsOptions`, since what a scan keeps are
     Findings). the `max_results` column and its `topics_max_results_allowed` check keep their names, mapped in
     `db/schema/topics.ts`, so no migration moved
   - `api/mcp/caller.ts` (now `api/mcp/toolCaller.ts`), and with it `Caller`, `resolveCaller`, the `mcpCaller` context
     variable, `RateLimitCaller`, `toRateLimitCaller`, and `callerRateLimiter` (now `ToolCaller`, `resolveToolCaller`,
     `toolCaller`, `RateLimitToolCaller`, `toRateLimitToolCaller`, and `toolCallerRateLimiter`). the plain word for
     whoever calls a function keeps its comments
   - `finishScan`'s `ingested`/`reviewed` parameters (now `ingestResult`/`reviewResult`, which every
     call site already used). they hold stage results, so neither is a Resource

   - `topic/TopicMentionBadge.tsx` (now `common/UpdateCountBadge.tsx`, since one summed badge shows chat mentions, note
     changes, and topic invitations alike; the page-name badge it exported is `PageUpdateCountBadge`)
   - `common/CountPill.tsx` (now `common/CountBadge.tsx`; a badge is what every caller called it)
   - `toRecencyOrdered` (now `toRelevanceThenRecencyOrder`; it orders by similarity band first and recency second,
     so the old name said only the tiebreak)
   - `ui/src/components/chat/ChatMarkdown.test.ts` (now `ChatMarkdown.test.tsx`; its render cases need JSX)
   - `CHAT_STREAM_FAILED_TEXT` and the marker line it belonged to. a chat reply stream is newline-delimited json
     now, one `ChatReplyLine` per line, so a failure is the `failed` line and text Carl writes can never pass for one
   - `api/litellm.ts` (now `worker/litellm.ts`), `effectiveBudgetCents` (now `userBudgetCents` in `shared/plans.ts`
     with `UserAccess`), `isAdminRole` (now in `shared/enums.ts`; the gate re-exports all three), the admin row's
     `effectiveBudgetCents` field (now `budgetCents`), and `startOfUtcMonth` (now in `db/quotas.ts`, re-exported from
     `api/topic/quotas.ts`)

   - `api/pages.ts` and `pagesRoute` (now `api/documents.ts` and `documentsRoute`), `UI_BUNDLE_ROOT` (now
     `UI_CLIENT_ROOT`), and the shell routes with `toShellWithHeadTags`, `toFindingListHtml`, and `SPA_PAGE_TITLES`
     (now each route's `head()` under `ui/src/routes/`, and `pageHeadRoute` in `api/share/pageHead.ts`)
   - `ui/index.html`, `ui/src/App.tsx`, `ui/src/main.tsx`, and `react-router-dom` (now the route files under
     `ui/src/routes/`, `ui/src/router.tsx`, and `ui/src/client.tsx`)
   - `renderOnTop` (now `BodyPortal` in `ui/src/components/chat/ChatPanelWidget.tsx`)
   - `useRememberedSignedIn` and the `signed-in` localStorage key (now `useIsSignedInBeforeSession` in
     `ui/src/hooks/useIsSignedInBeforeSession.ts`)
   - `publicTopicRows` (now `loadPublicTopics` in `api/seo.ts`), `toTopicDescription` in `api/share/preview.ts` (now in
     `api/seo.ts`), and `MAX_POPULAR_TOPICS` (now `TOPICS_PER_PAGE` in `ui/src/components/topic/TopicSection.tsx`)
   - `outsider` in every form (now `non-member` for a user who is not on the team, as in the smoke tests'
     `nonMemberId`. the topic tools smoke's user with no tie to the topic is now `otherUserId`)
   - `ChatRoomState.rejectionReason` and `clearRejectionReason` (now `rejection` and `clearRejection`, a
     `ChatRoomRejection` kind that `ChatRoomRejectionNotice` in `ui/src/components/chat/ChatRoomPanel.tsx` renders)
   - `/topics/<id>` as a topic's canonical url (now `/topics/<id>/<slug>`, from `toTopicPath` in `shared/seo.ts`)
   - `countScanQueuePollers` (now `describeScanQueue` in `worker/temporalClient.ts`) and `reportUnpolledScanQueue`
     (now `reportScanQueue` in `worker/schedule.ts`)
   - `toReportedPath` and its route shape tables in `ui/src/lib/visitAnalytics.ts` (now `shared/reportedPath.ts`)
   - `deleteAttachment` and `deleteResourceContent` (now `deleteStoredObject` and `deleteStoredObjects` in
     `worker/store.ts`, the one delete path, beside `recordPendingObjectDeletions`), `deleteStoredChatAttachments`
     (now `loadChatAttachmentObjectKeys` in `api/chat/attachments.ts`), and `deleteTopicPodcastEpisodeAudio` and
     `deletePodcastEpisodeAudio` (now `loadTopicPodcastEpisodeAudioKeys` and `toPodcastEpisodeAudioKeys` in
     `worker/podcast/removePodcastEpisode.ts`)
   - `readQueryCount` (now `readRequestCounts` in `db/queryTracing.ts`), and `topicSectionIdCache` with its
     `loadedAt` (now the `topic-section-ids` Redis key in `api/topic/feeds.ts`)
   - the `@opentelemetry/sdk-node` dependency and its `NodeSDK` in `worker/telemetry.ts` (now a `NodeTracerProvider`
     from `@opentelemetry/sdk-trace-node`)
   - `loadUserAccess` in `api/authorization.ts` (now the one in `db/quotas.ts`, which `api/authorization.ts` re-exports)
   - `useAvatarVersion` and `refreshAvatars` in `ui/src/hooks/useAvatarVersion.ts` (removed: each payload's
     `avatarVersion`, from `toAvatarVersion` in `shared/avatars.ts`)
   - a team's `hasAvatar` and a chat room's `teamHasAvatar` (now `avatarVersion` and `teamAvatarVersion`)
   - `toClientAddress` in `api/rateLimit.ts` (now `resolveClientAddress` in `api/trustedProxies.ts`)
   - `reportForwardedChain` in `api/auth.ts` (now `checkTrustedProxies`), and "the forwarded chain" in comments (now the
     x-forwarded-for header)
   - `api/chat/turns.ts` (now `api/chat/privateChat.ts`) and its `chatRoute` (now `privateChatRoute`). its `ChatPage`,
     `saveChatTurn`, `toChatTurnRow`, `recordChatRoomTurn`, `loadChatTurns`, and `clearChatTurns` (now
     `api/chat/chatTurns.ts`), `writeReplyStream` (now `api/chat/replyStream.ts`), and `api/chat/turns.test.ts` (now
     `chatTurns.test.ts` and `replyStream.test.ts`)
   - `ledger` and the `chat ledger` in comments (now a `chat turn row`, or a `spend row` where the point is what it bills)
   - `DATABASE_URL_DIRECT` and `toDirectConnectionString` in `api/note/noteStream.ts` (removed: the chat and note
     fan-out is Redis pub/sub through `publishToChannel` and `subscribeToChannel` in `db/redis.ts`), and with them
     the brokers' own `Client`, `listener`, `listenRetryMs`, and `NOTIFY_TOOL_CALLS_MAX_BYTES`
   - `toExclusiveTask` in `worker/schedule.ts` (now `runWithClaim` in `db/claim.ts`), `isTopicScheduled`, and
     `loadScheduledTopics` with its JS filter (now `toScheduledTopicFilter` in `worker/schedule.ts`), and the reset
     inside the sweep (now `worker/resetMonthlyBudgets.ts` and `bun run reset:monthly-budgets`)
   - `MAX_CONCURRENT_SCAN_ACTIVITIES` in `worker/temporal.ts` (now `SCAN_CONCURRENCY`, read from the setting of that name)
   - `runWithConcurrency` in `worker/review/score.ts` (now `worker/concurrency.ts`)
   - `flagCounts` in `api/flagContent.ts` and `suggestionCountsByUserId` with `dayStartTime` in `db/quotas.ts`
     (removed: both count through `incrementRateLimitWindow` in `db/redis.ts`), and `hono-rate-limiter`'s memory store in
     `api/rateLimit.ts` (now `toolCallerRateLimitStore` over the same counter)
   - `RATE_WINDOW_MS` in `api/rateLimit.ts`, `FLAG_WINDOW_MS` in `api/flagContent.ts`, and
     `CREDENTIAL_RATE_WINDOW_SECONDS`
     in `api/auth.ts` (now `RATE_LIMIT_WINDOW_MS`, `FLAG_RATE_LIMIT_WINDOW_MS`, and
     `CREDENTIAL_RATE_LIMIT_WINDOW_SECONDS`)
   - `sendTopicScanEmail` in `worker/notify.ts` (now `planScanDigest` and `sendScanDigestBatch`), `sendManualScanEmail`
     (now `sendScanReport`), and `finishScan`'s `trigger` argument (now `sendScanEmailWorkflow` in
     `worker/workflows/sendScanEmail.ts`)
   - `worker/temporal-client.ts` and the kebab-case files in `worker/workflows/`: `run-topic-scan.ts`,
     `run-topic-scan-activities.ts`, `process-attachment.ts`, `process-attachment-activities.ts`, `screen-source.ts`,
     `screen-source-activities.ts`, and `stage-timeouts.ts` (now `worker/temporalClient.ts`, `runTopicScan.ts`,
     `runTopicScanActivities.ts`, `processAttachment.ts`, `processAttachmentActivities.ts`, `screenSource.ts`,
     `screenSourceActivities.ts`, and `stageTimeouts.ts`)
   - `monthlySpendDollars` in `api/authorization.ts` (now in `db/quotas.ts`, re-exported by `api/authorization.ts`), and
     `updateTopicFieldsPayload.shape` as a tool's input (now `toUpdateTopicFieldsShape()` in `api/tool/topicTools.ts`)
   - `isUniqueViolation` in `api/usernames.ts` (now in `db/index.ts`)
   - `loadUserLiteLLMKey` (now `loadOrProvisionUserLiteLLMKey` in `worker/litellm.ts`), and `ToolCaller`'s
     `litellmApiKey` in `api/mcp/toolCaller.ts` (removed)
   - `TopicSectionPagination` and `toPageLinkClass` in `TopicSection.tsx` (now `Pagination` and `toPageControlClass`
     in `ui/src/components/common/Pagination.tsx`), `MAX_HISTORY_SCANS` (now `SCANS_PER_PAGE`) and
     `EXPANDED_HISTORY_CLASS` (removed) in `TopicScanHistory.tsx`, `RateTopicFindingButton` in `TopicResource.tsx` (now
     `RatingThumbs` in `ui/src/components/common/RatingThumbs.tsx`), `THEME_SCRIPT` (now
     `FIRST_PAINT_SCRIPT` in `ui/src/routes/__root.tsx`), `SCHEME_PREFIXES` (now `URI_SCHEME_PREFIXES` in
     `AnchorLink.tsx`), `CARD_SKELETONS` in `TopicSkeleton.tsx` (removed), and `toHost` in `worker/suggest.ts` (now
     `toHostWithoutWww` in `shared/seo.ts`)
   - `CardNode` in `api/share/previewImage.ts` (now `CardElement`), with every share card's `*Node` locals (now `*Element`)
   - `scripts/eval-pipeline.ts`, `scripts/eval-pipeline.smoke.ts`, and `scripts/eval-pipeline.test.ts` (now
     `reviewPipelineEval.ts`, `reviewPipelineEval.smoke.ts`, and `reviewPipelineEval.test.ts`, in
     `evals/review-pipeline/`), the bare `bun run eval` script (now
     `bun run eval:review-pipeline`), and fixtures at `evals/<topicId>.json` (now
     `evals/review-pipeline/<topicId>.json`)
   - `isFollowTopicInMenu` and `toActionLayout` in `ui/src/components/topic/TopicActions.tsx` (now
     `toTopicActionLayout`),
     `HeldTeamMenu` in `TeamUpButton.tsx` (now `AddTopicToTeamButton` and `AddTopicToTeamOptionList` over
     `useAddTopicToTeam`), and `TeamActionRow` (now `TeamActionOption` in `ui/src/components/team/TeamMenuOptions.tsx`)
   - `isTeamUpInRow`, `isTeamUpCallToAction`, and the `joinButton` prop in `TopicActions.tsx` (now
     `isAddTopicToTeamOnLeft`,
     `isNewTopicCallToAction`, and `renderJoinButton`)
   - `ui/src/components/team/TeamUpButton.tsx`, `TeamUpButton`, and `isTeamUpShown` (now `AddTopicToTeamButton.tsx`,
     `AddTopicToTeamButton`, and `isAddTopicToTeamShown`), and `TeamOption` and `NewTeamOption` in it (now in
     `ui/src/components/team/TeamMenuOptions.tsx`)
   - `ProfileTeamUpButton` and `RemoveTeamMemberButton` in `ui/src/pages/ProfilePage.tsx` (now `InviteUserToTeamButton` in
     `ui/src/components/team/InviteUserToTeamButton.tsx`), and the page's `handleTeamUp`, `onTeamUp`, `handleOpenTeamUpMenu`,
     and `isTeamingUp` (now `handleInviteUserToTeam`, `onInviteUserToTeam`, `handleOpenNewTeamModal`, and `isNewTeamModalOpen`)
   - `TeamUpMenuOption` and `loadTeamUpMenu` in `api/team/helpers.ts`, `TeamMenuOption` and `fetchTeamOptions` in
     `ui/src/clients/profileClient.ts`, and the `/profiles/:userId/team-up` route (now `ProfileTeamStatus` in
     `shared/contracts/profiles.ts`, `loadProfileTeamStatuses`, `fetchProfileTeamStatuses`, and
     `/profiles/:userId/team-statuses`)
   - `gradeLinksToFindings` and `toParagraphs` in `evals/topic-chat/topicChatEval.ts` (now `toStrayLinkUrl` and
     `toProseParagraphs` in `evals/evalReplies.ts`), and `readablePercent` in `sourceSuggestionsEval.ts` (now
     `toPercentLabel` in `evals/evalLabels.ts`)
   - each eval's rubric constants in `evals/<name>/<name>Eval.ts` (now in `evals/<name>/<name>Rubrics.ts`)
   - `MAX_QUERIES` in `worker/ingest/search.ts` (now `MAX_SEARCH_QUERIES`)
   - `isLikedOrBookmarked` and `likedOrBookmarkedFindingRows` in `worker/podcast/planPodcastEpisode.ts` (now
     `hasScoreBonus` and `scoreBonusFindingRows`)
   - `audioUrl` in `PageHead` and the `og:audio` tags in `ui/src/lib/pageHead.ts` (removed)
   - `finalizeTableAttachment` and the `tableContext` field in `worker/workflows/processAttachmentActivities.ts` (now
     `finalizeVerbatimAttachment` and `verbatimContext`), and `TABLE_SCREEN_TIMEOUT_MS` (now
     `VERBATIM_SCREEN_TIMEOUT_MS`)
   - the `LLM_GUARD_TABLE_TIMEOUT_MS` and `MAX_ATTACHMENT_CONTEXT_CHARS` environment variables (now the
     `VERBATIM_SCREEN_TIMEOUT_MS` constant and the `MAX_ATTACHMENT_CONTEXT_CHARS` constant in
     `shared/contracts/topics.ts`)
   - `TopicResource`'s `podcastEpisodeChapterPill` and `isChapterPlaying` props (now `latestPodcastEpisode`), and the
     `TopicFindingRow` component in `ui/src/components/topic/TopicFindingsSection.tsx` (now `TopicFindingList`, which the
     homepage card shares). `MAX_RESOURCES` in `Topic.tsx` (now `MAX_TOPIC_FINDINGS` in `TopicFindingsSection.tsx`)
   - `TopicPodcast.latestPodcastEpisode` (now `latestPodcastEpisode` on `TopicDetails`, which `TopicFeed` and
     `TopicResponse` extend)
   - the episodes card's `PodcastEpisodeRow` props `isPlayerCardPodcastEpisode`, `isPodcastEpisodePlaying`, and
     `onTogglePlayback` (now `isPlayButtonMuted` in `ui/src/components/podcast/PodcastEpisodeRow.tsx`, which reads the
     player itself), `PodcastEpisodeDetails` in `PodcastEpisodePlayerCard.tsx` (now its own file), and
     `handleTogglePlayback` in `PodcastEpisodeChaptersTable.tsx` (now `togglePodcastEpisodeChapterPlayback` in
     `ui/src/stores/podcastEpisodePlayActions.ts`)
   - `PlaybackControls` in `PodcastEpisodePlayerCard.tsx` (now `SkipPlaybackButtons` and `PlaybackSpeedButton` in
     `ui/src/components/podcast/PlaybackControlButtons.tsx`), and `toChapterIndexAt`, the media session, and
     `podcastEpisodePlayerStore.test.ts` in `ui/src/stores/` (now `ui/src/lib/podcastEpisodePlayback.ts` and its test)
   - `toScanFailureReason` (now `toWorkflowFailureReason` in `shared/scanFailure.ts`)
   - `toTopicTableRows` in `api/topic/helpers.ts` (now `api/topic/topicTableRows.ts`), `TopicNameLink` in
     `OwnerTopicsTable.tsx` (now `ui/src/components/table/TopicNameLink.tsx`), and `loadActivity`'s `isOwnView`
     parameter (then `viewerUserId`, now `signedInUserId`, which `loadTopics` takes too)
   - `stray` for a link outside an eval case's allowed urls (now `disallowed`): `strayUrl` in the scan report and topic
     chat evals (now `disallowedUrl` and `disallowedLinkUrl`), and `strayToolCall` (now `unexpectedToolCall`)
   - `canRenderPodcastEpisode` in `db/quotas.ts` and on the topic podcast payload (now `hasFullPodcastEpisodes`), and
     the `podcastEpisode:render` capability (now `podcastEpisode:full`)
   - `MAX_PODCAST_EPISODE_MINUTES` in `worker/podcast/podcastEpisodeScript.ts` (now `FULL_PODCAST_EPISODE_MINUTES` in
     `shared/podcastEpisodes.ts`), `MAX_PODCAST_EPISODE_FINDINGS` (now `FULL_PODCAST_EPISODE_FINDINGS`), and
     `PODCAST_EPISODE_BUDGET_SHARE` in `db/quotas.ts` (now each plan's `podcastEpisodeBudgetShare` in `shared/plans.ts`)
   - the settings tool's `podcastPlan` result, its 402 response, and the ui client's `planRejected` (removed)
   - `DbTransaction` in `api/team/members.ts`, `ChatRoomTransaction` in `api/chat/roomTurns.ts`, `Transaction` in
     `api/topic/promptVersions.ts`, and the local `DbHandle` aliases (now `DbTransaction` and `DbHandle` in
     `db/index.ts`)
   - `podcastEpisodeOutlinePayload`, `PodcastEpisodeOutline`, and `toCheckedPodcastEpisodeOutline` in
     `worker/podcast/podcastEpisodeScript.ts`, with their tests in `podcastEpisodeScript.test.ts` (now
     `worker/podcast/podcastEpisodeOutline.ts` and `podcastEpisodeOutline.test.ts`)
   - `rendering` for a podcast episode in progress (now `recording`): the `episode_status` value,
     `renderPodcastEpisode.ts` and `renderPodcastEpisodeActivities.ts` in `worker/workflows/` (now
     `recordPodcastEpisode.ts` and `recordPodcastEpisodeActivities.ts`), `renderPodcastEpisodeWorkflow`,
     `renderPodcastEpisodeChapter`, `renderSpeech`, `toRenderedPodcastEpisodeScript`, `RenderedChapter`,
     `tracePodcastEpisodeRender`, `isPodcastEpisodeRenderingConfigured`, `isPodcastEpisodeReadyToRender`, the
     `episode-renders` task queue, the `episode-render` Langfuse trace, and `PODCAST_RENDER_CONCURRENCY`. the scan
     workflow's `episode-render-workflow` patch id keeps its string, since every scan workflow's history stores it. a
     feed's rendered XML, a cover image, an email, and a component still render
   - the `/topics` page: `ui/src/pages/PublicTopicsPage.tsx` with its route `topics.index.tsx`, the
     `GET /api/public-topics` route, and `fetchPublicTopics` in `ui/src/clients/topicClient.ts` (removed: the
     homepage's paged sections, the sitemap, and llms.txt lead a crawler to every public topic, and
     `loadPublicTopics` stays for them)
   - `AnalyticsEvent` (now `UserAnalyticsEvent` beside `BotAnalyticsEvent` and `VisitAnalyticsEvent` in
     `shared/analytics.ts`), and the `topic_edited` events the add-source and remove-source Topic Tools emitted (now
     `source_added` and `source_removed`, which the topic form emits too). `usePagination` returns
     `{ pageRows, renderedRows, pagination }` instead of the state spread beside `pageRows`
   - `resourceHandlers`, `topicHandlers`, and the `handlers` prop of `TopicFindingsSection` (now `topicFeedHandlers`,
     the name of their `TopicFeedHandlers` type, in every component that passes them), and `stopResult` (now
     `stopManualScanResult`)
   - `db/schema.ts` (now one file per domain under `db/schema/`: `users.ts`, `topics.ts`, `scans.ts`, `teams.ts`,
     `invites.ts`, `chat.ts`, `notes.ts`, `podcast.ts`, `billing.ts`, `releases.ts`, `storage.ts`, and `columns.ts` for
     the pgEnums and column helpers), with `db/index.ts` spreading them into the one `schema` object
   - the `*Payload` zod schemas and the types inferred from them in `shared/contracts.ts`, with `EMPTY_TOPIC_DRAFT`
     and `topicSettingsShape` (now `shared/payloads.ts`; the `shared/contracts/` modules keep the response shapes and
     the constants)
   - the long-file splits of 2026-10-10, each moved whole: `deleteTopic` and `loadTopicObjectKeys` from
     `api/topic/topics.ts` (now `api/topic/deleteTopic.ts`) and `topicsRoute` from it (now `api/topic/topicsRoute.ts`);
     `loadTopicFeedData` and the `loadFeed*Rows` reads from `api/topic/feeds.ts` (now `api/topic/feedData.ts`);
     `loadChatRoom` from `api/chat/room.ts` (now `api/chat/roomAccess.ts`) and `clearChatRoom`,
     `deleteChatRoomMessage`, `deleteChatRoomAttachment`, `downloadChatRoomAttachment`, and
     `canDeleteChatRoomMessage` from it (now `api/chat/roomDeletes.ts`); `loadKeptTopicAttachments`,
     `loadTopicChatTurnAttachments`, `toAttachmentsByChatTurnId`, `loadDownloadableChatAttachment`, and
     `streamVideoAttachment` from `api/chat/attachments.ts` (now `api/chat/chatAttachmentReads.ts`); `deleteTeam` and
     `updateTeamLeader` from `api/team/teams.ts` (now `api/team/deleteTeam.ts`); `searchTeams`, `toTeamSearchQuery`,
     and `escapeLikePattern` from `api/team/helpers.ts` (now `api/team/search.ts`); `extractText`,
     `toCanonicalContentType`, `isImageAttachmentType`, `isTableFileType`, `AttachmentValidationError`, `toTableText`,
     and `toClippedTableText` from `worker/attach.ts` (now `worker/attachText.ts`, `worker/attachContentType.ts`, and
     `worker/attachTable.ts`); `failStaleScans`, `toStaleScanFilter`, and `staleScanWindowMs` from
     `worker/schedule.ts` (now `worker/staleScans.ts`); `retrieveDocsBlock` and `toDocsBlock` from
     `worker/chat/retrieve.ts` (now `worker/chat/retrieveDocs.ts`) and `retrieveTeamChatContext` from it (now
     `worker/chat/retrieveTeam.ts`); `REDIS_CLIENT_OPTIONS` and `RedisConnectionClient` from `db/redis.ts` (now
     `db/redisConnection.ts`); the fake Redis server from `db/redis.test.ts` (now `db/redisFakeServer.ts`);
     `teamsRoute` from `api/team/teams.ts` (now `api/team/teamsRoute.ts`); `loadTeamPage` from `api/team/helpers.ts`
     (now `api/team/teamPage.ts`) and `loadTeamsPage` from it (now `api/team/teamsPage.ts`); `createTopic`,
     `updateTopic`, and `notifyIndexNowOfTopicChange` from `api/topic/topics.ts` (now `api/topic/saveTopic.ts`);
     `chatRoomRoute`, `toBeforeChatMessageId`, and `toChatMessagePage` from `api/chat/room.ts` (now
     `api/chat/roomRoute.ts`)
   - the long-file splits of 2026-10-11, each moved whole: `addTopicSource`, `removeTopicSource`,
     `toTopicSourceCostDelta`, and `toTopicSourceLabel` from `api/tool/topicTools.ts` (now
     `api/tool/topicSourceTools.ts`) and `createTopicFromDraft` and `suggestTopicDraftSources` from it (now
     `api/tool/topicDraftTools.ts`); `toNewTopicChatTools`, `toSuggestTopicSourcesTool`, `toCreateTopicText`, and
     `TEAM_MISSING_TEXT` from `api/tool/chatTools.ts` (now `api/tool/newTopicChatTools.ts`); `isTakingDailySlot`,
     `startFirstScan`, and `toNewSourceRow` from `api/topic/helpers.ts` (now `api/topic/saveHelpers.ts`),
     `loadTeamTopicOptions` from it (now `api/topic/teamTopicOptions.ts`), and `loadTopicAccessAndFindings` from it (now
     `api/topic/accessibleFindings.ts`); `setRating`, `setBookmarked`, `setConsumed`, and `recordView` from
     `api/topic/findings.ts` (now `api/topic/findingFeedback.ts`); `toJsonLdTag`, `toCreativeWorkLd`, and
     `toFindingListLd` from `api/seo.ts` (now `api/jsonLd.ts`); `authorizeChatTurn`, `authorizeTeamChatTurn`, and
     `authorizeNewTopicChatTurn` from `api/chat/privateChat.ts` (now `api/chat/chatTurnAuthorization.ts`) and
     `streamChatTurn` from it (now `api/chat/chatTurnStream.ts`); `toTopicFilter` from `api/chat/roomTurns.ts` (now
     `api/chat/roomAccess.ts`) and `toModelRoomQuestion` from it (now `api/chat/roomQuestion.ts`); `listTopics` from
     `api/mcp/results.ts` (now `api/mcp/topicResults.ts`); `acceptInviteToken`, `acceptTopicInvite`, `acceptTeamInvite`,
     and `toInviteProperties` from `api/invite/invites.ts` (now `api/invite/inviteAcceptance.ts`); `loadAdminUsers`,
     `loadAdminTeams`, `loadAdminTotals`, and `computeContributionCents` from `api/admin.ts` (now
     `api/adminConsole.ts`); `loadTopics`, `toActivityTopics`, and `toCents` from `api/activity.ts` (now
     `api/activityTopics.ts`); `mergeNoteYdoc`, `toNoteSnapshot`, `emptyNoteYdoc`, `toNoteHtml`, and `sanitizeNoteHtml`
     from `api/note/notes.ts` (now `api/note/noteYdoc.ts`) and `loadNotesPayload` and `createNote` from it (now
     `api/note/notePayloads.ts`); `sendResetPasswordEmail`, `sendChangeEmailConfirmationEmail`, and
     `sendVerificationEmail` from `api/auth.ts` (now `api/authEmails.ts`), `signGateToken`, `verifyTurnstileToken`,
     `verifyGateToken`, and `GATE_COOKIE_NAME` from it (now `api/signupGate.ts`), and `checkTrustedProxies` and
     `toTrustedProxiesWarning` from it (now `api/trustedProxies.ts`); `loadAccessiblePodcastEpisode`,
     `loadPublishedPodcastEpisode`, and `loadPublishedPodcastEpisodeRows` from `api/podcast/helpers.ts` (now
     `api/podcast/podcastEpisodeRows.ts`); `useNewTopicDraft`, `useChatConversationLoad`, and `useLinkPreviewRefresh`
     from `ui/src/components/chat/useTopicChat.ts` (now their own files beside it) and `ChatTurn` from
     `ui/src/components/chat/ChatMessages.tsx` (now `ui/src/components/chat/chatTurns.ts`); `toChatMentionSuggestions`
     from `ui/src/components/chat/ChatRoomComposer.tsx` (now `MentionSuggestionList.tsx`) and
     `toChangedMentionChatMessage` from it (now `ReplyToDropdown.tsx`); `toTimeAgoLabel`, `ChatVideo`, `CopyButton`, and
     `ModelThinkingBubble` from `ChatMessages.tsx` (now `ChatMessageParts.tsx`) and `ChatMessageAuthor` from it (now
     `ChatTurnBlock.tsx`); the smoke sections and fixtures of `invites.smoke.ts`, `teams.smoke.ts`, `room.smoke.ts`,
     `mcp.smoke.ts`, `topicTools.smoke.ts`, and `podcastEpisodes.smoke.ts` (now `*SmokeSections.ts` and
     `*SmokeFixtures.ts` beside each); and the test renames `api/invite/invites.test.ts` (now
     `inviteAcceptance.test.ts`), `api/note/notes.test.ts` (now `noteYdoc.test.ts`), `api/topic/helpers.test.ts` (now
     `saveHelpers.test.ts`), and `ui/src/components/chat/ChatRoomComposer.test.ts` (now `MentionSuggestionList.test.ts`
     and `ReplyToDropdown.test.ts`); `ChatHistoryTurn`, `ChatTurnInput`, `toModelMessages`, `toConsentStep`,
     `isTopicEditProposed`, and `isConsent` from `worker/chat/index.ts` (now `worker/chat/chatMessages.ts`, with
     `ChatHistoryTurn` now in `shared/payloads.ts`) and `buildTopicChatPrompt`, `buildNewTopicChatPrompt`,
     `buildTeamChatPrompt`, and `toEditTopicBlock` from it (now `worker/chat/chatPrompts.ts`); `dedupeResources`,
     `DedupeKeys`, `hasNearDuplicateKey`, `toContentHash`, `normalizeText`, and `isNearDuplicate` from
     `worker/review/filter.ts` (now `worker/review/dedupe.ts`); `isSnippetComplete`, `toPageTitleField`, and
     `toFetchedContentFields` from `worker/review/score.ts` (now `worker/review/fetch.ts`); the email props builders of
     `worker/notify.ts` (now `worker/scanEmailContent.ts`); and the test splits `worker/chat/index.test.ts` (now beside
     `chatPrompts.test.ts` and `chatMessages.test.ts`), `worker/schedule.test.ts` (now beside `staleScans.test.ts` and
     `scanQueue.test.ts`), `worker/litellm.test.ts` (now beside `resetMonthlyBudgets.test.ts` over
     `litellmTestFixtures.ts`), and `worker/review/filter.test.ts` and `score.test.ts` (now beside `dedupe.test.ts` and
     `fetch.test.ts`); the topic payloads (`topicDraftPayload`, `TopicDraft`, `EMPTY_TOPIC_DRAFT`, `createTopicPayload`,
     `updateTopicPayload`, `updateTopicFieldsPayload`, `proposeTopicEditPayload`, `addTopicSourcePayload`,
     `suggestSourcesPayload`, and their siblings) from `shared/payloads.ts` (now `shared/topicPayloads.ts`); and
     `ChatRoomMessageBubble` from `ui/src/components/chat/ChatRoomMessages.tsx` (now `ChatRoomMessageBubble.tsx`)
   - `SERVER_RENDERED_PREFIXES` in `ui/src/components/common/AnchorLink.tsx` (now `SERVER_PATH_PREFIXES`, with `/api`
     among them), and the bare `<a>` for an `/api` download or image link with its "plain anchor" comment (now
     `AnchorLink`, which renders a server path as a plain anchor and passes `download`, `target`, and `rel` through)
   - `LatestPodcastEpisodePlayButton` in `ui/src/components/podcast/LatestPodcastEpisodePlayButton.tsx` (now
     `PodcastEpisodePlayButton` in `PodcastEpisodePlayButton.tsx`), the chapters table's own `CHAPTER_COLUMN_CLASS`
     (now `TABLE_WIDE_FIRST_COLUMN_CLASS` in `ui/src/lib/styleClasses.ts`), the exported `EMBED_QUERY_INSTRUCTION` in
     `worker/chat/retrieveDocs.ts` (now private behind `embedRetrievalQuery`), and the `restoreEnv` copies in
     `worker/litellmTestFixtures.ts` and `worker/email.test.ts` (now `saveEnvSettings` in `shared/savedEnvSettings.ts`),
     and `loadLatestPodcastEpisodes`, `loadPodcastEpisode`, and `toPodcastEpisode` in `api/podcast/helpers.ts` with
     their test `helpers.test.ts` (now `api/podcast/podcastEpisodeShapes.ts` and `podcastEpisodeShapes.test.ts`, beside
     `loadLatestPodcastEpisodeSummaries`, which the topic tables read), and `isPublicAndShown` in
     `api/topic/permissions.ts` (now in `db/index.ts` beside `isFindingShown` and `hasEnoughFindingsToList`)
   - `loadMoreTopics` and `MORE_TOPICS_LIMIT` in `api/topic/moreTopics.ts` with `moreTopics.test.ts`,
     `ui/src/components/topic/MoreTopicsSection.tsx`, and `TopicResponse.moreTopics` (removed; the topic page's
     Similar topics table is `RelatedTopicsSection` over `loadRelatedTopics`)
   - `shared/contracts.ts` and `@shared/contracts` (now one module per domain under `shared/contracts/`, each imported
     by its own path: `chat`, `teams`, `invites`, `activity`, `profiles`, `admin`, `search`, `findings`, `podcast`,
     `podcastEpisodePage`, `topics`, `notes`, `pageHead`, `signupCta`), and `escapeLikePattern` in `api/team/search.ts`
     (now private behind `toContainsLikePattern` in `api/likePattern.ts`)
   - the viral-day splits of 2026-10-11, each moved whole: `readRedisExtraGauges` from `db/redis.ts` (now
     `db/redisGauges.ts`); `incrementRateLimitWindow`, `decrementRateLimitWindow`, and `takeRateLimitSlot` from
     `db/redis.ts` (now `db/redisRateLimits.ts`); the video id, caption track, and transcript readers such as
     `toYoutubeVideoId` and `toTranscriptText` from `worker/scrape.ts` (now `worker/transcripts.ts`); `isSameShowName`,
     `toAdvertisedFeedHref`, and `isTemporaryFailure` from `worker/suggest.ts` (now `worker/suggestedSourceChecks.ts`);
     the Better Auth request hooks from `api/auth.ts` (now `api/authHooks.ts`); `scrubContent` and `scrubTransaction`
     from `shared/monitoring.ts` (now `shared/monitoringScrub.ts`, with their tests in `monitoringScrub.test.ts`);
     `avatarsRoute` from `api/avatars.ts` (now `api/avatarsRoute.ts`); `billingRoute` from `api/billing.ts` (now
     `api/billingRoute.ts`); `startUndispatchedScans` and `reportScanQueue` from `worker/schedule.ts` (now
     `worker/scanQueue.ts`); and the test splits `api/index.test.ts` (now beside `pageRender.test.ts` and
     `pageGuards.test.ts` over `indexTestFixtures.ts`) and `worker/schedule.test.ts` (now beside
     `scheduledTopicFilter.test.ts`)
   - `INGEST_TOTAL_TIMEOUT_MS` and `REVIEW_TOTAL_TIMEOUT_MS` (removed: ingest and review now share
     `QUEUED_STAGE_TIMEOUT_MS` as their schedule-to-close bound, and `MAX_SCAN_DURATION_MS` derives from it),
     `toSpendLimit` (now `toDollarSetting` in `shared/envSettings.ts`, which reads any setting in dollars), and the
     local `DAY_MS` copies in `db/quotas.ts`, `worker/schedule.ts`, `worker/retryPendingObjectDeletions.test.ts`, and
     the schedule tests (now `DAY_MS` in `shared/time.ts`, beside `withTimeLimit`)
   - `toInstantSetTimeout` in `db/redisFakeServer.ts` (now `toInstantReconnectSetTimeout`, which speeds and records only
     the reconnect timers, beside `toEveryTimerInstantSetTimeout` for every timer), and `clearTopicSectionIdCache` (now
     `clearSharedTopicFeedCaches`, which drops the visitors' feeds with the section ids)
   - `FeedStatusError` in `worker/ingest/feed.ts` (now `FetchStatusError` in `worker/publicFetch.ts`, beside
     `isRetryableFetchFailure`), `topicOwnerModelKey` in `worker/workflows/processAttachmentActivities.ts` (now
     `loadOrProvisionTopicOwnerLiteLLMKey` in `worker/litellm.ts`), and `QUEUE_DESCRIBE_TIMEOUT_MS` in
     `worker/temporalClient.ts` (removed: the describe call runs through `withClientDeadline`)
   - `toPositiveInteger` in `db/index.ts` (now `shared/envSettings.ts`), `toMonthlySpendCents` in `db/quotas.ts` (now
     `toSpendCents`, beside `loadSpendSince`), and `quietErrorReports` in `worker/litellmTestFixtures.ts` (now
     `shared/monitoringTestFixtures.ts`)
   - `deleteRedisKey` in `db/redis.ts` (now `deleteRedisKeys`, which takes one or more keys and returns how many it
     deleted), `isWithinRateLimit` (removed: `countRateLimitHit` in `db/redisRateLimits.ts` counts a hit and returns
     whether it is within the limit), `isAnsweredRefusal` in `worker/ingest/index.ts` (now `isHostRejection`), and
     `isReadable` in `worker/suggest.ts` (now `isSuggestedSourceReadable` in `worker/suggestedSourceChecks.ts`)
   - `PROVIDER_PHOTO_CACHE_CONTROL` in `api/avatars.ts`, and `CURRENT_IMAGE_CACHE_CONTROL` and
     `CURRENT_IMAGE_EDGE_CACHE_CONTROL` in `api/edgeCache.ts` (now `UNVERSIONED_CACHE_CONTROL`,
     `IMMUTABLE_CACHE_CONTROL`, and `FILE_EDGE_CACHE_CONTROL` in `api/edgeCache.ts`)
   - `docs/src/rehypeTopicTutorialVideo.ts` and `rehypeTopicTutorialVideo`, set through `markdown.rehypePlugins` (now
     `docs/src/topicTutorialVideoPlugin.ts` and `topicTutorialVideoPlugin`, a hast plugin on `satteri()`)
   - `ui/src/components/topic/TopicTutorialVideoCard.tsx` with `TopicTutorialVideoCard`, `TopicTutorialVideoPlayer`, and
     `TopicTutorialVideoTitle` (removed: the hero's `TopicTutorialVideoButton` opens the video's dialog in
     `TopicTutorialVideoDialog.tsx`, which holds its player and title)
   - `isPlainClick` in `ui/src/lib/utils.ts` (now `shouldHandleLinkClick`, with `toLinkClickHandler` beside it)
   - `topic-tutorial-video-thumbnail.png` in `ui/public/` and its `docs/public/` symlink (now
     `topic-tutorial-video-thumbnail.webp` in both)
   - "the event loop stalled past 200 ms" as the event loop warning's message, and `EVENT_LOOP_DELAY_ALERT_MS` (now
     "the api's event loop stalled", from `EVENT_LOOP_STALL_ALERT_MS` and `EVENT_LOOP_P99_ALERT_MS` in
     `shared/runtimeGauges.ts`)
   - `wordmark` for the CarlNotes cup and name (now `logo`, in comments and specs alike)
   - `createTopic` as a new-topic chat tool (now `proposeNewTopic`, and `createTopicInChat` in
     `api/tool/newTopicChatTools.ts`)
   - the saving tools in the private topic chat (now the preview tools, with `api/chat/chatProposals.ts` applying the
     private chat's changes)
   - the saving tools in a team room, `toChatTopicTools`, `toUpdateTopicPromptTool`, `toUpdateTopicFieldsTool`,
     `toAddTopicSourceTool`, `toRemoveTopicSourceTool`, `EditTopicToolBinding`, `CONFIRMATION_RULE`,
     `worker/prompts/chat-edit-topic.md`, and the eval's `toSavingToolStandIns` (now the preview tools alone in every
     chat, with `api/chat/roomProposals.ts` applying a room preview for the member it was shown to), and
     `toConsentStep`, `isTopicEditProposed`, `isConsent`, and `CONSENT_PATTERN` (removed). the ui's
     `isTopicEditProposed` on `EditableTopicDraft` and `TopicDraftCard` is a different field and keeps its name
   - `toHostVoice` and the inline cohost voice in `worker/speech.ts` (now `toSpeakerVoice(speaker)`), and `toStepsText`
     in `evals/evalReplies.ts` (now in `worker/chat/index.ts`)
   - a chat turn row's kind read from which columns are null, as `isNotNull(chatTurns.roomMessageId)` (now
     `chat_turns.kind`)
   - `in flight` / `in-flight` / `inFlight` (now `running` for a Scan, a task, or an activity, and `in progress` for a
     request, a post, or a render; the concurrency tests count with `runningCount`)
   - the advisory lock in `db/claim.ts` (now a lease row in the `claims` table)
   - `toPlainText` as a private helper in `shared/seo.ts` (now exported from `shared/spokenText.ts`, beside
     `toSpokenParts`)
   - `toFailedSpeechResult` in `worker/speech.ts` (now `toModelCallFailure`, beside
     `toRetryableModelCallFailure`). `SpeechResult` stays the podcast's recording result, and a spoken answer's is
     `SpokenAnswerResult`
   - the inline `Bun.spawn(["ffmpeg", ...])` in `worker/podcast/podcastEpisodeAudio.ts` and
     `api/share/podcastCover.ts` (now `runFfmpeg` in `worker/ffmpeg.ts`, which every ffmpeg run goes through)
   - the talk-to-carl splits, each moved whole: `savePodcastEpisodeListen`, `isPodcastEpisodeListenDue`,
     `setIsUserSignedIn`, and `resetPodcastEpisodePlaybackStart` from `ui/src/stores/podcastEpisodePlayerStore.ts`
     (now `ui/src/stores/podcastEpisodeListenStore.ts`), and `useChatRoomLinkPreviews` from
     `ui/src/components/chat/useChatRoom.ts` (now its own file beside it, with `useChatRoomSpokenAnswer.ts`)
   - each plan's `podcastEpisodeBudgetShare` in `shared/plans.ts` (now `monthlyBudgetCutoffShares`, beside
     `toMonthlyBudgetCutoffs`), `isPodcastEpisodeBudgetShareExhausted` in `db/quotas.ts` (now
     `isMonthlyBudgetCutoffPassed` in `db/monthlyBudgetCutoffs.ts`), and `SpendSection` with `BUDGET_MESSAGES` in
     `ui/src/components/account/AccountBudget.tsx` (now `SpendMeter` in `ui/src/components/account/SpendMeter.tsx`)
   - the podcast player question splits, each moved whole: `toRecordingDecision`, `toRecordingLevel`, `toMeterLevel`,
     `toSilenceThreshold`, `toRecordingMimeType`, `RecordingDecision`, and the recording constants such as
     `END_OF_SPEECH_MS`, `RECORDING_LIMIT_MS`, and `METER_STEPS` from `ui/src/lib/voiceRecorder.ts` (now
     `ui/src/lib/voiceRecordingDecisions.ts`), and `voiceRecorder.test.ts` (now `voiceRecordingDecisions.test.ts`);
     `answerChatTurn`, `toChatTurnTools`, `toNewTopicChatDraft` (now `loadNewTopicChatDraft`), and
     `toPromptTopicsRemaining` from `api/chat/privateChat.ts` (now `api/chat/chatTurnAnswer.ts`); `SpokenAnswerQueue`,
     `SpokenAnswerState`, `SpokenAnswerEnd`, `toNextSpokenPartAction`, and `toChatRoomSpokenAnswerKey` from
     `ui/src/stores/spokenAnswerStore.ts` (now `ui/src/stores/spokenAnswerQueue.ts`); `togglePodcastEpisodePlayback` and
     `togglePodcastEpisodeChapterPlayback` from `ui/src/stores/podcastEpisodePlayerStore.ts` (now
     `ui/src/stores/podcastEpisodePlayActions.ts`); `toStreamedSpokenAnswer` and `StreamedSpokenAnswer` from
     `ui/src/components/chat/useTopicChat.ts` (now `ui/src/stores/streamedSpokenAnswer.ts`) and `SendChatTurnOptions`
     from it (now `ui/src/clients/chatClient.ts`); `ListenMode` and `LISTEN_WAIT_TIMEOUT_MS` from
     `ui/src/components/chat/useVoiceRecording.ts` (now `useListenMode.ts`) and `MICROPHONE_REJECTED_TOAST`,
     `NO_SPEECH_TOAST`, and `TRANSCRIPTION_FAILED_TOAST` from it (now `chatRejectionCopy.ts`, the last as
     `CHAT_FAILED_TOAST`)
   - `showCarlOnMediaSession` (now `showSpeakerOnMediaSession`), `announceSpokenAnswerEnd` (removed), `toHostsBlock` in
     `worker/podcast/generatePodcastEpisodeScript.ts` (now `toPodcastEpisodeHostsBlock` in
     `worker/podcast/podcastEpisodeHosts.ts`), `ChatHistoryTurn` in `worker/chat/chatMessages.ts` and the ui's copy in
     `ui/src/components/chat/chatHistoryTurns.ts` (now one type in `shared/payloads.ts`), `gradeNoMarkdown` in
     `evals/topic-chat/topicChatEval.ts` (now `evals/evalChecks.ts`), `toJsonRequest` in
     `api/chat/voiceRouteTestFixtures.ts` (now `api/testSession.ts`), `SPOKEN_BLOCK_START` and `chatContext` in
     `worker/chat/chatPrompts.test.ts` (now `worker/chat/chatContextTestFixtures.ts`), `replaceNewestChatTurn` in
     `ui/src/components/chat/chatTurns.ts` (removed), and `ensureDevUser` in `api/seed.ts` (now `ensureUser`)
   - `ui/src/components/branding/CarlAvatar.tsx` and `CarlAvatar` (now `HostAvatar` in
     `ui/src/components/branding/HostAvatar.tsx`), `PlaybackControlButton` in
     `ui/src/components/podcast/PlaybackControlButtons.tsx` (now the common `IconButton`),
     `FetchSpokenAnswerAudioOptions` in `ui/src/clients/voiceClient.ts` (now `SpokenAnswerPayload` in
     `shared/payloads.ts`), `VoiceModelCall` in `api/chat/voiceRoute.ts` (now `VoiceSpendChatTurnKind` in
     `api/chat/chatTurns.ts`), `toAttachmentName` in `worker/chat/chatMessages.ts` and `toCollapsedText` in
     `worker/transcripts.ts` (now `toOneLineText` in `shared/text.ts`), and `FULL_PODCAST_COVER_SIZE` in
     `api/share/podcastCover.ts` (now `shared/podcastEpisodes.ts`)
   - the ship splits, each moved whole: `isWithinDailyTopicLimit`, `loadDailyTopicIdsByOwner`, and
     `loadBudgetExhaustedOwnerIds` in `worker/schedule.ts` (now `worker/scheduledTopicLimits.ts`), `toScheduledTopic` in
     `worker/schedule.test.ts` (now `worker/scheduledTopicTestFixtures.ts`), `withPodcastEpisodeQueryRows` in
     `db/quotas.test.ts` (now `withSpendQueryRows` in `db/quotaTestFixtures.ts`), `withAttachmentNote` in
     `shared/contracts/chat.ts` (now `shared/contracts/chatQuestionNotes.ts`), `VoiceRecordingState` in
     `ui/src/components/chat/useVoiceRecording.ts` (now `voiceRecordingRules.ts`), `toGradingResult` in
     `evals/evalHarness.ts` and `gradeLinksToMaterial`, `gradeParagraphCount`, and `MAX_REPLY_PARAGRAPHS` in
     `evals/topic-chat/topicChatEval.ts` and `evals/team-chat/teamChatEval.ts` (now `evals/evalChecks.ts`)
   - `isWeekend` in `worker/schedule.ts` (now `isUtcWeekend` in `shared/time.ts`), and `toSpokenEventMeasurements` in
     `api/chat/voiceRoute.ts` (now `toSpokenEventProperties`)
   - the top-level folders `ui/`, `api/`, `worker/`, `db/`, `shared/`, `emails/`, and `docs/` (now the Bun workspaces
     `apps/web`, `apps/api`, `apps/worker`, `apps/docs`, `packages/contracts`, `packages/client`, `packages/core`,
     `packages/nightshift`, `packages/server`, `packages/db`, `packages/emails`, `packages/models`, and
     `packages/pipeline`; every entry above names its paths in the old layout), the `@shared/*` alias (now
     `@carlnotes/contracts/*` and `@carlnotes/server/*`), the `worker/index.ts` re-export module (removed: the api
     imports each module by its package path), `ui/src/clients/` (now `packages/client/`), and
     `scripts/check-ui-boundary.ts` (now `scripts/check-package-boundaries.ts`)
   - `reportFailedWrite` / `reportRejectedWrite` in `ui/src/clients/topicClient.ts` (now `showFailedWrite` /
     `showRejectedWrite` in `packages/client/topicClient.ts`), `sourceFilesUnder` in `db/schema.test.ts` (now
     `listSourceFiles` in `packages/server/sourceFileTestFixtures.ts`), `DOCS_ROOT` in `api/seo.ts` and `DOCS_DIR` in
     `worker/docsSync.ts` (now `DOCS_CONTENT_DIRECTORY` in `packages/server/docsContent.ts`), and
     `shared/podcastEpisodes.ts` (now `packages/contracts/podcastEpisodes.ts`,
     `packages/server/podcastEpisodeSettings.ts`, and `packages/server/podcastCoverPaths.ts`)
   - `TEAM_REJECTION_REASONS` in `ui/src/components/topic/TopicTeamSelect.tsx` (now
     `apps/web/src/components/team/saveTeam.ts`), `isLeaderRole` in `api/authorization.ts` (now
     `packages/contracts/enums.ts`, re-exported by the gate), and `isHostRejection` in `worker/ingest/index.ts` (now
     `packages/server/publicFetch.ts`)
   - `provisionLiteLLMKey`, `deleteLiteLLMKey`, `readLiteLLMKeyBudget`, and `readLiteLLMKeySpend` in
     `packages/models/litellm.ts` (now `packages/models/litellmProxy.ts`)
   - `packages/tokens` and `@carlnotes/tokens` (now `packages/nightshift` and `@carlnotes/nightshift`), and a
     hand-edited `tokens.css` (now written, with `figma/light.tokens.json` and `figma/dark.tokens.json`, from
     `colors.ts`, `radius.ts`, `theme.ts`, and `typography.ts` in `packages/nightshift/` by `bun run nightshift:write`)
   - `hasTsconfig` on `Workspace` in `scripts/packageBoundaries.ts`, and the exemption that let a dependency on a
     tsconfig-less package go without a reference (removed)
   - `chat/thinkingLines.ts` and its test (now `common/thinkingLines.ts`), and the three local thinking lines,
     `ThinkingLine` in `chat/ChatMessageParts.tsx`, `ScanThinkingLine` in `topic/TopicScanHistory.tsx`, and
     `ThinkingLine` in `topic/TopicSourceEditor.tsx` (now `common/ThinkingLine.tsx`)
   - `mcp` from `better-auth/plugins` (now `mcp` from `@better-auth/mcp`, beside `jwt` and `cimd` in
     `apps/api/auth.ts`), `auth.api.getMcpSession` (now `verifyMcpAccessToken` in `apps/api/mcp/toolCaller.ts`), and
     `oAuthDiscoveryMetadata` and `oAuthProtectedResourceMetadata` (now `oauthProviderAuthServerMetadata` and
     `toProtectedResourceMetadata` in `apps/api/index.ts`)
   - `/api/auth/mcp/authorize`, `/mcp/register`, and `/mcp/token` (now `/api/auth/oauth2/authorize`, `/oauth2/register`,
     and `/oauth2/token`), and the consent page's `consent_code` (now the signed query it posts as `oauth_query`)
   - `oauthApplications` and `oauth_applications` (now `oauthClients` and `oauth_clients` in
     `packages/db/schema/users.ts`), and the client name lookups in `toolCaller.ts`, `server.ts`, and `authHooks.ts`
     (now `loadOAuthClientName` in `apps/api/mcp/oauthClientNames.ts`)
   - `getIp` from `better-auth/api` (now `getIP`)
   - `TopicFinding.viewCount` (now `viewerCount` in `packages/contracts/findings.ts`, read from
     `findings.viewer_count`), and `TopicFinding.engagement` (removed)
   - `topicResponse = topicFeed.extend` and `TopicFeed` as the topic header's type (now `topicDetails` and
     `TopicDetails` in `packages/contracts/topics.ts`, which `topicFeed` and `topicResponse` both extend)
   - `savePodcastEpisodeListen` and `loadNextUnplayedPodcastEpisode` in `apps/api/podcast/podcastEpisodes.ts` (now
     `apps/api/podcast/podcastEpisodeListens.ts`)
   - `startScanPoll` (now `startVisiblePoll` in `apps/web/src/lib/visiblePoll.ts`), `toRemovedTopicSourceText` (now
     `toRemoveTopicSourceText` in `apps/api/tool/chatTools.ts`), `MAX_FAILURE_REASON_CHARS` (now
     `SOURCE_RESULT_REASON_CHARS` in `packages/contracts/topics.ts`), `RSS_FALLBACK_MODE` (now
     `REDDIT_RSS_FALLBACK_MODE` in `packages/contracts/sources.ts`), `handleOpenScanNote` (now
     `handleScanNoteOpenChange` from `apps/web/src/hooks/useScanNote.ts`), and the `ScanNote` component (now
     `ScanNotePanel` in `apps/web/src/components/topic/TopicScanHistory.tsx`)
   - `api/topic/findingMarks.ts` (now `apps/api/topic/findingFeedback.ts`) and `registerMarkTools` (now
     `registerFeedbackTools` in `apps/api/mcp/tools.ts`)
   - `ScansTable` and `ScanNotesCell` in `apps/web/src/components/table/OwnerTopicsTable.tsx` (now `TopicScansTable` and
     `ScanNotesCell` in `apps/web/src/components/table/TopicScansTable.tsx`), and `handleCostCellClick` and
     `expandedTopicIds` with `setExpandedTopicIds` in `OwnerTopicsTable.tsx` (now `handleSubtableClick` and
     `openSubtableByTopicId` with `setOpenSubtableByTopicId`), and `withTopicId` there (removed)
   - `activeSubscribers` in `apps/api/topic/subscriberCounts.ts` (now `isActiveNonOwnerTopicSubscription`)
   - `estimateEmbedTokens` in `packages/pipeline/review/filter.ts` and `TRANSCRIPT_CHARS_PER_TOKEN` in
     `packages/models/transcription.ts` (now `toEstimatedTokens` in `packages/models/budget.ts`), and `rejectChatTurn`
     in `apps/api/chat/privateChat.ts` (now exported from `apps/api/chat/chatTurnAuthorization.ts`)
   - the `serve-pages-from-a-web-service` OpenSpec change (now the unapplied `split-web-from-api`, with its attachment
     extraction moved to `extract-attachment-text-in-a-worker`), and `extractText` called on the api's event loop (now
     `readChatAttachmentText` in `apps/api/chat/chatAttachmentScreening.ts` over `extractTextInWorker` in
     `apps/api/chat/attachmentExtraction.ts`)
   - the per-kind search routes `GET /api/topics/search`, `/api/teams/search`, `/api/users`, and
     `/api/episodes/search`, with `topicSearchRoute`, `podcastEpisodeSearchRoute`, `TopicSearchResult`, `TopicResult`,
     `PodcastEpisodeSearchResult`, `PodcastEpisodeResult`, `TeamSearchResult`, `TeamResult`, `UserSearchResult`,
     `UserResult`, `ResourceResult`, `USER_SEARCH_LIMIT`, and `ToTopicSearchQueryOptions` (now `GET /api/search`,
     `searchSite` and `searchRoute` in `apps/api/search/search.ts`, the `SearchRow` kinds in
     `packages/contracts/search.ts`, and `SearchTopicsOptions`), and `tagMatchModes` in
     `apps/web/src/providers/TopicFeedProvider.tsx` (now `TAG_MATCH_MODES` in `packages/contracts/findings.ts`)
   - `SEARCH_RESULT_TYPES`, `SearchResultType`, and the search kind value `podcasts` in `packages/contracts/search.ts`
     (now `SEARCH_RESULT_KINDS`, `SearchResultKind`, and `podcastEpisodes`)
   - the MCP tools `update_topic_prompt`, `update_topic_fields`, `add_source`, and `remove_source` (now `edit_topic` in
     `apps/api/mcp/topicEditTools.ts`), `updateTopicPromptInChat`, `updateTopicFieldsInChat`, `addTopicSourceInChat`,
     `removeTopicSourceInChat`, `updateTopicPromptPayload`, and `removeTopicSourcePayload` (now `saveTopicPromptEdit`,
     `saveTopicFieldsEdit`, `saveAddedTopicSource`, and `saveRemovedTopicSource` in `apps/api/tool/topicEditSaves.ts`,
     over `proposeTopicEditPayload`), and `TopicEditSave` and `toTopicEditSaves` in `apps/api/chat/chatProposals.ts`
     (now `apps/api/tool/topicEditSaves.ts`)
   - `apps/web/src/components/chat/editableTopicDraft.ts` and its test (now `toEditableTopicDraft` in
     `packages/contracts/topicEdits.ts`), and `NewTopicRow` in `apps/web/src/pages/HomePage.tsx` (now
     `apps/web/src/components/topic/TagsAndNewTopicRow.tsx`)
   - `TopicFinding.viewerCount` (now `viewCount` again, read from `findings.view_count`, which counts every open), the
     first-open lock in `recordView`, and the `ratedDown` view with its "Rated down" filter (removed: a thumbs down hides
     a finding from every view)
   - `SessionLayout`'s `onOAuth` prop, `handleOAuthLogin` in `LoginPage.tsx`, and `handleOAuthSignup` in
     `SignupPage.tsx` (now `handleOAuth` in `apps/web/src/components/session/SessionLayout.tsx`, which takes a
     `redirectPath` prop), and the `"com.carlnotes.app"` literal in `apps/mobile/app.config.ts` (now
     `MOBILE_APP_BUNDLE_IDENTIFIER` in `packages/contracts/mobileApp.ts`)
   - `GATE_COOKIE_NAME` in `apps/api/signupGate.ts` and `MIN_PASSWORD_LENGTH` in `apps/api/auth.ts` (now
     `packages/contracts/signupGate.ts`), `isLanDevOriginTrusted` in `apps/api/auth.ts` (now a branch of
     `toTrustedOrigins`), `authClient` the object in `packages/client/authClient.ts` (now `authClient()`, with
     `configureAuthClient` and the `AuthClient` type), and `fetch(toApiUrl(...))` in a client module (now `fetchApi` in
     `packages/client/apiClient.ts`; `toApiUrl` stays for a url the platform loads itself)
   - `apps/mobile/src/components/session/SessionButton.tsx` (now `Button` in
     `apps/mobile/src/components/primitives/button.tsx`), `cn` in `apps/web/src/lib/utils.ts` (now
     `@carlnotes/nightshift/classNames`), `shadow-lift` and its `@utility` in `apps/web/src/globals.css` (now
     `shadow-raised`, written into `tokens.css` and `uniwind.css` from `packages/nightshift/elevation.ts`), `siApple`
     in `BrandIcon.tsx` (now `APPLE_ICON_PATH` in `packages/nightshift/oauthProviderIcons.ts`), and the root
     `components.json` (now `apps/web/components.json`)
   - `toImportViolations`, `toParsedImports`, `isTypeOnlyImport`, `ParsedImport`, and `STORY_FILE_SUFFIX` in
     `scripts/packageBoundaries.ts` (now `scripts/importBoundaries.ts`), `COMPONENT_BROWSER_FOLDERS` there (now
     `WEB_COMPONENT_BROWSER_FOLDERS` in `scripts/importBoundaries.ts`), `Workspace`, `SourceFile`, and
     `UNIVERSAL_WORKSPACE_FOLDERS` there (now `scripts/workspaces.ts`), and `listSourceFiles` in
     `scripts/check-package-boundaries.ts` (now `readSourceFiles` in `scripts/sourceFiles.ts`)
   - `apps/api/note/noteYdoc.ts` with `mergeNoteYdoc`, `toNoteSnapshot`, `emptyNoteYdoc`, `toNoteHtml`, and
     `saveNoteUpdate` (removed: a note's body is sanitized html saved at a version; `sanitizeNoteHtml` is now in
     `apps/api/note/noteHtml.ts`), `apps/api/note/noteStream.ts` and the Redis channel `note_updates` (removed: no note
     change fans out; `apps/api/chat/roomStream.ts` is the one Redis fan-out), `apps/api/note/noteCommentThreads.ts`
     and the threads routes (now `apps/api/note/noteComments.ts`, one plain-text thread per note), the ydoc snapshot
     route, the events route, and the users route (removed: a note read returns the body with its version, and a
     comment includes its author), and `POST /notes/:id/updates` with `NOTE_SYNC_PATH` (now `NOTE_BODY_PATH`,
     `PUT /notes/:id/body`, in `apps/api/note/notes.ts`)
   - `apps/web/src/components/note/useNoteSync.ts`, `noteProvider.ts` with `NoteProvider` and `NoteTransport`,
     `CommentMentions.tsx`, and `noteEditor.css` (removed: the editor is `react-native-enriched-html` in
     `NoteEditor.tsx`, with `NoteToolbar.tsx`, `NoteLayout.tsx`, `NoteComments.tsx`, and `NoteConflictNotice.tsx`
     beside it, and the save schedule in `packages/core/hooks/useNoteBodySave.ts`)
   - `mentionableUsernames` on `NotesResponse` and `NoteCommentUser` in `packages/contracts/notes.ts` (removed: no `@`
     menu, and a comment includes its author), `NOTE_UPDATE_MAX_CHARS` (now `NOTE_HTML_MAX_CHARS`), `noteSyncPayload`,
     `noteCommentThreadPayload`, `noteCommentWritePayload`, and `noteCommentReactionPayload` in
     `packages/contracts/payloads.ts` (now `noteBodyPayload`; `noteCommentPayload` is now the plain-text body),
     `isNoteBodyChanged` in `apps/api/note/noteBadges.ts` (removed: the save route compares the two bodies as strings),
     the `ydoc` column on `notes` and the `note_comment_threads` table (now `notes.version` beside `notes.html`, and
     `note_comments` with a `note_id` and a text `body`), `isTopicOwner` on a `Note` (now `isNoteOwner`; the topic
     contract keeps `isTopicOwner`), and the `@blocknote/*` packages, `yjs`, `y-prosemirror`, and `y-protocols`
     (removed from `apps/web` and `apps/api`; `react-native-enriched-html` is the editor)

5. **Cross-harness enforcement parity**: `.claude/settings.json` hooks and
   `.opencode/plugin/guardrails.mjs` must gate the same operations with the
   same scripts. Compare the tool/event coverage of each adapter against the
   other and flag any operation one gates and the other doesn't. Confirm both
   invoke only `scripts/check-comment-groups.sh` and `scripts/check-structure.sh`,
   and that no check logic lives inline in an adapter.
   > 2026-07-10: Both scripts verified dual-mode by execution (per-file `$1`
   > arg and stdin `tool_input.file_path` JSON). No enforcement gap existed:
   > check-structure's count was always repo-wide and correct; the suspected
   > "stdin gap" was a mis-constructed test (jq hanging on terminal stdin).
   > Real fixes: dual-mode input for contract parity, and loud jq guards in
   > both scripts (missing jq now exits 2 with a message, never hangs, never
   > passes silently).
6. **Gitignore coverage**: `.opencode/node_modules/`, `.opencode/package.json`,
   `.opencode/package-lock.json`, `apps/*/node_modules/`, `packages/*/node_modules/`, and any tool cache dirs
   must be ignored; confirm none are tracked or staged.
7. **Untracked strays**: anything in `git status` that is neither deliberate
   source nor covered by `.gitignore`; classify each as commit, ignore, or
   delete with a one-line reason.
8. **skills-lock.json integrity**: every skill it records exists on disk in
   `.agents/skills/`, and every vendored skill on disk is recorded.
9. **Always-on context matches canonical skills**: `domain-model/SKILL.md` is
   the single source for domain nouns and rejected terms; `AGENTS.md` points at
   it and repeats no noun list of its own. The AGENTS.md skills index lists
   every skill present in `.agents/skills/`, and every module AGENTS.md states
   only what is true of that module alone.
10. **AGENTS.md matches the tree**: every folder, entry point, and script the
    root AGENTS.md and each module AGENTS.md name exists as described, and no
    module has grown a subsystem its AGENTS.md omits. Spot-check by listing
    each module's folders against its doc's layout bullet.

11. **Prompts do not restate what the code already holds**: check each prompt
    body under `packages/models/prompts/` for a hand-typed list of source kinds,
    visibilities, frequencies, or findings limits, and compare it against
    `packages/contracts/sources.ts` and `packages/contracts/enums.ts`. A prompt takes such a list as a
    variable, the way `chat-glossary.md` takes `{{sourceOptions}}`. The
    `prompt-authoring` skill's Prompt fragments section is the rule.
12. **One wording, one prompt fragment**: when two prompts under `packages/models/prompts/`
    share the same paragraph or rule, it belongs in a prompt fragment that both prompts splice, as
    `chat-glossary.md` and `chat-conduct.md` are spliced. Diff the prompt bodies
    against each other for repeated sentences and flag any that a prompt fragment
    should own. The `prompt-authoring` skill's Prompt fragments section is the rule.

Report as a table: finding, file(s), which rule it violates, proposed fix.
Then stop.