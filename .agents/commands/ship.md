---
description: Run the full pre-push ship ritual for the current OpenSpec change. Usage: /ship [no-ponytail]
---

# Ship

Run the pre-push ritual for the current OpenSpec change, strictly in order.
Stop and report at the first failure. Never skip a step.

## 1. Structural audit, conditional

If the diff touches `skills-lock.json`, `.agents/`, `openspec/`,
`.claude/settings.json`, or `.opencode/plugin/`, run /audit-structure first
and resolve its findings before proceeding. Skip silently when none of those
paths changed.

## 2. Module docs match the tree

Always runs. AGENTS.md says structure changes update the docs in the same
change; this is where that gets checked, in both directions.

Forward, from the diff: `git diff --name-status <origin/main sha>` (after
`git fetch origin main`, since a local main goes stale) plus
`git ls-files --others --exclude-standard` for the untracked files names every
path the change adds, moves, renames, or deletes, staged or not. For each one
that is a folder, an entry point, or a `package.json` script, confirm the
module's own AGENTS.md says so, and that the root module map and routing table
still read true. A new file inside a folder those docs already describe
generically needs nothing; a new folder, a moved or renamed entry point, and a
deleted script always do. A changed script also updates the README's Development
section, and a moved generated or archived path also updates the root "Never
read" list.

Backward, from the docs: every path named in an AGENTS.md still has to exist.

    grep -rnoE '`[a-zA-Z0-9_./-]+/`' AGENTS.md apps/*/AGENTS.md packages/*/AGENTS.md | tr -d '`'

Each hit prints as `file:line:path`, and the path reads relative to that
module, so `pages/` in `apps/web/AGENTS.md` is `apps/web/src/pages/`. Resolve each one
against its own module. A path that no longer resolves is drift the change
introduced or left behind.

Fix the docs in this change. Never file it as follow-up work.

## 3. Verify the spec

Follow the /opsx:verify workflow: check the implementation against the
change's artifacts in `openspec/changes/<name>/`. Report any drift between
spec and implementation, and stop if drift is found.

## 4. Mechanical gates

Run: bash scripts/preflight.sh
This runs Biome, the type check, and the test suite. All three must be green.

## 5. Security and performance audit

Audit what the diff adds or changes from two sides, with read-only agents in
parallel: one for security, one for performance and scaling. The
`cc-autopilot:security-auditor` and `cc-autopilot:performance-engineer` agent
types fit; without them, a general-purpose agent takes the same brief. For a
large diff, split each side by area, as step 10 does. Give each agent the diff
against origin/main, the list below, and one rule: every finding names a file
and line, a concrete failure scenario, and a severity.

Security:
- Authorization on every new or changed route, tool, and gate, on every path
  that reaches the data, and what a visitor or another user can read.
- Input at each trust boundary is validated and bounded, and an oversized value
  gets a 4xx, never a 500.
- Injection: SQL goes through Drizzle, and untrusted text in a model prompt is
  fenced as data (the `prompt-authoring` skill). Output encoding in the ui,
  redirects, and urls built from input.
- Secrets and keys are never logged or returned.
- Every paid model call sits behind the budget gate and a rate limit.

Performance and scaling:
- Queries per request, N+1 loops, and an index for each new query's filter.
- Migrations take a lock timeout and change a busy table in one ALTER.
- Work in a hot path: per request, per chat turn, per sweep owner.
- What the browser loads: bundle and payload size, and what loads before the
  first tap.
- Lifetimes: streams, audio nodes, timers, listeners, and connections close,
  and a paid call that the user abandons stops or is accounted for.

Check each finding against the code before fixing it: a finding counts only if
its scenario holds. Fix every critical, high, and medium finding in this change,
whether or not this diff introduced it, the way step 8 fixes its critical and
major ones. Fix a low finding too if the change can do it now, or list it with
the reason it waits. Rerun step 4, and report each finding as fixed, kept on
purpose with the reason, or left for the user. Its fixes go through the DRY and
long-file passes next.

## 6. DRY audit and fix

Find every second copy that the diff adds or keeps, and give it one shared home
in this change: logic, a type, a constant, a user-facing label, a style class,
an api contract, or a test fixture. Compare the diff against itself and against
the codebase: grep for each new function's core expression, each new type's
fields, each new string a user reads, and each repeated class list. A second
copy gets a shared helper now (code-style rule 18).

Put the shared piece where every caller can import it without side effects: a
client for an api call, a `packages/contracts/` module for a type the api and the ui both
read, `apps/web/src/lib/styleClasses.ts` for a class list. Leave apart code that only
looks alike but means different things, and two components whose jobs differ
enough that sharing would take a flag per difference. Fix every copy in this
pass, rerun step 4, and report what was shared, where it now lives, and what was
left apart and why.

## 7. Long files: report and split

List every file that the diff adds or changes with its line count, longest
first, beside its line count on origin/main: `git diff --name-only <origin/main sha>`
plus the untracked files, then `wc -l` and `git show <origin/main sha>:<path>`.
Generated, vendored, fixture, and result files are exempt. A file whose diff
changes only its import lines, as when a module it imports moves or is renamed,
does not count as added, changed, or touched here: leave it off the list and
never split it for this change.

About 400 lines is the guide, not a hard cutoff. A file a little over it that
holds one concern can stay whole; the line count is a reason to look, and the
concerns decide.

- A file that this diff adds well over 400 lines or grows well past 400, or that
  holds more than one concern after the diff, gets split in this change even if
  the moved code has one caller: a page's menu into its own component, shared
  options into their own module, pure helpers out of a module that sets
  something up on import. Split within the module, name each new file for what
  it holds, and update every doc that lists the module's files, its AGENTS.md
  first (step 2).
