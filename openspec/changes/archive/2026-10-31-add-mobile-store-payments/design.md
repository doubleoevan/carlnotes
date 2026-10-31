# Design

## Context

See `proposal.md` for why. The pieces this design builds on, as the code stands:

- `packages/contracts/plans.ts` holds the plan catalog, `PLANS_PATH`, and `PURCHASE_COPY`. `apps/api/billing.ts`
  creates Stripe Checkout and Customer Portal sessions, applies Stripe's subscription webhooks to the one
  `billing_subscriptions` row per user and its `users.plan` projection, reissues the LiteLLM key on a plan change,
  reports metered overage, and cancels the subscription when an account closes. `packages/db/quotas.ts` reads the row's
  `hasPaymentMethod` and `billingInterval` to decide whether the daily scan limit is soft.
- `packages/core/components/PlanCard.tsx` composes a plan card for both apps and takes optional `onCheckout` and
  `onPortal` handlers. The web passes Stripe's. The app passes neither, so a signed-in user's other cards show no
  action. `AccountBudget`, `TopicScanFailure`, and `ChatTopicLimitNotice` take the plans link the same way, and the
  app's spend meter, budget notice, scan button, and spoken-questions mic drop it.
- `scripts/checkPurchasePaths.ts` fails preflight when the app reaches `billingClient.fetchCheckoutUrl` or
  `fetchBillingPortalUrl`, or when an app file outside four listed exceptions names `PLANS_PATH` or a `PURCHASE_COPY`
  label. `apps/mobile/parity.md` lists both capabilities as deferred to this prompt.
- The app is an Expo SDK 58 development build on EAS. A native dependency changes the runtime fingerprint and ships
  as a store build. Public values reach the bundle through `scripts/sync-mobile-env.ts`, secrets stay in Doppler.
- `contracts/releases.json` is empty: no app version is frozen yet, so a new route needs a registry entry and nothing
  else.

CarlNotes is not a "reader" app. Apple's 3.1.3(a) covers access to previously purchased magazines, newspapers, books,
audio, music, and video. A CarlNotes plan unlocks features: Topics, scans, chat, and podcast episodes. The reader
entitlement also forbids in-app purchase in the same app. Nothing below relies on reader eligibility.

## Storefront research (October 31, 2026)

Primary sources read: Apple's App Review Guidelines (last updated October 16, 2026), Apple's "Changes for apps in the
European Union" and "Payment options on the App Store in the EU" support pages and the August 18, 2026 newsroom
announcement, Apple's reader-app and Small Business Program pages, Google Play's payments policy, the external content
links program (US), the user choice billing, external offers (EEA), and service fee pages, RevenueCat's pricing, Expo,
Stripe, webhook, and identity docs, and the `react-native-purchases` API reference. The US link-out commission and
Japan's rates come from court filings and press reports, named where used.

### Apple

- **In-app purchase is required for a subscription that unlocks features.** 3.1.1: "If you want to unlock features or
  functionality within your app, (by way of example: subscriptions, ...), you must use in-app purchase." No storefront
  is exempt from that sentence.
- **US storefront: links and calls to action are allowed beside in-app purchase, with no entitlement.** 3.1.1(a):
  "These entitlements are not required for developers to include buttons, external links, or other calls to action in
  their United States storefront apps." The exception lifts the ban on links, not the in-app purchase requirement.
  Apple collects no commission on a US linked-out purchase today: its August 2026 motion to stay the remand says so,
  the Ninth Circuit allows only a cost-based commission once the district court sets one, Apple proposed a rate of up
  to 15% on August 13, 2026, and its Supreme Court petition (No. 25-1311) is pending. The rate is unsettled.
- **Every other storefront bans links** without an entitlement: "apps and their metadata may not include buttons,
  external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase."
- **EU, Attachment 14, effective October 1, 2026.** In-app purchase pays 26%, or 15% for the Small Business Program and
  for subscriptions after their first year. A link-out pays 15%, or 10%, on sales within 7 days of the tap. It needs
  the StoreKit External Purchases or Offers Entitlement, iOS 26.2 or later, the system disclosure sheet through the
  `ExternalPurchaseCustomLink` API, a parental gate for users under 18, in-app purchase shown at least as prominently
  when offered beside it, and a monthly transaction report within 15 days.
