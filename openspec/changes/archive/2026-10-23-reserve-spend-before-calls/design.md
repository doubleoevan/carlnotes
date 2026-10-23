## Context

Split from the apps-and-packages-restructure change, whose phase one shipped as 8b92e486; this is its phase three.
Measured on 2026-10-20:

- Both budget checks are check-then-spend: `canScoreResource` compares spent to the limit before each item while
  `REVIEW_CONCURRENCY` (4) items run at once, and a chat turn's gate reads the app's monthly spend sum before the turn
  posts while the turn's cost is recorded when the stream ends. LiteLLM checks the key's budget when a call starts and
  has no reservation primitive.

Re-read against the code on 2026-10-22, after main's a6b902f4:

- The spent figure and the store hold: every chat gate still reads `isMonthlySpendExhausted` over
  `monthlySpendDollars`, and the Redis store already sends Lua through `send("EVAL", ...)` for its rate limits.
- The sweep's spend check moved: it reads the LiteLLM key's spend through `isUserLiteLLMKeyBudgetExhausted`
  (`apps/worker/scheduledTopicLimits.ts`, `apps/worker/scanQueue.ts`), not the app's monthly sums. The manual scan
  route reads both.
- The turn limits live in `@carlnotes/pipeline` (`MAX_TURN_STEPS`, `MAX_TURN_OUTPUT_TOKENS` in `chat/index.ts`,
  `MAX_PODCAST_REPLY_OUTPUT_TOKENS` in `chat/podcastReply.ts`, the retrieval limits in `chat/retrieve.ts`) and the score
  limit in `review/score.ts`. `@carlnotes/models` comes before the pipeline in the package order, so `budget.ts` cannot
  import them.
