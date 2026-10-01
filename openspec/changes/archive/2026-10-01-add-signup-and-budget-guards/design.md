## Context

Every user's model calls go through the LiteLLM proxy on their own virtual key, whose `max_budget` is the user's monthly budget. The proxy rejects a call once the key's spend reaches that budget, with an error that `isBudgetError` in `shared/scanFailure.ts` recognizes.

- **Signup.** The user create hook in `api/auth.ts` calls `provisionLiteLLMKey` inline, and the hook throws an error if that call fails. `provisionLiteLLMKey` sends `POST /key/generate` with no timeout. So a slow proxy holds every signup open, and an unreachable one fails every signup, password and OAuth alike.
- **A missing key.** `loadUserLiteLLMKey` returns undefined for a user with no key, and `worker/models.ts` then bills the call to `LITELLM_MASTER_KEY`, which has no per-user budget. The MCP search tool and the topic attachment summaries read the stored key directly, with the same fallback. `db/schema.ts` says that the key is null only before signup completes. Today only smoke and seed fixtures, which insert users directly, have no key.
- **The sweep.** `startScheduledTopicScans` in `worker/schedule.ts` checks each owner's daily scan limit and daily topic limit, never their budget. A Scan loads its owner's key in the review stage, after ingest. So a Scan whose owner's budget is spent pays for its whole ingest, then fails at its first embedding call.
- **The app's spend total.** `isMonthlySpendExhausted` in `api/authorization.ts` gates chat on the app's recorded spend. That total sums `scans.cost` and `chat_turns.cost`, and `scans.cost` includes the ingest charges for Exa, TwitterAPI.io, and Firecrawl that the proxy never sees.
- **Constraints.** The worker never imports the api. A Temporal activity's arguments and results are stored in the workflow history, so a key never crosses an activity boundary.

## Goals / Non-Goals

**Goals:**

- Signup never waits more than five seconds on the proxy, and never fails because of it.
- A user without a key gets one before their first model call, and a user's model call is never billed to the master key.
- The sweep never starts a Scan whose first model call the proxy would reject because of the budget, unless the budget read fails. The owner sees why that Scan did not run.
- A manual Scan whose owner's budget is spent is rejected before it starts, with the same budget copy and See plans.
- The operator's worst-case monthly spend on Exa, TwitterAPI.io, and Firecrawl per fully active user is a stated number for each plan.

**Non-Goals:**

- Turnstile on password signup is unchanged, and OAuth signup stays one click with no check.
- Ingest spend stays on the operator's account and is not charged against a user's budget.
- The free plan's pricing.

## Decisions

### 1. Every proxy admin call times out after five seconds

`provisionLiteLLMKey`, `deleteLiteLLMKey`, and the `/key/info` read pass `signal: AbortSignal.timeout(LITELLM_ADMIN_TIMEOUT_MS)`, which is five seconds. A `/key/generate` call normally returns in well under a second, so five seconds only cuts off a slow proxy. A timeout reads as a failure, the same as an unreachable proxy.

A failed `/key/generate` or `/key/delete` throws an error that names only the response status. The proxy's response body goes to the log. A Scan stores its failure's message and shows that message to the Scan's owner, and an MCP tool returns its error's message to the client. So the response body must not be in the error's message.

Retrying at signup was considered and rejected. A retry lengthens every signup exactly when the proxy is overloaded, and the first model call is a better time to try again.

### 2. A failed key creation at signup still creates the user

The user create hook calls `provisionLiteLLMKey` and catches a failure. On a failure or a timeout, the hook reports the error to Sentry with the signup path and returns the user's data with no `litellmVirtualKey`. The rest of the hook runs as before: the username, the avatar source, and the Turnstile check that comes first on the password path. The null column is the record that the key is missing, so no new column is needed.

### 3. The first model call creates a missing key

`loadUserLiteLLMKey` becomes `loadOrProvisionUserLiteLLMKey(userId): Promise<string>`. Every caller moves to it, and so do the MCP search tool and the topic attachment summaries.

- It reads the stored key and returns it if there is one.
- If there is none, it creates one at the user's current budget, `userBudgetCents`, with the timeout from decision 1.
- It stores the new key with a conditional update, `where litellm_virtual_key is null`, and sets `litellm_key_created_at` to now, so the monthly reset treats the key as this month's.
- If the conditional update matched no row, another call stored a key first. This call deletes its own new key and returns the stored one.
- If the update itself fails, this call deletes its new key and throws the update's error, so a retried call never leaves a key at the proxy that no row names.
- If the proxy cannot create the key, the function throws an error. A caller's model call then fails as it would if the proxy were down.

A Scan calls `loadOrProvisionUserLiteLLMKey` at the start of `ingestForScan`, before any Source runs, so a key that cannot be created fails the Scan before any ingest spend. The ingest stage reads the owner from the Scan row, so the activity's arguments do not change. The review stage calls it again and reads the stored key. The key never enters an activity's arguments or result, because those are stored in the workflow history.

