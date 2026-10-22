## MODIFIED Requirements

### Requirement: OAuth on the transport, optional until a tool needs an account
The app SHALL act as the OAuth authorization server for its MCP server through Better Auth's `mcp` plugin from
`@better-auth/mcp`, with the `jwt` plugin signing its access tokens. It SHALL serve
`/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` at the origin root, the first also
at the issuer path after it, and every protected resource path, the topic-bound `/mcp/t/<topicId>` included, SHALL
return the one protected resource metadata naming `/mcp` as the resource. A client SHALL register by dynamic client
registration, which takes no credential, or by a client metadata document, and SHALL use PKCE. An authorize request that
names no resource SHALL ask for `/mcp`, so every access token is a JWT bound to `/mcp`, and the server SHALL verify it
in-process against the auth server's signing keys, with a DPoP-bound token's proof checked too. An unauthenticated
connection SHALL work. A tool that needs an account, called by a visitor, SHALL return an ordinary tool result whose
text names what connecting an account enables and that the client's connect control does it, and SHALL NOT respond with
an HTTP 401. Signing in on the way to an authorize request SHALL return the user to that authorize request with its
whole signed query, and consent SHALL render on the app's own page naming the client, which SHALL send that signed query
back with the user's answer.

#### Scenario: Discovery documents are served at the root
- **WHEN** a client fetches `/.well-known/oauth-authorization-server`
- **THEN** it receives the authorization, token, and registration endpoints under the app's auth path, after `/oauth2`

#### Scenario: A visitor is told what an account enables
- **WHEN** an anonymous client calls `rate_finding`
- **THEN** the result's text says the tool needs a connected account and that reading and searching public topics work
  without one, and the connection stays usable

#### Scenario: Sign-in returns to the authorize step
- **WHEN** a visitor is sent to the login page by an authorize request
- **THEN** after signing in they land back on the authorize request with every OAuth parameter and its signature intact,
  then on the consent page

#### Scenario: A token resolves to its user
- **WHEN** a client sends an unexpired access token the auth server signed for `/mcp`
- **THEN** the caller resolves to that token's user and reads as that user would

#### Scenario: A topic-bound path reads the MCP server's protected resource metadata
- **WHEN** a client fetches `/.well-known/oauth-protected-resource/mcp/t/<topicId>`
- **THEN** it receives the protected resource metadata naming `/mcp` as the resource, so its token works on the
  topic-bound path too
