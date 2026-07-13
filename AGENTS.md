# CarlNotes agent rules (always-on)

- Comment every logical group: `//` comment line(s) above every group of 2+ statements, one line preferred.
- One package.json. Folders separate concerns; packages separate deployments.
- Domain nouns: Topic, Source, Scan, Resource, Finding, Feed, Subscription, Audience, Integration. Never Channel, Item, Update, Run, or Group.
- Module boundaries: ui never imports api, worker, or db; api and worker import db; db imports nothing app-level. Enforced by tsconfig project references (`bunx tsc -b`).
- Per-process scripts are `dev:<module>` / `build:<module>`; bare `dev` and `build` are reserved (multi-process orchestrator; container image). When adding or changing package.json scripts, update the README Development section in the same change.
- Commits: ask first. "go ahead" at session start pre-approves commits for that session. Never push unless explicitly asked to.
- Ship via /ship. Archive OpenSpec changes with the CLI (`openspec archive <name> --yes`), never /opsx:archive.

## Skills
Rules agents and reviewers must honor, canonical at `.agents/skills/`:
- domain-model: canonical vocabulary: Topic, Source, Scan, Resource, Finding, Feed, Subscription, Audience, Integration; never introduce Channel, Item, Update, Run, Group
- adapter-authoring: adapters emit Resources only, never Findings; idempotent by canonical URL; one failing Source never aborts a Scan batch
- code-style, jsx-conventions, git-discipline: shared readability and git rules
- vendored guidance: vercel-react-best-practices, web-design-guidelines, ai-sdk, impeccable, ponytail