- **Japan, under the Mobile Software Competition Act since December 18, 2025** (press reports, not an Apple page):
  a link-out pays 15%, or 10% for program participants; in-app purchase pays 21% plus a 5% processing fee, or 10% plus
  5%; no external purchase under 13, parental approval from 13 to 17.
- **Standard rates elsewhere:** 30%, 15% for the Small Business Program (under $1M prior-year proceeds) and for
  subscriptions after their first year. CarlNotes qualifies for the Small Business Program today.
- **3.1.3(b) Multiplatform Services** lets the app honor a plan bought on the web "provided those items are also
  available as in-app purchases within the app". Selling the plans in the app puts the web-bought plan the app already
  shows on firm ground.

### Google

- **US:** the external content links program lets an enrolled app link out to buy digital items "in lieu of or
  alongside Google Play Billing". From October 1, 2026, an enrolled developer reports every transaction within 24
  hours of a link tap and pays 10% on a subscription (first $1M and standard alike; 20% on other items). Alternative
  billing inside the app is a second enrolled program with the same fee.
- **Google Play Billing** in the US, EEA, UK, Japan, and Australia: 10% plus a 5% billing fee on an auto-renewing
  subscription, 15% in all. Other markets: 15% on subscriptions.
- **EEA external offers program:** 10% on a subscription within 24 hours of the link, 0% acquisition fee, EEA users
  only, a registered business, the external offers APIs, and 24-hour reporting. User choice billing runs beside Play
  Billing in the EEA, UK, Japan, Australia, Brazil, Indonesia, and South Africa at a 4-point reduction, and Korea and
  India have their own programs.
- **Content rating:** "Digital purchases: Yes" once the app sells anything.

### RevenueCat

- Free up to $2,500 of monthly tracked revenue, then 1% of tracked revenue, gross before the store's cut. Webhooks
  come with that plan.
- `react-native-purchases` works in an Expo development build on SDK 54 or later, installed with `expo install`, and
  needs a new build. `Purchases.getStorefront()` returns `{ countryCode }` or null. `logIn`, `logOut`,
  `restorePurchases`, `getOfferings`, `purchasePackage` with Google's product change info, and `CustomerInfo` with
  `entitlements.active` and `managementURL` cover every flow below.
- Webhook events include an `id` that retries reuse, are retried up to five times over about 80 minutes, and are
  authenticated by an Authorization header value or an HMAC signature. `CANCELLATION` covers a refund, `EXPIRATION`
  ends access, `BILLING_ISSUE` starts the grace period, `TRANSFER` moves purchases between app user ids.
- RevenueCat can ingest a Stripe subscription by its id so one customer record spans Stripe and the stores.

### The three candidates

Net on a $20 monthly plan bought by a US user. Stripe's card fee is about 2.9% plus $0.30.

| Path | iOS | Android | Net of $20 | Conditions |
| --- | --- | --- | --- | --- |
| A. External link to carlnotes.com only | Not allowed: 3.1.1 still requires in-app purchase; only the link ban is lifted in the US | US only, enrolled; nothing outside the US | $17.12 on Android (10% + Stripe) | 24-hour transaction attribution and reporting to Google; sign in again on the web; no reach outside the US |
| B. In-app subscriptions through RevenueCat (recommended) | Every storefront | Every storefront | $17.00 (15%) on both; EU iOS $14.80 (26%) in year one | Store products, RevenueCat, a store build, Restore purchases, the store's localized prices; no overage billing on a store plan |
| C. Both: B everywhere, plus a US link to the web | Allowed beside in-app purchase; 0% today, up to 15% proposed, reporting likely once set | Enrolled; 10% and 24-hour reporting | $19.12 iOS today, $17.12 Android, for the users who take the link | Everything in B, plus two program enrollments, the attribution and reporting pipeline, and a second purchase path to keep consistent |

