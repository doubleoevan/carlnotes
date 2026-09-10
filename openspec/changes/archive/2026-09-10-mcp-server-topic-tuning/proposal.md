## Why

The roadmap lists "MCP-queryable" as a selling point, and the decision log fixed the transport as remote streamable HTTP. The server deploys to Northflank, where stdio would serve nobody. Today the only way an agent reaches a Topic is the clipboard. Someone copies Carl's notes as Markdown and pastes them in. The next queued change, the registry listing, needs a server to list. And Carl can read a Topic but never edit one. A user who notices the prompt drifting in the chat has to leave the chat and open the editor, and an agent has no way to edit at all.

## What Changes

- **A remote MCP server** on the api at `/mcp`, streamable HTTP, served through the official `@modelcontextprotocol/sdk` with `@hono/mcp` as the Hono transport. One server, one tool list: identity changes what a call returns, never which tools exist.
- **Two ways in, one handler.** `/mcp` takes the topic as a tool argument. `/mcp/t/<topicId>` is the topic-bound variant, with the topic bound from the path: a visitor reads it, and a connected account that may edit the Topic edits it there too. The path segment is the topic id, the same identifier `/topics/:id` and the RSS feed use. Topics have no slug column.
- **OAuth on the transport, optional per call.** Better Auth's `mcp` plugin is the authorization server. It adds discovery at the origin's `/.well-known/*`, dynamic client registration, PKCE, and three new tables. An unauthenticated connection resolves as a visitor and sees public Topics only. A tool that needs an account, called without one, returns what connecting enables. Where the client supports URL elicitation it also asks the client to open the connect flow.
- **Read tools:** list topics, read a topic's feed with findings and relevance explanations, search a topic's findings over the existing pgvector index, mark a finding consumed. Rating and bookmarking need an account, and the visitor result says so, because a feed that returns no reaction signal breaks the preference loop.
- **The visitor path is its own branch.** It skips the consumed and bookmark joins and the personal rerank. Its one model call, the search embedding, spends from a shared public LiteLLM key with its own monthly budget, and it has a per-caller rate limit.
- **A per-caller rate limit shared with the chat.** the chat has only the monthly budget gate today. This change adds one limiter and applies it to the chat turn routes and every MCP request, keyed by user when signed in and by client address when not.
- **Responses fit the connector's limit.** Every list tool paginates by cursor and holds each page under a character budget well below 30,000 tokens. When a page must shrink, it returns fewer findings, each with its full relevance explanation.
- **Edit tools in `api/tool/`:** `updateTopicPrompt`, `addTopicSource`, `removeTopicSource`. Each tool resolves the actor and asks the gate for `topic:edit` on that Topic itself, so neither caller can grant access by being trusted. Every prompt write keeps a Prompt Version, so any change can be rolled back. Editing never starts a Scan. `addTopicSource` returns the projected per-scan cost delta. The topic editor's own save writes a Prompt Version through the same function, so the history is one history.
- **Chat adapter.** The topic is bound from the chat session and is not a tool parameter. The tools join Carl's tool list only when the reader may edit the Topic; every other reader, visitors on a public Topic included, keeps the read-only Carl they have today. Carl proposes an edit citing the findings and explanations behind it and calls a tool only after the reader confirms in the next message. A tool-calling turn costs more tokens and spends from the same budget pool, and any turn in which a tool fired persists regardless of plan. A Topic's team chat room turn gets the same tools when the member who addressed Carl may edit the Topic, so a team tunes together with the history in the room.
- **MCP adapter.** The topic is an ordinary argument, the tools need an account, and each is annotated `destructiveHint`. The server asks for no second confirmation. The client runs its own approval prompt.
- **An "Add to AI" install dialog** from a single option in the page header's action menu, on every page that registers actions, including a public Topic page seen by a visitor. The dialog lists Claude, ChatGPT, Cursor, VS Code, and Copy server URL in that order with no default. Cursor and VS Code are one-click deeplinks from one function taking `{ name, url }`. Claude and ChatGPT open short paste instructions, to be repointed at the directory listing once approved. Copy server URL is always present and always last. The last choice is remembered and moves to the top on return visits. The row label stays "Add to AI" always.
- **Domain model:** the `domain-model` skill gains Prompt Version, Topic Tool, and the MCP caller vocabulary.

Not in this change: the `server.json` manifest, registry submission, and the `/docs/mcp` page, which belong to the registry listing change. Also left out: a rollback control in the ui, and any change to scoring or ingestion.

## Capabilities

### New Capabilities
- `mcp-server`: the transport and routes, the caller model (visitor or user), OAuth on the transport with on-demand prompting, the read tools and their results, the visitor path's shared budget and rate limit, and response budgeting.
- `topic-tools`: the three tools, authorization and Prompt Version writes inside them, the no-scan rule, the cost delta, and the contracts the chat and MCP adapters must honor.
- `mcp-install`: the Add to AI option, the dialog and its order, the deeplinks, the paste instructions, the remembered choice, and the voice split between eyebrow labels and Carl's body copy.

### Modified Capabilities
- `topic-chat`: the read-only rule over a Topic's existing Findings narrows to users who cannot edit. An editor's Carl may write through the Topic Tools, propose then confirm, and a turn in which a tool fired persists on every plan.
- `topic-editing`: the editor's save writes a Prompt Version when the prompt changed, through the same function the tools use.
- `domain-schema`: adds `topic_prompt_versions` and the three Better Auth OAuth tables (`oauth_applications`, `oauth_access_tokens`, `oauth_consents`).

## Impact

- **Dependencies:** `@modelcontextprotocol/sdk` and `@hono/mcp`. Better Auth's `mcp` plugin ships in the installed version.
- **Schema:** four new tables, one migration, no change to `topics`, `findings`, or `chat_turns`.
- **api:** `api/mcp/` (server, caller resolution, read tools), `api/tool/` (the tools and the chat adapter), a shared rate limiter, the `mcp` plugin and the well-known routes in `api/auth.ts` and `api/index.ts`, the chat turn route handing tools to an editor's turn, and the topic update route writing a Prompt Version.
- **worker:** `streamChatReply` takes a tool set. `chat-topic.md` gains an edit block filled from a new `chat-edit-topic.md` prompt.
- **ui:** the Add to AI option in `PageActionMenu`, the dialog, the deeplink helper, a login redirect that returns to the OAuth authorize step, and the chat panel reloading the Topic after an editor's turn.
- **Config:** `LITELLM_PUBLIC_KEY`, a budgeted LiteLLM key the visitor path spends from, in Doppler and `.env.example`, with the README naming it.
- **Cost:** the visitor path can spend embeddings from the public key up to its monthly budget and no further. Tool-calling chat turns spend more tokens per turn on the editor's own budget.
- **Skills:** `domain-model` gains three rows and the MCP caller rule, mirrored to `.agents/skills/`.
