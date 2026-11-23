# Proposal

## Why

The admin plan change asks for a reason and an end date in a dialog, and marks the row with a Set by admin badge and
its end. An admin only needs to set the plan. The dialog, the badge, the end date, and the sweep that ends a plan add
steps and code that nothing else needs. The role and budget changes also save without saying so.

## What Changes

- **The plan select saves on pick.** Picking a plan in the admin users table sets it at once, like the role select,
  and a toast says the user's new plan. A user that Stripe or a store bills still gets a 409, shown as an error toast.
- **No dialog, badge, reason, or end date.** The plan change dialog, the Set by admin badge, and the worker sweep that
  ended a plan on its end date are gone. `admin_plan_changes` logs the user, the admin, the plan, and when. Its `reason`
  and `ends_at` columns stay unread until a later migration drops them, because the previous release still reads them.
- **Toasts for role and budget.** A role change and a budget override each show a toast once they save.

## Capabilities

### Modified Capabilities

- `admin-console`: the plan select saves on pick, and every row change shows a toast.
- `subscription-billing`: an admin plan change has no end date, and the sweep no longer ends one.

## Impact

- `packages/db/schema/billing.ts` (`admin_plan_changes.reason` becomes nullable, one migration)
- `packages/pipeline/adminPlanChanges.ts`, `packages/pipeline/billingProjection.ts`, `apps/worker/schedule.ts`
- `packages/contracts/payloads.ts`, `packages/contracts/admin.ts`, `packages/client/billingClient.ts`
- `apps/api/admin.ts`, `apps/api/adminConsole.ts`
- `apps/web/src/components/table/` (the plan select and the toasts) and `apps/web/src/components/admin/`
