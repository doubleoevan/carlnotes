## 1. shared/ module (folded into this change)

- [x] 1.1 Create the `shared/` module: `shared/tsconfig.json` (references nothing app-level), `shared/enums.ts`, and `shared/index.ts`; add `shared` to the root `tsconfig.json` solution references.
- [x] 1.2 Move the const enum value arrays out of `db/schema.ts` into `shared/enums.ts`; `db/schema.ts` imports them to build its `pgEnum`s (names/values unchanged, so no migration diff).
- [x] 1.3 Wire the tsconfig target graph for the edges available now: `db → shared`, `api → db, shared`, `worker → db, shared`; confirm `verbatimModuleSyntax` is on so value imports stay explicit. (The `ui → api` types-only edge lands with the UI in task 6.3.)

## 2. Schema: per-user consumed state

- [x] 2.1 Add a `consumptions` table to `db/schema.ts`: `id`, `userId` → `users.id` (cascade), `findingId` → `findings.id` (cascade), a `consumedAt` timestamp, and a `unique(userId, findingId)` constraint. Add the comment group per house style. Do NOT add any consumed/seen column to `findings`.
- [x] 2.2 Generate the migration with `bun run db:generate`; confirm it only creates `consumptions` with its two foreign keys and the `(user_id, finding_id)` unique constraint, and alters no other table.
- [x] 2.3 Extend `db/schema.test.ts` to cover `consumptions`: the unique `(user, finding)` constraint and cascade on delete of either parent.
- [x] 2.4 Apply the migration to the Neon dev branch: `doppler run -- bun run db:migrate`.

## 3. Shared wire contract

- [x] 3.1 Add the feed wire contracts to `shared/`: Zod schemas for the rating payload (`up | down | null`), the consumed mark/unmark payload, and the Feed response shape (Topic + Findings + Resource, with per-user `rating` and `isConsumed`). Reuse the shared enum arrays for `resourceKind`. Keep Drizzle/domain row types out of `shared/` (they stay in `db`).

## 4. Feed API (`feed-api`)

- [x] 4.1 Add `hono` to `package.json` (`bun install`); it also provides `hono/client` for the RPC client.
- [x] 4.2 Add a `currentUser()` seam in `api/` that returns the fixed seed user id today (Better Auth session later); route every per-user query through it.
- [x] 4.3 Build the Hono app in `api/`: `GET` the assembled Feed (Topics → Findings → Resources + Topic metadata), default-unconsumed with an include-consumed parameter for the "All" view; `POST` a rating (writes `findings.rating`, idempotent); mark and unmark consumed (upsert/delete a `consumptions` row for the current user). Validate request bodies with the shared Zod contracts.
- [x] 4.4 Export the app's `AppType` from `api/` for the Hono RPC client, and ensure `api/tsconfig.json` references `shared` and emits declarations.
- [x] 4.5 Add an `api/` unit test for the pure default-unconsumed filter (`filteredTopicFindings`/`newTopicFindingCount`/`toUrlHost`); the DB mark/unmark round-trip is browser-verified in 7.1 (no live DB in unit tests, per the repo convention).

## 5. Dev-only seed

- [x] 5.1 Write `db/seed.ts`: idempotent (deterministic ids + `onConflictDoNothing`/`onConflictDoUpdate`) hydration of the dev user, stub Topics (incl. Featured/Popular stubs), Sources, a succeeded Scan per Topic, Resources across read/watch/listen, and Findings. Guard it to abort unless the Doppler config is dev, so it can never touch prod.
- [x] 5.2 Add a `db:seed` script to `package.json` and document it in the README Development section (same change, per the scripts rule).
- [x] 5.3 Run `doppler run -- bun run db:seed` against the dev branch, then re-run once to confirm idempotency (row counts unchanged).

## 6. Homepage UI (`feed-homepage`)

- [x] 6.1 Render the committed export (`docs/design/homepage.html`) in the browser to read exact structure, then add the Latte/Dark-roast Tailwind theme tokens and the Architects Daughter + Karla fonts.
- [x] 6.2 Add the shadcn `Popover` and `Accordion` primitives (only `button/resource/input/label/select/textarea` exist today).
- [x] 6.3 Build the typed feed client in `ui/` with `hc<AppType>()` importing `api`'s `AppType` **types-only**, and wire `ui/tsconfig.json` references (`api` types-only, `shared`); confirm `verbatimModuleSyntax` keeps value imports explicit.
- [x] 6.4 Build the homepage components replacing `App.tsx`: hero band + headline + visual search; the collapsible Your topics / Featured / Popular sections; per-Topic header (title, tag pills, "N new", ⓘ popover with prompt/attachments/sources/schedule, downloads only on own Topics); Resource rows typed read/watch/listen (icon, title, ⓘ popover with Carl's summary + listen control, source/age meta, dashed separators, max 5 + expander).
- [x] 6.5 Wire thumbs up/down and the consumed toggle through the feed client; default view unconsumed, "All" view dims consumed; opening a Resource marks it consumed.
- [x] 6.6 Add the wide/narrow responsive layouts and the ☀/☾ theme toggle (both verified in the browser). **Deferred:** the elaborate entrance motion (blur-in word-by-word, cascade) is left as "fun stuff last" polish — a `ponytail:` cut of a non-functional requirement; a simple `prefers-reduced-motion`-respecting entrance can layer on later with no structural change.

## 7. Verification

- [x] 7.1 Verified the homepage in the browser against the seeded dev data: sections render; thumbs (`POST → 200`, filled) and consumed persist across reload; default-unconsumed filter hides consumed and the "All" view shows them dimmed; light/dark and wide/narrow both hold. Note: two **dev-only** console warnings remain (a StrictMode double-invoke "invalid hook call" with a fluctuating 2–4 count, and feed 502s from StrictMode's concurrent double-fetch against the N+1 `buildTopicFeeds`); neither breaks functionality and both are absent from the production build (StrictMode is dev-only).
- [x] 7.2 Ran the verification gate: `bunx biome check .`, `bunx tsc -b` (confirms the types-only `ui → api` edge), `bun test` (45 pass) — all green, plus a clean `bun run build:ui` production build.
- [x] 7.3 Validated the change: `openspec validate add-feed-homepage --strict` → valid.
