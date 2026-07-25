## Context

The homepage renders Topic feeds, but a Topic has no page of its own: `/topics/:id` and `/topics/:id/edit` are stubs. The handoff spec (`topic-pages-spec.md`, reference mocks 5a/5c) pins the layout: the detail page mirrors the homepage's visual system (Latte/Dark-roast tokens, Architects Daughter + Karla, dashed separators, ⓘ popovers), and editing happens in a modal over the dimmed page, not on a route.

Constraints that shape the design:

- Module boundaries are compiler-enforced by tsconfig references. Today `api → db, shared`. "Run now" must execute a real Scan and attachment upload must run the real ingestion (storage + context generation) — both live in `worker/`.
- There is no queue or Temporal wiring yet; the repo is one deployment (one `package.json`).
- `visibility` already contains `invite` in the enum and the database; nothing uses it yet.
- The scan pipeline makes paid model calls; a manual trigger needs a quota.

## Goals / Non-Goals

**Goals:**

- A real Topic detail page matching the handoff spec, driven by one `GET /api/topics/:id` payload.
- Owner editing (fields, invitees, sources, attachments) via a modal with Cancel/Save semantics, and deletion via its own confirmation dialog.
- Working invite visibility: invited emails can view and subscribe.
- A real manual scan trigger with per-user daily quota accounting.

**Non-Goals:**

- Temporal workflows, schedules, or a job queue (the api calls the worker in-process for now).
- A pricing page (the "upgrade for more" link points at `/pricing`, which does not exist yet).
- Auth (the fixed dev user stands in, as everywhere else).
- Editing an existing Source's config in place — the spec offers only remove and add.

## Decisions

- **api → worker in-process.** The api gains a tsconfig reference to `worker` and calls `runTopicScan`, `ingestAttachment`, and the storage helpers directly. One deployment makes this correct today; when Temporal lands, these call sites become workflow starts. The scan trigger is fire-and-forget so the request returns immediately; the Scan row appears in History as "running".
- **Quota accounting per plan.** Scans are limited per user per UTC day to their billing plan's daily limit (Free 5, Plus 20, Premium 50), counted across every Scan on the user's Topics — scheduled and manual share one pool. Only running and succeeded Scans count, so a failed Scan gives its slot back, and admins bypass the quota. The `scans.is_manual` marker records which runs were owner-triggered for display, not for the count. The check-then-insert is not atomic, so concurrent requests can slip a few scans past the count; the owner's per-user litellm key budget caps real spend regardless, so an over-count never becomes over-spend — acceptable at this scale. A per-user advisory lock around the count and insert would close the count gap.
- **Save-time application.** The modal applies everything on Save: one `PATCH` with the full desired field/invitee/source lists (the api reconciles rows), then uploads of newly picked files, then deletes of removed attachments. Cancel discards everything, including staged uploads, which is what a Cancel/Save footer promises. The steps are sequential, not transactional: the `PATCH` commits first, so a failure during an upload or delete leaves the `PATCH` applied with attachments partially synced. The modal surfaces the error rather than compensating, and re-saving reconverges the desired-state lists. Fully transactional save would fold the uploads into the request and defer the attachment writes until server-side commit — deferred at this scale.
- **Sources travel as desired-state lists.** A payload source with an `id` keeps that row; without an `id` it is inserted; stored rows missing from the payload are deleted. The add picker takes one value per kind (rss url, search query, reddit subreddit, youtube channel-or-playlist id) and the ui builds the config.
- **Invite access rule.** A non-owner may see an invite Topic when their account email is invited or they already subscribe. Subscribing is allowed on public topics for anyone and on invite topics for invited users; private topics never show the bell.
- **Findings rows are shared.** `TopicResource` gains an optional handlers prop so the detail page reuses the homepage row (icons, popover, rating, consumed) while reloading its own payload instead of the homepage feed.