- The history limit is `CHAT_HISTORY_TURNS` (100) turns of up to 25,000 characters, and the transcription and speech
  requests set no output limit.

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
...)` under `runWithRedis`): remove members whose score is past now, sum the remaining members' dollars, add the
member if that sum is below the remaining budget the caller computed, and set the key's expiry to the latest
member's. Settling and releasing both remove the member by `ZREM`; settling first writes the
spend row, so the monthly sum never dips between the two. The module is `packages/models/spendReservations.ts`, next
to `budget.ts` whose rates it prices with. The fake Redis server in `db/redisFakeServer.ts` and the client stub in
`db/redisClientStub.ts` both learn the script's `EVAL` and `ZREM` through `db/redisFakeSpendReservations.ts`, so the
tests run against them as the other Redis tests do. Nothing reads the open sum outside the script, so no
`ZRANGEBYSCORE` is sent.

**The soft limit.** The user budget and the Scan limit are soft. A call starts while what is spent plus every open
reservation is below the budget, even if its own maximum would take the month past it, and its reservation then counts
against what is left. A user with budget left is never rejected. A second call is rejected while a running first call
holds the rest of the budget, and starts once the first settles. Calls that race each start only while the open sum is
below the budget, so together they pass it by less than one call's maximum, and the month's overshoot is bounded by
about one call's maximum per user. A spoken part is rejected by recorded spend alone: it speaks a reply whose chat turn
already holds a reservation, often while that turn still streams, so the turn's own reservation would otherwise reject
its reply's audio near the end of the budget. A hard limit, rejecting a call whose maximum does not fit beside what is
left, was rejected: with the maximums below it rejected chat in the last quarter of the free plan's $3 budget, for turns
whose median costs three cents.

**The spent figure.** The gate reads the app's own monthly sums, `monthlySpendDollars`: scan, chat, and podcast episode
spend rows, memoized per request. It is what every budget gate reads today, it needs no network call, and its only
staleness is the running calls whose cost is not yet recorded, which is exactly what the open reservations cover. The
LiteLLM key's spend was rejected as the figure: its read is an HTTP call that fails open, it updates when a stream ends,
so it is stale by the same running calls, it does not count the transcription and speech the app prices itself, and
it resets when a key is replaced. It stays the proxy's own backstop, and `isBudgetRejection` keeps catching it.

**The maximum.** Each call kind's maximum is priced with the rates in `budget.ts`, at four characters a token through
`toEstimatedTokens`, and lives beside the limits it reads, since `budget.ts` cannot import the pipeline's. A chat turn,
`maxChatTurnDollars` in `pipeline/chat/chatTurnCost.ts`: (`MAX_TURN_STEPS` + 1, the agreement check) calls, each reading
the largest system prompt (a 28,000-character allowance for the template, the scan summaries, and the docs sections,
plus `MAX_RETRIEVED_FINDINGS` × `MAX_RESOURCE_CHARS` and `MAX_ATTACHMENT_CONTEXT_CHARS`) with the user's words, and
writing `MAX_TURN_OUTPUT_TOKENS`, at `CHAT_COST_PER_MILLION_TOKENS`, plus `MAX_TURN_STEPS` × `EXA_COST_PER_SEARCH`. A
podcast reply is one call writing `MAX_PODCAST_REPLY_OUTPUT_TOKENS` with no search. The user's words are what the turn
actually sends, not the kind's limits: a private turn's question and history as `toModelMessages` shapes them plus its
read attachments (`toChatTurnMessageChars`), and a room turn's stored window, shared files, and summary limit
(`loadModelRoomQuestionChars` in `api/chat/roomQuestion.ts`, which sums the stored lengths in the database through
`toDecryptedLengthSql` in `encryption.ts`, an upper bound that reads and decrypts no text) plus the chat message about
to post. The limits were rejected as the input: 100 history turns of 25,000 characters would price one turn at about ten
dollars. Both inputs are known before anything posts, so the gate stays ahead of the post. A transcription,
`MAX_TRANSCRIPTION_DOLLARS` in `transcription.ts`: `transcriptionCost` of the longest recording at 32 audio tokens a
second and a 4,000-token output allowance. A spoken part, `maxSpokenAnswerDollars` in `speech.ts`: `speechCost` of the
part's text tokens and its audio at 25 tokens a second, read at the slowest pace of 10 characters a second. A scored
Resource, `MAX_SCORED_RESOURCE_DOLLARS` in `review/score.ts`: `FIRECRAWL_COST_PER_FETCH` plus the cheap and premium
scores of `MAX_SCORE_CHARS` and a 12,000-character prompt allowance, writing 1,000 tokens.

The figures on 2026-10-22: a new private question reserves $0.74, a ten-turn conversation $0.96, a room turn over a
full window of short messages $0.93, a podcast reply $0.07, a transcription $0.05, a 2,000-character spoken part $0.05,
and a scored Resource $0.006. The input drives the chat maximum: of a new question's $0.74, the nine calls' input is
$0.58, mostly the 64,000-character system prompt allowance read on every call, the output limit is $0.11, and the
searches are $0.06. What chat turns cost in production over the 30 days to 2026-10-22, from `chat_turns`:

| Kind | Turns | Median | p95 | Max | Most tokens |
|---|---|---|---|---|---|
| private | 332 | $0.027 | $0.114 | $0.316 | 55,169 |
| chat_room | 18 | $0.056 | $0.230 | $0.251 | 59,164 |
| podcast | 2 | $0.047 | $0.047 | $0.047 | 11,736 |
| speech | 8 | $0.002 | $0.005 | $0.006 | 756 |
| transcription | 3 | $0.0003 | $0.0008 | $0.0008 | 258 |

The costliest turn with a token count used 59,164 tokens, a third of the 171,000 a new question's maximum prices, and
no turn spent more than $0.042 on searches. The largest private cost, $0.316, is on a row with no token count. Under
the soft limit the maximum decides how much a turn holds and so how far the month can pass the budget, not whether a
user with budget left may chat. Manual step 22 watches the rejections and the overshoot for a week; the step count and
the allowances are the knobs.

**Lifecycle.** `reserveUserSpend({ userId, kind, maxDollars })` returns a reservation with `release()`, or `"rejected"`.
Settling is writing the spend row, then releasing: the cost lives in the row, so a separate `settle(costDollars)` would
have nothing to write. The authorizations keep `isMonthlySpendExhausted`, since the chat panels' reads call them too and
must not reserve. The reserve runs on the paths that call a model: the room post in `api/chat/room.ts` before the chat
message is stored, the private turn in `api/chat/chatTurnAnswer.ts` after its attachments are read and before the
agreement check or the reply, and the transcription and speech routes in `voiceRoute.ts` before the key is loaded. A
rejected private turn is rejected through `rejectChatTurn`, which counts `chat_budget_reached` as a spent budget does.
The private stream releases after `saveFinishedChatTurn`, which saves a partial turn too; a reply that fails before it
streams releases at once. The room turn releases when `runModelChatRoomTurn` settles, after `saveFinishedChatRoomTurn`,
and a post that never starts the turn releases at once. The voice routes release after `recordPaidModelCall`. A
reservation expires at the kind's longest run plus a minute: 16 minutes for a turn, six for a transcription or a spoken
part. When Redis is unreachable, the script times out, or the reply is unreadable, the gate compares recorded spend
against the budget alone and allows a user under it; `runWithRedis` counts the failure on the minute line. That call's
release still removes its member, since a script that missed its deadline may have added it after.

**In a Scan.** `Budget` gains `reservedDollars`. `reserveScanSpend(budget, dollars)` returns false once `spentDollars +
reservedDollars` reaches `limitDollars` and otherwise adds the dollars, so a Scan passes its limit by less than one
Resource's maximum; `releaseScanSpend` removes them. The fetch and the scores already `charge` their stages as they run,
so a separate `settleScanSpend` would charge twice; the reservation is released in `fetchAndScoreResource`'s `finally`,
however the paid section ends. While a Resource runs, its charges and its reservation both count, which can defer the
next Resource a little early, never let one start late. `reserveScoredResource` in `review/score.ts` runs the count and
stop check, `canScoreResource`, then the reservation. The heartbeat pump sends `toCheckpointBudget(budget)`, which omits
`reservedDollars`, and `toResumedBudget` sets it to zero on both of its paths, so a retried attempt includes settled
spend only and a budget passed from a workflow started before this change, which has no `reservedDollars`, reads as
zero. The accepted overshoot of `concurrency - 1` Resources in the curation spec becomes an overshoot of less than one
Resource's maximum, about six tenths of a cent.

**What keeps today's check.** A Scan's spend against the user budget keeps the start checks in the manual scan route
and the sweep exactly as they are: recorded spend against the budget, and the key's spend in the sweep. A Scan is
already bounded by `SCAN_BUDGET_USD`, and reserving that limit for a run of minutes, across Temporal retries whose
expiry would have to outlast every stage timeout, would hold fifty cents per running Scan against users who scan daily.
Subtracting the open chat reservations at a Scan's start was dropped: a reservation is a turn's largest cost, often
twenty times what it settles at, so a sweep that met one would fail a scheduled Scan as over budget for a user with
budget left. Podcast episodes keep their cutoff
pause: an episode is a worker job the user did not start, its cutoff share (20, 75, or 85 percent by plan) already
leaves the headroom an episode costs, and reserving a 30-minute episode's maximum would reject the episodes that
headroom exists for.

## Risks / Trade-offs

- [A month passes the budget by up to one call's maximum] → $0.74 to $0.96 for a chat turn, a quarter or more of the
  free plan's $3; the turn settles at its actual cost, a median of three cents, so the real overshoot is that cost,
  and the key's budget in LiteLLM stays the backstop. The step count and the system prompt allowance are the knobs, and
  manual step 22 reads the overshoot.
- [A user's second turn is rejected while the first is running near the end of the budget] → it gets the spent
  budget's wording until the first settles, seconds later.
- [The estimate allows for what has no hard limit] → the system prompt allowance, a step's parallel searches, the
  transcript's thought tokens, and a spoken part's pace are allowances, not limits, so a call can still pass its
  reservation by what it exceeds them by; the key's budget in LiteLLM stays the backstop.
- [The Lua script needs `EVAL` through Bun's `RedisClient.send`] → the rate limits already send their scripts that
  way. The fakes reimplement the script, so the tests prove the command shape and the reserve rule, not the Lua; a
  script that fails on a real Redis returns null through `runWithRedis`, which falls back to today's check and counts
  the error on the minute line. If `send` cannot carry it, the script becomes `WATCH`/`MULTI` on the same key.

## Migration Plan

Ship the reservations behind no flag, with one index, `room_attachments_team_id_idx` on `(team_id, topic_id)`, which the
room estimate and the existing reads of a team room's files filter by: the Redis set is empty until the first turn
reserves, and a Redis outage is today's behavior. Watch the daily spend lines and the rejection count for a week (manual
step 22). Rollback is reverting the commit; no stored state outlives the set's expiry.

## Open Questions

None that block the apply.
