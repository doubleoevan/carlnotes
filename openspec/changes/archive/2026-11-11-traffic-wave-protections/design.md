## Approval

The user approved decisions 1, 2, 3, 6, 7, and 8 as written on 2026-11-10.

## Context

See proposal.md for why. This section lists only the facts the decisions rest on, as observed in the code on
2026-11-10.

**Model calls.**

- `scoreResourceContent` in `packages/pipeline/review/score.ts` and the private scorer in
  `packages/pipeline/personalSources/scoreResource.ts` pass `maxRetries: 0`. `embedVector`, `embedVectors`, and
  `embedPrivateVectors` in `packages/models/models.ts` pass nothing, so they get the AI SDK's default of 2 retries. The
  report call passes `REPORT_MAX_RETRIES = 4`.
- The AI SDK (7.0.145) retries an `APICallError` whose `isRetryable` is true: a 408, 409, 429, or 5xx. It waits
  2 s, then 4 s, then 8 s, with no jitter. It reads `retry-after-ms` and `retry-after` from the error's
  `responseHeaders` and uses them if they are under 60 s. It cannot tell a rate limit from a spent budget, because
  LiteLLM sends a spent budget as a 429 too. So today the report call and every embedding call try a spent budget
  again.
- LiteLLM, read in the local v1.94.0 source with v1.106.4 pinned in `infra/litellm/Dockerfile`, returns the
  provider's response headers on an error. It returns them unchanged if the exception holds them, and otherwise
  under an `llm_provider-` prefix, for example `llm_provider-retry-after`. It sets a bare `retry-after` of its own
  only if its router is cooling a deployment down. Its router tries a rate limit twice more and a timeout once more
  (`retry_policy: TimeoutErrorRetries: 1`) before the AI SDK sees an error. Whether Fireworks itself sends
  `Retry-After` on a 429 has not been observed.
- The per-alias timeouts are `cheap-model` 45 s, `score-model` 150 s, and `embed-model` 30 s. With the router's
  timeout retry, one timed-out attempt from the AI SDK's side takes about 90 s, 300 s, and 60 s.
- `isBudgetRejection` in `packages/models/models.ts` finds a spent budget anywhere in an error's cause chain.
  `toModelCallFailure` in `packages/models/speech.ts` already sorts a status and a body into `budget-spent`,
  `retryable` (a 429 or a 5xx), or `rejected`. `runWithRetries` in `packages/server/retry.ts` waits a fixed
  `delayMs`.
- `REVIEW_TIMEOUT_MS` is 30 minutes per attempt, and the review may be attempted twice. `withHeartbeat` in
  `apps/worker/workflows/runTopicScanActivities.ts` heartbeats on a 30-second `setInterval`, and Temporal fails the
  attempt after 2 minutes without one. A Scan scores at most 30 Resources (`MAX_SCORED_RESOURCES_PER_SCAN`), 4 at a
  time (`REVIEW_CONCURRENCY`), which makes 8 rounds. The filter embeds candidates in batches of 100, one batch at a
  time.
- The Budget already holds `reservedDollars`, which belongs to one attempt. `toCheckpointBudget` leaves it out of
  the heartbeat and `toResumedBudget` resets it.

**Api limits.**

- `apps/api/rateLimit.ts` holds twelve limiters, not five. All but one are built by `toRateLimiter`, which keys by
  `toRateLimitKey`: the user, else `address:<ip>`, else the one `shared` bucket. It sends `draft-6` rate limit headers
  and a JSON 429 with no `Retry-After`. `pageRenderRateLimiter` instead skips a request with a session cookie or with
  no external address, sends no rate limit headers, and sets `Retry-After: 60`.
