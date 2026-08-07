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
   or removed in a change, add its old name here in the same change.
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
     `topic/TopicScanRecap.tsx`), `SearchFilters.tsx` (folded into `layout/SearchBar.tsx`)
   - `ui/src/components/search/` (proposed then abandoned; SearchBar lives in `layout/`)
   - `layout/AnchorLink.tsx`, `layout/ConfirmDialog.tsx`, `layout/FileDropZone.tsx` (now
     `ui/src/components/common/`). `layout/` keeps only page chrome: Header, Footer, SearchBar,
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
9. **Always-on context matches canonical skills**: the domain nouns and
   rejected terms in `AGENTS.md` match `domain-model/SKILL.md` exactly, and
   the AGENTS.md skills index lists every skill present in `.agents/skills/`.

Report as a table: finding, file(s), which rule it violates, proposed fix.
Then stop.