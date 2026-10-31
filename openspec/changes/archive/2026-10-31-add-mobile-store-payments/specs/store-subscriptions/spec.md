# Spec Delta

## Purpose

How the mobile app sells, restores, switches, and manages a plan through Apple In-App Purchase and Google Play Billing,
how a store subscription reaches the entitlement row, and the storefront rules that decide which purchase entry points
the app shows.

## ADDED Requirements

### Requirement: The app sells the paid plans as store subscriptions

The mobile app SHALL sell the plus and premium plans, monthly and yearly, as auto-renewing subscriptions through Apple
In-App Purchase on iOS and Google Play Billing on Android. A signed-in free user's other plan cards SHALL offer
Upgrade, a store subscriber's other cards SHALL offer a plan switch that changes the store product, and the current
plan and interval SHALL be marked. The app SHALL never open the web's checkout or Customer Portal.

#### Scenario: A free user buys plus

- **WHEN** a signed-in free user presses Upgrade on the plus card at the monthly interval
- **THEN** the store's purchase sheet opens for the plus monthly product, and after the store confirms, the account
  shows the plus plan billed monthly

#### Scenario: A store subscriber switches plan

- **WHEN** a plus store subscriber presses the action on the premium card
- **THEN** the store changes the subscription to the premium product with the store's proration, and the account shows
  premium after the change

#### Scenario: A visitor is sent to sign-up

- **WHEN** a visitor presses a plan card's action
- **THEN** sign-up opens and returns to Plans, where the purchase is offered

### Requirement: The storefront rules decide every purchase entry point

A shared rules function SHALL decide whether a plan may be bought in the app and where the user's plan is managed,
from the platform, the store account's storefront country code or its absence, whether the store returned an offering
with every plan package, the user's plan, and the subscription's provider, and never from the device locale or region.
Every purchase entry point SHALL read the rules.

#### Scenario: Every entry point reads the rules

- **WHEN** the rules change what the storefront allows
- **THEN** the Plans cards, the Account plan button, and the budget, Topic-limit, scan failure, spoken-questions, and
  failed-payment notices all follow them

#### Scenario: A storefront with the offering buys in the app

- **WHEN** the store returns the offering with the four plan packages for the account's storefront
- **THEN** the Plans cards offer the purchase and every notice shows the web's words with the plans link

#### Scenario: A storefront without the offering is read-only

- **WHEN** the store returns no offering, or one missing a plan package, for the account's storefront
- **THEN** the Plans cards show no purchase action and every notice keeps its words without a plans link

#### Scenario: An unknown storefront falls back to the offering

- **WHEN** the store reports no storefront country code
- **THEN** the rules decide from the offering alone, and no entry point links to web checkout

#### Scenario: The web is never linked

- **WHEN** the rules run for any storefront
- **THEN** no entry point opens the web's checkout or the Customer Portal

### Requirement: The app's plan card shows the store's price

On the app, a plan card's price and billing note SHALL come from the store's product for the account's storefront,
and the cards SHALL be withheld until the offering and the billing state resolve. If the offering fails to load, the
cards SHALL show the catalog's prices with no purchase action. A line under the cards SHALL say the subscription renews
until canceled in the App Store or Google Play, with links to the Terms of Service and the Privacy Policy under it.

#### Scenario: A German storefront shows euro prices

- **WHEN** a user whose store account is on the German storefront opens Plans
- **THEN** each card shows the store's euro price and the yearly card's per-month price from the store

#### Scenario: The offering fails

- **WHEN** the store returns an error for the offering
- **THEN** the cards render the catalog's dollar prices, no card offers a purchase, and a retry is offered

### Requirement: A purchase or a restore reaches the entitlement row through the api

After the store confirms a purchase, a plan switch, or a restore, the app SHALL call the api's store sync route and
refetch the billing state. The route SHALL read the signed-in user's current customer record from the purchase
processor, project it into the user's Billing Subscription row, and refresh the session, trusting nothing the app
claims. The account SHALL show the plan on the web and the app within that request.

#### Scenario: The plan shows at once

- **WHEN** the store confirms a purchase and the sync route returns
- **THEN** the billing state, the session's plan, and the web's account page all name the bought plan

#### Scenario: The sync trusts the processor alone

- **WHEN** the app calls the sync route for a user with no store subscription at the processor
- **THEN** the route changes nothing, whatever the app's own customer info says

#### Scenario: A failed read keeps the app's state