- `configureWebApiClient` points a server render's requests at `http://localhost:3000` and sends no cookie and no
  `x-forwarded-for`. `resolveClientAddress` returns null for such a request, so `toRateLimitKey` puts it in the
  `shared` bucket. The Topic Post page's loader calls `GET /api/topic-posts/:id`, which sits behind
  `socialReadRateLimiter`. So every visitor's Topic Post render on the site shares that limiter's 120 a minute. The
  edge's one-minute copy is the only thing that hides the problem.
- In dev, vite forwards the browser's `/api` requests to port 3000 from loopback, so they resolve to no external
  address either.
- Every webhook route is under `/api/webhooks/`. The GitHub webhook is mounted outside `apiRoute`. The health checks
  are mounted ahead of `apiRoute` and never reach it.
- The busiest client behaviors, from `packages/core/`, are listed in decision 6.

## Goals / Non-Goals

**Goals:**

- One model call runner that every covered Scan call goes through, and no client-side retry anywhere else on those
  calls.
- A worst case that provably fits inside one review attempt.
- Limits that no real client reaches, reusing the existing Redis counter and its memory fallback.

**Non-Goals:**

- Changing the LiteLLM router's own retries. They serve every app caller, chat included.
- Patient retries for model calls outside a Scan: chat, podcast scripts, moderation, Personal sources topic matching.
- A cross-replica throttle on model calls.
- Any change to the limits or keys of the existing limiters, beyond skipping a visitor with no external address.

## Decisions

### 1. The attempt count and the longest wait: 5 attempts, 60 s of waiting, no wait past the review's 20th minute

**For approval.**

| Bound | Value | Why |
| --- | --- | --- |
| Attempts per call | 5 | The four backoff waits below sum to at most 58 s, so the fifth attempt still fits the 60 s total. |
| Longest single wait | 30 s | A wait longer than 30 s means the provider will not recover inside the call's 60 s. |
| Waiting per call | 60 s | Over 8 rounds, two scoring calls per Resource could add 16 minutes at most. |
| Elapsed time before an attempt | under 3 min | A timed-out `score-model` attempt takes 300 s, so it never retries, as today. A timed-out `cheap-model` attempt takes 90 s, so it retries once. A timed-out embedding takes 60 s, so it retries up to twice. |
| No wait ends after | review attempt start + 20 min | This leaves 10 minutes for the attempts in progress, the report, and the closing writes. |

Worst case for one review attempt: the embedding batches, then 8 rounds of a cheap and a premium score per Resource,
then the report. The waits alone could add more than 20 minutes, which is why the wait deadline exists. Once the
deadline passes, a retryable failure fails at once, as it does today, and `canScoreResource` starts no new Resource.
The Resources left are deferred, as they are at the Scan's limit. A call in progress is never cut off. The
heartbeat keeps running, because `Bun.sleep` does not block the event loop and the 30-second `setInterval` pump keeps
firing. No single wait (30 s at most) comes near the 2-minute heartbeat timeout anyway.

A Retry-After past 30 s, or a wait that would pass the call's 60 s or the review deadline, fails the call at once,
without sleeping first. Sleeping and then failing would only delay the same outcome.

**Alternatives.** Per-call limits alone, with no review deadline: rejected, because 8 rounds of two 60-second waits
plus the embedding and report waits can reach the 30-minute timeout. That would fail the whole attempt, not just one
Resource. A `Promise.race` timeout around each call: rejected, because it abandons a paid call in progress and loses its
usage.

### 2. Retry-After: read it in four forms, and back off with jitter if none is there

**For approval.** LiteLLM does pass Retry-After through. It passes the provider's own header unchanged or under the
`llm_provider-` prefix, and it adds a bare `retry-after` if its router is cooling a deployment down. The AI SDK puts
those headers on `APICallError.responseHeaders` but reads only the unprefixed two. The runner reads, in order:
`retry-after-ms`, `retry-after` (seconds or an HTTP date), `llm_provider-retry-after-ms`, and
`llm_provider-retry-after`. It walks the error's cause chain the way `isBudgetRejection` does.

