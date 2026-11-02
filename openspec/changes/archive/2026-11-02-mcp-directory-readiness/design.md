# Design

## Context

See `proposal.md` for scope. Inspection on November 2, 2026 found these constraints:

| Area | Shipped behavior and implication |
| --- | --- |
| Transport | `apps/api/mcp/server.ts` creates a stateless SDK server per request. Both endpoints share its handler. |
| Middleware | `apps/api/index.ts` resolves the caller before rate and body limits. Origin rejection must precede that pipeline. |
| Auth | Better Auth supplies discovery, registration, PKCE, and consent. `toolCaller.ts` verifies resource-bound JWTs locally and checks that the user exists. |
| Annotations | All eleven tools have titles. Four reads are read-only. Two writes are destructive; four account writes and Source suggestions currently declare destructive false. |
| Smoke coverage | The smoke checks three tool annotations, OAuth, several writes, cards, and rate limiting. It does not assert a live result-size limit. |
| Result packing | `results.ts` packs 20 items within a 40,000-character item budget. It always includes one whole item, even when oversized. |
| Privacy | `/privacy` covers the required general subjects and keeps analytics up to twelve months. It has no MCP section. |
| Tracking | `mcp_tool_called` goes to PostHog, keyed by client name, with person-profile processing disabled. Account actions can separately emit account-keyed events. |
| Docs | `account/add-to-ai.md` already ships, with cards, permissions, and general installation guidance. It lacks a complete tool reference and self-contained client setup. |
| Registry | No root manifest or installed `mcp-publisher` executable was found. Git origin is `doubleoevan/carlnotes`. |

Two existing spec statements need reconciliation. `suggest_sources` is specified read-only but ships with `readOnlyHint: false` because it consumes allowance. `follow_topic` specifies destructive false. The delta preserves their operations and changes their hints conservatively for the current directory guidance.

## Goals / Non-Goals

**Goals:** Reject browser-origin abuse before account work, retain server-side client compatibility, and make directory-facing claims verifiable from shipped behavior. Keep the existing tools, resource URIs, OAuth audience, and public documentation URL.

**Non-Goals:** Directory submission, publishing, DNS ownership changes, new tools, new account controls, token blacklists, a protocol upgrade, and repository-wide cleanup. Card appearance and native apps do not change.

## Decisions

### 1. Apply an exact Origin guard to the two transport endpoints

Add a small `apps/api/mcp/origins.ts` middleware with focused tests. Mount it on `/mcp` and `/mcp/t/:topicId` in `index.ts`, ahead of caller resolution, rate limiting, and body parsing. Avoid a blanket `/mcp/*` Origin rule: `/mcp/consent` is a web page with its own authentication flow.

The allowlist is:

| Origin | When allowed | Reason |
| --- | --- | --- |
| `https://carlnotes.com` | Always | Hosted CarlNotes. The HTTP URL is not an equivalent origin. |
| `new URL(appUrl()).origin` | The configured deployment | Reuse `BETTER_AUTH_URL`, including a development tunnel or a self-hosted deployment. |
| `http://localhost:5173` | When configured or when `appUrl()` uses its existing local fallback | The repository's web development origin. Production does not gain arbitrary localhost origins. |

Deduplicate the values. Do not infer permission from the request URL, Host, forwarded headers, OAuth callback URLs, or client names. No wildcard subdomains, wildcard ports, or arbitrary origins are allowed. A different development origin is supported by configuring the existing application URL.

Distinguish `headers.get("origin") === null` from an empty header. A present value must be an exact serialized HTTP(S) origin in the allowlist. Reject `null`, lists, credentials, paths, queries, fragments, wrong schemes, and unlisted ports with a small generic HTTP 403 response. Do not echo the supplied value or add permissive CORS headers.

Apply the check to every method. Allowed and absent origins continue to the existing transport, which still decides method support. No Origin is normal for server-side clients, including Claude's hosted connector and command-line agents. Requiring a header, restricting all callers to a browser Origin, or accepting only the production origin would break those clients or legitimate development deployments. Adding every vendor website to the allowlist is unnecessary for server-side clients and would expand browser access without evidence.

