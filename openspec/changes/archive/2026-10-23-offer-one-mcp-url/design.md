## Context

`PageActionMenu` opens the Add to AI dialog with `pageActions.mcp`, or `{ name: "CarlNotes", url: <origin>/mcp }` if the
page set none. `TopicPage` is the only page that sets one: `CarlNotes: <topic name>` at `/mcp/t/<topicId>`. The api
serves both paths through one handler, and the topic-bound path defaults each tool's `topic_id` to its Topic and
rejects any other.

## Goals / Non-Goals

**Goals:**

- One server url in the dialog on every page, so a user installs CarlNotes once.

**Non-Goals:**

- Removing the `/mcp/t/<topicId>` route. Connectors installed from a topic page keep working.
- A topic-only link in the dialog.

## Decisions

**The page actions lose `mcp`.** With the topic page no longer setting a server, no page sets one, so the field and the
fallback in `PageActionMenu` go. The menu builds `{ name: "CarlNotes", url: <origin>/mcp }` itself. `TopicPage` drops
the `useOrigin` call it made only for that url.

**`AddToAiDialog` keeps its `mcpServer` prop.** The menu still passes the server, and the install deeplinks and their
tests take any server, so neither changes.

**The route stays.** An installed topic connector keeps reading its Topic. The mcp-server spec's topic-bound
requirement is unchanged.

## Risks / Trade-offs

- [An AI on `/mcp` has to name the topic] → `search` and `list_topics` find it by name, and the tools already take a
  `topic_id`.
- [A topic link limited to one topic is no longer offered] → It was useful only to share one topic's tools with someone
  else's AI. A public topic is readable on `/mcp` anyway.
