## 1. Dependencies

- [x] 1.1 Take Dependabot's group: better-auth at 1.7.11 in the api, the web app, and the client package, and the `ai`
  patch
- [x] 1.2 Add `@better-auth/mcp`, `@better-auth/oauth-provider`, and `@better-auth/cimd` at 1.7.11 to the api

## 2. Auth config

- [x] 2.1 Compose `jwt` with its model named `jwk`, `mcp` with open dynamic registration and inferred application
  types, and `cimd` with the `mcp-2026-07-28` profile, and export `MCP_RESOURCE_URL`
- [x] 2.2 Move the registration rate limit to `/oauth2/register`
- [x] 2.3 Add `getAndDelete` to the secondary storage through `GETDEL`, with `getdel` in the Redis store's command list
  and both fakes
- [x] 2.4 Fall back to the local app url for `baseURL`, so the provider names an issuer in the unit tests
- [x] 2.5 Rename `getIp` to `getIP`

## 3. MCP server

- [x] 3.1 Verify the access token in-process in `toolCaller.ts`, with the DPoP binding enforced, and read the user from
  `sub` and the client from `azp`
- [x] 3.2 Share the client name lookup as `loadOAuthClientName` in `mcp/oauthClientNames.ts` for the tool caller, the
  consent page's route, and the `mcp_connected` hook on `/oauth2/token`
- [x] 3.3 Default a missing `resource` to `/mcp` in the forced-consent authorize rewrite at `/oauth2/authorize`
- [x] 3.4 Serve the authorization server document from `oauthProviderAuthServerMetadata`, and every protected resource
  path from the plugin's one document

## 4. Consent and login

- [x] 4.1 Post the consent page's signed query as `oauth_query` and follow the returned `url`
- [x] 4.2 Return from login to `/api/auth/oauth2/authorize` with the whole signed query

## 5. Schema

- [x] 5.1 Replace the 1.6 OAuth tables with the 1.7 models in `packages/db/schema/users.ts`
- [x] 5.2 Generate the migration that drops the 1.6 tables, then the one that creates the 1.7 tables, and apply both to
  dev
- [x] 5.3 Update the schema test for the new tables and their cascades

## 6. Verification

- [x] 6.1 Walk the MCP smoke from registration through the login return, a posted authorize, consent, the form-encoded
  token exchange, and a user's tool calls, with the oauth checks in their own `mcpOAuthSmokeSections.ts`
- [x] 6.2 Run the preflight gate and the smoke suite
- [ ] 6.3 After the deploy, check the root discovery documents and the MCP `tools/list` probe on production
