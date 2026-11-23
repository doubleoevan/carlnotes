# Tasks

## 1. The admin plan change without a reason or an end

- [x] 1.1 Make `reason` nullable and stop reading or writing `reason` and `ends_at`, which a later migration drops
      once no process from the previous release runs
- [x] 1.2 Take only the plan in the payload, the route, and `changeUserPlan`, and write the admin billing row with no
      period end
- [x] 1.3 Remove `endExpiredAdminPlanChanges`, its sweep stage, and the projection's `clearedSubscriptionId`

## 2. The users table

- [x] 2.1 Remove the plan change dialog and the Set by admin badge, and save the plan select on pick
- [x] 2.2 Show a toast after a plan, role, or budget change saves, and an error toast if it fails

## 3. Tests

- [x] 3.1 Update the pipeline, route, and schedule tests to the plan-only change
