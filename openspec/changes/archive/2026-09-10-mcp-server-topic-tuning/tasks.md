## 1. Dependencies, schema, and vocabulary

- [x] 1.1 Add `@modelcontextprotocol/sdk`, `@hono/mcp`, and `hono-rate-limiter` with `bun add`, caret-pinned like the rest of `package.json`.
- [x] 1.2 Add `topicPromptVersions` to `db/schema.ts`: `topicId` cascading, `prompt`, nullable `savedByUserId` nulling on delete, `origin` limited to `editor`, `chat`, `mcp` by a check, `createdAt`, and an index on `(topicId, createdAt)`. Add `promptVersionOrigins` to `shared/enums.ts` for the check and the contracts.
- [x] 1.3 Add `oauthApplications`, `oauthAccessTokens`, and `oauthConsents` to `db/schema.ts` shaped to the `mcp` plugin's three models, with the plural export names the Drizzle adapter resolves and the plain timestamps `accounts` uses. Comment them as identity plumbing beside the sign-in tables.
- [x] 1.4 Run `bun run db:generate` and confirm the migration creates only the four tables, then `bun run db:migrate` against dev.
- [x] 1.5 Extend `db/schema.test.ts` with the four tables' shapes.
- [x] 1.6 Add `mcp` to the reserved list in `shared/usernames.ts`, since `/mcp` is a new top-level route.
- [x] 1.7 Add the Prompt Version and Topic Tool rows and the MCP layering rule (client, caller, user, visitor) to `.claude/skills/domain-model/SKILL.md` and mirror it to `.agents/skills/domain-model/SKILL.md`.

## 2. OAuth on the transport

- [x] 2.1 Register Better Auth's `mcp` plugin in `api/auth.ts` with `loginPage: "/login"`, `resource` set to the origin's `/mcp`, and `oidcConfig.consentPage: "/mcp/consent"`.
- [x] 2.2 Serve `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` in `api/index.ts` from `oAuthDiscoveryMetadata(auth)` and `oAuthProtectedResourceMetadata(auth)`, mounted ahead of the static bundle.
- [x] 2.3 Teach `ui/src/pages/LoginPage.tsx` the authorize return: when the query has `client_id` and `redirect_uri`, the post-sign-in destination is `/api/auth/mcp/authorize` with the whole query, accepted by `toSafeRedirectPath`, and carried through to the signup page's return the same way.
- [x] 2.4 Add `ui/src/pages/McpConsentPage.tsx` at `/mcp/consent` in `App.tsx`: name the client from its registration where the plugin exposes it, offer Allow and Deny, post accept or deny with the `consent_code` to `/api/auth/oauth2/consent`, and follow the returned redirect. Body copy in Carl's voice, title an eyebrow.
- [x] 2.5 Verify the flow by hand with `claude mcp add --transport http carlnotes <dev url>/mcp`: registration, login return, consent, a token that `auth.api.getMcpSession` resolves.

## 3. The per-caller rate limit

- [x] 3.1 Add `api/rateLimit.ts`: `callerRateLimiter` on `hono-rate-limiter`, one-minute window, `CALLER_RATE_LIMIT` requests, keyed by the context's user id, else the token's user once resolved, else the `x-forwarded-for` hop the trusted proxies vouch for, the nth from the right behind n proxies, when `TRUSTED_PROXIES` is set, else one shared bucket. Mark the in-memory store `ponytail:` with the shared-store upgrade.
- [x] 3.2 Mount it on `POST /topics/:id/chat` and `POST /teams/:id/chat` in `api/chat/turns.ts` and on both MCP routes.
- [x] 3.3 Add `api/rateLimit.test.ts` for key resolution: user beats address, address beats the shared bucket, unset proxies fall to shared.
- [x] 3.4 Map a 429 in `ui/src/clients/chatClient.ts` to a `rateLimited` rejection and show it in `ChatMessages` in Carl's voice, apart from the budget prompt.

