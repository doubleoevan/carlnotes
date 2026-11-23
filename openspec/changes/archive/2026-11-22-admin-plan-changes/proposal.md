# Proposal

## Why

An admin cannot give someone a paid plan without Stripe. A directory reviewer, a beta tester, or a partner needs
Premium for a while, and today the only path is a real subscription or a hand-edited database row that leaves the topic
limit, the full podcast episodes, and the LiteLLM key budget out of step.

## What Changes

- **An admin plan change.** The admin users table's plan cell becomes a select like the role's. Picking a plan opens a
  dialog that asks for a required reason and an optional end date. The admin plan change writes the plan through the
  same billing projection the Stripe and RevenueCat webhooks use, so `users.plan`, the sessions, the topic limit, the
  full podcast episodes, and the LiteLLM key budget all follow at once.
- **A log.** Each admin plan change is an `admin_plan_changes` row: the user, the admin, the plan, the reason, the end
  date, and when.
- **An end.** The worker's sweep returns an admin plan change past its end date to the free plan through the same
  projection.
- **Paying users stay with billing.** A user that Stripe or a store bills cannot have their plan changed by an admin,
  and the api responds 409 with its reason. A user with an admin plan change who subscribes leaves the admin plan change
  for the subscription.
- **The table.** A plan an admin set shows a Set by admin badge with its end date and its reason in a tooltip. The cost
  against the budget links to the user's account page in place of the plan.

## Capabilities

### Modified Capabilities

- `admin-console`: the admin plan change control, the Set by admin badge, and the cost link to the account page.
- `subscription-billing`: an admin billing row beside the providers' rows, its end, and its place under a subscription.

## Impact

- `packages/db/schema/billing.ts` (the `admin` billing provider and `admin_plan_changes`, one migration)
- `packages/pipeline/billingProjection.ts` and `packages/server/stripeClient.ts`, moved from `apps/api/` so the worker
  can end an admin plan change, and `packages/pipeline/adminPlanChanges.ts`
- `apps/api/admin.ts`, `apps/api/adminConsole.ts`, `apps/api/billing.ts`, `apps/worker/schedule.ts`
- `apps/web/src/components/table/` (the plan select, the plan change dialog, the cost link)
