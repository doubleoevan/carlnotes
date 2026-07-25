## Why

`/topics/:id` is a stub ("This page is coming soon"). Users need to see a Topic's full Findings and Scan history, and owners need to edit or delete a Topic — both are currently only reachable conceptually from the homepage's info popover. The handoff spec (`topic-pages-spec.md` + reference mocks) defines the layout, copy, and interactions exactly.

## What Changes

- Replace the TopicPage stub with a real detail view: a top row (`← All topics` link; owner-only `▶ Run now` block with "N left today" and an upgrade link), the title with its unread count, tag pills with bare-glyph actions (owner: ✎ edit, 🗑 delete, plus a 🔔 subscribe bell on public/invite topics; non-owner: bell only), a collapsible Findings list capped at 5 reusing the homepage row anatomy, a collapsible History list of past Scans capped at 10, and a right-rail info card (prompt, sources, attachments, schedule, visibility).
- Add an edit-topic **modal** (not a route) opened from ✎: title, prompt, tags, frequency, visibility, invitees (only when visibility is invite), sources add/remove, attachments upload/remove, Cancel/Save. The `/topics/:id/edit` route stub and `EditTopicPage.tsx` are **removed**.
- Add a delete-confirmation dialog opened from 🗑, separate from the edit modal.
- Flesh out `invite` visibility (the enum value already exists): a new `topic_invites` table, invitee editing in the modal, and access rules — invited users can view and subscribe without the topic being public.
- Add a manual Scan trigger (owner only) that draws from the same per-user daily scan quota as scheduled Scans — one plan-based pool (Free 5, Plus 20, Premium 50), so scheduled and manual runs count together. The Scan row's `is_manual` marker only records which runs the owner triggered, for bookkeeping, not for the count.
- New api routes: `GET/PATCH/DELETE /api/topics/:id`, `POST /api/topics/:id/scan`, `POST /api/topics/:id/subscription`, `POST /api/topics/:id/attachments`, `DELETE /api/attachments/:id`, `GET /api/attachments/:id/download`.
- New module edge: `api → worker` (tsconfig reference) so the api can run `runTopicScan` and the attachment ingestion/storage helpers in-process. This is the bridge until Temporal lands; the app is one deployment today.

## Capabilities

### New Capabilities

- `topic-detail-page`: the `/topics/:id` detail view — layout, findings list, right-rail info card, visibility-gated access, and the subscribe bell.
- `topic-editing`: the edit modal, the delete dialog, invitee management for invite visibility, source add/remove, attachment upload/remove/download, and the owner-only update/delete API.
- `scan-history`: the History list of past Scans with per-scan popovers, the manual "Run now" trigger, and its per-user daily quota.

### Modified Capabilities

- `domain-schema`: add a `topic_invites` table (topic + invited email, unique per pair), an `is_manual` marker on `scans`, a `role` column on `users` (text, default `user`), and a `plan` enum plus `plan` column on `users` (default `free`), with their migrations. Role gates operator-only data like Scan spend, and plan drives the topic and daily-scan quotas.

## Impact

- Specs: three new capabilities, one modified.
- Code: `ui/` (TopicPage rewrite, new EditTopicModal, a dialog primitive, client functions, route removal, `EditTopicPage.tsx` deleted), `api/` (new `topicPage.ts`, new routes, worker tsconfig reference), `worker/` (`runTopicScan` gains an isManual flag, storage gains a download stream, index re-exports), `db/` (schema + migration + seed update: the first dev topic becomes an invite topic with two invitees), `shared/` (topic page contracts and the editable source kinds).
- Data: additive migrations — the new `topic_invites` table, the `scans.is_manual` column, the `users.role` column, and the `plan` enum plus `users.plan` column, each with a default; the seed stays idempotent.
