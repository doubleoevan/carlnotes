## Why

The plans cap the wrong thing. Topic count barely moves cost; frequency decides all of it. A daily topic scans about 30 times a month against a weekly topic's 4, so a plan's topic limit says almost nothing about what a user will spend.

Today every tier's topic limit implies four to five times the scans its monthly budget funds. Nothing stops a user putting every topic on a daily schedule, so they hit the budget wall partway through the month with no warning and no explanation — the limit they exceeded was never one they were shown.

A second, quieter gap: the plan limits are single numbers, so a yearly subscriber silently reads a monthly subscriber's caps. That was invisible because nothing in the type system ever asked which interval a limit belonged to.

## What Changes

- `shared/plans.ts` gains a `BillingInterval` of `monthly` and `yearly`. `dailyScanLimit` and a new `dailyTopicLimit` both become `Record<BillingInterval, number>`, so every read site has to name the interval it means. A free user has no subscription and resolves as monthly.
- New limits, with `monthlyBudgetCents` set near each plan's yearly net revenue after Stripe fees, so even a fully utilized user costs roughly nothing:

  | plan | topicLimit | dailyTopicLimit | dailyScanLimit | monthlyBudgetCents |
  |---|---|---|---|---|
  | free | 3 | 1 / 1 | 5 / 5 | 300 |
  | plus | 10 | 3 / 4 | 15 / 20 | 1000 |
  | premium | 25 | 6 / 7 | 30 / 40 | 2000 |

- Yearly carries the higher caps because it cannot carry metered overage — its ceiling is hard where monthly's is soft.
- `plus` drops from 20 daily scans to 15 and `premium` from 50 to 30. There are no subscribers on any plan, so this reduces nobody's allowance and no one is over the new daily topic cap. It is a change to numbers nobody has yet been sold.
- A **daily topic limit** is enforced wherever a topic's frequency is set — both creation and a frequency change on an existing topic. A `weekdays` topic counts against the same cap as a `daily` one. Refusal names the number, in Carl's voice, with a path to pricing. Admins bypass it.
- The Account page's spend card becomes Carl's coffee fund: the percentage leaves the heading, and the static "Not a bill" line becomes a state line keyed on the fraction spent, ending in an inline upgrade link once the budget is gone.
- The pricing cards drop the dollar budget and express the same limit as scans: topics, how many run daily, manual scans a day, and an approximate monthly total. The yearly toggle marks the lines that actually move.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authorization`: the plans catalog becomes interval-aware, the daily scan limit resolves against the user's billing interval, and a new daily-topic-limit entitlement joins it.
- `topic-scheduling`: setting a topic's frequency to a daily frequency is gated by the plan's daily topic limit, on creation and on edit alike.
- `activity-page`: the Account page's spend section reads as a coffee fund with a state line, rather than a percentage and a disclaimer.
- `subscription-billing`: the pricing cards describe each plan in scans rather than dollars, and show what the yearly interval changes.

## Impact

- **Shared**: `shared/plans.ts` gains `BillingInterval` and `dailyTopicLimit`, and turns two flat numbers into per-interval records. `shared/plans.test.ts` follows.
- **API**: `authorization.ts` resolves limits by interval and gains the daily-topic check; `topic/topics.ts` enforces it on create and on frequency change; `billing.ts` reports the interval-correct scan limit.
- **DB**: `billing_subscriptions.has_overage` becomes `interval`. The yearly-overage change stored a boolean for whether a subscription carries the metered overage price; now that the plan limits themselves turn on the interval, the interval is the honest column and overage-billability derives from it. One source of truth instead of two flags that must agree.
- **UI**: `AccountPage` spend card, `PricingPage` cards, and any read site that today assumes a single number.
- **Depends on**: the yearly-overage change, which established that only a monthly subscription can carry metered overage. This change replaces the boolean it stored with the interval behind it.
