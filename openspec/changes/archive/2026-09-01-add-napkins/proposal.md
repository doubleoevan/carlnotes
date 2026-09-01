# Add Tasting Notes

## Why

Topic and team pages surface what Carl found, but readers have nowhere to keep their own thinking next to it — a private scratchpad, shared team notes, or a public annotation all require leaving the app. Notes add rich-text notes with checklists and comments directly on topic pages and individual team pages, in three visibilities (private / team / public), without making the default page load any heavier than a stored HTML fragment.

## What Changes

- New **Note** entity: each topic page and individual team page has a Tasting Notes section — a container of notes. A note is a named rich-text note with its own **visibility** (`private` | `team` | `public`) and an owner; a page holds any number of notes.
- New **Tasting Notes section** on topic pages and individual team pages, always expanded by default: a sortable table of the visible notes (Name / Visibility / Updated, visibility as an icon with verbatim tooltips) with an "Add Note" call to action. A note opens in a large dialog with a rename pencil beside its title and a control that expands the dialog to fill the screen. Most UI code lives in `ui/src/components/note/`.
- Two rendering states keep the default load cheap: **static** (the table alone — no note bodies, no editor bundle, no SSE; a read-only open also gets a static stored-HTML dialog) and **live** (a dialog opened by a user with edit access dynamic-imports BlockNote + Yjs, connects SSE, and is editable straight away with comments active).
- New collaborative sync over the existing chat SSE pattern — no websockets, no Hocuspocus, no new infra. GET snapshot with Yjs state-vector diff support, POST base64 Yjs updates, server-side merge under a Postgres advisory lock, debounced persist, HTML regenerated on save, fan-out through an in-process broker. All visibilities share the one code path, including private (cross-device sync comes free).
- New comments via BlockNote `CommentsExtension` + `RESTYjsThreadStore`: Hono CRUD routes enforce permissions server-side, write into the ydoc threads map, mirror into `note_comment_threads` / `note_comments` SQL tables, and broadcast over the same SSE channel. Anyone with edit access can comment; no comment-only role in v1.
- New editor dependencies: BlockNote MPL-licensed core packages only (`@blocknote/core`, `@blocknote/react`, and the Mantine UI package) plus `yjs` — never `@blocknote/xl-*` (GPL).
- New `notes`, `note_comment_threads`, `note_comments` tables; deleting a page cascades to all of its notes, including other users' private notes.
- Domain vocabulary: **Note** joins the domain-model skill's entity table (with "Tasting Notes" as the section's UI copy) in the same change.

## Capabilities

### New Capabilities

- `tasting-notes`: the Tasting Notes container and its notes, per-note visibilities and their visibility/edit permissions, the two rendering states, the Tasting Notes section UI (sortable notes table, Add Note flow, note dialog, expand and rename controls, formatting toolbar, verbatim tooltip copy), data model, and page-deletion cascade.
- `tasting-note-sync`: Yjs-over-SSE collaborative sync — snapshot/update endpoints, advisory-lock merge, debounced persist with HTML regeneration, in-process broker fan-out, SSE lifecycle (connect on live/edit only, pause on hidden, state-vector resync, heartbeat), and the minimal custom Yjs provider.
- `tasting-note-comments`: comment threads on note content — BlockNote CommentsExtension with RESTYjsThreadStore, authoritative server-side permission checks, SQL mirroring, SSE broadcast, `resolveUsers` from the existing `users` table, the threads panel beside the floating comment UI, and the "@" mention menu.

### Modified Capabilities

None — the feature is additive. Subject-deletion cascade is a tasting-notes requirement, not a change to existing topic or team deletion requirements.

## Impact

- `db/`: new `notes`, `note_comment_threads`, `note_comments` tables in `db/schema.ts` + generated migration.
- `shared/`: note contracts (zod) and visibility enum in the shared contracts.
- `api/`: new note domain routes (snapshot GET, update POST, SSE stream, thread/comment CRUD), permission checks through the `isAllowed` gate, in-process SSE broker beside the chat broker pattern, server-side HTML on save.
- `ui/`: new `ui/src/components/note/` component family (notes table, note dialog, visibility select, lazy editor, custom Yjs SSE provider, comments wiring), mounted on the topic detail page and the team page; typed API client additions.
- `worker/`: not in the note write path (HTML is regenerated where the save happens, in `api/`); no Temporal changes.
- Dependencies: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`, `@blocknote/server-util`, `yjs`, `y-protocols`, `y-prosemirror`, and `sanitize-html` for the stored HTML (MPL/MIT only; `@blocknote/xl-*` GPL packages are excluded and must never be added).
- Docs/skills: domain-model skill gains the Note row; module AGENTS.md files updated for the new folders.
- Performance stance: default page load serves the stored HTML for every visibility — zero SSE connections and zero editor bytes until a user clicks into a note, so SSE connection count scales with active engagement, not page views.
