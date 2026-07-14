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
   - `use-ai-sdk` (skill renamed upstream to `ai-sdk`)
    - `"recommended": true` in Biome config (deprecated in Biome 2.5+; the current form is
      `"preset": "recommended"`)
    - `bunx tsc --noEmit` (now `bunx tsc -b`; the old form silently checks nothing
      against a solution-style root)

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