# packages/client/

`@carlnotes/client`, the typed api clients, one module per domain named `<domain>Client.ts`. `apps/web` imports them as
`@carlnotes/client/<domain>Client`, and `@carlnotes/core` reads `authClient.ts`, `profileClient.ts`, `topicClient.ts`, and `topicFindingClient.ts`.

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
  `configureAuthClient({ baseURL, plugins, headers })` once at startup, before the first screen, and gets its client typed with
  its plugins back. Optional headers carry native device descriptions through sign-in. `authClient()` returns that client to every importer, or the browser's own client, which sends its
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

`topicFindingClient.ts` exposes Finding write helpers with named options: finding id, action fields, and optional `shouldThrowOnError`.
Default calls retain the existing failure message and resolve after reporting. Opt-in calls reject after reporting so optimistic clients can roll back.
`clientWrite.ts` owns this shared rejection and error-message policy for Topic and Finding writes.
Opening a Finding always keeps its background failure silent. Topic-page reads in `topicClient.ts` distinguish visible, gated, and missing responses from transport or server failures.
`sendFindingFeedback` also accepts named options and opt-in rejection, so a details panel only acknowledges a saved note and retains failed text for retry.
`topicFindingClient.test.ts` covers successful writes, HTTP and network rejection, silent opens, and failed page reads.

`noteClient.ts` reads and writes notes through the existing endpoints. `fetchNote` and `fetchNotes` accept
`shouldThrowOnError` to distinguish retryable reads from missing or forbidden notes. Comments and badge reads reject
failures so consumers retain confirmed content. `sendNoteRead` returns whether the server accepted the read.
`noteClient.test.ts` covers these outcomes, including transport failures and read acknowledgements.

Native forms reuse the existing Topic, Team, profile, invite, and billing clients. Avatar and attachment uploads
accept a platform-built FormData body. Team member visibility and join-request withdrawal reject failed HTTP writes;
callers must retain their current state and show failure rather than report success.

`fetchTopicAttachment` downloads attachment bytes with the configured session headers and rejects failed access.
Native file viewing uses this client so it does not depend on a browser session.

`chatClient.ts` keeps the shared incremental UTF-8/NDJSON reader for `sendChatTurn`. The caller supplies a streaming
fetch and AbortSignal; native aborts can be plain Errors, so an aborted signal is authoritative. `chatStreaming.test.ts`
checks byte-split multibyte text, tool callbacks before EOF, and native cancellation. No transport retries a chat POST.

`podcastEpisodeClient` resolves audio through the existing authorized route with `Accept: application/json` and
refuses redirects. Only the returned HTTPS media URL reaches a platform player, without session headers. Sources
stay in memory. Episode/feed reads can opt into `PodcastEpisodeRequestError`: 401/403/404 retire access; transport
and server failures remain retryable. Legacy nullable defaults remain unchanged. Listen writes accept a retirement
signal, and `fetchApi` checks cancellation after asynchronous session headers, before dispatch.
