# packages/client/

`@carlnotes/client`, the typed api clients, one module per domain named `<domain>Client.ts`. `apps/web` imports them as
`@carlnotes/client/<domain>Client`, and `@carlnotes/core` reads `authClient.ts` and `profileClient.ts`.

- `apiClient.ts` — the typed Hono client and the plain fetch beside it. An app calls `configureApiClient` once with
  the api base url and `showError`, and an app with no cookie jar adds `headers`, a function whose headers every
  request sends, `credentials`, and `onUnauthorized`, which a 401 from any request calls. `apiClient()` returns the
  `hc` client over `AppType`, `fetchApi(path, init)` is the one plain fetch, at the base url with the configured
  headers and credentials, `toApiUrl` prefixes a path with the base url for a url the platform loads itself, such as
  an avatar image or an `EventSource`, and `showClientError` shows a message the way the app configured. Until an app
  configures it, a request goes to the page's own origin and an error goes to the console. `readApiErrorMessage` reads
  the api's error message from a failed response, and `ApiResponse` is the `ok`, `status`, `json`, and `text` of a
  response, the part the helpers read.
- `authClient.ts` — the Better Auth client, typed by the api's `auth` through `inferAdditionalFields`. An app calls
  `configureAuthClient({ baseURL, plugins })` once at startup, before the first screen, and gets its client typed with
  its plugins back. `authClient()` returns that client to every importer, or the browser's own client, which sends its
  `/api/auth` requests to the page's own origin, if no app configured one. Configuring after a first use throws an
  error, and `resetAuthClient` drops the client for a test file that configures its own. `AuthClient` is the client's
  type as the shared code sees it. Beside them the signup-gate calls:
  `passSignupGate` for the web's Turnstile token, and `fetchAppSignupChallenge` and `passAppSignupGate` for the mobile
  app's attestation, the second through the auth client's own fetch, whose cookie jar keeps the gate cookie for the
  sign-up request.
- Most clients build on `apiClient()`. Some calls, and all of `chatClient.ts`, `flagContentClient.ts`, and
  `voiceClient.ts`, use `fetchApi` instead. `pageHeadClient.ts` reads a page's head data.
  `viewerCountsClient.ts` sends a topic page's view and reads a topic's or a podcast episode's counts, a public
  topic's without credentials so the edge can cache them.
  `voiceClientTestFixtures.ts` holds the voice tests' topic voice chat page and spoken question timings.
  `fetchTestFixtures.ts` holds `stubFetch` and `stubFailingFetch`, the fetch stubs the client tests share.
- A client returns values and never touches the browser. `billingClient.ts` returns the Checkout and Customer Portal
  urls, and the web app sends the browser to them; `apps/web/src/lib/inviteUrl.ts` builds an
  invite token's url on the page's origin; and an error shows through the `showError` the app configures.
- Imports: `@carlnotes/contracts`, and `@carlnotes/api` as types only (`AppType` and `auth`), plus `hono`,
  `better-auth`, and `zod`. Never `@carlnotes/core`, which comes after it, and never a server package. Universal: the
  root rule.
- Tests: `bun test packages/client`.