**Recommendation: B, approved by the user on October 31, 2026.** In-app purchase is required on iOS whichever way the
link question goes, so B is the floor and A is not available on iOS. C adds at most 5 points on Android and 15 points on
iOS, and only for US users who leave the app, sign in on the web, and check out there. It costs two program enrollments,
an attribution pipeline that reports every Stripe transaction within 24 hours of a tap, a commission that Apple has not
set, and two purchase paths for one account. At CarlNotes' revenue the points do not pay for that. The storefront rules
module below holds the switch, so C is a later rule change and a design note, not a rebuild.

## Goals / Non-Goals

**Goals:**

- One entitlement row per user that any provider writes, and one projection every reader keeps reading.
- A store purchase, restore, renewal, cancellation, expiry, refund, billing issue, plan switch, and account transfer
  each reach that row idempotently, out of order, and under duplicate delivery.
- The app shows a purchase only where the store sells it, decided by the store's signal, and shows the read-only cards
  everywhere else.
- Web subscribers keep every behavior they have today.
- The web's structure, controls, and words on the app, with the store's prices and management where the store owns
  them.

**Non-Goals:**

- A link from the app to web checkout (candidate C). The rules module keeps the switch.
- Metered overage on a store plan. The stores have no metered price, so a store plan's daily limit is hard, as a yearly
  web plan's is.
- Moving web billing into RevenueCat. See the entitlement decision.
- Promotional offers, introductory prices, free trials, or family sharing. None exists on the web.
- Store revenue in the admin totals. The Stripe figure is labeled as web revenue, and store revenue is read in
  RevenueCat's dashboard. Adding it needs RevenueCat's v2 metrics key and a second integration for one number.

## Decisions

### The entitlement row is the truth, and Stripe is one of its providers

Stripe cannot be the billing truth for a store purchase. Stripe has no App Store or Google Play payment method, and a
synthetic Stripe subscription would invent invoices, revenue, and a Customer Portal entry for a charge Stripe never
made, and would still need a second record of the real store state. Making RevenueCat the truth for every provider was
considered too: RevenueCat ingests a Stripe subscription by id and then tracks its renewals. That trades a working
Stripe path for a dependency on RevenueCat's Stripe refresh, which lags a cancellation by up to two hours and cannot
restore a Stripe purchase from the app. Rejected.

The decision: `billing_subscriptions` stays the one entitlement row and gains a `provider` column (`stripe`,
`app_store`, `play_store`). The `stripe_customer_id` and `stripe_subscription_id` columns keep their names, mapped to
`providerCustomerId` and `providerSubscriptionId` in the schema as `max_results` is, so pods that still run the old code
during a deploy read the same columns. A Stripe row keeps the customer and subscription ids. A store row holds the
account's RevenueCat app user id and the store's latest transaction id. `users.plan`, the LiteLLM key reissue, the
session refresh, and the analytics events stay exactly as `applySubscriptionState` does them today, extracted so both
providers call them. The domain model's Billing Subscription row says "a user's active paid subscription from Stripe,
the App Store, or Google Play".

### A store event is a signal to re-read the customer, not a state to apply

Each RevenueCat webhook names an app user id. The handler ignores every other field and reads RevenueCat's current
customer record (`GET /v1/subscribers/{appUserId}` with the secret key), then projects it: the active entitlement with
the highest plan rank sets the plan, its product id's `monthly` or `yearly` word sets the billing interval, its expiry
sets the period end, a detected billing issue sets the status to `past_due`, a detected unsubscribe to `canceled` (still
entitled until the period end), and no active entitlement clears the row and reverts the user to free. A `TRANSFER`
event re-reads both app user ids. Duplicate and out-of-order deliveries converge on the same row, so no event id table
is needed, and a missed event is repaired by the next one. The same function serves the sync route the app calls, which
is why a purchase shows on the account a second after the store confirms it, with no trust in what the app claims. The
handler keeps the Stripe webhook's response contract: 400 for a missing or wrong Authorization value, 500 when the read
or the write fails so RevenueCat retries, both reported. The sync route responds 502 when the read fails, reported, and
the app keeps the state it has.

