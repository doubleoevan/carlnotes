## Why

Dependabot's minor-and-patch group moves better-auth from 1.6 to 1.7, and 1.7 removes the in-core `mcp` plugin that the
MCP server's OAuth sign-in is built on. The plugin moves to `@better-auth/mcp` on top of `@better-auth/oauth-provider`,
with new tables, endpoints under `/oauth2/*` instead of `/mcp/*`, signed JWT access tokens, and a signed query instead
of a consent code. The same release renames `getIp` to `getIP` and adds `getAndDelete` to secondary storage. The group
PR fails to build until the app moves with it, and every later Dependabot group would carry the same failure.

## What Changes

- better-auth, `@better-auth/mcp`, `@better-auth/oauth-provider`, and `@better-auth/cimd` at 1.7.11, with the `ai`
  patch the group also holds.
- The auth config composes the 1.7 `mcp` plugin with the `jwt` plugin that signs its access tokens and the `cimd`
  plugin, so a client registers either by dynamic registration, kept open as before, or by a client metadata document.
- The MCP server verifies a token in-process against the jwt plugin's signing keys and the MCP resource, with a
  DPoP-bound token's proof checked too. A request with no valid token stays a visitor, as before.
- An authorize request that names no resource asks for the MCP server, so every client's token is the signed one the
  server verifies. Every authorize request still goes through the consent page.
- The root `/.well-known` routes serve 1.7's authorization server metadata, and every protected resource path, the
  topic-bound `/mcp/t/<topicId>` included, serves the one document for `/mcp`.
- The consent page posts the signed query it was sent and follows the url the endpoint returns.
- The 1.6 tables `oauth_applications`, `oauth_access_tokens`, and `oauth_consents` are dropped and the 1.7 tables are
  created: `jwks`, `oauth_clients`, `oauth_resources`, `oauth_client_resources`, `oauth_refresh_tokens`,
  `oauth_access_tokens`, `oauth_consents`, and `oauth_client_assertions`. Production holds no MCP client, token, or
  consent, so nothing is copied and nobody is signed out.
- The Redis secondary storage reads a single-use value with `GETDEL`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-server`: the OAuth requirement names the 1.7 plugin, client metadata documents, the signed consent query, the
  default resource, and the one protected resource metadata.
- `domain-schema`: the OAuth provider tables are the 1.7 models.
- `user-auth`: a single-use value is read and deleted from Redis in one command.

## Impact

- `apps/api/auth.ts`, `apps/api/api.ts`, `apps/api/index.ts`, `apps/api/authHooks.ts`, `apps/api/trustedProxies.ts`,
  `apps/api/mcp/` (`toolCaller.ts`, `server.ts`, the new `oauthClientNames.ts`, and the smoke), the consent page and
  `packages/client/mcpClient.ts`, the login page's return path in `apps/web/src/lib/utils.ts`.
- `packages/db/schema/users.ts` and two generated migrations. The Redis store's command list and its two test fakes
  gain `getdel`.
- Every connected MCP client signs in again through the new endpoints. Production has none today.
