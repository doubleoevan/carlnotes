## Context

Chat attachments (images, PDFs, pasted text) ride to the model for exactly one turn and are then discarded — nothing persists but a `[attached: name]` note on the stored question. What a reader experiences as "Carl remembering" the material across later turns is entirely Carl's own first-pass reply riding verbatim in conversation history. That's often good enough, but it has a hard ceiling: a detail the first reply never mentioned can never resurface, and once the conversation outgrows the verbatim character budget, even that summary compacts to its opening line.

This change adds an opt-in path for a reader to make an attachment durable: kept, summarized once, and re-delivered fresh to every future turn they take on that topic — sidestepping both ceilings at once.

## Goals / Non-Goals

**Goals:** a reader can keep an attachment so Carl's knowledge of it survives indefinitely; the ongoing per-turn cost of a kept item stays small and bounded regardless of the original file's size; the feature works identically for the topic owner and any other signed-in reader who can chat.

**Non-goals for this change:** a UI to browse, search, or bulk-manage kept attachments; letting one reader's kept material feed another reader's conversation; raising attachment size limits; re-attaching kept material as a fresh live attachment.

## Decision: scoped to (reader, topic), not to the topic

The existing topic attachment system is topic-wide and owner-only: the owner uploads, and only the owner's own chat turns ever see the resulting context (`isOwner ? readAttachmentContext(topicId) : ""`). Chat itself is not owner-only — any signed-in reader who can chat about a public or subscribed topic can attach and might want to keep something.

The natural scope for "keep" is the (userId, topicId) pair, matching how chat conversations already work — `chat_turns` is already keyed by (userId, topicId), so each reader already has their own private thread with Carl about a topic. Scoping kept attachments the same way means:

- A reader can only ever add to *their own* future context, never anyone else's — no trust or moderation question about a stranger injecting permanent content into someone else's topic.
- No special-casing for the owner: an owner who keeps something in their own chat is scoped exactly like anyone else. Their separate, topic-wide topic-attachment context is untouched and reads as a distinct, existing concept.
- Storage and ongoing prompt cost scale per reader, which is also the natural unit for the count cap below.

The alternative — a shared, topic-wide pool anyone could add to — was rejected: it would mean either everyone's chat turns silently grow to include material a stranger pasted (unwanted context bleed, and a spam/abuse surface on someone else's topic), or the pool stays owner-visible only (which would mean a non-owner's "keep" benefits only the owner, not the person who did the keeping — a confusing incentive that doesn't match what "keep" should mean to the person clicking it).

## Decision: store the original, ride a summary

Mirroring exactly how topic attachments already keep the per-turn cost of a large document bounded: the raw bytes (image, PDF) or raw text persist once for later reference, but what rides into every future turn is a compact, one-time-generated summary — never the original re-sent. This is the same trick that already makes the owner's topic attachment context cheap regardless of document size, reused rather than reinvented.

- Text and PDF: reuse `generateContext`/`buildContextPrompt` (cheap model, capped input) unchanged — the same function topic attachments call today.
- Image: a new `generateImageContext` (chat model, vision-capable, one call) since there's no existing image-summarization path to reuse. A new registry prompt, `attach-image-context`, mirrors `attach-context.md`'s shape.
- The original bytes for image/PDF go through the same object-storage primitives (`putAttachment`/`toAttachmentKey`) topic attachments already use, under a parallel key scheme namespaced by reader instead of by topic-owner. Raw kept text is stored encrypted with the exact same AES-256-GCM helpers `chat_turns` text already uses — same sensitivity class, same mechanism.

## Decision: synchronous, fire-and-forget — no new Temporal workflow

Topic attachment ingestion runs through a durable Temporal workflow because the upload route wants to return instantly with zero LLM latency. Chat is a different shape: the request is already paying for one LLM call (the reply itself, streamed), so adding one more smallish, bounded call (context generation, capped input, short output) as a fire-and-forget background step after the reply's completion promise settles is a small marginal cost, not a new latency budget to protect. A failure in this step is caught and logged; it never surfaces to the reader and never blocks or breaks the turn they're already looking at.

The honest ceiling this accepts: persistence is best-effort. If it fails (extraction error, model hiccup, storage outage), the kept item is silently absent and the reader has no in-the-moment signal beyond it not showing up later. `# ponytail: best-effort persistence with no live failure feedback; upgrade path is a Temporal workflow if silent misses become a real complaint.`

## Decision: a hard, silent cap — 20 kept items per (reader, topic)

Each kept item adds a bounded but nonzero amount to every future turn's prompt. Without a ceiling, an enthusiastic reader could accumulate dozens of items and quietly inflate every turn's cost and latency. Twenty is generous headroom past the motivating case (a manuscript kept across several sessions, chapter by chapter) while keeping the worst-case addition to a handful of short paragraphs — nowhere near the model's context budget.

The cap surfaces at the toggle: the conversation load reports the reader's kept count, and the composer refuses to flip a bookmark on at the limit with a toast saying so — so the ui never promises a memory the server would skip. The server-side check inside the fire-and-forget persistence step stays as the backstop for anything that slips past (a second tab, a stale count), where an item past the cap is not kept and only logged. Eviction was rejected outright: silently forgetting something a reader deliberately kept, to make room for something newer, is the one behavior a memory feature cannot have — the new item is refused loudly, the old ones are never touched. Per-item size reuses the existing chat-attachment ceilings (~4.5MB images/PDFs, 50k-character text) rather than a new number — an item already had to clear that bar to attach at all.

## Decision: billed to the keeper, never the master key

Context generation for a kept item bills the reader who kept it, via their own LiteLLM virtual key — the same rule already applied to a reader's own chat turns, and unambiguous here since there is exactly one beneficiary of a kept item: the person who chose to keep it.

## Deletion and lifecycle

- Topic deleted → kept attachments for that topic cascade (FK `onDelete: cascade` on `topicId`), and the delete path removes their stored objects first, since the foreign key reaches rows but not object storage.
- Account deleted → that reader's kept attachments cascade (FK `onDelete: cascade` on `userId`).
- Conversation cleared → that reader's kept attachments for the topic are deleted with it, objects and rows.
- Clearing a chat conversation (`clearChatTurns`) does **not** touch kept attachments — clearing nulls the visible transcript, but a kept item was deliberately made independent of conversation history, which is the entire point of the feature. The two are separate durability tiers by design.
- A reader can delete one kept attachment by its own id; there is no bulk or list UI in this change.

## Prompt shape

`chat-topic.md` gains a new section, clearly distinguished from the owner-only "Extra context the owner gave you" block, so the model never conflates the topic's canonical material with something one particular reader happened to share mid-conversation. Version bumped, registry re-synced.
