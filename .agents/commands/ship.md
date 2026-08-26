---
description: Run the full pre-push ship ritual for the current OpenSpec change. Usage: /ship [no-ponytail]
---

# Ship

Run the pre-push ritual for the current OpenSpec change, strictly in order.
Stop and report at the first failure. Never skip a step.

## 0. Structural audit, conditional

If the diff touches `skills-lock.json`, `.agents/`, `openspec/`,
`.claude/settings.json`, or `.opencode/plugin/`, run /audit-structure first
and resolve its findings before proceeding. Skip silently when none of those
paths changed.

## 0b. Module docs match the tree

Always runs. AGENTS.md says structure changes update the docs in the same
change; this is where that gets checked, in both directions.

Forward, from the diff: `git diff --cached --name-status main` names every path
the change adds, moves, renames, or deletes. For each one that is a folder, an
entry point, or a `package.json` script, confirm the module's own AGENTS.md
says so, and that the root module map and routing table still read true. A new
file inside a folder those docs already describe generically needs nothing; a
new folder, a moved or renamed entry point, and a deleted script always do. A
changed script also updates the README's Development section, and a moved
generated or archived path also updates the root "Never read" list.

Backward, from the docs: every path named in an AGENTS.md still has to exist.

    grep -rnoE '`[a-zA-Z0-9_./-]+/`' AGENTS.md */AGENTS.md | tr -d '`'

Each hit prints as `file:line:path`, and the path reads relative to that
module, so `pages/` in `ui/AGENTS.md` is `ui/src/pages/`. Resolve each one
against its own module. A path that no longer resolves is drift the change
introduced or left behind.

Fix the docs in this change. Never file it as follow-up work.

## 1. Verify the spec

Follow the /opsx:verify workflow: check the implementation against the
change's artifacts in `openspec/changes/<name>/`. Report any drift between
spec and implementation, and stop if drift is found.

## 2. Mechanical gates

Run: bash scripts/preflight.sh
This runs Biome, the type check, and the test suite. All three must be green.

## 3. AI review: CodeRabbit + Gemini, both by default

The agent shell has no Doppler-injected secrets, so check for the key without
printing it: doppler run -- bash -c 'test -n "$CODERABBIT_API_KEY"'.

If present, authenticate and run CodeRabbit under Doppler in the background.
Defer variable expansion into the Doppler-injected subshell (a bare
`--api-key "$CODERABBIT_API_KEY"` expands empty in the outer shell before
doppler run starts):
- doppler run -- bash -c 'coderabbit auth login --api-key "$CODERABBIT_API_KEY"'
- doppler run -- bash -c 'coderabbit review --agent --type all --base main'
  If the key is not set (in Doppler or the shell), or CodeRabbit rejects it
  (e.g. a user key where the CLI needs an agentic key), report that CodeRabbit
  was skipped and why, and continue — never fail the ritual on a missing or
  invalid key.

Always run Gemini:
- gemini /code-review (reviews the current branch; if non-interactive
  invocation fails, say so and run it interactively before continuing)

Fix every critical and major finding from every reviewer that ran. Where
CodeRabbit and Gemini both ran and agree, fix without debate. Re-run until
clean or only dismissible nits remain, and list any findings you dismissed
and why.

## 3b. Ponytail pass, default on

Run /ponytail-review and apply its delete-list before the manual review
handoff. Skip only when the command arguments ($ARGUMENTS) include
"no-ponytail". If the ponytail plugin is not installed, report that and
continue; never fail the ritual on a missing reviewer.

## 3c. Naming and comment audit

Read the diff as a stranger with no project context would. Every folder, file,
function, and variable name must say what the thing is without a comment
explaining it. Review the codebase and match the conventions already in it. 
The `code-style` skill is the reference for naming rules, not this file. Where the diff
introduces a term that already exists under another name, adopt the existing
one.

Every comment justifies itself or gets deleted:
- Keep: a short sentence explaining why a non-obvious choice was made.
- Delete: restatements of the code, decision history, "NOT X" notes, migration
  narrative, and anything a reader would skip.
- Delete the trailing justification, the definition by negation, and the
  downstream narrative: a clause after "since" or "because" that argues for the
  fact before it, a comment saying what the thing is not instead of what it is,
  and any note about what some other module does with the value. Sweep `//`,
  `/** */`, and `{/* */}` alike — a JSX comment hides from a grep written for
  the other two.

Comments are current documentation, not a record of how the code got here.
They should be clear, concise, human-readable sentences that are genuinely helpful.
Rename and rewrite in this pass instead of filing follow-up work. Report what
you changed and why.

## 4. Manual review handoff

Summarize the full diff for human review: each file, what changed, and why.
Then STOP, show the suggested commit message, and wait for explicit approval.
Do not proceed without it.

## 5. Archive the change

Determine the name yourself: run `openspec list`. If exactly one change is
open, use it without asking. If several are open, ask which one to archive.
Then run: openspec archive <change-name> --yes
Always the CLI, never /opsx:archive. The archive is included in the same push as
the code.

## 6. Commit

Confirm `git status --short` shows no unstaged modifications. Always show
the suggested commit message first (git-discipline skill, Conventional
Commits) — this never skips. Then ask before running `git commit`, unless
commits were pre-approved at session start; pre-approval skips the ask, not
the message. NEVER push unless explicitly asked to.