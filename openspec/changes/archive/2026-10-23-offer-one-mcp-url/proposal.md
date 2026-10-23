## Why

The Add to AI dialog offers a different MCP server on every topic page, `/mcp/t/<topicId>`, and `/mcp` everywhere else.
A user who adds CarlNotes from three topic pages ends up with three connectors that each sign in on their own and each
register the same tools, so the AI sees every tool several times. The AI already finds a topic by name through `search`
and `list_topics`, so the topic-bound server saves it little.

## What Changes

- The Add to AI dialog offers `/mcp`, named "CarlNotes", on every page, the topic page included.
- A page no longer sets the server the dialog installs: the page actions lose their `mcp` field.
- The `/mcp/t/<topicId>` route keeps serving, so a connector installed from a topic page before this change still
  works. No page offers it.
- The Add to AI docs page describes one server, and its screenshot shows the `/mcp` url.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-install`: every page, the topic page included, installs the server at `/mcp`. A page no longer sets its own.

## Impact

- `apps/web`: `TopicPage.tsx`, `PageActionMenu.tsx`, `stores/pageActionsStore.ts`, the `AddToAiDialog` story.
- `apps/docs`: `account/add-to-ai.md`, and its screenshot, renamed `add-to-ai-dialog-claude.png`.
- No api, route, or schema change.
