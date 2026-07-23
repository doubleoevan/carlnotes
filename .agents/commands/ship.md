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

## 4. Manual review handoff

Summarize the full diff for human review: each file, what changed, and why.
Then STOP, show the suggested commit message, and wait for explicit approval.
Do not proceed without it.

## 5. Archive the change

Determine the name yourself: run `openspec list`. If exactly one change is
open, use it without asking. If several are open, ask which one to archive.
Then run: openspec archive <change-name> --yes
Always the CLI, never /opsx:archive. The archive lands in the same push as
the code.

## 6. Commit

Confirm `git status --short` shows no unstaged modifications. Always show
the suggested commit message first (git-discipline skill, Conventional
Commits) — this never skips. Then ask before running `git commit`, unless
commits were pre-approved at session start; pre-approval skips the ask, not
the message. NEVER push unless explicitly asked to.