If no header names a wait, the runner backs off 4 s × 2^(attempt − 1), limited to 30 s, and scaled by a random
50 to 100 percent: 2–4 s, 4–8 s, 8–16 s, then 15–30 s. That is the jitter shape `toReconnectStreamDelayMs` already uses.
The jitter keeps two worker replicas, and their 32 calls each, from retrying in step.

Whether Fireworks sends `Retry-After` on its 429s is not known, so the tests cover both a header and no header.
Apply task 1.4 logs which header, if any, the first real 429 sent, and nothing else about it.

### 3. Repeated rate limits do not lower the Scan's review concurrency

**For approval: no.** A waiting call holds its concurrency slot without calling the provider. So during a wave, the
Scan's request rate already falls by however long its calls wait, with no new state. A per-Scan slowdown would not fix
the real pressure either. The pressure is up to 64 calls from two replicas against one per-model limit, and a fix
would need a token bucket shared in Redis per model alias. The runner leaves a `ponytail:` comment naming that upgrade,
for the case where waits are seen to outlast the 60 s limit often. The retry log line from decision 5 is what would
show it.

### 4. One runner in `packages/models/`, built on `runWithRetries`

- `runWithRetries` gains an optional `toDelayMs(error, attempt)`, used in place of the fixed `delayMs`. It returns the
  next wait, or null to fail now. Every existing caller keeps `delayMs`.
- `packages/models/modelCallFailure.ts` takes `toModelCallFailure` and its type out of `speech.ts`, which then imports
  them. The runner and speech share that one sorting.
- `packages/models/modelCallRetry.ts` exports `runModelCall({ runAttempt, waitDeadlineAt, label })`. It counts as
  worth another attempt:
  - an `APICallError` whose `toModelCallFailure` outcome is `retryable`, or whose status is 408;
  - a thrown `TimeoutError` or `AbortError`, or a network failure with no response.

  A spent budget (`isBudgetRejection`), any other 4xx, and a `NoObjectGeneratedError` fail at once.
- Every covered call passes `maxRetries: 0`, so the runner is the only retry on the client's side. `embedVector`,
  `embedVectors`, and `embedPrivateVectors` take an optional `maxRetries` that defaults to the AI SDK's own. The Scan's
  calls pass 0, and their other callers keep today's behavior: chat's docs retrieval, the docs embed, and Personal
  sources topic matching. A chat turn should not wait up to a minute on an embedding.
- Charging stays inside each attempt. `.catch(chargeScoringFailure)` and the following `charge` run per attempt, so
  only an attempt that returned usage is charged. The Resource's reservation is taken before `scoreResource` and
  released in its `finally`, so it already spans every wait.

**Alternative.** Keep the AI SDK's retry and add `additionalRetryableError`: rejected, because that option can only add
retryable errors, not remove a spent budget's 429. It also has no jitter and no total limit.

### 5. The review deadline rides on the Budget, like `reservedDollars`

`Budget` gains `modelCallWaitDeadlineAt: number | null`, which belongs to one attempt. `newBudget` sets null,
`toCheckpointBudget` leaves it out, and `toResumedBudget` resets it to null. `reviewForScan` sets it on its stage
budget to `Date.now() + REVIEW_MODEL_CALL_WAIT_DEADLINE_MS`, a new constant in `stageTimeouts.ts` beside
`REVIEW_TIMEOUT_MS`. Every covered call already receives the Budget: the scoring calls, the filter's batches,
`loadTopicContext` through the review, and the report. A null deadline means only the per-call limits apply, which is
what the smoke scripts and any call outside a review get.

Each retry logs one line: the label (`scoringCheap`, `scoringPremium`, `embedding`, `scan-report`), the status, the
attempt, and the wait. A private call logs its label alone, and no call logs its prompt or its key. A call that still
fails is reported by its caller once, as today.