The private chat loads the key in the chat turn itself instead of in the chat's authorization. Loading a conversation runs that authorization too. So loading a conversation never creates a key, and still works while the proxy is down.

The master-key fallback in `worker/models.ts` stays for calls made for no user, such as the docs embedding and the search Source's query generation during ingest. That query generation is ingest spend. The MCP visitor path has its own public key.

A background job that creates missing keys on a schedule was considered and rejected. A user can make a model call before the job runs, so the call itself would still need this path.

### 4. The sweep reads each owner's key budget from the proxy

`readLiteLLMKeyBudget(key)` reads `/key/info` and returns `{ spendDollars, maxBudgetDollars }`, or null on any failure. The key's recorded spend and its maximum budget are the numbers that the proxy compares when it rejects a call. A key with no maximum budget has a null `maxBudgetDollars`, and its budget is never spent. `readLiteLLMKeySpend`, the admin console's spend read, returns the spend from `readLiteLLMKeyBudget`.

`isUserLiteLLMKeyBudgetExhausted(userId)` reads the user's stored key without creating one and compares the key's recorded spend with its maximum budget. It returns false if the user has no key or the read fails. The sweep and the manual scan route both call it.

Before the start loop, `loadBudgetExhaustedOwnerIds(scheduledTopics)` calls `isUserLiteLLMKeyBudgetExhausted` for each distinct owner of the scheduled Topics, a few owners at a time through `runWithConcurrency`, and returns the owners whose key budget is spent. An owner with no key, or whose read fails or times out, is not in the set, so that owner's Topics are scanned as before. A read that throws an error, such as a failed query for the owner's row, is reported and counts as not spent, so one owner's failure never stops the sweep. Counting a failed read as not spent is the right way to fail, because the proxy still rejects a call that is over budget.

The app's recorded spend (`isMonthlySpendExhausted`) was considered and rejected for the sweep. The recorded spend counts ingest charges that the proxy does not, so a check on the recorded spend would skip Scans whose model calls would still succeed. `isMonthlySpendExhausted` also lives in the api, and the worker never imports the api. Skipping a Topic if the remaining budget is less than a typical Scan's model cost was also rejected. That skip would take away Scans that could finish.

### 5. A skipped Topic gets a failed Scan with the budget reason

In `startScheduledTopicScans`, the checks run in this order: the owner's daily scan limit, the daily topic limit, then the budget. A Topic whose owner's budget is spent gets a Scan row and nothing is started:
- status `failed`, not manual, cost zero;
- `startedAt` and `finishedAt` set to now, and no `dispatchedAt`;
- the error `SCHEDULED_SCAN_SPENT_BUDGET_REASON`, "Carl ran out of coffee this month, so the scheduled scan didn't start", exported from `shared/scanFailure.ts`. `isBudgetError` matches it by its exact text, beside the proxy's own "Budget has been exceeded" rejection.

The sweep's summary counts the Topic in a new `skippedOverBudget`, and the log line reads "N over budget".

The row reuses everything that the budget error already has on the Topic page:
- `toScanFailureLabel` shows "Carl hit this month's coffee budget." with the See plans action;
- the recap shows "Today I ran out of coffee.";
- the Scan history shows the failure.

A Topic whose Scan is still running gets no row. The scheduled topic filter ignores a running Scan, so such a Topic stays selected, and a failed Scan row beside its running Scan would be a second Scan for the Topic. The running Scan ends on its own.

The row also counts as the Topic's last completed Scan, so the scheduled topic filter does not select the Topic again until its frequency window passes. So the sweep saves one row per frequency window, not one row per sweep. A failed Scan never counts toward the daily scan limit, so the row takes none of the owner's daily Scans. A row that fails to save is reported, and the Topic stays scheduled for the next sweep.

A separate notice field was rejected, because it needs a new column and new UI to say what the failed Scan already says. Skipping silently was rejected by the request.

### 6. A manual Scan takes the same check before it starts

In the manual scan route in `api/topic/scans.ts`, after the gate allows the request, `runManualScan` calls `isUserLiteLLMKeyBudgetExhausted` for the requesting user. A manual Scan bills the key of the user who requested the Scan: the owner's own, or an admin's own on a Topic that the admin does not own. `runManualScan` checks the budget before it closes out stale Scans or starts anything. If that key's budget is spent, `runManualScan` returns a new `{ status: "budget" }` result. The route responds to that result with a 402 and `SCAN_SPENT_BUDGET_LABEL`, the copy "Carl hit this month's coffee budget." The label is exported from `shared/scanFailure.ts` so that `toScanFailureLabel` and the rejection share one string. No Scan row is created, no Source runs, and no overage is billed. A read that fails or times out starts the Scan as before.