Alternative: apply each event's own fields. Rejected: `TRANSFER` has no subscription, a late `RENEWAL` after an
`EXPIRATION` would resurrect access, and refund, grace, and pause semantics differ per store.

A store row whose period end is more than a day past re-reads the customer when the account page loads it, so an expired
plan a webhook never reported does not outlive the month. The period end is the later of the expiry and a billing grace
period's end, so a row in its grace period never reads stale, and a failed re-read is reported and the stored row read
instead.

### Two providers for one user

The app hides the store purchase from a Stripe subscriber and shows "Your plan is billed on the web." with no link,
since Apple bans a link or a call to action toward another purchase path on most storefronts. The web hides checkout
from a store subscriber and shows the store's management link, so a second subscription is a restore of someone else's
receipt or a race. When the store projection and a Stripe row meet, the higher plan rank wins, equal ranks keep the
row's current provider, and the conflict is reported to monitoring with both ids so support can refund one. A Stripe
subscription that a higher store plan replaces is set to cancel at its period end once the write commits, so the user
is not billed twice for one plan, and a failed cancel is reported without undoing the write. A store subscription
cannot be canceled from the api, so equal ranks keep Stripe and leave the store's refund to support. The api also
rejects a store subscriber's Stripe checkout with a 409, so a stale tab cannot open a second subscription. RevenueCat's
transfer behavior stays at its default, transfer to the new app user id: the store account that paid owns the plan, the
losing user's `TRANSFER` re-read clears their row, and both see the change on their next request.

### Account linkage and sign-out

The adapter configures RevenueCat once at launch with an anonymous id, so a visitor's Plans screen loads the store's
offerings and prices. A purchase and a restore first read the billing state and `logIn` with its
`revenueCatAppUserId`, which aliases the anonymous id, so a store that still names the previous account never bills
it. `logOutStoreUser` in the root layout's account effect calls `logOut()` once no one is signed in, beside the chat
account and file cache changes. A purchase is offered to a signed-in user alone, as the web does.

The RevenueCat app user id is a random uuid in `users.revenuecat_app_user_id`, unique, and set by the column default,
so no backfill runs. RevenueCat's public SDK key can log in as any app user id, so the user id, which the api never
keeps secret, would let anyone who learns it read or restore into that customer. An HMAC of the user id was considered
and rejected: rotating its secret would orphan every store customer. The id travels in the billing state and never in
the session, whose cache could send a stale one. The webhook finds the user by this id and ignores an id that is no
user's. Closing an account deletes its RevenueCat customer, so RevenueCat keeps no purchase history against a closed
account. A failed delete is reported, and the close goes on.

### The storefront rules decide every purchase entry point

`packages/core/lib/storefrontPurchaseRules.ts` is a pure, tested function from the platform, the store's storefront
country code (or null), whether the store returned offerings with every plan package, the user's plan, and the row's
provider, to the purchase offers: whether a plan may be bought in the app, whether the user's plan is managed in the
store or on the web, and which management url kind applies. The rules today: a native platform with full offerings may
buy in the app on every storefront, a storefront with no or partial offerings and an unknown storefront are read-only,
and no storefront links to web checkout. The storefront code is recorded on the sync and on the `checkout_started`
event, so the day the US link-out is approved it is one rule and no new wiring.
`packages/core/stores/purchaseOffersStore.ts` holds the offers in module state behind exported functions and a hook.
The Plans screen, the Account plan button, the spend meter, the budget and Topic-limit notices, the scan failure, the
spoken-questions mic, and the spoken answer toast all read it, and each shows the web's words with the plans link when
a purchase is offered and the gated words when not.

Why the store's signal and not the device locale: a US phone on a German Apple ID buys from the German storefront and
pays German prices under EU terms. `Purchases.getStorefront()` reads the account's storefront, and `getOfferings()`
already filters by what the store sells there. A null storefront is safe because the offerings decide what may be
bought; the code is for the rules and the record.

### The guard becomes the rules check

