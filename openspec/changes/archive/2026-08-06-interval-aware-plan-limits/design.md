## Context

`shared/plans.ts` holds each plan's `topicLimit`, `dailyScanLimit`, `monthlyBudgetCents`, and prices as flat numbers. The gate reads them in `authorization.ts`, the pricing cards render them, and the account page charts spend against the budget.

Two things are wrong with that shape.

The limits cap the wrong dimension. A Topic on a daily frequency scans about 30 times a month; a weekly one about 4. So `topicLimit` says almost nothing about what a user costs, and nothing stops all of their Topics running daily. At today's numbers every tier's topic limit implies four to five times the scans its budget funds.

And a flat number cannot express a limit that differs by billing interval. The yearly-overage change established that a yearly subscription cannot carry metered overage — its ceiling is hard — but nothing in the types made anyone ask which interval a limit belonged to, so the yearly path stayed invisible.

## Goals / Non-Goals

**Goals:**

- Cap the thing that drives cost, at the moment the user chooses it.
- Make the billing interval impossible to read past by accident.
- Set each plan's budget backstop against its own revenue, so a fully utilized user is roughly break-even.
- Describe plans to readers in scans, which is what they can reason about.

**Non-Goals:**

- Weighting `weekdays` differently from `daily`. It costs about 27% less, and a weighted cap is much harder to explain than a single one.
- Capping scheduled scans at run time. The cap belongs where the user makes the choice, not in the sweep.
- Changing how spend is measured, recorded, or summed.
- Migrating anyone's existing schedules. Existing Topics keep their frequency; the cap binds the next change.

## Decisions

### Per-interval limits are a type, not a lookup

`dailyScanLimit` and `dailyTopicLimit` become `Record<BillingInterval, number>`. A caller cannot read a number without naming an interval, so the yearly case stops being something a reader has to remember.

This is the whole reason to change the type rather than add a `yearlyDailyScanLimit` beside the existing field: an added field can be ignored silently, a changed type cannot.

A free user resolves as monthly. They have no subscription, and monthly is the only frequency a free plan could be said to be on.

*Alternative considered*: resolving the interval at each call site from `billing_subscriptions`. Rejected — that spreads a billing lookup across the gate and the UI, and it is the same invisibility in a new place.

### Yearly gets the higher caps because its ceiling is hard

A monthly subscriber past their daily scan limit can keep going and be billed for it. A yearly subscriber cannot — Stripe refuses a subscription mixing intervals, so there is no metered price to bill against, and the limit is a wall.

Giving yearly the higher number is what keeps that wall from being worse than the soft ceiling it replaces. It is also the honest pitch for prepaying.

### `has_overage` becomes `interval`

The yearly-overage change stored a boolean: whether the subscription carries the metered overage price. That was the minimum needed to close the billing gap.

Now that the plan limits themselves turn on the interval, storing the interval is the honest model, and overage-billability derives from it — `interval === "monthly"`. Keeping both would mean two columns that must agree, with nothing enforcing that they do.

The migration maps the existing boolean back: `true` to monthly, `false` to yearly. That is exact, because the boolean was only ever set from the interval.

### The cap is enforced where frequency is written, not where it is read

Both `createTopic` and `updateTopic` set frequency, and the edit path is the one that gets missed. Enforcing only at creation would leave the cap trivially bypassed: create three weekly Topics, then switch them.

The check counts the user's Topics already on a daily frequency and compares against the plan's limit at their interval. On an edit it excludes the Topic being edited, so re-saving an already-daily Topic never refuses itself.

### The account card states one thing per element

The heading said the percentage, the figures beside it said the same proportion in money, and the bar said it again in width. The state line replaces a static disclaimer that never changed and so was never read.

The 100% line is the one that carries an upgrade link. A user reading "dry until the 1st" has more intent than at any other point on the page, and no other line has a reason to sell.

### The daily-topic caps rest on an assumed per-scan cost

The caps of 1, 3, and 6 come from dividing each plan's monthly budget by an assumed **$0.06 per scan**. That figure is an assumption, not a measurement.

The one real observation we have is **$0.13**, from a Scan with three attachments and twenty findings — heavier than a median Scan is likely to be, but more than twice the number the caps are built on. If the true median lands near $0.13, the caps roughly halve: free would fund about 1 daily Topic, plus about 1 or 2, premium about 3.

The values ship as specified because a cap set too high is recoverable and there is no live data to set it better. But the assumption is the thing to check first if budgets start running out early, and it is written here so it is confirmed rather than rediscovered.

The query that would settle it, once enough Scans exist to have a median:

```sql
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cost) AS median_scan_cost
FROM scans WHERE status = 'succeeded';
```

### The pricing cards trade dollars for scans

The budget backstop is our cost ceiling. On a pricing page it reads as another charge, which is the opposite of its meaning.

The four lines are ordered so each answers the question the one above raises: how many Topics — of those, how many run daily — how many can I force by hand — so what does that add up to. The monthly total is approximate because it depends on the user's own scheduling.

## Risks / Trade-offs

- **The caps assume a per-scan cost we have not measured** → See below. This is the risk most likely to matter.
- **Monthly daily scans drop** (plus 20 → 15, premium 50 → 30) → There are no subscribers, so this reduces nobody's allowance. The soft ceiling would let a monthly subscriber exceed it and be billed regardless.
- **A user with more daily Topics than the new cap** → Also an empty set today. Existing schedules are untouched and the cap binds the next frequency change, so whenever it does start to matter, it is met at a moment that can be explained.
- **`weekdays` counted as `daily`** → Under-charges the user's allowance by about a quarter. Deliberate: the safe direction, and one number to explain.
- **Dropping the dollar budget from pricing** → A reader can no longer see the spend ceiling before signing up. It remains on the account page, where it describes something they can act on.
- **Replacing a column the previous change just added** → The migration is mechanical and the mapping exact, but it does mean two migrations touching one table in quick succession.

## Open Questions

None.