**Alternatives.** An `AbortSignal` threaded beside the Budget: rejected, because `fetchAndScoreResources` already takes
nine positional parameters, and the Budget already reaches every covered call. A module-level deadline: rejected,
because 8 Scans share one replica.

### 6. The numbers: 1,800 general, 120 topic feed, 120 link preview, a minute per caller

**For approval.** Each number is set against the busiest real behavior of one person, from the shared hooks in
`packages/core/` that both apps run:

| Client behavior | Requests a minute |
| --- | --- |
| Topic page scan poll (`scanPoll.ts`), 3 s for the first 30 s, then 10 s, then 30 s | 20 at most |
| Topic image render poll (`useTopicImageRender.ts`), 3 s for up to 20 min | 20 |
| Podcast episode recording poll (`useShownPodcastEpisode.ts`), 5 s | 12 |
| Personal sources refetch, 15 s on up to three queries | 12 |
| Topic Post Discussion poll 15 s, film render poll 30 s | 6 |
| Update badge and note badge polls 45 s, counts poll 60 s | 4 |
| Stream reconnects (`streamReconnect.ts`), from 0.5 to 1 s doubling to 30 s, two streams | about 16 |
| Page navigation: an estimated 30 api calls per page, a fast user at 10 pages a minute | about 300 |
| Feed refetch after each rating, consume, or bookmark (`useTopicFindingActions.ts`), one every 2 s | 30 |

One busy tab with every poll running at once comes to about 420 a minute. One active tab plus two idle tabs or
devices polling comes to about 600. Three tabs all navigating at full speed would reach about 1,260, but one person
cannot drive that.

- **General, 1,800 a minute** (30 a second): three times the realistic heavy case of 600, and still above the
  impossible three-tab case. A visitor's server render is exempt, so a visitor's own browser sends only the counts poll
  and a few reads. 1,800 then covers dozens of visitors behind one carrier NAT address. A script at 30 a second is
  stopped, and the expensive routes each have their own lower limit.
- **Topic feed, 120 a minute**: the busiest real use is about 30 refetches during fast triage, plus focus refetches and
  a mobile pull to refresh, so 40 at most. Keyed by the user, else the address. The user's brief named an address limit
  for the signed-out feed. This design keys the signed-in feed by user too, because a signed-in request bypasses the
  edge and builds the user's own feed, the costlier read.
- **Link preview, 120 a minute**: a person moving across a film's chapter tooltips, each opening a preview, sends
  about 1 a second at most. The query cache keeps each finding's preview, so a second look sends nothing. Keyed the
  same way, for the same reason: an uncached url costs an outbound fetch, whoever asks.

The page fan-out of 30 was an estimate. Apply task 3.1 measured it on 2026-11-11, signed in, in this change's built ui
on its own port, counting every `/api/` request the browser sent:

| Page | On load | First minute | What the first minute adds |
| --- | --- | --- | --- |
| Home | 34: 22 images, 12 reads | 38 | the 60 s badge and counts polls, 4 requests |
| Topic page with a running Scan | 28: 8 images, 20 reads | 44 | the scan poll 9 times, the Personal sources refetch 3 times, and the 4 badge polls |

Both pages stay under the 60 on load that would have stopped apply, and close to the estimate of 30. The topic page
sends the topic feed twice on load, far under its limit of 120. In production the topic images are cached at the edge
and mostly never reach the api.

### 7. Exemptions, and the existing limiters' routes are counted

**For approval.** The general limiter is mounted in `apiRoute` right after the session lookup, so it knows the user.
It skips:

- `/api/auth/*`: Better Auth's own limits.
- `/api/webhooks/*`: signed senders, from shared addresses.
- The podcast app's paths: `GET /api/topics/:id/podcast-feed`, `/api/podcast-feeds/*`, `/api/podcast-covers/*`, and
  a podcast episode's `audio.mp3`, `video.mp4`, `captions.vtt`, `chapters.json`, and `transcript.html`. Aggregators fetch
  private feeds for many users from a few addresses, and a player sends many range requests.
