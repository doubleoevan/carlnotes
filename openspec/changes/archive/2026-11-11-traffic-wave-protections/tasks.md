## 1. The model call runner

- [x] 1.1 Get the user's approval of design decisions 1, 2, 3, 6, 7, and 8 before any code changes, and record any
      number or exemption they change in `design.md` and the two spec deltas
- [x] 1.2 `packages/server/retry.ts`: add the optional `toDelayMs(error, attempt)` that returns the next wait or null to
      fail now, used in place of `delayMs`; every existing caller unchanged; `retry.test.ts` covers a returned wait, a
      null, and the fixed `delayMs` path
- [x] 1.3 `packages/models/modelCallFailure.ts`: move `toModelCallFailure` and its type out of `speech.ts`, which
      imports them; the speech tests pass unchanged
- [x] 1.4 `packages/models/modelCallRetry.ts`: `runModelCall({ runAttempt, waitDeadlineAt, label })` with the
      retryable sorting, the four Retry-After headers through the cause chain, the jittered backoff, the 30 s single
      wait, the 60 s total, the 3-minute elapsed bound, the deadline check before each wait, one log line per retry
      that names the label, status, attempt, wait, and which Retry-After header was read (none for a private call
      beyond the label), and the `ponytail:` comment from decision 3; `modelCallRetry.test.ts` with a fake sleep and
      clock covers a 429 then a success, a 429 that outlasts the waits, a 400 and a spent-budget 429 that fail at once,
      a 408, a thrown `TimeoutError`, each header form, a Retry-After past 30 s, a wait past the total or the deadline,
      a premium attempt past 3 minutes, and a jitter test with an injected random
- [x] 1.5 `packages/models/models.ts`: `embedVector`, `embedVectors`, and `embedPrivateVectors` take an optional
      `maxRetries` that defaults to the AI SDK's own; the existing embedding tests pass and their other callers are
      untouched
- [x] 1.6 `packages/models/AGENTS.md` names `modelCallRetry.ts` and `modelCallFailure.ts`; `bunx knip` passes

## 2. The Scan's calls go through the runner

- [x] 2.1 `packages/models/budget.ts`: `modelCallWaitDeadlineAt` on `Budget`, null from `newBudget`, left out by
      `toCheckpointBudget`, null from `toResumedBudget`; `canScoreResource` starts no Resource past the deadline;
      `budget.test.ts` covers the checkpoint, the resume, and the deadline
- [x] 2.2 `packages/pipeline/stageTimeouts.ts`: `REVIEW_MODEL_CALL_WAIT_DEADLINE_MS` of 20 minutes beside
      `REVIEW_TIMEOUT_MS`; `apps/worker/workflows/runTopicScanActivities.ts` sets the stage budget's deadline in
      `reviewForScan` on each attempt; a worker test shows a second attempt gets a fresh deadline
- [x] 2.3 `packages/pipeline/review/score.ts`: each scoring tier's `generateText` runs per attempt inside
      `runModelCall` with `maxRetries: 0`, with `chargeScoringFailure` and `charge` inside the attempt; `score.test.ts`
      covers a 429 then a success (one Finding, charged once), a 429 that outlasts the waits (reported once, no
      Finding, reservation released), and a 400 that fails at once (one attempt)
- [x] 2.4 `packages/pipeline/personalSources/scoreResource.ts`: the private scoring call goes through the runner with
      the label alone in its log; a test shows a 429 then a success and that no prompt text reaches the log
- [x] 2.5 `packages/pipeline/review/filter.ts` and `topicContext.ts`: the embedding batch and the query embeddings go
      through the runner with `maxRetries: 0`; `filter.test.ts` shows a 503 then a success stores every vector and a
      spent budget marks the batch failed after one attempt
- [x] 2.6 `packages/pipeline/review/summarize.ts`: drop `REPORT_MAX_RETRIES`, run the report through the runner with
      `maxRetries: 0`; a test shows a spent budget makes one attempt and leaves the report empty
- [x] 2.7 `packages/pipeline/AGENTS.md` and `apps/worker/AGENTS.md`: name the runner and the review's wait deadline
      where they describe scoring and the review stage; `bun test packages/pipeline packages/models apps/worker` passes

## 3. The api limits

- [x] 3.1 Measure, in the browser signed in, the api calls the home page and a topic page with a running Scan
      send on load and in their first minute; record both counts in `design.md` decision 6, and stop and report to the
      user if either page sends more than 60 api calls on load
- [x] 3.2 `apps/api/rateLimit.ts`: `toRateLimiter` skips a request with no user and no external address on the limiters
      over the reads a page render calls, the search and social read limiters; a `rateLimit.test.ts` case shows the
      social read limiter lets 200 address-less requests through and still limits a signed-in user and an external
      address
- [x] 3.3 `apps/api/rateLimit.ts`: the general limiter (1,800, `rate-limit:api`), the topic feed limiter (120,
      `rate-limit:topic-feed`), and the link preview limiter (120, `rate-limit:link-preview`), each with
      `standardHeaders: false` and the 429 from design decision 9; tests for each cover the limit by user and by
      address, `Retry-After` and `Cache-Control` on the 429, no `RateLimit` header on an allowed response, and the
      memory fallback with Redis unreachable, stubbed the way `redisRateLimits.test.ts` does
- [x] 3.4 `apps/api/api.ts`: mount the general limiter after the session lookup with the exempt path matcher from
      decision 7, and the topic feed limiter on `GET /topic-feed`; `apps/api/topic/findings.ts`: the link preview
      limiter on its route; `api.test.ts` shows an exempt path (a webhook, a podcast feed, an auth path) is never
      counted and a counted path is
- [x] 3.5 A test in `pageRender.test.ts` or `api.test.ts` sends 2,000 requests to `/api/topic-feed` and
      `/api/topic-posts/:id` as a server render does, from `http://localhost:3000` with no cookie and no
      `x-forwarded-for`, and none gets a 429
- [x] 3.6 Docs: the README drops "`/api/topic-feed` has no rate limit" and its load test note says the run is unlimited
      because the limits skip this machine's address, and that a run against production meets the limits at once;
      `apps/api/AGENTS.md`'s `rateLimit.ts` paragraph names the general, topic feed, and link preview limits, the
      exempt paths, and the skip for a visitor with no external address

## 4. Verification

- [x] 4.1 `bun run check` passes: Biome, the component conventions, the package boundaries, knip, both parity checks,
      the purchase paths, the contract freeze, `tsc -b`, the workflow bundles, `bun test`, and the MCP view smoke
- [x] 4.2 `bun run smoke:review` under `doppler run` completes a review with the runner in place, and its log shows no
      retry line on a healthy run
- [x] 4.3 Run the comment-groups check by hand on every changed `.ts` file, and sweep the diff for the rejected words
      and full-noun names in the domain-model skill and the memory notes

## Workflow follow-up

- Ship through `/ship`, which archives the change with `openspec archive traffic-wave-protections --yes`.
