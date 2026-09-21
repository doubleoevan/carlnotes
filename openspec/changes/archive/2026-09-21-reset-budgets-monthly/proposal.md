## Why

The docs promise that a paused user's brews resume "on the first of the month, UTC", and the account page shows
spend against a monthly budget that resets on that boundary. Neither is what happens. A user's LiteLLM key is created
with `budget_duration: "30d"`, which the proxy reads as a rolling thirty days from the moment the key was created. So
every user's budget resets on a different day, drifting later each cycle, and never on the first.

In production the proxy did not reset at all. Two free accounts hit their $3.00 on September 14th and were refused
every scan since. Their keys were due to roll over on September 17th and did not: the metered spend sat at the same
figure for five days running. The account page told both of them they had spent 66%.

The app has no part in that reset today, so there is nothing of ours to watch fail. The proxy owns the window, the
proxy's window is the wrong one, and when the proxy's reset does not fire nobody finds out until a user does.

## What Changes

The app owns the budget reset. On the first of every month, UTC, the scheduled sweep replaces every user's key with a
fresh one at their current budget, the same replacement a plan change or a budget override makes today. A
key created before the current month is replaced. The key keeps its `max_budget` as the hard backstop and loses its
`budget_duration`, so the proxy no longer has a window of its own to disagree with.

The sweep reports how many keys it replaced and how many replacements failed, and a failure leaves that user's key
where it was, so the next sweep tries it again.

The key management moves from `api/litellm.ts` to `worker/litellm.ts`, since the sweep runs in the worker and the
worker cannot import from the api. The pure budget math, `userBudgetCents`, moves to `shared/plans.ts` for the
same reason, and the admin role test to `shared/enums.ts`, where `db/quotas.ts` reads it too instead of keeping its
own copy of the rule.

## Capabilities

### New Capabilities

_none_

### Modified Capabilities

- `subscription-billing`: the budget period is the UTC calendar month, and the key's budget resets with it
- `scheduled-scans`: the sweep replaces the keys whose budget period has ended

## Impact

- `db/schema.ts`: `users.litellm_key_created_at`, so the sweep can tell which keys predate the month. A migration
- `worker/litellm.ts`: the proxy calls from `api/litellm.ts`, the key replacement from `api/authorization.ts`, and the
  monthly reset the sweep calls
- `worker/schedule.ts`: one more step in the sweep, before any scan is started
- `shared/plans.ts`: `UserAccess` and `userBudgetCents`; `shared/enums.ts`: `isAdminRole`. All three re-exported from the gate
- `db/quotas.ts`: `startOfUtcMonth` beside `startOfUtcDay`, re-exported from `api/topic/quotas.ts`
- `api/authorization.ts`, `api/admin.ts`, `api/auth.ts`, `api/billing.ts`, `api/seed.ts`, `api/users.ts`: import moves
- no change to what a budget is, who has one, or how spend is recorded. The two accounts blocked today stay blocked
  until their keys are replaced by hand or by the October sweep