- **WHEN** the processor's customer read fails on the sync route
- **THEN** the route responds 502 and reports the failure, and the app keeps the billing state it has

#### Scenario: A sync fails after the charge

- **WHEN** the store charges for a purchase and the sync route then fails
- **THEN** the app says the purchase went through and the plan will show shortly, and the store's event applies it

### Requirement: The store knows an account by its RevenueCat app user id

Before a purchase or a restore, the app SHALL log the store in with the account's RevenueCat app user id from the
billing state: a random id the api saves per account, never the account id. The app SHALL log the store out once no
one is signed in, and the webhook SHALL find the account by this id.

#### Scenario: The store still holds the previous account

- **WHEN** a second account signs in on a phone whose store log in still names the first, and buys or restores a plan
- **THEN** the app logs the store in with the second account's RevenueCat app user id first, and the plan reaches
  that account

#### Scenario: Signing out

- **WHEN** the signed-in user signs out of the app
- **THEN** the store logs out to an anonymous id, and a visitor's Plans still shows the store's prices

### Requirement: A store event re-reads the customer and projects it idempotently

The purchase processor's webhook SHALL verify the configured Authorization value, and for a verified event SHALL
re-read the named customer's current record and project it into the row: the active entitlement with the highest plan
rank sets the plan, the product's interval word sets the billing interval, and no active entitlement clears the row. A
rejection SHALL get a 400 and a read or write failure a 500 so the event is retried, and both SHALL be reported.

#### Scenario: A renewal, a duplicate, and a late event converge

- **WHEN** a renewal event is delivered twice and an older event arrives after it
- **THEN** every delivery leaves the same row, read from the customer's current record

#### Scenario: A refund ends access

- **WHEN** a store refund expires the subscription and the expiration event arrives
- **THEN** the row is cleared, the user reads free, and the key budget is resized to the free backstop

#### Scenario: A billing issue keeps access in the grace period

- **WHEN** a billing issue event arrives while the entitlement is active
- **THEN** the row's status is `past_due`, the plan is kept, the row's period end is the grace period's end, and the
  account shows the failed-payment notice

#### Scenario: A cancellation keeps the plan until the period ends

- **WHEN** a cancellation event arrives
- **THEN** the row's status is `canceled`, the plan is kept, and the expiration event later clears it

#### Scenario: A transfer re-reads both users

- **WHEN** a transfer event names a source and a destination app user id
- **THEN** both users' rows are projected from their records, the source reverts to free, and the destination gains
  the plan

#### Scenario: An unknown app user id is ignored

- **WHEN** a verified event names an app user id that is no user's RevenueCat app user id
- **THEN** the webhook responds 200 and writes nothing

#### Scenario: A wrong Authorization value is rejected

- **WHEN** an event arrives with a missing or wrong Authorization value
- **THEN** the webhook responds 400, writes nothing, and reports the rejection

### Requirement: An expired store row repairs itself on read

A store row whose period end is more than a day past SHALL re-read the customer when the billing state loads, so a
plan whose expiration event never arrived does not outlive the month. A failed re-read SHALL be reported, and the
billing state SHALL read the stored row.

#### Scenario: A missed expiration

- **WHEN** a store subscriber whose period ended two days ago opens Account
- **THEN** the customer is re-read, the row is cleared, and the account shows the free plan

#### Scenario: A failed re-read

- **WHEN** the customer re-read fails for a stale store row
- **THEN** the failure is reported and Account shows the stored plan

### Requirement: A sandbox purchase counts only for listed accounts

A store sandbox purchase charges nothing, so outside dev the projection SHALL drop the entitlements a sandbox
subscription grants unless the user's id is in the api's sandbox user list, which holds App Review's account.

#### Scenario: A tester's sandbox purchase

- **WHEN** a TestFlight tester whose id is not listed buys a plan in the store's sandbox in production
- **THEN** the sync and the webhook leave the tester on free, and the key budget is unchanged

#### Scenario: App Review's sandbox purchase

- **WHEN** App Review's listed account buys a plan in the sandbox
- **THEN** the account shows the plan, as a production purchase would

### Requirement: A store subscriber manages the plan in the store

A store subscriber's Manage plan on the app SHALL open the store's subscription management page, and on the web SHALL
show "Manage in the App Store" or "Manage in Google Play" with the store's link in place of the Customer Portal. For
a Stripe subscriber, the app SHALL show "Your plan is billed on the web." with no link. Neither app SHALL offer a
second checkout to a user with an active plan from another provider, and the api SHALL reject a store subscriber's
Stripe checkout with a 409.