## 4. The Topic Tools

- [x] 4.1 Add `updateTopicPromptPayload` and `addTopicSourcePayload` to `shared/contracts.ts`: the prompt bounded by `TOPIC_PROMPT_CHARS`, and a source option key from the shared registry with its value.
- [x] 4.2 Write `api/tool/topicTools.ts`: `loadEditableTopic` (view then edit through `isAllowed`, returning missing or forbidden), `savePromptVersion(transaction, …)`, `updateTopicPrompt`, `addTopicSource` (registry config, duplicate as already-present, `MAX_TOPIC_SOURCES`, podcast name lookup, insert, `startPendingSourceScreens` for a url kind), `removeTopicSource` (scoped, idempotent), and `projectSourceCostDelta`. Every result is a discriminated union. Track a `topic_edited` event naming the tool and origin.
- [x] 4.3 In `api/topic/topics.ts`, write the first Prompt Version in `createTopic` and call `savePromptVersion` inside `updateTopic`'s transaction when the prompt changed, origin `editor`.
- [x] 4.4 Add `api/tool/topicTools.test.ts` over the pure parts: the cost delta's mean, ready-count division, paid-kind addition, no-scan fallback, and frequency multiplier; duplicate detection over registry configs; the result shapes.

## 5. The chat adapter

- [x] 5.1 Add `worker/prompts/chat-edit-topic.md` with the five frontmatter keys and the propose-then-confirm rules: cite the findings and their relevance explanations, name the exact wording or Source, call a tool only in a turn after the reader agreed, report the cost delta, never start a scan. Register it in `FALLBACK_PROMPT_TEMPLATES`.
- [x] 5.2 Bump `chat-topic.md` to v17 with a `{{editTopicBlock}}` slot among the instructions above the untrusted fence, filled with the edit body when tools are on and a one-line no-edit note otherwise, passed as a trusted value.
- [x] 5.3 Extend `worker/chat/index.ts`: `ChatTurnInput.tools` merged beside `searchWeb`, `buildTopicChatPrompt` taking the edit block, and the completion reporting `toolCallCount` from the result's steps.
- [x] 5.4 Write `api/tool/chatTools.ts`: `toChatTopicTools({ userId, topicId })` returning three AI SDK tools whose input schemas hold no Topic and whose descriptions restate the confirmation rule, returning short text with the cost delta.
- [x] 5.5 In `api/chat/turns.ts`, set `canEditTopic` from `isAllowed(userId, "topic:edit", topic)` in `authorizeChatTurn`, include it on `ChatConversation`, build the tools for an allowed turn, and save a turn with text kept when `isPersisted` or a tool fired.
- [x] 5.6 Extend `worker/chat/index.test.ts` and `worker/prompts/write.test.ts`: the edit block interpolates when on, the note when off, no leftover placeholders, the last line is not a placeholder.
- [x] 5.7 Add `onTopicChanged` to `ChatPageContext` in `chatPanelStore.ts`, register `reloadTopicPage` from `TopicPage.tsx`, and call it from `useTopicChat` after a completed send when the conversation says the reader may edit.
- [x] 5.8 Push the prompts with `bun run prompts:sync`, then verify a propose-then-confirm edit end to end in the panel: proposal turn writes no version, confirmation turn writes one, the page reloads with the new prompt.
- [x] 5.9 In `api/chat/roomTurns.ts`, build the same tools for a Topic's team chat room turn when the gate grants the member who addressed Carl `topic:edit`, and reload the Topic page from `useChatRoom.ts` when Carl's room message arrives.
- [x] 5.10 Record each save in `TurnToolCalls`, end the private reply stream with the tool calls, which the api client strips, send the room's toast lines as a `topicToolCalls` event, and toast them in both chats, a rejection as an error toast.

## 6. The MCP server

