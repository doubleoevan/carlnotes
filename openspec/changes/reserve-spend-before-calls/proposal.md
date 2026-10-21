## Why

Both budget checks are check-then-spend, so a streaming turn or four parallel review items can finish past the budget
they passed. This is phase three of the apps-and-packages-restructure change, split out when its phase one shipped.

## What Changes

**Spend reservations.** Before a chat turn, a voice turn, or a scored resource, the call's largest possible cost is
reserved against the remaining budget, less what is spent and less every open reservation. A call whose maximum does
not fit is refused before anything posts, with today's rejection wording. The reservation settles when the call ends,
releases when it fails, and expires if the process dies. User reservations live in Redis with the same
degrade-not-stop rule as every other Redis path, so a Redis outage falls back to today's check. A Scan reserves inside
its own `Budget` object, so parallel review can no longer overshoot the Scan limit, and a budget resumed from heartbeat
details carries settled spend only. Podcast episodes keep their cutoff pause instead of reserving.

## Capabilities

### New Capabilities
- `spend-reservations`: reserving a call's largest cost before it runs, settling it at the actual cost, releasing it on
  failure, expiring it after a crash, the Redis store for user reservations with its fallback, and the in-memory
  reservation inside a Scan's budget.

### Modified Capabilities
- `topic-chat`: a turn is metered by reserving its largest cost.
- `curation`: the per-Scan spend limit becomes hard; the accepted overshoot of `concurrency - 1` Resources ends.
- `durable-scans`: a resumed budget carries settled spend only, never an attempt's open reservations.

## Impact

- Adds a Redis sorted set per user and a `reservedDollars` field on the in-memory `Budget`; no schema change.
- `packages/models` gains `spendReservations.ts`; the chat, voice, and review gates, the manual scan route, and the
  sweep read it.
