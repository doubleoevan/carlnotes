# Tasks

## 1. The admin billing row and its log

- [x] 1.1 Add `admin` to the billing row's provider enum, beside the billing providers the account page names, and
      the `admin_plan_changes` table, then generate the migration
- [x] 1.2 Move the billing projection to `packages/pipeline/` and the Stripe client to `packages/server/`, so the
      worker can write through them
- [x] 1.3 Let a provider's projection replace an admin billing row, and keep an admin projection from replacing a
          provider's row

## 2. The admin plan change and its end

- [x] 2.1 Add `changeUserPlan` in `packages/pipeline/adminPlanChanges.ts`: reject a billed user, write the plan through
          the
      projection, and log the admin plan change
- [x] 2.2 Add `endExpiredAdminPlanChanges` and run it as a sweep stage
- [x] 2.3 Add `POST /admin/users/:id/plan` behind `admin:changePlan`, rejecting a past end date and responding 409 for a
      billed user

## 3. The users table

- [x] 3.1 Return each user's admin plan change reason and end date in the console's users rows
- [x] 3.2 Turn the plan cell into a select that opens the plan change dialog, with the Set by admin badge and its end
          date
- [x] 3.3 Link the cost against the budget to the user's account page

## 4. Tests

- [x] 4.1 The admin plan change's plan change and log, the key's budget resize, the end, and the billed user's rejection
          in
      `packages/pipeline/adminPlanChanges.test.ts`
- [x] 4.2 The route's gate, its past end date, and its 409 in `apps/api/admin.test.ts`
