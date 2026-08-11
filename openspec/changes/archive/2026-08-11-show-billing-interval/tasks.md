## 1. Carry the interval through to the UI

- [x] 1.1 Add `billingInterval: BillingInterval` to `BillingState` in `shared/contracts.ts`
- [x] 1.2 Return the `billingInterval` that `loadBillingState` in `api/billing.ts` already reads, adding no query
- [x] 1.3 Confirm no second copy of the interval is introduced on `users` or in the session

## 2. Name the interval on the account page

- [x] 2.1 In `ui/src/pages/AccountPage.tsx`, have `PlanSection` name the interval next to the plan for a paid plan
- [x] 2.2 Leave the free plan's card naming the plan alone, since its resolved `monthly` is a lookup default and not a billing frequency

## 3. Open the pricing toggle at the reader's interval

- [x] 3.1 In `ui/src/pages/PricingPage.tsx`, fetch billing state only when the signed-in user is on a paid plan
- [x] 3.2 Initialize the toggle from the fetched interval, leaving visitors and free users on monthly with no request
- [x] 3.3 Withhold the toggle and the plan cards behind `CoffeeLoading` while a paid user's interval loads, so neither moves after paint and a click on the toggle cannot be overwritten

## 4. Make current-plan mean plan and interval

- [x] 4.1 Give the current-plan test the interval match, so the badge appears only on the reader's exact subscription
- [x] 4.2 Keep the recommendation badge to signed-out visitors, so a signed-in reader sees no badge on a non-matching card
- [x] 4.3 In `PlanAction`, give the reader's plan at a non-matching interval the Customer Portal action instead of the inert current-plan button
- [x] 4.4 Leave the highlight ring on the reader's plan at either interval

## 5. Verify

- [x] 5.1 `bash scripts/preflight.sh` is green
- [x] 5.2 Cover the badge and current-plan rules with a test over the plan-and-interval match, including the same plan at the other interval
- [x] 5.3 Check the account page as a paid monthly user, a paid yearly user, and a free user
- [x] 5.4 Check the pricing page as a visitor, a free user, and a yearly subscriber, confirming the toggle opens correctly and neither the toggle nor the cards move after paint