#### Scenario: Manage plan on the app

- **WHEN** a store subscriber presses Manage plan on Account
- **THEN** the store's subscription management page opens

#### Scenario: A store subscriber on the web

- **WHEN** a store subscriber opens the web's Account or Plans page
- **THEN** the plan button and the other cards' action read Manage in the App Store or Manage in Google Play, open the
  store's page, and no card opens checkout

#### Scenario: A web subscriber on the app

- **WHEN** a Stripe subscriber opens Plans on the app
- **THEN** no card offers a store purchase, and Plans and Account say the plan is billed on the web, with no link

#### Scenario: A store subscriber's checkout request

- **WHEN** a store subscriber's request reaches the api's Stripe checkout route, as from a stale tab
- **THEN** the route responds 409 and opens no Checkout Session

### Requirement: Restore purchases

The app SHALL offer Restore purchases on Account. It SHALL ask the store for the account's purchases, call the sync
route, and refetch the billing state. A restored subscription that belongs to another CarlNotes account SHALL move to
the restoring account, with the other account's row cleared on its next event or read.

#### Scenario: A reinstall restores the plan

- **WHEN** a store subscriber reinstalls the app, signs in, and presses Restore purchases
- **THEN** the account shows the plan without a new charge

#### Scenario: Nothing to restore

- **WHEN** a user with no store purchase presses Restore purchases
- **THEN** the account says nothing was found and the plan is unchanged

### Requirement: Two providers resolve to one plan

When a store projection meets a Stripe row for the same user, the higher plan rank SHALL win, equal ranks SHALL keep
the row's current provider, and the conflict SHALL be reported with both subscription ids. A Stripe subscription that
a higher store plan replaces SHALL be set to cancel at its period end after the row is written, and a failed cancel
SHALL be reported without undoing the write.

#### Scenario: A premium store subscription meets a plus Stripe row

- **WHEN** the sync projects a premium store subscription for a user with a plus Stripe row
- **THEN** the row becomes the premium store subscription, the Stripe subscription is set to cancel at its period
  end, and the conflict is reported

#### Scenario: The Stripe cancel fails

- **WHEN** Stripe rejects the cancel of a subscription that a premium store subscription replaced
- **THEN** the row keeps the premium store subscription and the failed cancel is reported

#### Scenario: Equal plans keep the current provider

- **WHEN** the sync projects a plus store subscription for a user with a plus Stripe row
- **THEN** the Stripe row stays and the conflict is reported

### Requirement: A store plan's daily limit is firm

A store subscription SHALL never bill metered overage. Its daily scan limit SHALL be a hard limit, and the account
page SHALL never show the "billed by the scan" line for it.

#### Scenario: A monthly store subscriber reaches the limit

- **WHEN** a monthly store subscriber starts a manual Scan beyond the daily limit
- **THEN** the Scan is rejected and the account says the daily limit is reached

### Requirement: Closing an account with a store subscription

Account closing SHALL tell a store subscriber that the store keeps billing until they cancel there, SHALL give the
store's management link in the closing section and its confirmation, and SHALL delete the row and the account's
RevenueCat customer with the account. A failed customer delete SHALL be reported, and the close SHALL go on. A Stripe
subscription SHALL keep being canceled by the api as it is today.

#### Scenario: A store subscriber closes the account

- **WHEN** a store subscriber opens Close your account on either app
- **THEN** the section and the confirmation say to cancel the subscription in the store, with the link, and closing
  deletes the row and the RevenueCat customer

### Requirement: Store products and entitlements are named once

The entitlement ids, the plan each maps to, and the rule that reads a billing interval from a product id SHALL live in
one shared module both the api and the apps read, and the store products SHALL be priced to match the web's plans in
USD.

#### Scenario: A product maps to its plan and interval

- **WHEN** the api projects an entitlement whose product id ends in a yearly word
- **THEN** the row's plan is the entitlement's plan and its interval is yearly, for either store's id format

### Requirement: A store purchase is reported like a web one

The app SHALL report `checkout_started` with the plan, the interval, the provider, the storefront country code, and
the mobile entry point, and the store sync SHALL report `subscription_started`, `plan_changed`, and
`subscription_canceled` with the provider, through the same function the Stripe webhook uses.

#### Scenario: A store purchase starts

- **WHEN** a user presses Upgrade on the app
- **THEN** `checkout_started` is recorded with the provider and the storefront country code
