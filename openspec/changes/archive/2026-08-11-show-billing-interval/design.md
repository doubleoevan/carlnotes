## Context

A subscription's billing interval is stored on `billing_subscriptions.interval`, written by the Stripe webhook from the prices the subscription actually carries. `loadBillingState` already selects it, uses it to resolve `PLANS[plan].dailyScanLimit[billingInterval]`, and then leaves it out of the `BillingState` it returns.

So the two pages that talk about plans are both blind to it:

- `AccountPage` renders `Plan {billing.plan}` and nothing more.
- `PricingPage` opens with `useState(false)` for `isYearly` and highlights `session.user.plan`. A yearly subscriber sees monthly prices and a `Current plan` badge on a card whose price, limits, and Stripe subscription are not theirs.

The session carries `plan` because `users.plan` is a Better Auth `additionalFields` column. It does not carry the interval, and the interval does not live on `users`.

## Goals / Non-Goals

**Goals:**

- A paid user can read their billing interval on the account page.
- The pricing page opens at the interval the user is actually on.
- `Current plan` on a pricing card is true — it means this plan at this interval.

**Non-Goals:**

- Switching interval from the pricing page. Plan and interval changes for a paying user go through the Customer Portal, which this change keeps.
- Showing the renewal date. `current_period_end` is stored but is a separate question from which interval you are on.
- Putting the interval on the session.

## Decisions

**Return the interval from `loadBillingState` instead of putting it on the session.** The session would be the cheaper read on the pricing page — no request at all — but Better Auth's `additionalFields` read from the `users` row, and the interval is not there. Putting it there would mean a copy of a fact that `subscription-billing` already requires be stored once: "it stores the billing interval, and overage-billability is derived from it rather than stored alongside it". A copy on `users` is exactly the second value that can disagree with the first. `loadBillingState` already has the interval in hand, so returning it costs one field on a type and nothing at runtime.

**The pricing page fetches billing state only when the signed-in user is on a paid plan.** A visitor and a free user are already correct at Monthly — free bills on no frequency — so there is nothing to fetch for them and no reason to spend the request. Only a paid user can open at a different interval than the default.

**A paid user's toggle and plan cards wait for that fetch, using the account page's `CoffeeLoading`.** The alternative is to paint at Monthly and flip once the state lands. On a page whose entire content is prices, that means the reader watches `$29` become `$24.17` and every limit line grow a marker. A brief spinner on a page a subscriber visits rarely is the smaller cost, and it reuses the pattern `AccountPage` already uses for the same payload.

The toggle waits with the cards rather than rendering ahead of them. A toggle that is live before the interval lands can be moved by the reader and then moved back under their hand when the fetch resolves, which is the same flicker with a lost click on top. The heading still renders immediately, since it makes no claim about what the reader is on.

**`Current plan` becomes plan-and-interval, on both the badge and the action.** Once the toggle can open at yearly, `plan === signedInPlan` is no longer the same question as "is this the subscription you have". Two things follow from it:

- The badge appears only on an exact match. A signed-in user looking at the other interval gets no badge at all — not `Recommended`, which is the visitor's badge and would read as advice to a reader who is already paying.
- The card's action at a non-matching interval is `Manage billing`, the same portal button every other card gives a paying user. Leaving it as a disabled `Current plan` would dead-end the one card a subscriber is most likely to click when they came to switch interval.

The highlight ring stays on the user's plan at either interval. It marks which row of the page is about them, which is still true when the toggle has moved.

**The account card names the interval only for a paid plan.** `Plan Premium, billed yearly`. A free plan has no `billing_subscriptions` row, and `loadBillingState` resolves it to `monthly` so the limit lookup has a key — that is a lookup default, not a fact about the user, and printing `billed monthly` under a `$0` plan would state a charge that does not exist.

## Risks / Trade-offs

**One extra request on the pricing page for paid users** → It is the existing `/api/billing/state` endpoint, which also counts the day's scans. A subscriber opens the pricing page rarely, and free users and visitors add no request at all.

**A spinner where there was none** → Bounded to signed-in paid users, and only over the cards. Accepted over prices that change after paint.

**The interval can be stale between a portal change and its webhook** → `plan` already has this exact window and the account page already shows it. No new failure mode, and the webhook closes both at once.

**A subscriber could read `Manage billing` on their own plan card as a downgrade prompt** → The button is the portal, which is where an interval change is actually made, so the click leads where the reading suggests.
