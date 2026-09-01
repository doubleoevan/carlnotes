# Tasting Notes tasks

## 1. Foundation: vocabulary, dependencies, schema, contracts

- [x] 1.1 Add the Note row to the domain-model skill's entity table (`.claude/skills/domain-model/SKILL.md` + `.agents/skills/` copy) and verify the noun, page, and visibility wording matches the notes spec
- [x] 1.2 Add `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`, `@blocknote/server-util`, `yjs`, `y-protocols` at pinned versions with `bun install`, and verify no `@blocknote/xl-*` package appears anywhere in `package.json` or the lockfile
- [x] 1.3 Add `noteVisibilities` to `shared/enums.ts` and note payload/response contracts to `shared/contracts.ts` (the page notes response, the create and update payloads, the sync update payload, the opened note with its stored HTML, the comment author shape), verified by `bunx tsc -b`
- [x] 1.4 Add `notes`, `note_comment_threads`, `note_comments` tables to `db/schema.ts` per design D1/D2/D12 (nullable `topic_id`/`team_id` FKs with cascade + CHECK exactly one, `bytea` customType ydoc, partial unique indexes for the private and team/public uniqueness), run `bun run db:generate`, and verify the migration applies and a topic delete cascades note + thread + comment rows in a db test

## 2. Authorization

- [x] 2.1 Add the note access deciders in `api/note/permissions.ts` per design D9 (private owner-only; team = active member of a holding team; public view-all / edit by page owner + holding-team members), verified by unit tests covering each visibility × role matrix row including the visitor and non-member cases

## 3. Sync backend

- [x] 3.1 Implement `api/note/noteStream.ts` mirroring `roomStream.ts` (in-process EventEmitter keyed by note id + pg LISTEN/NOTIFY poke channel), verified by a unit test that a subscriber receives an emitted update and unsubscribes cleanly
- [x] 3.2 Implement snapshot GET (`/api/notes/:id/ydoc`, full doc or state-vector diff) and update POST (base64, advisory-lock merge, durable persist per design D3) in `api/note/notes.ts`, verified by a test that two concurrent posts both survive and a diff GET returns only missing changes
- [x] 3.3 Implement the page GET (`/api/topics/:id/notes`, `/api/teams/:id/notes`) returning the visible notes with the page name, the creatable visibilities, and the mentionable usernames, verified by tests for member, non-member, and visitor shapes
- [x] 3.4 Implement the SSE stream endpoint with chat-matching heartbeat, max age, view-access 404, and `update`/`resync` events per design D4, verified by a test driving one update through the broker to a connected stream
- [x] 3.5 Implement debounced HTML regeneration via `@blocknote/server-util` on save per design D3/D7, verified by a test that a posted update refreshes the stored HTML (and that a checklist round-trips into it)

## 4. Comments backend

- [x] 4.1 Implement thread/comment CRUD routes in `api/note/noteCommentThreads.ts` for `RESTYjsThreadStore` — edit-access checks, ydoc threads-map mutation under the note's advisory lock, resolve/unresolve and emoji reactions, `note_comment_threads`/`note_comments` mirroring, SSE broadcast, `resolveUsers` from `users` — verified by tests for the refused no-edit-access write, the accepted member comment, and mirror-row consistency after add/resolve

## 5. UI: static path

- [x] 5.1 Build `ui/src/clients/noteClient.ts` (page GET, snapshot GET, update POST, SSE URL builder, thread CRUD) typed off `AppType`, verified by `bunx tsc -b`
- [x] 5.2 Build `NotesSection` + `NotesTable` + `NoteVisibilitySelect` + `NoteStatic` in `ui/src/components/note/` — expanded-by-default section, the "Add Note" call to action beside the header (a visitor's leading to the sign-up), visibility dropdown with verbatim tooltips, verbatim empty states, default visibility per design D6 — verified by component tests asserting the exact tooltip and empty-state strings and role-dependent visibility lists
- [x] 5.3 Mount the section on the topic page (`CollapsibleSection`) and the team page (accordion item), verified in the running app: both pages show Notes expanded, static HTML renders, and no editor chunk or SSE request fires on load

## 6. UI: live and edit path

- [x] 6.1 Implement `noteProvider.ts` (SSE apply, resync-coalesced diff refetch, batched POST sends, stubbed `y-protocols` Awareness) and `useNoteSync.ts` lifecycle (connect on live/edit, disconnect on leave/unmount, pause on document hidden, state-vector resync on reconnect), verified by unit tests for batching, resync coalescing, and hidden-tab disconnect
- [x] 6.2 Build the lazily-imported `NoteEditor` (BlockNote + Mantine UI, checklist blocks, slash menu, always-editable live mode, the formatting toolbar with its comment and list buttons, comments via `CommentsExtension` + `RESTYjsThreadStore` with the threads panel, floating composer, and "@" mention menu), verified in the running app: click-in loads the editor chunk, edits persist and appear in a second session, comments render with author identity, and a visitor's public note stays static
- [x] 6.3 Add Carl-voiced sonner toasts for note save/comment failures per house pattern, verified by the strings living at the mutation sites and verbatim spec copy untouched

## 7. Verification gate and docs

- [x] 7.1 Add an integration test asserting the two-state contract: the default page load serves stored HTML with no editor bundle and no SSE connection, click-in connects, and leaving disconnects, verified by `bun test`
- [x] 7.2 Update `api/AGENTS.md`, `ui/AGENTS.md`, `db` notes, and the root routing table for the new `api/note/` and `ui/src/components/note/` folders in the same change, verified by the audit-structure expectations
- [x] 7.3 Run the full gate — `bunx biome check .`, `bunx tsc -b`, `bun test` — and verify green

## Verification notes

- Offline gate: `bunx biome check .` + `bunx tsc -b` + `bun test` green; the build splits the editor into
  its own lazy chunk (~1 MB) out of every page bundle; the visibility × role matrix and yjs merge/diff/broadcast
  logic are unit-tested pure; the cascade is enforced by the migration's `on delete cascade` clauses.
- End-to-end, against the real stack (local Postgres 16 + pgvector, the neon driver over a local ws relay,
  the api, vite, and Playwright-driven Chromium): signup → seeded topic → Tasting Notes section expanded with the
  empty-state copy and zero SSE/editor requests on load → note created through the dialog (name + visibility) →
  BlockNote loads as its own chunk with exactly one SSE stream → typed content converges live into a second
  page over SSE → table lists the note with its visibility icon and date → a private note never appears to a
  signed-out visitor, whose Add Note button leads to the sign-up → the visitor's dialog renders the stored HTML with
  zero editor chunk and zero SSE → a comment thread posts 200 and mirrors one thread + comment row into
  `note_comment_threads`/`note_comments` → a credential-less comment answers 404. Harness lives outside the repo
  (scratchpad); the unreachable third parties (litellm admin api, turnstile siteverify/widget) were stubbed.
