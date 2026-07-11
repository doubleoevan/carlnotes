---
name: git-discipline
description: >
  Git workflow rules. Use whenever changes have been made to files and a
  commit is being considered, suggested, or written: every commit message,
  every commit, every push decision. Covers commit approval, the never-push
  rule, diff review, and Conventional Commits message format.
---

# Git Discipline

### Commits require approval

Ask before running `git commit`. "Go ahead" at session start pre-approves
commits for that session. NEVER push unless explicitly asked to; pushing is usually manual and human.
Before suggesting a commit, review the full diff: the message must describe
what actually changed, not what was intended.

### Commit message format: Conventional Commits

`type: subject` with a lowercase imperative subject, no trailing period,
under 72 characters.

Types: feat, fix, chore, docs, refactor, test, build, ci.

- feat means user-facing product capability only. Tooling, scaffolding,
  hooks, and developer experience are chore.
- Scope is optional and lowercase: `feat(db): add topic schema`.
- Breaking changes: append `!` after the type and explain in the body.

### Commit message body

Plain English, readable with zero project context. Never reference internal
planning artifacts: no "Day N", phase numbers, sprint names, or task labels.
Bullets over prose for multi-part changes. Wrap at 72 characters.

    chore: add agent tooling, enforcement hooks, and local model proxy

    - LiteLLM proxy via docker compose with three model aliases
    - blocking hooks for comment discipline and single-package structure

### Staging

Stage every file as soon as you finish changing it: `git add <path>`, explicit
paths only. Staging needs no approval and no announcement; it is the hand-off.

- Stage after each change, not at the end of the session. An unstaged fix is
  invisible to `git diff --staged` review and will drift out of the commit.
- Re-stage a file every time you touch it again; the index must always match
  the work you consider done.
- Never `git add -A`, `git add .`, or `git add -u`: bulk staging sweeps in
  files you did not touch, including untracked strays.
- Never stage files you did not change; never unstage work you did not stage.
- The human reviews `git diff --staged` as one changelist. Commits still
  require explicit approval; pushing is always human.