Use the same middleware in standalone smoke fixtures, whose SDK transport currently calls `mcpRoute` directly. Add composed-app tests to catch missing production registration and prove guard ordering. Keep the implementation independent of the SDK's deprecated transport protection options. CORS alone is insufficient because response-read policy does not reject server processing.

The [MCP transport security requirement](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#security--endpoint) explicitly calls for 403 on a present invalid Origin. Applying that rule does not require adopting unrelated protocol changes.

### 2. Make the tool contract executable

Update the account tools to explicit `readOnlyHint: false` and `destructiveHint: true`. Preserve existing `idempotentHint` and `openWorldHint` values. The four reads retain `readOnlyHint: true`.

Claude's current [review criteria](https://claude.com/docs/connectors/building/review-criteria) require destructive hints for tools that modify data. Conservatively classify Source suggestions too, since they consume the account's daily allowance. This is a client-permission change: users can see more confirmations. It neither adds server permissions nor replaces `edit_topic`'s existing confirmation token.

Use one small expected-tool matrix in test support for the unit and smoke assertions. It covers names, nonempty titles, boolean hints, read/write classification, and the identical inventory across both routes and identities. A boolean false counts as a boolean, but cannot satisfy a required true classification. Unexpected tools fail with a message requiring an intentional matrix update. Keep helpers local to MCP tests; do not introduce a generic conformance framework.

Extend the smoke fixtures with a private Topic, enough Findings to exceed count and packing budgets, and enough searchable records for a 50-row search page. Retain isolated run IDs and cleanup in `finally`. Run both endpoints through valid initialization and tool calls for missing, allowed, and forbidden Origin. Authenticate through the existing real OAuth flow. Check that invalid bearer tokens remain visitors and that foreign Origin is rejected even with a valid bearer.

Result assertions use the existing 40,000-character packing budget, not a new guessed provider token limit:

- For ordinary fixtures, summed serialized items stay within the packing budget; each text or structured page stays within the budget plus 1,024 characters of envelope allowance.
- Follow feed cursors with a bounded loop. Compare IDs and complete explanations to seeded values, detect duplicates, and require cursor progress. Include the 20-item boundary and the character boundary.
- Exercise site search at size 50 and page 2, with each model-visible representation within the same fixture bound.
- Measure text and serialized structured content separately, and record their combined size. Record `_meta` separately because it holds card data; resource HTML is not a tool text result.
- Preserve and explicitly test the lone oversized-item exception. The existing spec requires whole Findings, so this change does not silently truncate or discard one.

These are regression bounds for controlled fixtures, not proof of a universal token limit for arbitrary content. Fix a failing ordinary fixture within existing pagination and result-shaping contracts; never raise the bound just to make a regression pass.

Mirror Origin and annotation failures in `bun run check`. Keep live checks in `bun run smoke:mcp`, which the existing Smoke workflow already runs. The Smoke workflow is separate from the deployment prerequisite jobs today; do not describe it as an existing automatic deployment blocker. Require its successful run in this change's release evidence.

The shipping security audit found that unbound `list_topics` trusted an active subscription even after its Topic became private.
Filter that query with public visibility or the existing `toTopicAccessFilter(userId)` predicate. Keep followed public Topics
below the public discovery threshold, invite subscriptions, and owner/team access. The live regression keeps a subscription
while moving a foreign-owned Topic from public to private, changes its sensitive metadata, and checks both endpoint lists
and feeds. Invite visibility and an active team role then prove legitimate access still works.

### 3. Add factual privacy disclosures without inventing product controls

Add one MCP section to `PrivacyPage.tsx`, and update its last-updated date. Retain all existing sections, provider coverage, retention commitments, and contact routes.

| Subject | Copy must say | Evidence |
| --- | --- | --- |
| Received data | The connected AI app sends arguments such as queries, Topic IDs, and requested changes. Arguments can contain text the app deliberately supplies. | `tools.ts`, `topicEditTools.ts` |
| Returned data | Public or account-authorized Topics, Findings, search results, and action outcomes return to the connected app, sometimes with cards. Its own privacy policy governs its handling. | `results.ts`, `topicResults.ts`, `searchResults.ts`, `cardData.ts` |
| Assistant data | CarlNotes does not query the assistant's history, memory, or uploaded files. The MCP connection gives it no such access. | Registered server capabilities and tool handlers |
| Credentials | CarlNotes issues access tokens and refresh tokens after sign-in and consent. The client uses them for allowed account actions. | `auth.ts`, `mcpOAuthSmokeSections.ts`, OAuth tables in `schema/users.ts` |
| Revocation | Remove the connection in the AI app. A client can revoke its refresh token through the discovered revocation endpoint. Already-issued JWTs can remain usable until expiry. | Built-in OAuth provider; local JWT verification in `toolCaller.ts` |
| Tool analytics | PostHog records app name, tool name, caller kind, entry point, timestamp, and outcome. No tool arguments, results, or token values enter this event. | `trackToolCall`, `toBotCapture` |
| Retention | These analytics fall under the existing policy's up-to-twelve-month limit. This change adds no automatic deletion mechanism. | Existing Privacy policy Retention section |

The [Better Auth revocation documentation](https://better-auth.com/docs/plugins/oauth-provider#revoke-endpoint) distinguishes refresh revocation from self-contained JWT access tokens. Confirm that distinction against the installed plugin through the smoke flow before publishing the wording. Extend that flow to inspect discovery, revoke the issued refresh token, and prove it cannot refresh again. Do not print tokens or authorization codes.

The current MCP resolver does not consult token revocation state or introspect sessions. Signing out of CarlNotes therefore must not be advertised as immediate invalidation of every MCP access token. Account deletion is an existing route: subsequent MCP resolution finds no user. Link its existing privacy section and support address rather than inventing a Connected Apps screen. Disconnect controls can remove local credentials without requesting server-side revocation; explain that difference.

The repository proves event fields and the published retention promise, not the hosted PostHog retention setting. Record operator evidence that hosted retention matches the existing promise before claiming directory readiness. Do not replace missing evidence with a new numerical promise. This verification does not require changing provider settings or exposing credentials.

### 4. Expand the existing documentation URL

Keep `apps/docs/src/content/docs/account/add-to-ai.md`, its sidebar order, screenshots, and `/docs/account/add-to-ai/` URL. Adding a second MCP guide would split the installation instructions and create avoidable drift.

Provide numbered setup for Claude and ChatGPT. Use the current official flows: Claude custom connectors; ChatGPT's Add custom MCP server flow with OAuth. Mention workspace restrictions without promising universal plan availability. Correct the shared Claude and ChatGPT paste instructions in `packages/core/lib/installDeeplinks.ts` where they disagree with the verified guide.

Give Claude Code and Codex examples, with browser-based authorization:

```sh
claude mcp add --transport http carlnotes https://carlnotes.com/mcp
codex mcp add carlnotes --url https://carlnotes.com/mcp
codex mcp login carlnotes
```

Claude Code completes authorization through `/mcp`. Keep the existing Cursor and VS Code one-click instructions. Link official setup sources rather than claiming approval in either directory. These commands are documentation examples, not commands to run while authoring the guide.

Add a table for all eleven tools: purpose, account requirement, permission restrictions, and side effects. Explain public search budgets, suggestion allowance, the first Scan after creation, edit confirmations, pagination, and the 30-request-per-minute limit. Preserve the three-card explanation and text fallback. Mention `/mcp/t/<topicId>` as an optional existing bound endpoint, with `/mcp` remaining the install default.

The docs build already covers sidebar and search inclusion. The existing embedding sync reads Markdown, so keep this page in that format. Use `bun run docs:embed` against development after the final edit, and leave production embedding to its existing deployment job.

Client references checked during planning: [Claude connector testing](https://claude.com/docs/connectors/building/testing), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [ChatGPT custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server), and [Codex MCP commands](https://learn.chatgpt.com/docs/developer-commands). Recheck UI labels when applying because client interfaces change.

### 5. Keep registry metadata remote-only

Use this candidate structure in root `server.json` during implementation:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "com.carlnotes/carlnotes",
  "title": "CarlNotes",
  "description": "Read research findings, search topics, and manage your CarlNotes topics from your AI app.",
  "version": "1.0.0",
  "websiteUrl": "https://carlnotes.com/docs/account/add-to-ai/",
  "repository": {
    "url": "https://github.com/doubleoevan/carlnotes",
    "source": "github"
  },
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://carlnotes.com/mcp"
    }
  ]
}
```

Version `1.0.0` matches the server's advertised version today. Do not add package publishing metadata or encode OAuth tokens as headers. The schema and remote shape come from the [official remote-server guide](https://modelcontextprotocol.io/registry/remote-servers).

Install or obtain an official publisher release when applying, record its version, and run `mcp-publisher validate server.json`. The [CLI validation command](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/cli/commands.md#mcp-publisher-validate) validates without publishing. It was not run during proposal creation: neither the manifest nor the CLI is installed yet.

The `com.carlnotes` namespace requires [domain-based authentication](https://modelcontextprotocol.io/registry/authentication). The operator handles that proof and publication manually. Do not run publisher init over the repository or add a publishing workflow. Document the validation command in README and the root module map; no new package script is needed.

## Risks / Trade-offs

- **More client confirmations:** Conservative write hints can prompt more often. Preserve idempotence hints and explain actual effects in the tool reference.
- **Browser clients outside the allowlist:** They receive 403. Add an exact origin only with evidence of a supported direct-browser client; server-side clients need no entry.
- **False revocation promises:** Verify the refresh path and disclose JWT expiry. Do not claim that client removal erases data the AI app already received.
- **Unverified hosted retention:** Capture operator evidence before final readiness sign-off. The source tree alone cannot prove a hosted provider setting.
- **Size bounds mistaken for token guarantees:** Name measured representations and preserve the oversized-item exception explicitly.
- **Directory rules change:** Keep dated official references, recheck them on implementation, and treat approval as a separate manual outcome.

## Migration Plan

No database migration is needed. Implement the guard and regression checks, update annotations and public copy, then validate the manifest. Deploy through the normal `/ship` flow after required checks pass. Recheck the public documentation and privacy URLs after deployment as part of manual submission preparation.

Rollback uses the normal code revert; there is no external registry record to undo. Keep Origin protection when correcting an allowlist mistake. Update only the verified origin entry rather than disabling validation.

## Acceptance and Validation

| Command or check | Acceptance |
| --- | --- |
| `openspec validate mcp-directory-readiness --strict` | All planning artifacts and deltas validate. |
| `bun test apps/api/mcp` | Origin, annotation, auth-related unit coverage, analytics fields, and pagination checks pass. |
| `bun test apps/api/index.test.ts` | Composed routing rejects forbidden origins before account work and leaves OAuth pages reachable. |
| `bun run smoke:mcp` | Both routes pass Origin, full annotation, OAuth, access, result-size, cards, confirmation, and rate-limit checks. |
| `bun run build:docs` | The guide builds at its stable URL with sidebar, search, and links. |
| `bun run docs:embed` | Development docs sync accepts the updated Markdown. |
| `mcp-publisher validate server.json` | Official validator succeeds; record its version and any resolved warnings. |
| `bun run check` | Repository preflight passes after implementation. |
| Rendered review | Privacy and guide work at desktop and narrow widths, with readable tool table and unchanged existing legal sections. |
| Evidence review | Revocation wording matches the exercised flow; hosted retention matches the existing twelve-month promise. |

Run heavyweight builds and smoke checks sequentially. Close task-owned browser sessions and test processes between checks. No simulator is required for this API and documentation change.