`scripts/checkPurchasePaths.ts` keeps its first rule: the app never reaches `billingClient.fetchCheckoutUrl` or
`fetchBillingPortalUrl`, which stay the web's Stripe path. Its second rule changes: a plans path or a purchase label in
an app file passes when the file imports the purchase offers store or the rules, and fails otherwise, with the three
listed routing files and the app's `PlansLink` as the exceptions. The names `PLANS_PATH`, `PURCHASE_COPY`, and
`PlansLink` count as a plans path or a purchase label, so a constant cannot get one past the check.
`check-purchase-paths.ts` keeps its name and preflight slot, and the message says what to import.

### The app's purchase flow

`apps/mobile/src/storePurchases.ts` is the platform adapter over `react-native-purchases`: configure, `logIn`,
`logOut`, the storefront, the offerings, `purchasePackage` (with Google's product change info when the user holds a
store plan), `restorePurchases`, and the management url, each returning plain values the shared code reads. The
Plans screen withholds the cards until the offerings and the billing state resolve, as the web withholds until the
interval loads, then renders the shared `PlanCard` with the store's `priceString` and per-month price in place of the
catalog's dollars, because the store's price is the one the user is charged and differs by storefront. A free user's
other cards say Upgrade and buy; a store subscriber's other cards say Switch plan and change the product; the current
card is marked. A line under the cards says the subscription renews until canceled in the App Store or Google Play,
with the Terms of Service and the Privacy Policy linked under it, which Apple's subscription rules ask for beside the
purchase. After a purchase or a restore the app calls `POST /billing/store/sync` and
refetches the billing state, so the plan, the limits, and the session agree with the web within the request.

Account's header gains the web's `PlanButton`: Upgrade opens Plans for a free user, Manage plan opens the store's
`managementURL` for a store subscriber, and a Stripe subscriber reads "Your plan is billed on the web." with no link.
Account's settings gain Restore purchases, a native requirement with no web counterpart, named in `parity.md`. The
failed-payment notice's Update opens the store's management url for a store subscriber, and a Stripe subscriber's
notice keeps its words with no button.

A visitor keeps Get started to sign-up, which returns to Plans, where the purchase is offered.

### Pricing, products, and entitlements

Store prices match the web: $20 and $40 monthly, $200 and $400 yearly, in USD, with the store's automatic pricing
elsewhere. App Store Connect: one subscription group with four products, `carlnotes.plus.monthly`,
`carlnotes.plus.yearly`, `carlnotes.premium.monthly`, `carlnotes.premium.yearly`, premium ranked above plus. Play
Console: `carlnotes_plus` and `carlnotes_premium`, each with `monthly` and `yearly` base plans. RevenueCat: entitlements
`plus` and `premium`, each attached to its two products, and a `default` offering with the four packages. The server
maps an entitlement id to the plan and reads the interval from the product id, so the two stores' id formats never
reach a switch. `packages/contracts/storeBilling.ts` holds the entitlement ids and the interval rule.

### Overage names its provider

`isOverageBillable({ provider, billingInterval, hasPaymentMethod })` in `packages/contracts/plans.ts` is true for a
monthly Stripe subscription with a card. `quotas.ts` and the account page both read it, and the billing state includes
`provider` and `isOverageBillable`. A store plan's daily limit is hard, and the account page's "billed by the scan" line
never shows for it.

### Web changes for a store subscriber

The web's `PlanButton`, the plan card's portal action, and the payment notice read the provider. A Stripe subscriber
sees the portal as today. A store subscriber sees "Manage in the App Store" or "Manage in Google Play", which opens
the store's subscription page, and no checkout. `PURCHASE_COPY` gains the two labels. Account closing:
`cancelUserSubscription` cancels a Stripe subscription as today and cannot cancel a store one, so the closing section
and its confirmation tell a store subscriber to cancel in the store, with the link, before or after closing, and the
row and the RevenueCat customer are deleted with the account either way.

### The Terms name store plans

The Terms of Service's paid plans section gains a store plan list: the store charges the price it shows in its
currency and renews until canceled in the store, the store handles refunds, a store plan's limit is never billed as
overage, and closing the account does not cancel a store subscription. `TERMS_VERSION` moves to `2026-10-31`, so every
account accepts the Terms again before its next write that other users read, and the acceptance notice's body names
both changes since the last version.

