## Why

The pipeline now produces Findings, but nothing renders them: there is no way to see a Topic's Feed, thumb a Finding, or mark it consumed. This change (MVP roadmap item 3) gives the Feed a face — the signed-in homepage from the committed design export — and in doing so lands the first real `api/` endpoints and the `ui → api` type edge the rest of the app builds on.

## What Changes

- Build the homepage from the committed design export at `docs/design/homepage.html` (Claude Design export): dark hero band, overlapping search, and the collapsible Topic sections **Your topics → Featured → Popular**, each listing a Topic's Resources typed **read / watch / listen**, with ⓘ popovers, Latte/Dark-roast theming, and the wide/narrow responsive layouts. Motion and copy follow the design spec.
- Present the homepage as a per-user **inbox**: every Finding shows with read (consumed) rows muted by default, an **All / Unread** toggle narrows to unread, and "N new" counts unread. Per-Resource **thumbs** (up/down, writing `findings.rating`) and the **mark-read/unread** control live in the Resource ⓘ popover. Opening a Resource marks it read automatically. (The Feed API still defaults to unconsumed; the inbox's default "All" view requests consumed-included and the UI mutes them.)
- Land the first real `api/` (Hono): `GET` the assembled Feed (Topics → Findings → Resources, default-unconsumed), `POST` a rating, and mark/unmark consumed — exporting `AppType` so the UI drives it through a Hono RPC client. **This is the `ui → api` type edge** (types only; `api` emits declarations, `verbatimModuleSyntax` keeps value imports explicit).
- Add per-user consumed-state persistence: a new `consumptions` table. Per the consumed-state design, this state is **per-user, not on the Finding** — building it per-user now makes launch-week auth a wiring step, not a migration. (Pre-auth, the seed's single user stands in.)
- Add the Feed/rating/consumed **wire-contract Zod schemas** to `shared/` (UI-validated payloads), and consume the shared enum arrays for Resource-kind labels.
- Add an idempotent, **dev-only seed script** in `db/` that hydrates stub Topics, Sources, Scans, Resources, and Findings against the Neon **dev** branch (via Doppler dev), so the homepage has data before real Scans run. Wired as a `db:seed` script (README Development section updated in the same change).
- **Prerequisite, NOT in this change:** the `shared/` module lands first as a trunk commit — module scaffold, tsconfig project-reference wiring, and the const enum-array move out of `db/schema.ts`. Per the Architecture timing rule, structural graph changes ride trunk, never a feature branch. This change assumes `shared/` exists and adds the feed wire contracts to it.

## Capabilities

### New Capabilities

- `feed-api`: the HTTP contract the UI (and later MCP) reads the Feed through — assemble-and-return a user's Feed with the default-unconsumed filter, record a rating, and mark/unmark consumed — served by Hono and exposing `AppType` for the typed client.
- `feed-homepage`: the signed-in homepage UI built from the committed design export — Topic sections, read/watch/listen Resource rows, ⓘ popovers (Topic details; per-Resource summary, read/unread, and thumbs), the All/Unread inbox toggle, theming, motion, an ambient background, a loading skeleton, and responsive layouts — driven by `feed-api` through the shared wire contract.

### Modified Capabilities

- `domain-schema`: add a `consumptions` table recording per-user consumed state for a Finding (unique per user + Finding), with its migration. Existing tables are untouched; the `rating` column already lives on `findings`.

## Impact

- Code: `ui/` (the homepage, first real components + fonts + theme), `api/` (first real Hono routes + `AppType`), `db/` (`consumptions` table, generated migration, `seed.ts`), `shared/` (feed/rating/consumed Zod contracts), `package.json` + `README.md` (`db:seed` script), and tsconfig references for the `ui → api` (types-only) and `→ shared` edges.
- Dependencies: add `hono` (server + `hono/client` RPC). No change to existing tables, adapters, the Scan pipeline, or the worker.
- Data: the seed writes only to the Neon dev branch and is guarded against non-dev environments; it is idempotent (safe to re-run).
