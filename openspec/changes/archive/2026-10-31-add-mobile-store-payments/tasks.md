# Tasks

The user approved the storefront option in `design.md` on October 31, 2026. Group 1 is the user's: the store accounts,
products, and keys that no script can create. Groups 2 onward are the code, written for the approved option, in-app
subscriptions through RevenueCat on every storefront.

## 1. Store accounts, products, and keys (the user)

- [ ] 1.1 Accept the Paid Apps agreement in App Store Connect with banking and tax, and create the subscription group
  with `carlnotes.plus.monthly`, `carlnotes.plus.yearly`, `carlnotes.premium.monthly`, and `carlnotes.premium.yearly`
  at $20, $200, $40, and $400, premium ranked above plus. Verify: the four products show Ready to Submit
- [ ] 1.2 Create the Play Console subscriptions `carlnotes_plus` and `carlnotes_premium`, each with `monthly` and
  `yearly` base plans at the same prices, and a license tester. Verify: both subscriptions are active on the internal
  track
- [ ] 1.3 Create the RevenueCat project with the iOS and Android apps, upload Apple's In-App Purchase key and Google's
  service account, point App Store Server Notifications and Play's real-time developer notifications at RevenueCat,
  create the `plus` and `premium` entitlements over their products, and the `default` offering with the four packages.
  Verify: the offering shows all four packages with prices in the RevenueCat dashboard
- [ ] 1.4 Put `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTHORIZATION`, `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`,
  and `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` in Doppler dev and prd, `REVENUECAT_SANDBOX_USER_IDS` in prd with App
  Review's user id, and configure RevenueCat's webhook at `https://carlnotes.com/api/webhooks/revenuecat` with the
  Authorization value. Verify: `doppler run -- bash -c 'test -n "$REVENUECAT_SECRET_API_KEY"'` passes in both configs

## 2. Contracts and the entitlement row

- [x] 2.1 Add `billingProviders` (`stripe`, `app_store`, `play_store`) to `packages/contracts/enums.ts`, the
  `storeBilling.ts` module with the entitlement ids, their plans, `toStoreBillingInterval` over a product id, and
  `isOverageBillable` in `plans.ts`; add `provider` and `isOverageBillable` as fields of `billingState`, the
  `manageInAppStore` and `manageInGooglePlay` labels to `PURCHASE_COPY`, and the store sync route's contract in
  `accountRouteContracts.ts`. Verify: `bun test packages/contracts` passes with tests for the interval rule on both id
  formats and the overage rule per provider
- [x] 2.2 Add `provider` with default `stripe` to `packages/db/schema/billing.ts`, map `stripe_customer_id` and
  `stripe_subscription_id` to `providerCustomerId` and `providerSubscriptionId` with the column names kept, add
  `revenueCatAppUserId` to `packages/db/schema/users.ts` as a unique text column with a random uuid default, run
  `bun run db:generate`, and put the `CREATE TYPE` and both `ADD COLUMN` statements under a lock timeout. Verify: the
  migration applies to the dev database, every existing row reads `stripe`, and every user has an id
- [x] 2.3 Make `quotas.ts`'s `loadBillingAccess` return the provider and decide overage through `isOverageBillable`,
  and update the domain model's Billing Subscription row and the contracts and db guides. Verify: `bun test packages/db`
  passes with a store row test that keeps the limit hard

## 3. The api: Stripe refactor, the store sync, and the webhook

- [x] 3.1 Extract the plan projection, `users.plan` sync, session refresh, analytics events, and LiteLLM key reissue
  out of `applySubscriptionState` in `apps/api/billing.ts` into shared functions both providers call, with the provider
  on each event, and keep every test in `billing.test.ts` green. Verify: `bun test apps/api/billing.test.ts` passes
  unchanged