### Secrets and configuration

Doppler holds `REVENUECAT_SECRET_API_KEY` (the v1 secret key the customer read uses) and
`REVENUECAT_WEBHOOK_AUTHORIZATION` (the Authorization header value configured in RevenueCat), and
`REVENUECAT_SANDBOX_USER_IDS` (the accounts whose sandbox purchases count outside dev), read through `Bun.env` in
`apps/api/storeBilling.ts`. `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` and `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` are
public SDK keys, moved into EAS by `sync-mobile-env.ts` as plaintext. RevenueCat itself holds Apple's In-App Purchase
key and Google's service account, uploaded in its dashboard, and receives App Store Server Notifications and Play's
real-time developer notifications; none of that passes through the repo. `.env.example` names the five values.

### Analytics and monitoring

`checkout_started` gains the provider, the storefront country code, and `entryPoint: "mobile"`, sent through `POST
/billing/store/checkout` before the store's sheet opens. The store sync emits `subscription_started`, `plan_changed`,
and `subscription_canceled` through the same function the Stripe webhook uses, with the provider added. A webhook
rejection or failure is reported like Stripe's.

## Risks / Trade-offs

- [Apple rejects the build over the subscription screen] → the cards show the store price, the period, the renewal
  line, Restore purchases, and the Terms and Privacy links the footer already shows, and the review notes name the
  sandbox account and the purchase steps.
- [The sandbox differs from production: Apple renews a sandbox subscription in minutes and Google needs a published
  internal track] → the release checklist's purchase items name the sandbox account per store, and the sync route is
  tested in-process with a stubbed customer record.
- [A webhook arrives before the user row exists, or for an app user id that is not a user] → the sync ignores an
  unknown user and responds 200, as the Stripe handler ignores a subscription without a user id.
- [RevenueCat is unreachable when a webhook or the sync route runs] → 500 and RevenueCat's retries for the webhook. The
  sync route responds 502 and reports the failure, and the app keeps the state it has and refetches on the next launch.
- [Double subscription across providers] → hidden in both apps, rejected by the api's checkout for a store subscriber,
  reported when it happens, higher rank wins.
- [A sandbox purchase charges nothing, and TestFlight testers buy in the sandbox] → outside dev, the projection drops
  the entitlements a sandbox subscription grants unless the user's id is in `REVENUECAT_SANDBOX_USER_IDS`, which holds
  App Review's account.
- [Store prices drift from the catalog] → the cards show the store's price on the app, the catalog's on the web, and
  the docs say the app's price is the store's.
- [The new dependency grows the bundle and the fingerprint] → one store build, measured with `@expo/fingerprint`
  before and after.
- [The 1% RevenueCat fee above $2,500 MTR] → accepted; it replaces receipt validation, server notifications for two
  stores, and the restore logic.

## Migration Plan

1. The user creates the store products, the RevenueCat project, its entitlements and offering, uploads the store
   credentials to RevenueCat, and puts the five values in Doppler. `bun run mobile:env:sync` moves the public keys to
   EAS.
2. The migration creates the provider enum, adds `provider` with default `stripe` to `billing_subscriptions`, and
   adds `users.revenuecat_app_user_id` with a random default and a unique constraint, one `ALTER` per table under a
   lock timeout. Every existing row reads as a Stripe row and every user gets an id. The random default is volatile, so
   the users column rewrites the users table under its lock, which takes moments at today's row count. Rollback is two
   column drops and the type's drop.
3. The api deploys with the webhook route and the sync route. RevenueCat's webhook is pointed at
   `/api/webhooks/revenuecat` with the Authorization value.
4. The store build ships with the dependency. Until it does, the shipped build has no purchase and nothing changes
   for it. A build that cannot load offerings shows the read-only cards it shows today.
5. Rollback of the purchase on a shipped build: remove the products from the RevenueCat offering, and the rules show
   the read-only cards within the next offerings load. Existing store subscribers keep their entitlements.
