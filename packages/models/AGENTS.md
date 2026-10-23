# packages/models/

`@carlnotes/models`, every model call, user key, budget, prompt, and screen: where the api, the pipeline, the worker,
and the evals all start. It imports `@carlnotes/db`, `@carlnotes/server`, and `@carlnotes/contracts`, with `ai`,
`@ai-sdk/openai`, the Langfuse and OpenTelemetry packages, and `tesseract.js`.

- `models.ts` — every model call, through LiteLLM; `litellm.ts` — the user keys that those calls bill to, over
  `litellmProxy.ts`, the proxy's key api that creates, deletes, and reads a key. A key is created at signup, or by
  `loadOrProvisionUserLiteLLMKey` before a user's first model call if that user has no key. A key is also replaced,
  read, and reset on the first of the month by the reset job (`apps/worker/resetMonthlyBudgets.ts`), and
  `isUserLiteLLMKeyBudgetStale` tells billing whether a key's max budget still matches its user's budget. Every proxy
  admin call times out after five seconds. A Scan creates its owner's missing key before any Source runs.
  `litellmTestFixtures.ts` is the stub proxy, the connection pool stub that keeps the call order, the user row, and the
  setup and restore that each LiteLLM test file runs around every test.
- `budget.ts` — a Scan's one Budget, which every scan stage charges; nothing spends outside it. A Resource reserves
  its largest cost in the Budget's `reservedDollars` with `reserveScanSpend` before its paid section and releases it
  with `releaseScanSpend` after. A Resource starts while the spent and reserved dollars are below the Scan's limit, so
  parallel review passes it by at most one Resource's largest cost. The heartbeat checkpoints
  `toCheckpointBudget`, the settled spend without the reservations, and `toResumedBudget` starts a retried attempt with
  none. It also prices the calls the api meters itself: `speechCost` by its speech tier and `transcriptionCost`, and
  `toEstimatedTokens` turns a text length into the tokens a cost estimate prices.
- `spendReservations.ts` — `reserveUserSpend` reserves a chat turn's, a transcription's, or a spoken part's largest cost
  against the user's monthly budget, a soft limit: the call starts while the app's own monthly spend sums and the open
  reservations in the Redis sorted set `spend-reservations:<userId>` are below the budget, even if its largest cost
  would pass it, so the month passes the budget by at most about one call's largest cost. One Lua script decides and
  adds. A spoken part is rejected by recorded spend alone, since its chat turn already holds a reservation. A budget
  that the spend and open reservations have reached returns `"rejected"`, and a reservation is released once the call's
  spend row is written or the call fails, or expires after the call kind's longest run plus a minute. If Redis cannot
  run the script, a user under budget runs, and the call's release still removes a member the script may have added
  late. `transcription.ts` prices its largest cost as `MAX_TRANSCRIPTION_DOLLARS`, and `speech.ts` a spoken part's as
  `maxSpokenAnswerDollars`. `spendReservationTestFixtures.ts` stubs `reserveUserSpend` for the api tests, with a release
  they read.
- `telemetry.ts` traces model calls in Langfuse on its own tracer provider beside Sentry's, and both processes start
  Sentry before it.
- `speech.ts` sends one two-speaker call per chapter through LiteLLM's Gemini pass-through and returns a WAV, and one
  single-speaker call in the answering host's voice for a spoken chat reply, which ffmpeg encodes to a 64 kbps MP3, or
  returns as the WAV if the encode fails. It reads the speech model from `@carlnotes/server/podcastEpisodeSettings`. A
  spent key budget, a retryable failure, and a rejection are sorted by `toModelCallFailure`, which the speech and the
  transcription calls share. `speech.smoke.ts` (`bun run smoke:speech`) checks both against the live proxy.
- `ffmpeg.ts` runs one ffmpeg process through its pipes, for the chapter join, the api's cover encode, a chat
  recording's transcode, and a spoken chat reply's MP3. `transcription.ts` transcodes a chat recording to 16 kHz mono
  WAV, reading only the containers and codecs a browser records, and transcribes it through Google's Interactions API on
  LiteLLM's Gemini pass-through on the user's key with store set to false, so Google keeps no recording. A WAV with no
  samples is silent and makes no call. The pass-through does not meter that route, so the key is never charged for a
  transcription, and the api's spend row, priced by `transcriptionCost` in `budget.ts`, is the only meter.
- Untrusted text is screened by LLM Guard (`guard.ts`) before any model reads it. `screenImage` screens the text a chat
  image shows, read with text recognition in `imageText.ts`, using tesseract.js and its installed English data, which
  it resolves from this package. With `LLM_GUARD_URL` unset it returns skipped before the text recognition code loads,
  so an image costs no call and no wait. `guardTestFixtures.ts` runs a test against a fake scanner that returns one
  verdict, or with no scanner at all.
- `prompts/` — the model-facing Markdown templates, each with YAML frontmatter and a `{{variable}}` body, loaded by
  thin builders: `write.ts` fills a template, `fetch.ts` loads a prompt from the Langfuse registry first and falls back
  to the bundled Markdown, with `promptTelemetry` naming the version that served it, and `sync.ts` (`bun run
  prompts:sync`, or `prompts:sync:prd` for production) pushes each bundled template up to Langfuse. `markdown.d.ts`
  types the `.md` imports, and `untrustedFenceTestFixtures.ts` serves the tests that read a prompt's untrusted fences.
  The prompt-authoring skill owns the conventions.
- Imports: `@carlnotes/db`, `@carlnotes/server`, and `@carlnotes/contracts`; `@carlnotes/emails` comes before it in the
  order and nothing here needs it. Never `pipeline` or an app.
- Tests: `bun test packages/models`; `*.smoke.ts` hit real services and run under `doppler run`.
