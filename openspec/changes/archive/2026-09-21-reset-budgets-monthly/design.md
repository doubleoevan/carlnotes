## Context

A user's model calls bill to a LiteLLM virtual key created at signup with a `max_budget` and a `budget_duration` of
`"30d"`. The proxy refuses the key once its metered spend reaches the budget, and the app recognises that refusal by
its text and labels it "Carl hit this month's budget." The account page sums the app's own recorded spend for the UTC
calendar month and shows it against the same budget.

Those are two windows. The proxy's runs thirty days from the key's creation. The app's runs from the first of the
month. Both comments that describe the reset say it happens on the first, and the docs say so too, so the drift went
unnoticed until two accounts were refused every scan for a week while their account page read 66%. Their keys were
also past their own thirty-day mark and had not reset, so the proxy's reset is not something the app can rely on
either.

Key replacement already exists: a plan change, a role change, or a budget override creates a fresh key at the new
budget and retires the old one. The seed uses it too.

## Goals / Non-Goals

**Goals:**

- Every user's budget resets on the first of the month, UTC, which is what the docs and the account page say
- The app performs the reset, so a reset that does not happen is a visible failure of ours
- A reset that fails for one user is retried and never blocks the others

**Non-Goals:**

- What the budget measures, or what the account page shows against it. That is its own change
- Pro-rating a budget for a user who joins late in the month
- Replacing the keys blocked today. That is done by hand through the admin console's budget override, which already
  creates a fresh key

## Decisions

### The app resets the budget by replacing the key

The proxy's `/key/update` can reset a key's spend, but nothing in the app has ever called it and its behaviour against
this proxy version is unverified. Replacement is the path a plan change and a budget override already take, so it is
exercised in production every time either happens. The monthly reset makes the same call.

`budget_duration` comes off the key. The key keeps `max_budget`, so spend can never run past the budget between
resets, and the proxy has no window of its own left to disagree with the app's.

### A key created before the month is replaced

`users.litellm_key_created_at` records when the user's current key was created. The sweep replaces every key
created before `startOfUtcMonth(now)` and records the new one's time. That is the whole rule: one comparison, no state
machine, and a key an admin replaced on the 25th is replaced again on the 1st because the period is the month, not the
key's age.

The column defaults to `now()`, so the migration gives every existing row the deployment date. Nobody's key is
replaced on deploy, and the first reset is October's. There is no data migration and no null to branch on.

### The reset runs in the sweep, ahead of the scans

`runScheduledTopicScans` already runs on the platform's cron, already treats each Topic's failure as its own, and
already reports a summary line. The reset is one more step at the top, before any scan starts, so a user whose key
the reset replaces has the fresh key by the time their Topic comes up in the same sweep.

A replacement that fails leaves `litellm_key_created_at` where it was, so the next sweep tries that user again. The
failure is reported the way a Topic's failed start is, and the summary counts it.

### Key management moves to the worker, budget math to shared

The sweep lives in `worker/` and the worker cannot import from `api/`. The three proxy calls and the key
replacement move to `worker/litellm.ts`, which `api/` reaches through `worker/index.ts` the way it reaches the scan
and chat functions. `userBudgetCents` needs the plans catalog and nothing else, so it moves to `shared/plans.ts`
with `UserAccess`. `isAdminRole` moves to `shared/enums.ts` beside the other vocabulary tests, and `db/quotas.ts`
calls it instead of keeping its own copy of the rule. The gate re-exports all three so its callers do not change. `startOfUtcMonth` moves to `db/quotas.ts` beside `startOfUtcDay`, which the worker already reads from
there, and `api/topic/quotas.ts` re-exports it as it does the others.

## Risks / Trade-offs

- **A late-month signup gets two budgets close together.** A user who joins on the 30th has a full budget for a day
  and a fresh one on the 1st. The budget bounds our cost to serve and is not something the user buys, so this costs
  little and is far simpler than pro-rating.
- **The first-of-month sweep makes two proxy calls per user.** At today's scale that is a few dozen calls. It runs
  once a month and each user's calls are independent, so a slow proxy stretches the sweep without breaking it.
- **A proxy outage on the 1st delays the reset.** Keys stay at last month's spend until the first sweep after the
  proxy returns, and a user at their limit stays refused meanwhile. That is what happens today with no reset at all,
  and now the sweep's summary says so.
- **Both `loadUserAccess` functions stay.** `db/quotas.ts` has one without the override and `api/authorization.ts`
  has one with it. The replacement reads the row it needs itself and touches neither.
