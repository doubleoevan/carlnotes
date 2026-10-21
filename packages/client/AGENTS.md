# packages/client/

`@carlnotes/client`, the typed api clients, one module per domain named `<domain>Client.ts`. `apps/web` imports them as
`@carlnotes/client/<domain>Client`, and `@carlnotes/core` reads `authClient.ts` and `profileClient.ts`.

- `apiClient.ts` — the typed Hono client. An app calls `configureApiClient({ apiBaseUrl, showError })` once,
  `apiClient()` returns the `hc` client over `AppType`, `toApiUrl` prefixes a path with the base url for a plain
  `fetch`, and `showClientError` shows a message the way the app configured. Until an app configures it, a request
  goes to the page's own origin and an error goes to the console. `readApiErrorMessage` reads the api's error message
  from a failed response, and `ApiResponse` is the `ok`, `status`, `json`, and `text` of a response, the part the
  helpers read.
- `authClient.ts` — the Better Auth client, typed by the api's `auth` through `inferAdditionalFields`, which sends its
  `/api/auth` requests to the page's own origin, with the signed-in user's identity from the session and the
  signup-gate call for a password signup.
- Most clients build on `apiClient()`. Some calls, and all of `chatClient.ts`, `flagContentClient.ts`, and
  `voiceClient.ts`, use `fetch` at `toApiUrl` instead. `pageHeadClient.ts` reads a page's head data.
  `voiceClientTestFixtures.ts` holds the voice tests' topic voice chat page and spoken question timings.
  `fetchTestFixtures.ts` holds `stubFetch` and `stubFailingFetch`, the fetch stubs the client tests share.
- A client returns values and never touches the browser. `billingClient.ts` returns the Checkout and Customer Portal
  urls, and the web app sends the browser to them; `apps/web/src/lib/inviteUrl.ts` builds an
  invite token's url on the page's origin; and an error shows through the `showError` the app configures.
- Imports: `@carlnotes/contracts`, and `@carlnotes/api` as types only (`AppType` and `auth`), plus `hono`,
  `better-auth`, and `zod`. Never `@carlnotes/core`, which comes after it, and never a server package. Universal: the
  root rule.
- Tests: `bun test packages/client`.
