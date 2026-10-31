# Proposal

## Why

The app sells nothing. The store release change (Prompt 51) made the native Plans screen read-only, dropped every
plans link, and put a preflight guard in front of checkout and the portal, all "until a storefront design is approved".
This change makes that decision with the storefront rules as they stand on October 31, 2026, and then builds the one
approved purchase path. A phone user on the free plan today has to find carlnotes.com in a browser, sign in again, and
check out there, with no word from the app that a paid plan exists.

`design.md` compares the three candidates against the current primary Apple and Google terms, with their fees,
storefronts, and conditions. The user approved option B in `design.md` on October 31, 2026, and the rest of this change
is written for it.

## What Changes

- **In-app subscriptions through the stores.** The app sells the plus and premium plans, monthly and yearly, as
  auto-renewing subscriptions through Apple In-App Purchase and Google Play Billing, with RevenueCat in front of both
  stores. The native Plans screen's cards gain the web's actions: Upgrade for a free user, a plan switch for a store
  subscriber, and the current plan marked. The store's own localized price shows on each card. Account gains the
  web's Upgrade and Manage plan button and a Restore purchases action, and the budget, Topic-limit, scan failure,
  spoken-questions, and failed-payment notices regain their plans link or their store action.
- **One entitlement row for every provider.** `billing_subscriptions` records which provider bills the row: Stripe, the
  App Store, or Google Play. Stripe's webhook keeps writing it as it does today. A RevenueCat webhook and a sync route
  the app calls after a purchase or a restore project the store's subscription state into the same row, idempotently,
  from RevenueCat's current record of the customer. `users.plan` stays the projection the gate and the quotas read.
  Stripe is not the billing truth for a store purchase, and no synthetic Stripe subscription is created. See
  `design.md` for why.
- **Storefront rules replace the purchase-link guard.** A shared, tested rules module decides which purchase entry
  points the app shows from the store's own storefront signal and the offerings the store returns, never from the
  device locale. A storefront the store does not sell in, or an unknown storefront, shows the read-only cards the app
  shows today. The preflight guard keeps failing when the app reaches Stripe's checkout or portal, and it fails when a
  purchase label or the plans path appears in an app file that does not read the rules.
- **Web keeps Stripe and learns about store subscribers.** Web checkout and the Customer Portal are unchanged for a
  web subscriber. A store subscriber on the web sees where their plan is billed and a link to manage it in the App
  Store or Google Play instead of the portal, and no second checkout. The failed-payment notice, the account closing
  copy, and the admin totals say which provider bills the user.
- **Store setup and release.** App Store Connect and Play Console subscription products, the RevenueCat project with
  its entitlements and offering, the keys and webhook secrets in Doppler and EAS, the store listing's purchase
  answers and review notes, the data inventory, the privacy policy's processor row, the release checklist's purchase
  items, and the user docs. The new native dependency changes the runtime fingerprint, so this ships as a store build.

## Capabilities

### New Capabilities

- `store-subscriptions`: how the mobile app sells, restores, switches, and manages a plan through Apple In-App Purchase
  and Google Play Billing, how a store subscription reaches the entitlement row, and the storefront rules that decide
  which purchase entry points show.

### Modified Capabilities

- `subscription-billing`: the Billing Subscription maps a subscription from any provider, not Stripe alone; the
  overage rule names the provider; dunning leads a store subscriber to the store; the no-purchase requirement and the
  purchase-path guard become the storefront rules; the web's plan card and plan button handle a store subscriber.
- `mobile-feed`: the Plans screen's cards offer a purchase where the storefront rules allow one.
- `mobile-store-delivery`: the listing and the data inventory name the purchases and the purchase processor, and the
  acceptance list covers each purchase path.
- `mobile-app`: the RevenueCat public keys join the values the sync script moves from Doppler into EAS.

## Impact

- `packages/contracts`: the billing provider enum, the store entitlement and product rules, `isOverageBillable`, the
  billing state's provider, and the sync route's contract.
- `packages/db`: `billing_subscriptions` gains a provider and provider-neutral customer and subscription ids, in one
  migration with a lock timeout.
- `apps/api`: `storeBilling.ts` with the RevenueCat customer read, the projection, the sync, and the webhook; the
  billing route's two new routes; `quotas.ts` reads the overage rule; account closing and the admin totals name the
  provider.
- `packages/core`: the storefront purchase rules and the purchase offers store; `PlanCard`, `AccountBudget`,
  `TopicScanFailure`, and `ChatTopicLimitNotice` take the store's actions and prices.
- `apps/mobile`: `react-native-purchases` as a new native dependency, the store purchases adapter, the Plans and
  Account screens' purchase actions, the notices' links, Restore purchases, the stories, the guides, `parity.md`, the
  store files, and the release checklist.
- `apps/web`: the plan button, the plan card's portal action, the payment notice, and the account closing copy for a
  store subscriber; the privacy policy's processor row.
- `scripts`: the purchase path guard reads the storefront rules; `sync-mobile-env.ts` moves the RevenueCat keys.
- Doppler: `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTHORIZATION`, `REVENUECAT_SANDBOX_USER_IDS`,
  `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`, and `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`. App Store Connect, the Play
  Console, and RevenueCat need accounts, agreements, and products that only the user can create.
- Docs: `plans-and-limits.md`, `get-the-app.md`, the mobile, api, contracts, core, and db guides, and the domain
  model's Billing Subscription row.