- The `preview.png` share cards: social crawlers, from shared addresses. Every file path is matched on its own route
  and on a read alone, so a write or a look-alike name on another route is counted.
- `/api/unsubscribe`: mail scanners.

The health checks and the GitHub webhook never reach `apiRoute`, so they need no entry. The skip is one path matcher
beside the limiter. Every path above is matched by pattern, not by a route constant, since several are built in route
files.

The routes that already have a limiter are counted by the general limit too, and not exempted. Their own limits are
all 120 a minute or less, so the general limit never decides for them, and counting them keeps the exempt list to the
callers that really share addresses. The topic feed and the link preview are counted twice for the same reason.

### 8. The limiters a page render reaches skip a visitor with no external address

**For approval.** This goes beyond the brief's "leave the existing limiters as they are", because one of them breaks
its rule that a render's loopback calls are never limited. The limiters over the reads a page render calls take the
page render limiter's skip: no user, and `isExternalAddress(resolveClientAddress(request))` is false. Those are the
three new limiters, the search limiter, whose page loads its results on the server, and the social read limiter.
`toRateLimiter` takes the skip as an option. Every other limiter keyed by user or address, such as the app signup gate
and the MCP caller limit, keeps counting such a request in the `shared` bucket, since no page render calls its routes.
A signed-in request is still counted by user. A request that resolves to an external address is counted by address,
as today.

What changes in behavior: if `TRUSTED_PROXIES` ever misses a hop, visitors go unlimited by the five limiters that skip
instead of sharing one bucket. The page render limiter already made that trade, and `checkTrustedProxies` logs the
warning. The signup gate and the MCP caller limit keep their shared bucket, so a missed hop never leaves them open.

**Alternatives.** The socket's peer address, through Bun's `requestIP` and Hono's `getConnInfo`, so that only true
loopback is skipped: rejected. In dev every browser request also arrives from loopback through vite, so it gives the
same result. It would also add a second way of reading the address beside `trustedProxies.ts`, which the brief asks
every limiter to use.

### 9. The 429

The three new limiters send `{ error: "rate limited" }` with status 429, `Retry-After` set to the seconds left in the
window (at least 1), and `Cache-Control: private, no-cache`. They set `standardHeaders: false`, so no response,
including a topic feed response the edge shares, includes anyone's count. The JSON body matches the other api
limiters, since the api clients parse an error's JSON. Existing limiters keep their headers and bodies. Neither app
changes. The api clients already treat a 429 as an error.

## Risks / Trade-offs

- [The router's own two retries mean one runner attempt can be three provider calls during a wave] → The jitter and
  the wait limits bound it. Setting `RateLimitErrorRetries: 0` would make the runner the only retry, but it would also
  change chat and every other caller, so it is left for a measured follow-up.
- [Waits make a Scan slower during a wave] → No wait starts after the review's 20th minute, and a Resource that still
  fails is reported as today. The Scan finishes within the timeout either way.
- [The page fan-out estimate is off] → Task 3.1 measures it before any number is written into code, and the limits can
  only fire on a caller far above the estimate.
- [One Redis increment on every counted request] → It is one atomic command on the existing connection, about 2 a
  second per active user. It falls back to memory if Redis is down.
- [A missed proxy hop now leaves visitors unlimited instead of sharing one bucket] → This matches the page render
  limiter. The trusted proxies warning logs it, and signed-in callers stay limited.
- [A podcast aggregator or a crawler on an exempt path is unlimited by address] → Those routes read rows that are
  cached at the edge or in Redis, as today. Nothing about them gets worse.

## Migration Plan

Nothing to migrate: no schema, no stored state, no configuration. The limits apply when the release deploys. To roll
back, revert the commit. A Redis rate limit key expires within a minute on its own.
