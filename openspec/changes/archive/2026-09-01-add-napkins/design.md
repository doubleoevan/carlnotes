# Tasting Notes design

## Context

See proposal.md for motivation. Constraints that shape the how:

- The chat module already owns the exact streaming shape notes need: `api/chat/room.ts` streams with `streamSSE`, a 25s heartbeat, a 15-minute stream max age, and cursor resume; `api/chat/roomStream.ts` is a two-level broker — an in-process `EventEmitter` keyed per room plus Postgres `LISTEN/NOTIFY` for cross-instance fan-out, with payloads with only ids (pg_notify is limited to near 8KB, so bytes never ride the channel).
- The schema idiom for "attached to a topic page or a team page" already exists: `room_messages` uses a nullable `topic_id` beside `team_id`, with real FK `onDelete: "cascade"` edges. Enum value arrays live in `shared/enums.ts` and are wrapped by `pgEnum` in `db/schema.ts`.
- The ui has no editor today; rich text is render-only. `ui/src/components/note/` does not exist. The topic page composes `CollapsibleSection` (Radix accordion, open by default); the team page uses a raw `Accordion` with `members` and `topics` items. Pages fetch through typed `hc<AppType>` clients.
- Authorization routes through `isAllowed(userId, capability, topic?)` in `api/authorization.ts`; a test bans inline `role ===` checks elsewhere. Unauthorized reads answer 404, not 403.
- The project is AGPL-3.0; the BlockNote constraint here is contractual, not compatibility: MPL core packages only, never `@blocknote/xl-*`.
- React 19, Tailwind v4, Vite SPA with `dedupe: ["react", "react-dom"]`.

## Goals / Non-Goals

**Goals:**

- Default page load costs one row read and some HTML — no editor bytes, no SSE, for every visibility including team.
- One shared code path for all three visibilities; private gets cross-device sync for free.
- Convergent collaborative editing with zero new infrastructure — the existing SSE + Postgres pattern only.
- Server-authoritative permissions for content and comments.

**Non-Goals:**

- Presence, live cursors, or awareness broadcasting (stubbed only).
- Comment-only roles or visitor comments.
- Version history, undo across sessions, or offline persistence (y-indexeddb).
- Encrypting note content at rest (see Decisions).
- Notes anywhere beyond topic pages and individual team pages.

## Decisions

### D1: Subject columns are two nullable FKs, not a polymorphic pair

`notes` stores `topic_id` (nullable, FK → topics, cascade) and `team_id` (nullable, FK → teams, cascade) with a CHECK that exactly one is set, following the `room_messages` idiom — instead of `page_type` + `page_id` text columns. Rationale: the spec's hardest deletion requirement (page deletion removes every note, including other users' private ones, plus mirrored threads/comments) becomes a database guarantee instead of app code scattered through topic and team delete paths. Each row is one named note with its own `visibility` and a NOT NULL `owner_user_id` recording its creator — a page holds any number of notes, so there are no per-visibility uniqueness constraints. Alternative considered: literal polymorphic columns — rejected because they forfeit FK cascade and referential integrity for no benefit at two page kinds.

### D2: The ydoc is one mutable blob; resync rides state vectors, not an update log

`ydoc` is a single `bytea` column (a Drizzle `customType` — first in the codebase) holding the encoded Y.Doc. There is no append-only update log. The 15-minute stream max age is survivable because Yjs state vectors make any reconnect a cheap diff: the client GETs `/api/notes/:id/ydoc?sv=<base64>` and receives only what it lacks. Alternative considered: a bigint-identity update log like chat's cursor resume — rejected as redundant (state vectors already give lossless resume) and as a compaction liability.

### D3: Merge on every POST under an advisory lock; debounce only the HTML

The POST handler takes `pg_advisory_xact_lock(hashtextextended('note:' || id, 0))`, loads the ydoc, `Y.applyUpdate`s the incoming base64 update, and writes the merged blob in the same transaction — every POST persists durably; nothing pending lives only in server memory. The "short debounce" applies to the two expensive/batchable parts: the client provider batches outgoing updates (~400ms), and the server debounces HTML regeneration per note (~1.5s trailing) since a keystroke burst needs one re-render, not thirty. Alternative considered: server-side in-memory merge with debounced persistence — rejected because a crash between debounces loses edits, and multi-instance memory diverges.

### D4: Fan-out reuses the chat broker shape; remote instances poke, clients diff

