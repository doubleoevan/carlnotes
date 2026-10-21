## Context

Split from the apps-and-packages-restructure change, whose phase one shipped as 8b92e486; this is its phase three.
Measured on 2026-10-20:

- Both budget checks are check-then-spend: `canScoreResource` compares spent to the limit before each item while
  `REVIEW_CONCURRENCY` (4) items run at once, and a chat turn's gate reads the app's monthly spend sum before the turn
  posts while the turn's cost is recorded when the stream ends. LiteLLM checks the key's budget when a call starts and
  has no reservation primitive.

## Goals / Non-Goals

**Goals:**

- A call's largest cost reserved before it runs, for chat turns, voice turns, and scored Resources, with user
  reservations in Redis and the Scan's in its own budget, degrading to today's check when Redis is unreachable.

**Non-Goals:**

- Reserving a Scan's whole limit against the user budget, or reserving a podcast episode's cost. Both keep today's
  checks for the reasons under Decisions.

## Decisions

### 1. Reservations

**Store.** A reservation is a member of a Redis sorted set `spend-reservations:<userId>`, member `<id>:<cents>`,
score the expiry time in milliseconds. Reserving is one Lua script sent through the store's client (`send("EVAL",
...)` under `runWithRedis`): remove members whose score is past now, sum the remaining members' cents, compare the
sum plus the request against the remaining budget the caller computed, add the member if it fits, and set the key's
expiry to the latest member's. Settling and releasing both remove the member by `ZREM`; settling first writes the
spend row, so the monthly sum never dips between the two. The module is `packages/models/spendReservations.ts`, next
to `budget.ts` whose rates it prices with. The fake Redis server in `db/redisFakeServer.ts` learns `ZADD`, `ZREM`,
`ZRANGEBYSCORE`, `ZREMRANGEBYSCORE`, and the script's `EVAL`, so the tests run against it as the other Redis tests do.

**The spent figure.** The gate reads the app's own monthly sums, `monthlySpendDollars`: scan, chat, and podcast episode
spend rows, memoized per request. It is what every budget gate reads today, it needs no network call, and its only
staleness is the in-flight calls whose cost is not yet recorded, which is exactly what the open reservations cover. The
LiteLLM key's spend was rejected as the figure: its read is an HTTP call that fails open, it updates when a stream ends,
so it is stale by the same in-flight calls, it does not count the transcription and speech the app prices itself, and
it resets when a key is replaced. It stays the proxy's own backstop, and `isBudgetRejection` keeps catching it.

**The maximum.** Each call kind's maximum is priced with the rates in `budget.ts` from the largest input the kind can
send and its output limit. A chat turn: `MAX_TURN_STEPS` × (the largest prompt the turn kind builds, from the message's
own characters, the retrieval limits `MAX_RETRIEVED_FINDINGS` × `MAX_RESOURCE_CHARS` and `MAX_SCAN_SUMMARIES`, the
history and kept attachment limits, at four characters a token, plus `MAX_TURN_OUTPUT_TOKENS`) at
`CHAT_COST_PER_MILLION_TOKENS`, plus `MAX_TURN_STEPS` × `EXA_COST_PER_SEARCH` for a turn that may search; a podcast
reply uses `MAX_PODCAST_REPLY_OUTPUT_TOKENS`. A transcription: `transcriptionCost` of the recording's duration at
Gemini's audio token rate and the transcript limit. A spoken part: `speechCost` of the part's characters and the audio
tokens the speech module already prices a part at. A scored Resource: `FIRECRAWL_COST_PER_FETCH` plus the cheap and
premium scores of `MAX_SCORE_CHARS` and the score schema's output. The gate runs before the chat message is stored, so
the prompt does not exist yet and the input is the kind's limit, not the built prompt; a tighter estimate from the
built prompt was rejected because it would move the gate past the post. The maximum of a turn that may search sits
around twenty cents, so the reservation only ever refuses a user within a turn or two of a spent budget; manual step
22 watches the refusals for a week, since an estimate set too high refuses turns a user could afford.

**Lifecycle.** `reserveUserSpend({ userId, kind, maxDollars })` returns a reservation with `settle(costDollars)` and
`release()`, or `"refused"`. The chat turn gates in `api/chat/room.ts`, the private chat turn authorization, and the
voice authorization call it where they call `isMonthlySpendExhausted` today; `chatTurns.ts` settles after writing the
cost row; the stream's error path releases. A reservation expires at the kind's time limit plus a minute: the chat
stream's 15 minutes for a turn, five minutes for a transcription or a spoken part. When Redis is unreachable or the
script times out, the gate runs `isMonthlySpendExhausted` alone and allows, counting the failure on the minute line.

**In a Scan.** `Budget` gains `reservedDollars`. `reserveScanSpend(budget, dollars)` returns false if
`spentDollars + reservedDollars + dollars` would pass `limitDollars` and otherwise adds it; `settleScanSpend` charges
the actual cost to its stage and removes the reservation; `releaseScanSpend` removes it. `fetchAndScoreResource`
reserves before the paid section instead of calling `canScoreResource` alone, and the scored-resource count check stays.
The heartbeat pump sends `toCheckpointBudget(budget)`, which omits `reservedDollars`, and `toResumedBudget` sets it to
zero, so a retried attempt carries settled spend only. The accepted overshoot of `concurrency - 1` Resources in the
curation spec ends.

**What keeps today's check.** A Scan's spend against the user budget keeps the start check in the manual scan route
and the sweep, run against the remaining budget less open reservations: a Scan is already bounded by `SCAN_BUDGET_USD`,
and reserving that limit for a run of minutes, across Temporal retries whose expiry would have to outlast every stage
timeout, would hold fifty cents per running Scan against users who scan daily. Podcast episodes keep their cutoff
pause: an episode is a worker job the user did not start, its cutoff share (20, 75, or 85 percent by plan) already
leaves the headroom an episode costs, and reserving a 30-minute episode's maximum would refuse the episodes that
headroom exists for.

## Risks / Trade-offs

- [The maximum refuses a turn a user could afford] → it only binds within a turn or two of the budget; the refusal
  count is watched for a week, and the input limits are the knob.
- [The Lua script needs `EVAL` through Bun's `RedisClient.send`] → the fake server test proves the command shape; if
  `send` cannot carry it, the script becomes `WATCH`/`MULTI` on the same key.

## Migration Plan

Ship the reservations behind no flag: the Redis set is empty until the first turn reserves, and a Redis outage is
today's behavior. Watch the daily spend lines and the refusal count for a week (manual step 22). Rollback is reverting
the commit; no stored state outlives the set's expiry.

## Open Questions

None that block the apply.
