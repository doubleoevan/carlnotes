## Why

Both budget checks are check-then-spend, so a streaming turn or four parallel review items can finish past the budget
they passed. This is phase three of the apps-and-packages-restructure change, split out when its phase one shipped.

## What Changes

**Spend reservations.** Before a chat turn, a voice turn, or a scored resource, the call's largest possible cost is
reserved. The budget is a soft limit: a call starts while what is spent plus every open reservation is below it, even if
its maximum would pass it, so a user with budget left is never rejected, a second call is rejected while the first holds
the rest, and the month passes the budget by at most about one call's maximum. A call whose spend and open reservations
have reached the budget is rejected before anything posts, with today's rejection wording. The reservation settles when
the call ends, releases when it fails, and expires if the process dies. User reservations live in Redis with the same
degrade-not-stop rule as every other Redis path, so a Redis outage falls back to today's check. A Scan reserves inside
its own `Budget` object under the same rule, so parallel review passes the Scan limit by less than one Resource's
maximum, and a budget resumed from heartbeat details includes settled spend only. Podcast episodes keep their cutoff
pause instead of reserving.

## Capabilities

### New Capabilities
- `spend-reservations`: reserving a call's largest cost before it runs, settling it at the actual cost, releasing it on
  failure, expiring it after a crash, the Redis store for user reservations with its fallback, and the in-memory
  reservation inside a Scan's budget.

### Modified Capabilities
- `topic-chat`: a turn is metered by reserving its largest cost against a soft budget.
- `curation`: the per-Scan spend limit's overshoot shrinks from `concurrency - 1` Resources to less than one
  Resource's maximum.
- `durable-scans`: a resumed budget includes settled spend only, never an attempt's open reservations.

## Impact

- Adds a Redis sorted set per user, a `reservedDollars` field on the in-memory `Budget`, and one index on
  `room_attachments (team_id, topic_id)`; no column changes.
- `packages/models` gains `spendReservations.ts`, and `packages/pipeline` gains `chat/chatTurnCost.ts` for a turn's
  largest cost; the chat room post, the private chat turn, the voice routes, and the review reserve through them. The
  manual scan route and the sweep keep today's start checks.