`api/note/noteStream.ts` mirrors `roomStream.ts`: in-process `EventEmitter` keyed by note id, `pg_notify` on a `note_updates` channel for cross-instance. Same-instance subscribers receive the SSE `update` event with the base64 update bytes directly (lowest latency). The pg_notify payload includes only the note id; instances receiving it emit an SSE `resync` event, and those clients re-GET the state-vector diff. Both paths converge via Yjs idempotence. Alternative considered: poke-and-refetch everywhere (one path) — kept as the semantic fallback, but the direct payload on the local instance is nearly free and covers the common single-instance case with no extra round trip.

### D5: SSE connects while a note's dialog is open live, for every visibility — not on page load

Answering the performance question directly: the two-state model means SSE cost scales with engaged users, not page views. Static is the default render for all visibilities — the Tasting Notes section is a table of names, dates, and visibility icons — no note bodies, zero connections. Opening a note's dialog with edit access (live) opens SSE because comments must be active and a collaborator's edits should land as they are made. A read-only open renders the stored HTML and holds no connection at all. Private uses the identical path — special-casing it to skip SSE would add branching to save connections that only exist while its one owner has clicked in; cross-device sync comes free. Lifecycle guards bound the residue: disconnect on dialog close or unmount, pause on `document.hidden`, 25s heartbeat, 15-minute server max age. Expected steady-state: connections ≈ users with a note dialog open, each costing one idle response stream and one EventEmitter listener — thousands per instance before it matters.

### D6: A note opens in a large centered dialog

Row click opens the note in a Radix Dialog — the house pattern (`EditTopicModal`) — sized large for writing. Canonical alternatives considered: a Notion-style side peek (needs a drawer primitive the repo does not have) and a bottom sheet (a mobile idiom that fights the desktop layout). The dialog is where the two states live: it opens live for users with edit access (editor editable straight away, comments active, SSE connected) and static HTML for everyone else. There is no separate edit mode and no edit toggle. The dialog header holds the visibility select on the left (owner only, limited to visibilities the owner may create in, with the verbatim tooltips) and, on the right, the comments toggle, an expand and collapse control on a wide screen (a phone always opens expanded), and close. The name sits below the header, renamed in place beside a pencil with edit access. Delete is the owner's alone, at the foot of the dialog.

### D7: HTML renders in `api/` via `@blocknote/server-util`

`ServerBlockNoteEditor.blocksToFullHTML` runs where the save happens — the api owns request/response HTML (share previews, SEO pages) and holds the merge lock; the worker is for Temporal pipelines, which notes never touch. `@blocknote/server-util` is MPL-licensed (core monorepo). Sanitized on write; the stored `html` is served inside the SPA and to crawlers.

### D8: Comments go through Hono CRUD routes that mutate the ydoc under the same lock

BlockNote's `CommentsExtension` + `RESTYjsThreadStore` point at `/api/notes/:id/threads...` routes. Each route checks edit access (authoritative — `ThreadStoreAuth` is UI cosmetics), takes the note's advisory lock, applies the thread/comment mutation to the ydoc's threads map, mirrors into `note_comment_threads` / `note_comments` (cascade from `notes`), and broadcasts the resulting ydoc update over the same SSE channel — comments and content share one stream and one convergence mechanism. `resolveUsers` reads `users` for username + avatar.

### D9: Permissions live in `api/note/permissions.ts`, the `topic/permissions.ts` shape