`sendManualScan` in `ui/src/clients/topicClient.ts` maps the 402 to `"budget"`. `TopicScanButton` then shows the copy in an error toast with the See plans action that a budget failure already has, and drops its optimistic running state.

The button's existing check stays as it is. The button reads the app's recorded spend from the page and shows "You are out of budget this month." with See account. The route check is what makes sure that a Scan whose key budget is spent never pays for ingest, since the app's total can lag the proxy's recorded spend and a page can be stale.

Creating a failed Scan row for a manual rejection, as the sweep does, was considered and rejected. The user is on the page when a manual Scan is rejected, so a toast tells them, and a row would add a Scan that never ran to the Topic's history.

### 7. The worst-case monthly operator spend

Third-party spend per Scan, charged to the operator's accounts, from the constants in `worker/budget.ts` and `worker/ingest/`:

| Where | Bound per Scan |
|---|---|
| Exa, the search Source | 5 queries × $0.007 = $0.035. A Topic has at most one search Source, since it is the only default Source and not a custom option |
| TwitterAPI.io, each X Source | one `from:` query, one page of at most 20 tweets × $0.00015 = $0.003 |
| Firecrawl, each url Source | one scrape if the stored page is stale, $0.001 |
| YouTube, Reddit, RSS, podcasts, Bluesky | no per-call charge |
| Ingest in all | a Topic holds at most 10 Sources, so $0.035 + 9 × $0.003 = $0.062 |
| Firecrawl in the fetch stage | $0.001 per scrape, about 30 scrapes under the 30 scored-Resource limit, so about $0.030 |
| Expected worst case | $0.092 |
| Hard bound | $0.50, the per-Scan spend limit (`SCAN_BUDGET_USD`, 0.5 in production), which stops the fetch and scoring stages. It is a loose bound on third-party spend, since it also counts the model spend. A failed scrape counts toward the 30 scored-Resource limit and is not charged to the Scan's Budget, so the fetch stage pays for about 30 scrapes, plus the few already in flight when the limit is reached |

Model spend on embedding and scoring goes to the user's key, and the plan's monthly budget bounds it. It is not in the table. The search Source's query generation is one cheap-model call per Scan on the master key. It is operator spend too, at a fraction of a cent, and is left out.

A fully active user uses every daily Scan on every day of a 31-day month:

| Plan | Daily Scans | Expected worst case ($0.092 a Scan) | Hard bound ($0.50 a Scan) | Monthly budget |
|---|---|---|---|---|
| free | 5 | $14.26 | $77.50 | $3 |
| plus, monthly | 15 | $42.78 | $232.50 | $10 |
| plus, yearly | 20 | $57.04 | $310.00 | $10 |
| premium, monthly | 30 | $85.56 | $465.00 | $20 |
| premium, yearly | 40 | $114.08 | $620.00 | $20 |

After this change, no scheduled Scan and no manual Scan starts for a user whose key budget is spent, unless the budget read fails. So the table bounds a user who stays under their key budget. A user whose key budget is spent can still cause ingest spend on the paths that take no budget check: the first Scan of a Topic that they create, and a Scan row that was opened earlier and that the sweep dispatches late. An admin's budget override changes only the monthly budget column.

## Risks / Trade-offs

- [A user created while the proxy was down has no key] → Their first model call creates it. If the proxy is still down, that call fails, as it would have anyway, because every model call goes through the proxy.
- [Two first model calls create two keys] → The conditional store keeps one, and the other call deletes its own.
- [A plan or budget override change happens while a first model call is creating the key] → The key keeps the budget that was read before the change, until the next monthly reset or the next plan or budget change replaces the key. This race needs a user with no key and a change inside one proxy round trip.
- [A model call creates a key while its user's account is closing] → The account close read no key, so the new key stays at the proxy with no row that names it. Nothing holds the key once that call ends, so it cannot be spent afterward.
- [The budget read adds a `/key/info` call per owner to every sweep] → Only owners with scheduled Topics are read, a few at a time, with the five-second timeout, and a failed read fails open.
- [The proxy records spend a moment after a call ends] → The check predicts only whether the next call would be rejected. A Scan that starts just under budget can still fail partway through, as it does today.
- [A Topic's first Scan at creation takes no budget check] → A user whose budget is spent still costs the operator one ingest for each Topic that they create, and that Topic's first Scan fails at its first model call, as it does today. The plan's topic limit bounds how many Topics they hold.
- [Smoke fixture users, created without a key, now get a dev key on their first model call] → The smoke cleanups delete any key that a fixture user was given.

## Migration Plan

- There is no schema change and no backfill. Every real user already has a key, and any user left without one gets one at their first model call.
- Rollback: before reverting, create a key for every user who has none, such as a user who signed up while the proxy was down. The old code would bill those users to the master key.

## Open Questions

None. The decisions above were settled with the user on 2026-09-30.
