# Contributing to CarlNotes

One script owns setup. No .env files, no shell configuration, no steps that live in anyone's head.

### Prerequisites

- Docker Desktop
- Bun
- Doppler CLI (`brew install dopplerhq/cli/doppler`)
- `jq` (`brew install jq`) - the enforcement hooks use it

### Setup: pick one

**Option A: Doppler (recommended)**

    # authenticate, one time per machine
    doppler login

Create a free Doppler project named `carlnotes` with a `dev` config and set
the secrets from `.env.example`.

**Option B: plain .env**

    cp .env.example .env
    # fill it in

### Start everything

    bash scripts/carl-up.sh

One command, either option: the script detects your secrets source, links
Doppler when present, routes the git hooks, installs carl-up and carl-down
as shell commands, starts Docker if needed, and boots the LiteLLM proxy at
http://localhost:4000 (dashboard at /ui). From your next terminal on:
carl-up to start, carl-down to stop.

### Gates

Every push runs `scripts/preflight.sh` through the pre-push hook: Biome, the
type check, and the test suite, all green or the push is rejected. Run the
same gate anytime with `bun run check`. Never bypass with `--no-verify`.
Edit-time hooks also block comment-discipline and structure violations as
agents write; the rules live in `.agents/skills/`.

### Review tools

`/ship` runs CodeRabbit and Gemini as reviewers. One-time setup per machine:

    # CodeRabbit: sign in with GitHub
    coderabbit auth login

    # Gemini: key from aistudio.google.com/apikey
    echo 'GEMINI_API_KEY=...' > ~/.gemini/.env && chmod 600 ~/.gemini/.env

Machine credentials, never repo secrets. Doppler stays app-runtime only.

### Agents

- Claude Code works out of the box on your subscription: planning and design-heavy work
- OpenCode does spec-driven apply work through LiteLLM; carl-up mints its capped `dev` key automatically on first boot. Open a new terminal after the first run
- Custom commands live in `.agents/commands/` and load in both agents: `/ship` runs the full pre-push ritual (gates + both reviewers), `/audit-structure` checks the tooling layout for drift
- The pre-push hook runs the same gates no matter which agent, or human, pushes

### Secrets

Doppler is the canonical path. A gitignored local `.env` works as the
no-account fallback; never commit one. `.env.example` documents the shape.