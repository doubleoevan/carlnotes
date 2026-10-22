## Context

better-auth 1.7 rebuilt the OAuth server. The 1.6 `mcp` plugin kept opaque tokens in `oauth_access_tokens` and the MCP
server looked each one up with `auth.api.getMcpSession`. The 1.7 `mcp` plugin is `oauthProvider` configured for MCP: it
signs JWT access tokens bound to one protected resource, serves its endpoints under `/oauth2/*`, sends the consent page
a signed copy of the authorize query, and leaves client registration closed unless the app opens it. Its own route
helper, `requireMcpAuth`, answers 401 to a request with no token, which the MCP server cannot use, since a visitor reads
public Topics without one.

A read-only count on 2026-10-22 found no row in production's `oauth_applications`, `oauth_access_tokens`, or
`oauth_consents`. The dev database held two clients with expired tokens.

## Goals / Non-Goals

**Goals:**
- Build on better-auth 1.7 with every behavior the `mcp-server` spec names kept: discovery at the root, open dynamic
  registration with PKCE, visitors without a token, the forced consent page naming the client, and the return to the
  authorize request after signing in.
- Verify tokens without the server calling itself over HTTP, so the smoke and CI work with no running api.

**Non-Goals:**
- Moving the MCP server to version 2 of the MCP SDK. The 1.7 guide pairs `requireMcpAuth` with it, and the server here
  does not use `requireMcpAuth`.
- Copying 1.6 client records into `oauth_clients`. Production has none.

## Decisions

### 1. The tool caller verifies the token in-process

`resolveToolCaller` takes the request. It parses the authorization header with `parseAccessTokenAuthorization`,
verifies the JWT with `verifyJwsAccessToken` against the keys the jwt plugin returns from `auth.api.getJwks()`, cached
under one key, with the auth base url as issuer, `<app url>/mcp` as audience, and `at+jwt` as the type. It then runs
`enforceDpopBinding` with the request's method and path on the app's public url and a replay store on the database
adapter, so a DPoP-bound token needs its proof and a bearer token passes. Any failure is a visitor. The user is the
`sub` claim and the client is `azp`.

Alternative: `verifyAccessTokenRequest` with `jwksUrl`. It fetches the keys over HTTP from the server's own `/jwks`,
which fails in the in-process smoke and in CI.

### 2. A missing resource defaults to the MCP server

The provider signs a JWT only for a token bound to a resource, and a client that names none gets an opaque token the
server cannot verify locally. The authorize rewrite in `apps/api/api.ts`, which already forces `prompt=consent`, sets
`resource` to `<app url>/mcp` if the request names none. The provider locks the resource at login, so the token request
needs nothing.

### 3. One protected resource metadata for every MCP path

The plugin serves the RFC 9728 document through the auth handler at `/.well-known/oauth-protected-resource` and at the
path with `/mcp` appended. The root routes forward every `/.well-known/oauth-protected-resource` path to it, so
`/mcp/t/<topicId>` reads `resource: <app url>/mcp`, the value production advertises for it today. The authorization
server document comes from `oauthProviderAuthServerMetadata`, at the root and at the issuer path after it.

### 4. Registration stays open, and client metadata documents join it

`mcp()` turns dynamic registration off by default. The config sets `allowDynamicClientRegistration` and
`allowUnauthenticatedClientRegistration`, with `clientRegistrationDefaultApplicationType: "infer"` so a client returning
to a loopback or app address registers as native. The `cimd` plugin with the `mcp-2026-07-28` profile adds client
metadata documents, fetched through `@better-auth/cimd/node`. The registration rate limit moves to `/oauth2/register`.

### 5. The schema replaces the 1.6 tables

Two generated migrations drop the three 1.6 tables, then create the eight 1.7 ones, so drizzle-kit never asks whether a
table was renamed. The columns follow the plugins' models with snake_case names and plain timestamps, text arrays and
jsonb where the models say string arrays and JSON, and cascades from the user and the client as the 1.6 tables had.
The jwt plugin's model is renamed `jwk`, so the adapter's plural names the `jwks` table.

### 6. Smaller 1.7 changes

- `getIp` is `getIP` in `trustedProxies.ts` and its test.
- Secondary storage gains `getAndDelete` through Redis `GETDEL`, added to the store's command list and both fakes.
- `baseURL` falls back to the local app url as `MCP_RESOURCE_URL` does, since the provider names its issuer from it at
  startup and the unit tests set no `BETTER_AUTH_URL`.
- The consent page sends `oauth_query`, the query it was sent, and follows the returned `url`. It needs `sig` instead of
  a consent code.
- One `loadOAuthClientName` in `apps/api/mcp/oauthClientNames.ts` serves the tool caller, the consent page's route, and
  the `mcp_connected` hook, which now matches `/oauth2/token`.

## Risks / Trade-offs

- [A client sends `resource=<app url>/mcp/t/<topicId>`] → the provider rejects it as an invalid target. Clients take
  the resource from the protected resource metadata, which names `/mcp` on every path.
- [The 1.7 releases are days old] → 1.7.11 matches Dependabot's pick, and the smoke walks the whole flow from
  registration to a user's tool calls.
- [A DPoP replay store on the database adds a write per DPoP request] → only a DPoP-bound token pays it.

## Migration Plan

The migrate job drops the 1.6 tables and creates the 1.7 ones before the app deploys. After the deploy, check the root
discovery documents and the MCP `tools/list` probe. Rollback is reverting the commit and restoring the 1.6 tables with a
new migration. No client data is lost either way, since production holds none.
