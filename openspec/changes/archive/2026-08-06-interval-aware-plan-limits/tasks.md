## 1. The plans catalog

- [x] 1.1 Add a `BillingInterval` type of `monthly` and `yearly` to `shared/plans.ts`, and turn `dailyScanLimit` into `Record<BillingInterval, number>` alongside a new `dailyTopicLimit` of the same shape.
- [x] 1.2 Set the new values: free `topicLimit` 3, `dailyTopicLimit` 1/1, `dailyScanLimit` 5/5, `monthlyBudgetCents` 300; plus 10, 3/4, 15/20, 1000; premium 25, 6/7, 30/40, 2000.
- [x] 1.3 Extend `shared/plans.test.ts`: every plan defines both intervals for both per-interval limits, a higher rank never lowers a limit at either interval, and no plan's yearly limit is below its monthly one.

## 2. The billing interval as the stored fact

- [x] 2.1 Replace `billing_subscriptions.has_overage` with an `interval` column, and migrate the existing rows by mapping `true` to monthly and `false` to yearly — exact, since the boolean was only ever set from the interval.
- [x] 2.2 Set `interval` from the subscription metadata in `toPaidSubscription`, and derive overage-billability from it wherever `hasOverage` was read.
- [x] 2.3 Add a `loadBillingInterval`-style read that resolves a user's interval, answering monthly for a user with no subscription.

## 3. The gate

- [x] 3.1 Resolve the daily scan limit by interval in `decideManualScan`, and pass the interval in from `authorizeManualScan`.
- [x] 3.2 Add the daily topic limit to the gate: count the user's Topics on a `daily` or `weekdays` frequency and compare against the plan's limit at their interval, with an admin bypassing it.
- [x] 3.3 Cover the gate in `api/authorization.test.ts`: at the limit, under it, `weekdays` counting the same as `daily`, `weekly` never counted, an admin bypassing, and a yearly subscriber reading the yearly number.

## 4. Enforcement where frequency is written

- [x] 4.1 Enforce the daily topic limit in `createTopic` before the transaction writes anything.
- [x] 4.2 Enforce it in `updateTopic` when the payload's frequency is a daily frequency, excluding the Topic being edited from the count so re-saving an already-daily Topic never refuses itself.
- [x] 4.3 Return a refusal the ui can surface in Carl's voice, naming the number and pointing at pricing, and render it on both the create and edit paths.

## 5. The account spend card

- [x] 5.1 Rename the section to Carl's coffee fund and drop the percentage from the heading, keeping the money figures and the bar.
- [x] 5.2 Replace the static disclaimer with a state line keyed on the fraction spent: full pot under 60%, getting low to 89%, nearly out to 99%, and dry at 100%, with the first three saying it is Carl's tab and not the reader's.
- [x] 5.3 Put an inline upgrade link in the 100% line only.
- [x] 5.4 Keep the Brews and Coffee talk segment labels untouched.

## 6. The pricing cards

- [x] 6.1 Drop the dollar budget line from every card.
- [x] 6.2 List topics, daily-scheduled topics, manual scans a day, and an approximate monthly scan total, in that order.
- [x] 6.3 Read the per-interval limits from the toggle, and mark the lines whose value changed when yearly is selected.

## 7. Verification

- [x] 7.1 `bunx biome check .`, `bunx tsc -b`, `bun test`.
- [x] 7.2 Live: at the free limit of one daily Topic, confirm creating a second daily Topic is refused with the number named, and that setting an existing weekly Topic to daily is refused the same way.
- [x] 7.3 Live: confirm re-saving an already-daily Topic succeeds, and that moving one to weekly frees the slot for another.
- [x] 7.4 Live: confirm the account card's state line changes across the thresholds and that only the spent state offers the upgrade link.
- [x] 7.5 Live: confirm the pricing cards read as specified on monthly, and that switching to yearly changes and marks only the daily-topic and manual-scan lines.
- [x] 7.6 Live: confirm a monthly subscriber's daily scan limit resolves to the monthly number and a yearly subscriber's to the yearly one.

## 8. Holding existing Topics to the limit

- [x] 8.1 Bind the daily topic limit in the scheduled sweep: scan only as many of an owner's daily-frequency Topics as their plan allows, oldest first, and count the rest in the sweep's log line.
- [x] 8.2 Claim a daily slot only when a save moves a Topic onto a daily frequency, so an owner holding more than their limit can still edit the Topics they have.
- [x] 8.3 Cover both rules: the sweep skips a daily Topic outside its owner's allowance and never a weekly one, and a Topic already on a daily frequency claims nothing.

## 9. Reading the interval from the price

- [x] 9.1 Derive the recorded billing interval from the prices the Stripe subscription carries, treating any yearly price as yearly, and fall back to the checkout stamp when an event carries no prices.
- [x] 9.2 Cover the portal switch in both directions, a monthly subscription carrying its overage price, and an event with no prices.