- [x] 3.2 Write `apps/api/storeBilling.ts`: the RevenueCat customer read with the secret key, the projection (highest
  active entitlement, interval word, `past_due`, `canceled`, cleared, the grace period's end), the provider conflict
  rule with its report and the cancel of a displaced Stripe subscription at its period end, the sandbox purchase rule,
  `syncStoreSubscription(userId)` over the account's RevenueCat app user id, and `deleteRevenueCatCustomer` on account
  closing. Verify: `storeBilling.test.ts` and `storeBillingRoute.test.ts` cover purchase, renewal, duplicate, late
  event, cancellation, expiration, refund, billing issue, product change, transfer, unknown user, equal and higher plan
  conflicts, the Stripe cancel and its failure, the customer delete, and a RevenueCat failure, with a stubbed customer
  record and the database pool stubbed
- [x] 3.3 Add `POST /billing/store/sync` and `POST /webhooks/revenuecat` to `billingRoute.ts`: the sync for the session
  user with 502 on a failed read, the webhook's Authorization check with 400, 500 on a read or write failure, 200 for an
  unknown user, both reported, a re-read of both ids on `TRANSFER`, and a 409 from Stripe checkout for a store
  subscriber. Verify: in-process `app.request` tests for each response, and `bun scripts/check-contract-freeze.ts`
  passes with the new route's entry
- [x] 3.4 Re-read a store row whose period end is more than a day past in `loadBillingState`, reading the stored row if
  the re-read fails, add the provider to the admin totals' revenue label, make account closing skip the Stripe cancel
  for a store row, and document the module in the api guide. Verify: tests for the stale re-read and the closing path

## 4. Shared rules and components

- [x] 4.1 Write `packages/core/lib/storefrontPurchaseRules.ts` and `packages/core/stores/purchaseOffersStore.ts`:
  the pure rules from platform, storefront code or null, full offering, plan, and provider to the offers, and the
  module-state store with its hook. Verify: tests for a full offering on each platform, a partial and a missing
  offering, a null storefront, a Stripe subscriber, a store subscriber, and the web platform
- [x] 4.2 Extend `PlanCard` with the store price and billing note, the plan switch action for a store subscriber, the
  provider-aware plan management action; extend `AccountBudget`'s payment notice with the provider, and keep the upgrade
  slots of `TopicScanFailure` and `ChatTopicLimitNotice`, which each app fills from the offers. Verify: `bun test
  packages/core` passes and the web renders the same as before for a Stripe subscriber

## 5. The guard becomes the rules check

- [x] 5.1 Change `scripts/checkPurchasePaths.ts` so a plans path or purchase label, or the `PLANS_PATH`,
  `PURCHASE_COPY`, or `PlansLink` name, passes in a file that imports the purchase offers store or the rules, keep the
  checkout and portal reach rule and the routing exceptions, and name the import in the failure. Verify:
  `checkPurchasePaths.test.ts` covers a rules reader, a non-reader, a reached Stripe capability, and a listed exception,
  and `bun scripts/check-purchase-paths.ts` passes on the tree

## 6. The app

- [x] 6.1 Add `react-native-purchases` with `expo install`, write `apps/mobile/src/storePurchases.ts` over it (configure
  at launch with an anonymous id, `logIn` with the billing state's RevenueCat app user id before each purchase and
  restore, `logOut` through the root layout's `logOutStoreUser` once no one is signed in, storefront, offering, purchase
  with Google's product change info, restore, management url), and the two public keys in `scripts/sync-mobile-env.ts`
  and `.env.example`. Verify: `bunx @expo/fingerprint apps/mobile` changes, a development build runs, and
  `storeProducts.test.ts` covers the pure mappings
- [x] 6.2 Wire `app/plans.tsx`: withhold the cards until the offering and billing state resolve, the store's prices,
  Upgrade and Switch plan through the adapter, `checkout_started` with the provider and storefront, the sync route and
  refetch after a purchase, the renewal line with the Terms and Privacy links, the catalog fallback with retry when the
  offering fails, and the `cta` prompt line for a mic's return. Verify: stories for loading, a visitor, a free user, a
  store subscriber, a Stripe subscriber, a read-only storefront, and the offering failure
- [x] 6.3 Add the web's `PlanButton` to Account's header (Upgrade to Plans, Manage plan to the store's management url,
  and the billed-on-the-web line with no link for a Stripe subscriber), Restore purchases to Account's settings with the
  sync and refetch, and the store link in Close your account's section and confirmation for a store subscriber. Verify:
  stories for each plan button state, Restore purchases, and the store closing copy, and the parity inventory names
  Restore purchases as a native requirement
- [x] 6.4 Give the spend meter, the budget notice, the Topic-limit notice, the scan failure, the spoken answer toast,
  the spoken-questions mic, the scan button's daily quota, the Topic settings card's daily line, the Topic editor's
  quota label, frequency alert, and daily Topic limit error, and the podcast field's upgrade line their plans link and
  words from the offers, and keep the gated words when the offers are read-only. Verify: stories in both states for the
  notices that take the offers as props (the spend meter, the budget notice, the Topic-limit notice, the scan failure),
  the rules' tests for the entry points that read `usePurchaseOffers`, and `toSpokenQuestionsPausedAction`'s tests for
  the mic's Plans screen for a non-premium plan when a purchase is offered
- [x] 6.5 Move `fetchCheckoutUrl` and `fetchBillingPortalUrl` to web-only in `parity.md` with the store reason, add
  the Store payments section to `apps/mobile/AGENTS.md`, and update the core guide. Verify:
  `bun scripts/check-client-parity.ts` passes

## 7. The web

- [x] 7.1 Make `PlanButton`, the plan card's portal action, the payment notice, and `AccountSettings`' closing copy
  read the provider: the portal for Stripe, Manage in the App Store or Manage in Google Play with the store's link for
  a store subscriber, and no checkout for either. Verify: `bun test apps/web` passes with the existing billing
  assertions untouched, and a Stripe subscriber's pages render as before
- [x] 7.2 Add RevenueCat and the stores to the privacy policy's processor table and payment paragraph in
  `PrivacyPage.tsx`. Verify: the page renders the row and `bun test apps/web` passes
- [x] 7.3 Add the store plan list to the Terms' paid plans section in `TermsPage.tsx`, move `TERMS_VERSION` to
  `2026-10-31`, and name the store plans in the acceptance notice's body. Verify: `bun test` passes with the Terms
  version tests

## 8. Store files, docs, and release

- [x] 8.1 Update `apps/mobile/store/listing.md` (digital purchases yes, the subscriptions in the description, the
  sandbox purchase steps in the review notes), `data-inventory.md` (the purchase row), and the release checklist's
  Store purchases item. Verify: the listing names no feature the app lacks
- [x] 8.2 Update `apps/docs/src/content/docs/account/plans-and-limits.md` (buying in the app, the store's price, no
  overage on a store plan, managing and canceling in the store, closing the account) and `get-the-app.md`, then run
  `bun run docs:embed`. Verify: the docs build and the embed runs
- [ ] 8.3 Run `bun run check`, then the storefront rules on a device per platform with the sandbox account: a purchase
  of each plan at each interval, a plan switch, a restore after a reinstall, a cancellation and its expiry, a refund, a
  sandbox billing failure, a second account's restore, a storefront with no offering, and the web's account page after
  each step. Verify: each release checklist row has a date, or the release record names it unverified

## Workflow follow-up

- Ship through `/ship`, which archives the change with the CLI and commits it with the code.
- After the deploy, bump `version` in `app.config.ts`, build the store build, freeze the contract, and submit per
  the mobile guide's Store release section.
- Record the approved option and the implemented behavior on the Prompt queue's Mobile payments page in Notion.