- [x] 6.1 Export a content-free ranking from `worker/chat/retrieve.ts` (the same query and `EMBED_QUERY_INSTRUCTION`, skipping the Resource text read) and re-export it from `worker/index.ts`.
- [x] 6.2 Make `loadTopicFindings` in `api/topic/findings.ts` build without the consumed and bookmark joins when there is no user, leaving every page call site unchanged.
- [x] 6.3 Write `api/mcp/results.ts`: `listTopics`, `readTopicFeed`, `searchTopicFindings`, and the three per-user writes through `setConsumed`, `setRating`, and `setBookmarked` with MCP analytics properties; the visitor branch with no per-user fields; `packPage` under `MCP_PAGE_MAX_CHARS` with at least one Finding and never a cut explanation; opaque cursor encode and decode; the connect-an-account text; the visitor embedding on `LITELLM_PUBLIC_KEY` with the unset and spent results.
- [x] 6.4 Write `api/mcp/server.ts` (a per-request `McpServer` and `StreamableHTTPTransport`, the bound-topic rule on `/mcp/t/:topicId`, and both routes on one Hono app), `api/mcp/caller.ts` (`resolveCaller` through `auth.api.getMcpSession`), and `api/mcp/tools.ts` (`registerTools` for the nine tools with their annotations and snake_case names).
- [x] 6.5 Mount the MCP routes in `api/index.ts` under the rate limiter, ahead of the `/api/*` 404 and the static bundle.
- [x] 6.6 Add `api/mcp/results.test.ts`: page packing, cursor round-trip, the bound-topic rejection, the visitor result with no per-user fields, and the connect text on every account-only tool for a visitor.
- [x] 6.7 Add `api/mcp/mcp.smoke.ts` and a `smoke:mcp` script: initialize, list tools, list topics as a visitor, read a public feed, search it, and rate as a visitor to see the connect text. Add it to the `smoke` chain and the smoke coverage script, and to the README's Development section.
- [x] 6.8 Add `LITELLM_PUBLIC_KEY` to `.env.example` and the README, create a dev one in `scripts/carl-up.sh` beside `LITELLM_DEV_KEY`, and note the Doppler prd value as a post-deploy step.

## 7. The Add to AI dialog

- [x] 7.1 Add `ui/src/lib/installDeeplinks.ts` with `toInstallDeeplink(deeplinkProvider, { name, url })` for Cursor and VS Code, and `installDeeplinks.test.ts` decoding both links back to their name and url.
- [x] 7.2 Add `mcp?: { name; url }` to `PageActions` in `pageActionsStore.ts`, and render one "Add to AI" option in `PageActionMenu.tsx` after the page's options, defaulting to the account server at `/mcp`.
- [x] 7.3 Write `ui/src/components/common/AddToAiDialog.tsx`: Claude, ChatGPT, Gemini, Grok, Perplexity, DeepSeek, Cursor, VS Code, Copy server URL in order with no default; the paste providers expanding to paste steps with the url and a copy control behind repointable destination constants; Cursor and VS Code as deeplink anchors; Copy server URL always last, copying through the share menu's clipboard path with a toast; the last choice remembered in `localStorage` and moved to the top; eyebrow labels and one body line in Carl's voice.
- [x] 7.4 Register the topic-bound server from `TopicPage.tsx`: name `CarlNotes: <topic name>`, url `/mcp/t/<id>` on the page's origin.
- [x] 7.5 Verify in the browser: the row on Home, Topic (signed in and signed out on a public Topic), Team, and Profile; the dialog order; the reorder after a choice with Copy server URL still last; the copy toast; the two deeplink hrefs.

## 8. Docs, structure, and the gate

- [x] 8.1 Update `api/AGENTS.md` for `mcp/`, `tool/`, and `rateLimit.ts`, and add the MCP, Topic Tool, and install row to the root routing table.
- [x] 8.2 Run `bun run check` green.
- [x] 8.3 Verify end to end against dev: an anonymous `list_topics` and feed read, an authenticated read with the consumed flag, `update_topic_prompt` over MCP writing a version of origin `mcp`, and a page reload showing it.
