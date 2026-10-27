# Proposal

## Why

Mobile users currently leave the app to chat, although web already supplies the conversation APIs and topic-edit behavior. Sharing that implementation will bring text chat to mobile while keeping web and mobile behavior aligned.

## What Changes

- Add native private Topic conversations and Team chat rooms, including a Team's own room and its rooms on held Topics.
- Put the shared orange chat pill at the bottom right of every signed-in page. Replace supported chat handoffs with a native screen. A Topic opens its available Team room first, with private chat one switch away. Other pages use the web default room, with a private Topic picker for people without rooms.
- Extract portable conversation, history, tool-result, topic-draft, rejection, mention, reply, and room state into `packages/core`. Reuse portable React composition with app-specific elements.
- Keep transports in their apps: the configured fetch streams private answers; a native server-sent events adapter resumes room messages after their cursor.
- Render answers with native streaming Markdown, the web's link safety policy, and readable tables. Preserve authors, avatars, copy/retry actions, previews, and Nightshift styling.
- Show proposed Topic edits in the shared draft card. Preserve server confirmation, permissions, save/rejection feedback, and Topic refreshes.
- Support mentions, replies, own-message deletion, existing moderation permissions, and confirmed clearing. Opening a room acknowledges its mentions.
- Reuse rejection wording without a mobile pricing link. Keep attachments already in history as named chips.
- Add shared logic tests, native stories, device acceptance checks, and documentation of module moves and native behavior.

Voice, native new-topic chat, attachment management, podcast chat controls, and broader live badge work remain separate changes. Existing web features remain available and behave as before.

## Capabilities

### New Capabilities

- `mobile-chat`: Native text conversations, room transport and lifecycle, safe answer rendering, Topic edit feedback, and shared web/mobile chat behavior.

### Modified Capabilities

- `mobile-feed`: Supported Topic and Team chat opens natively; the browser handoff requirement remains for deferred workflows.

## Impact

Changes touch `apps/mobile`, web chat components and their store adapters, universal core components/hooks/lib/stores, and existing client transport tests. Add `react-native-sse` and `react-native-enriched-markdown` to mobile; the latter requires rebuilt native clients.

The existing chat, room, Topic, and Team APIs remain authoritative. No new database schema, model prompts, authorization rules, or alternate chat backend are planned. History compaction already in contracts/client stays shared there.

Update `packages/core/AGENTS.md`, `apps/mobile/AGENTS.md`, the affected web/client guides, and the chat documentation. Record actual component reuse separately from shared logic and necessary native rendering.