- A file that was well over 400 lines on origin/main and that the diff only
  touches, beyond its import lines, is split in this change too, by the same
  rule. Thorough beats narrow: a split the change can do now is done now, never
  filed as its own change. A file left whole goes in the report with the reason
  it is one concern.

Rerun step 4, and report each long file, what was split out of it, and each file
left whole with the reason.

Run step 6 before step 7. Sharing a copy changes which files are long, and a
split made first can put two copies in two files where neither looks repeated.

## 8. AI review: CodeRabbit + Gemini, both by default

The agent shell has no Doppler-injected secrets, so check for the key without
printing it: doppler run -- bash -c 'test -n "$CODERABBIT_API_KEY"'.

If present, run CodeRabbit under Doppler in the background. The review takes the
key inline, so it needs no separate login. Defer variable expansion into the
Doppler-injected subshell (a bare `--api-key "$CODERABBIT_API_KEY"` expands empty
in the outer shell before doppler run starts). Compare against origin/main's
commit, since a local main goes stale: run `git fetch origin main` and
`git rev-parse origin/main`, and paste that sha in:
- doppler run -- bash -c 'coderabbit review --agent --include-untracked --base-commit <origin/main sha> --api-key "$CODERABBIT_API_KEY"'
  The last line it prints lists the reviewedFiles. Count the pass only if every
  changed file is in that list, new files included. The new files have turned up
  staged after the reviews run, so run `git reset -q` once they finish and stage
  paths on purpose at the commit step.
  If the key is not set (in Doppler or the shell), or CodeRabbit rejects it
  (e.g. a user key where the CLI needs an agentic key), report that CodeRabbit
  was skipped and why, and continue — never fail the ritual on a missing or
  invalid key.

Always run Gemini:
- gemini /code-review (reviews the current branch; if non-interactive
  invocation fails, say so and run it interactively before continuing)

Fix every critical and major finding from every reviewer that ran, whether or
not this diff introduced the problem: a real finding in code the change touches
or depends on is fixed in this change, never deferred as pre-existing. Where
CodeRabbit and Gemini both ran and agree, fix without debate. Dismiss only a
finding that is wrong, or one that needs a decision the user has to make, and
list each dismissed finding with the reason. Re-run until clean or only
dismissible nits remain. A fix that adds a second copy of something, or grows a
file past the guide, goes back through steps 6 and 7 for the files it touched.

## 9. Ponytail pass, default on

Run /ponytail-review and apply its delete-list before the manual review
handoff. Skip only when the command arguments ($ARGUMENTS) include
"no-ponytail". If the ponytail plugin is not installed, report that and
continue; never fail the ritual on a missing reviewer.

## 10. Aggressive audit: comments, naming, and new terms

Right before the manual review, audit the whole diff three ways, aggressively,
with the codebase as the reference for every finding: name the existing
convention that a finding compares against. For a large diff, split the read
across parallel read-only audit agents by area, such as the app code, the evals,
the worker and config, and the docs and specs, then apply the fixes yourself.

1. **Comments: clarity and relevance.** Every comment justifies itself or gets
   deleted. Sweep `//`, `/** */`, `{/* */}`, and `#` alike. A JSX comment
   hides from a grep written for the others.
   - Keep: a short sentence explaining why a non-obvious choice was made.
   - Delete: restatements of the code, decision history, "NOT X" notes,
     migration narrative, and anything a reader would skip.
   - Delete the trailing justification, the definition by negation, and the
     downstream narrative: a clause after "since" or "because" that argues for
     the fact before it, a comment saying what the thing is not instead of what
     it is, and any note about what some other module does with the value.
   - Check each comment against the code. A comment that is no longer true
     gets rewritten.
   Comments are current documentation, not a record of how the code got here.
   They should be clear, concise, human-readable sentences that are genuinely
   helpful.
2. **Naming: self-documentation.** Read the diff as a stranger with no project
   context would. Every folder, file, function, and variable name must say what
   the thing is without a comment explaining it, and match the names its
   siblings already use. The `code-style` skill is the reference for naming
   rules, not this file.
3. **New terms and phrasing.** A second name for something the codebase already
   names, coined jargon, a rare word where a common one is accurate, and every
   rejected term in the `domain-model` skill and code-style rule 17. Where the
   diff introduces a term that already exists under another name, adopt the
   existing one. Branding stays in customer copy. Code, comments, and change docs
   say what the thing does.

Apply every clear-cut finding and every judgment call you agree with. Rename
and rewrite in this pass instead of filing follow-up work, then rerun step 4.
Report what you changed, and each finding left alone with the reason.

## 11. Manual review handoff

Summarize the full diff for human review: each file, what changed, and why.
Write the long report to `logs/ship-report.md` and give its path in the
handoff: the reports from steps 5, 6, 7, and 10, every reviewer's findings with
the ones dismissed and why, and recommendations. A recommendation is only
work that needs the user's decision; anything the change could do, it has done.
Then STOP, show the
suggested commit message, and wait for explicit approval. Do not proceed
without it.

## 12. Archive the change

Determine the name yourself: run `openspec list`. If exactly one change is
open, use it without asking. If several are open, ask which one to archive.
Then run: openspec archive <change-name> --yes
Always the CLI, never /opsx:archive. The archive is included in the same push as
the code.

## 13. Commit

Confirm `git status --short` shows no unstaged modifications. Always show
the suggested commit message first (git-discipline skill, Conventional
Commits) — this never skips. Then ask before running `git commit`, unless
commits were pre-approved at session start; pre-approval skips the ask, not
the message. NEVER push unless explicitly asked to.