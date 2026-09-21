## 1. The shared pieces the worker needs

- [x] 1.1 Move `UserAccess` and `userBudgetCents` to `shared/plans.ts` and `isAdminRole` to `shared/enums.ts`, re-exported from `api/authorization.ts`, with `db/quotas.ts` calling it
- [x] 1.2 Move `startOfUtcMonth` to `db/quotas.ts` beside `startOfUtcDay`, re-exported from `api/topic/quotas.ts`
- [x] 1.3 Add `users.litellm_key_created_at`, defaulting to now, and generate its migration

## 2. The key management in the worker

- [x] 2.1 Move the three proxy calls from `api/litellm.ts` to `worker/litellm.ts`, and drop `budget_duration` from the key
- [x] 2.2 Move `replaceUserLiteLLMKey` there too, recording the new key's time, and export it through `worker/index.ts`
- [x] 2.3 Point `api/authorization.ts`, `api/admin.ts`, `api/auth.ts`, `api/billing.ts`, `api/seed.ts`, and `api/users.ts` at the worker
- [x] 2.4 Delete `api/litellm.ts`

## 3. The monthly reset

- [x] 3.1 `resetMonthlyBudgets` in `worker/litellm.ts`: replace every key created before the month began, one attempt per user, and return the counts
- [x] 3.2 Call it at the top of `runScheduledTopicScans`, before any Scan starts, and name its counts in the sweep's summary line
- [x] 3.3 Tests: the key is created with its budget and no `budget_duration`, and the month boundary the due rule compares against begins at utc midnight on the first

## 4. Docs

- [x] 4.1 `worker/AGENTS.md` names `litellm.ts`
- [x] 4.2 `api/litellm.ts` goes on the stale-drift list in `.agents/commands/audit-structure.md`
