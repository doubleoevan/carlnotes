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
shadcn components (`ui/src/components/ui/`), tool caches
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
     `<kind>Adapter` (now `<kind>Ingester`). "adapter" now means only a third-party interface shim,
     as in Better Auth's `drizzleAdapter` and Hono's `serveStatic`, which keep the word
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
     the pipeline itself is `worker/workflows/run-topic-scan-activities.ts`)
   - `toFilteredFindings` (now `toSortedFindings`)
   - `toOfferedUrls`/`OfferedUrlSources` (now `toPossibleSourceUrls`/`PromptSourceUrls` in `ui/src/lib/utils.ts`
     and `EditTopicModal.tsx`), `ScanNoteText` (now `SafeNoteText`), `loadScan` in the scan activities
     (now `requireScan`), `db:encrypt-chat` and `api/encryptChatBackfill.ts` (removed)
   - `SourceEditor.tsx` (now `TopicSourceEditor.tsx`)
   - "web scout" (now "web search", in UI copy and specs alike) — the built-in Source that
     searches the web, distinct from the `search` Source kind that names it in code
   - `emit` as the verb for what an ingester hands back (now "find" for discovering a page,
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
   - `carries` / `carrying` in comments (now `includes` when one thing holds another, `has` for an attribute,
     `sends` for something transmitted), `rather than` (now `instead of`), `rides with` (now `goes with`),
     `steers` (say what it sets or bounds), `lands in` (now `is included in`), `wears` (now `shows`),
     and em dashes in comments (use a comma or a second sentence). figurative words for a UI surface
     are out too: `chrome` and `furniture` both named the title bar and are now just what it is
   - `viewer` for the person on the page (now `user` when signed in, `visitor` when not; the
     domain-model skill owns the split). `viewerRole`/`viewerUserId`/`isViewerLeader`/`viewerId`/
     `isViewerMember`/`viewerTeams`/`viewerRequest`/`loadViewerRooms` are now `role`/`userId`/
     `isLeader`/`userId`/`isMember`/`userTeams`/`joinRequest`/`loadChatRooms`, and `loadProfile`'s
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
   `.opencode/package-lock.json`, `ui/node_modules/`, and any tool cache dirs
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

Report as a table: finding, file(s), which rule it violates, proposed fix.
Then stop.