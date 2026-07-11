# AI Scaffolding

How CarlNotes constrains AI-generated code. One canonical rule per concern,
deterministic gates at generation time, probabilistic reviewers layered on
top, and a human at exactly two decision points.

## The problem

AI agents write most of this codebase. Agents drift: they invent vocabulary,
duplicate structure, leave dead scaffolding, and skip conventions they were
told once. Review-time correction does not scale because the correction
itself is probabilistic. The fix is structural: enforce rules at generation
time with deterministic tools, use AI reviewers only for judgment, and keep
every rule in exactly one file so nothing can disagree with itself.

## Design rules

1. Determinism where possible, probability only where necessary. Formatters,
   type checkers, and hooks catch their rule set 100% of the time. LLM
   reviewers sample. When a reviewer finds the same issue twice, promote it
   to a deterministic rule.
2. Constraints at generation time, not review time. A hook that blocks a bad
   write beats a reviewer that flags it later. Advisory constraints drift;
   only exit-nonzero holds.
3. One canonical home per rule. Authored rules live in one file; per-tool
   paths are symlinks. Generated files stay where their generator puts them.
4. Gates fail loud, never hang, never fail open. Missing dependency: exit 2
   with a message. Wait loop: bounded with a timeout.
5. Independent reviewers with a triage protocol. Two engines agree: fix.
   Repeated nit: promote to a hook. Otherwise: dismiss with a reason. Two
   consecutive clean passes end review.
6. The human gates two moments: the staged changelist and the push. Agents
   stage every change as they make it. Agents never push.

## How it's built

### One canonical home for authored rules
Every authored rule is one file under `.agents/`; tools that read the open
standard get it natively, tools that don't get symlinks. Vendored skills pin
via a lockfile.
[domain-model](../.agents/skills/domain-model/SKILL.md) ·
[adapter-authoring](../.agents/skills/adapter-authoring/SKILL.md) ·
[git-discipline](../.agents/skills/git-discipline/SKILL.md) ·
[skills-lock.json](../skills-lock.json)

### Always-on context
[AGENTS.md](../AGENTS.md) carries the rules that apply on every keystroke:
comment discipline, one package.json, the domain nouns, module boundaries,
script naming, and commit approval. [CLAUDE.md](../CLAUDE.md) imports it and
adds only Claude Code specifics. A standing rule keeps package.json scripts
and the README in sync in the same change.

### Deterministic gates at generation time
Two scripts hold the check logic; each agent harness gets a thin adapter
that translates its hook protocol into "run the scripts." Both scripts take
a path argument or hook JSON on stdin, and fail loud when jq is missing.
[check-comment-groups.sh](../scripts/check-comment-groups.sh) ·
[check-structure.sh](../scripts/check-structure.sh) ·
[.claude/settings.json](../.claude/settings.json) ·
[guardrails.mjs](../.opencode/plugin/guardrails.mjs)

### A push gate no one can walk around
`git push` runs [preflight.sh](../scripts/preflight.sh) through a
repo-routed [pre-push hook](../.githooks/pre-push): Biome, tsc, tests.
`bun run check` runs the same script on demand, so "green" has one
definition. [biome.json](../biome.json) excludes vendored trees so the
gate judges only authored code.

### Layered AI review
The `/ship` ritual runs CodeRabbit and Gemini locally; the CodeRabbit
GitHub App reviews every PR. [.coderabbit.yaml](../.coderabbit.yaml) feeds
the project's own skills to the reviewer as guidelines, so review enforces
the same