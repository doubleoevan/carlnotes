## Why

A sudden wave of traffic breaks two things today. Fireworks serverless limits are per model and grow at most 25 percent
every 15 minutes, so a burst of Scans draws 429 and 503 responses for minutes at a time. A scoring call gets only the
LiteLLM router's two quick retries, so its Resource leaves the Scan with no Finding while the provider is still
catching up. The api has no general limit on `/api` either. `GET /api/topic-feed` and
`GET /api/topic-findings/:id/link-preview` have no limiter at all, and a signed-in request bypasses the edge cache, so
one account or one address can ask for the feed without bound. Neither protection should ever be visible to a real
person.

## What Changes

**Patient model calls.** A Scan's model call that meets a rate limit, an overloaded or failing provider, or a timeout
waits and tries again. It waits as long as the response's `Retry-After` asks, or backs off with jitter if the response
names no wait. One call waits at most 60 seconds in all, across at most 5 attempts. No wait starts past a review
attempt's 20-minute mark, so the waits always fit inside the 30-minute review timeout. This covers the cheap and premium
scoring calls, the private Personal sources scoring call, the filter's embedding batches, the topic context's query
embedding, and the scan report. A rejected request or a spent budget still fails at once. The Budget is charged only for
attempts that returned usage, a Resource's reservation is held across its waits and released as today, and a Resource
that still fails is reported as today. The report call drops its own `REPORT_MAX_RETRIES`, which also retried a spent
budget.

**Spam walls on `/api`.** One general limit of 1,800 requests a minute counts every `/api` request by the signed-in
user, or by the client address for a visitor. The topic feed and a finding's link preview each get their own limit of
120 a minute, by the same key. A page render's loopback calls, and any visitor request whose address cannot be trusted
as external, are never limited, by these limits or by an existing limiter over the reads a render calls. Today such a
limiter puts every such request into one shared bucket, so all visitors' Topic Post page renders share the social read
limit's 120 a minute. The health checks, the auth routes, the webhooks, the podcast app's feed and media paths, the
share cards, and the unsubscribe link are exempt. A limited request gets a 429 with `Retry-After` and `Cache-Control:
private, no-cache`, and no rate limit headers. Neither app adds any notice or copy for it.

**Docs.** The README drops its statement that `/api/topic-feed` has no rate limit and explains that the local load test
runs unlimited because the limits skip this machine's address. The rate limit paragraph in `apps/api/AGENTS.md` names
the three new limits.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `durable-scans`: a Scan's model calls wait out a rate limit, an overloaded provider, or a timeout within a bound the
  review stage leaves room for, and still fail at once on a rejection or a spent budget.
- `request-capacity`: every `/api` request is limited per caller far above real use, the topic feed and a finding's
  link preview have their own per-caller limits, and a page render's loopback calls are never limited.

## Impact

- Worker side: `packages/models/` gains the model call runner, `packages/server/retry.ts` takes a delay function,
  `packages/models/budget.ts` holds the review attempt's wait deadline, and the call sites in
  `packages/pipeline/review/` (`score.ts`, `filter.ts`, `topicContext.ts`, `summarize.ts`) and
  `packages/pipeline/personalSources/scoreResource.ts` run through it. `apps/worker/workflows/runTopicScanActivities.ts`
  sets the deadline. No new dependency, no schema change, no LiteLLM config change.
- Api side: `apps/api/rateLimit.ts` gains the general, topic feed, and link preview limiters, and its shared limiter
  builder skips a visitor request with no external address on the reads a page render calls, `apps/api/api.ts` mounts
  the general limiter after the session lookup and the topic feed limiter on its route, and
  `apps/api/topic/findings.ts` mounts the link preview limiter. Every counted request costs one Redis increment, two on
  the topic feed and the link preview.
- No screen changes on web or mobile. No contract change: a 429 was already a possible response on every route.
- Docs: `README.md` and `apps/api/AGENTS.md`.
