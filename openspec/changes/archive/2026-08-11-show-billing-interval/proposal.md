## Why

A subscriber's billing interval decides what they pay and what limits they get, and neither page that talks about plans tells them which one they are on.

The account page reads `Plan Premium` and stops there. The pricing page opens on Monthly for everyone, so a yearly subscriber lands on a page showing monthly prices with `Current plan` pinned to a card they are not actually on. Both pages already have the fact: `billing_subscriptions.interval` is stored, and `loadBillingState` reads it to pick the daily scan limit. It just never reaches the UI.

## What Changes

- `BillingState` includes the user's billing interval, which `loadBillingState` already reads and then drops.
- The account page's plan card names the interval for a paid plan: `Plan Premium` becomes `Plan Premium, billed yearly`. A free plan bills on no frequency, so it gets no interval line.
- The pricing page opens its toggle at the signed-in user's interval instead of always at Monthly. Visitors and free users still open at Monthly.
- `Current plan` on a pricing card means the plan **and** the interval match. A premium-monthly subscriber looking at the yearly cards sees no current-plan badge, and their premium card offers `Manage billing` rather than a disabled `Current plan` button — which is the change they would want to make from that view.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `subscription-billing`: the billing state surfaced to the UI includes the interval; the account plan card names it; the pricing toggle opens at the subscriber's own interval; and current-plan identity on a pricing card becomes plan-and-interval rather than plan alone.

## Impact

- `shared/contracts.ts` — `BillingState` gains `billingInterval`.
- `api/billing.ts` — `loadBillingState` returns the interval it already reads. No new query.
- `ui/src/pages/AccountPage.tsx` — the plan card's interval line.
- `ui/src/pages/PricingPage.tsx` — the toggle's initial value, and the badge and action rules that follow from it.
- No schema change and no migration. The column, the webhook that fills it, and the checkout that sets it are all unchanged.
- A paid user's pricing page makes one extra `/api/billing/state` request. Visitors and free users make none.