`canSeeNote` / `canEditNote` / `creatableNoteVisibilities` are pure deciders over a loaded `PageAccess` (page visibility, holding-team membership, page ownership), following the house precedent where resource resolvers live in a domain permissions module (`topic/permissions.ts`, chat's `loadChatRoom`) instead of widening `isAllowed`'s topic-shaped resource parameter. Rules: private → owner only; team → active member of a holding team (the team itself for a team page; owning team or `team_topics` share for a topic page); public → view for everyone, edit for the page owner and holding-team members. Every note route — snapshot, update, SSE, threads — routes through these deciders; failures answer 404 per house rule. Pure deciders also match the repo's test style: the visibility × role matrix is unit-tested with no database.

### D10: A minimal custom Yjs provider satisfies BlockNote's collaboration option

`ui/src/components/note/noteProvider.ts`: subscribes to the note SSE stream, applies `update` events, refetches the diff on `resync`, batches and POSTs local updates, and exposes a real `y-protocols` `Awareness` instance that never broadcasts (satisfying the type with no presence). Dependencies added: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` (the MPL UI package), `@blocknote/server-util`, `yjs`, `y-protocols`. All of BlockNote + editor code loads via dynamic `import()` from the live/edit transition so the main bundle never includes it.

### D11: Note content is not encrypted at rest (unlike chat messages)

Chat text is AES-encrypted per `api/chat/encryption.ts`. Notes stay plaintext: the server must decode the ydoc to merge, regenerate HTML, and serve crawlers — encrypt/decrypt around every merge buys little against a database-level adversary and complicates the pipeline. Note prose sits in the same privacy class as topic context docs, which are plaintext today. Flagged as a deliberate divergence.

### D12: Notes are created explicitly

The "Add Note" call to action takes a name and a visibility and POSTs a create; the server refuses visibilities the creator may not use (private needs a signed-in user who may see the page, team a holding-team member, public the page owner or a member). An empty section shows a card reading "Write a note on <page>." that opens the same create flow. No lazy upserts and no uniqueness gymnastics — a create is a plain insert.

## UI composition

Most UI code lives in `ui/src/components/note/` (per request):

- `NotesSection.tsx` — the section body, headed "Tasting Notes" on a topic and "Team notes" on a team: the notes table, the "Add Note" call to action, and the empty state, mounted in the topic page's `CollapsibleSection` at the bottom of the right column and the team page's accordion item, expanded by default.
- `NotesTable.tsx` — the house table (`TableCard` + `SortableHeader` + `usePaginatedRowSort`): sortable Name / Visibility / Updated, visibility as a lucide icon (Lock / Users / Globe) with the verbatim tooltips, row click opens the dialog.
- `NoteDialog.tsx` — the large dialog: visibility select (owner only), comments toggle, expand and collapse, close, the name renamed in place beside a pencil, delete (owner), and the note body — the lazy editor for editors, static HTML for read-only opens.
- `NoteVisibilitySelect.tsx` — the visibility icons, labels, and verbatim tooltips, shared by the table column, the create flow, and the dialog.
- `NoteEditor.tsx` — lazy chunk: BlockNote editor, checklists + slash menu, the formatting toolbar with its comment and list buttons, and comments wired into the threads panel and the floating composer.
- `CommentMentions.tsx` — the comment box rebuilt with the "@" menu that offers the holding teams' members.
- `noteProvider.ts`, `useNoteSync.ts` — the Yjs SSE provider and the lifecycle hook (connect/disconnect/pause/resync).
- `ui/src/clients/noteClient.ts` — typed client (note list GET, note create/read/update/delete, snapshot GET, update POST, SSE URL, thread CRUD).

Toasts use sonner inline with Carl-voiced fallbacks per house pattern; section header and verbatim copy per spec.

## Risks / Trade-offs

- [BlockNote server-util or comments API drifts (young library)] → Pin exact versions; the sync layer is BlockNote-agnostic (plain Yjs), so editor-layer churn stays in the lazy chunk.
- [Ydoc blobs grow unboundedly with edit history] → Yjs GC is on by default for deleted content; comments and notes are small documents. Revisit with a snapshot-compaction pass only if p95 blob size says so.
- [Advisory lock serializes writers per note] → Intended; contention is bounded by humans typing in one note. Lock is transaction-scoped so it cannot leak.
- [Cross-instance resync causes a diff GET per remote update burst] → Client coalesces resync events (one in-flight diff fetch); bursts collapse to one round trip.
- [Stored HTML is served raw to other users — XSS surface] → HTML is generated exclusively server-side from the ydoc by `server-util` on save (never accepted from the client) and sanitized before store.
- [First `bytea` customType in the schema] → Small, well-trodden Drizzle feature; base64 `text` fallback exists if the driver misbehaves (Neon serverless supports bytea hex).
- [SSE + editor added to a page that was cheap] → The whole cost is behind click-in; the guardrail is the spec scenario "default page load is static", enforceable in a test asserting no editor chunk and no stream request on load.

## Migration Plan

1. Additive migration: `note_visibility` enum, `notes`, `note_comment_threads`, `note_comments` (`bun run db:generate`). No existing tables touched.
2. Deploy api + ui together (single app deploy); feature is dark until the ui mounts the section.
3. Rollback: revert the deploy; tables are additive and inert, dropped by a follow-up migration if the feature is abandoned.

## Open Questions

- Whether the team visibility should later split per holding team on multi-team topics. The schema stores any number of notes per page with no per-visibility uniqueness, so this needs no rewrite.
- Comment notification fan-out (the SQL mirror exists precisely so a later change can count and notify without touching v1).
