## Context

`createTopic` in `api/topic/topics.ts` writes the Topic and its first Scan row in one transaction, then calls `startFirstScan` in `api/topic/helpers.ts` without waiting for it. `startFirstScan` waits up to 30 seconds for the Topic's url Sources to finish their llm-guard screen, then hands the open Scan row to Temporal with `scanTopic`.

The scheduled sweep and the manual scan route both call `isUserLiteLLMKeyBudgetExhausted` before they start a Scan. `startFirstScan` does not. A first Scan whose owner's key budget is spent runs every Source, then fails at its first embedding call.

- **What limits creation.** `topic:create` allows a user who owns fewer Topics than their plan's topic limit. Deleting a Topic frees its slot. Creation takes no daily limit, and a failed Scan does not count toward the daily scan limit.
- **The open row and the sweep.** The first Scan row is `running` with no `dispatchedAt` until `scanTopic` starts its workflow. The sweep's `startUndispatchedScans` starts any such row that it finds, with no budget check.
- **The stored reason.** The sweep stores `SCHEDULED_SCAN_SPENT_BUDGET_REASON` on the failed Scan that it saves, and `isBudgetError` matches that reason by its exact text. Production may already hold rows with it.
- **The key store.** `loadOrProvisionUserLiteLLMKey` reads the user's budget, creates a key at the proxy, then stores the key if the row still has none. A plan or budget override change between the read and the store is not seen, and `replaceUserLiteLLMKey` does nothing for a user whose key is not stored yet.
- **The account close.** `deleteUser` in `api/users.ts` reads the user's key once and deletes it from the proxy, then deletes the Topics, the stored objects, and the user row. A model call that runs in between creates and stores a new key, and the row delete then removes the only record of that key.

## Goals / Non-Goals

**Goals:**

- A Topic's first Scan never starts if the proxy would reject its first model call because of the budget, unless the budget read fails.
- The Topic's creator sees why the first Scan did not run, with the copy and the link to the plans page that the other budget failures have.
- The sweep starts no Scan row whose owner's key budget is spent, including a row that was opened and never dispatched.
- A key that a first model call stores always has the user's current budget.
- No key is left at the proxy after its user's account is closed.

**Non-Goals:**

- Creating a Topic is not rejected. A user whose budget is spent can still create Topics.
- The copy of the `create_topic` tool results is unchanged. A tool responds before the budget is read.

## Decisions

### 1. `startFirstScan` checks the budget before it waits for the Sources' screens

`startFirstScan` calls `isUserLiteLLMKeyBudgetExhausted(ownerId)` first. The check is one user row read and one proxy call under the five-second timeout.

Checking after the screen wait was considered and rejected. The first Scan row stays open and undispatched during that wait, which can last 30 seconds, and a sweep that runs in that time starts the row.

### 2. A spent budget marks the opened first Scan failed

Creation already opened the first Scan row inside its transaction, so the new Topic page shows a Scan under way. If the budget is spent, `startFirstScan` updates that row instead of starting it:

- status `failed` and `finishedAt` now;
- the error `FIRST_SCAN_SPENT_BUDGET_REASON`, "Carl ran out of coffee this month, so the topic's first scan didn't start", exported from `shared/scanFailure.ts`.

`isBudgetError` matches the new reason by its exact text, beside the scheduled reason and the proxy's own rejection. So the Topic page shows `SCAN_SPENT_BUDGET_LABEL` with its link to the plans page, the recap shows its budget line, and the toast for a Scan that fails while the page is open fires as the row changes from running to failed.

The update applies only if the row is still `running`, is not manual, and has no `dispatchedAt` and no `pickedUpAt`. A row that a sweep already dispatched has a workflow running, so it is left alone.

Rewording `SCHEDULED_SCAN_SPENT_BUDGET_REASON` to cover both cases was considered and rejected. Rows already saved with that text would stop matching `isBudgetError`.

Deleting the first Scan row was considered and rejected. The owner would see a new Topic with no Scan and no reason.

### 3. The Sources are still screened, without the wait

A Source row is hidden from other users and skipped by Scans until its llm-guard screen finishes. With no Scan to wait for the screens, `startFirstScan` starts them with `screenPendingSources(topicId)` and returns.

### 4. The first Scan row is handed to Temporal as an existing row

`startFirstScan` calls `scanTopic` with `isExistingRow` set, since `createTopic` opened the row. `scanTopic` deletes a row that its own caller opened if Temporal rejects the start because a workflow for the Topic is already running. For a first Scan, that workflow is the one a sweep started on the same row, so the delete removed the row from under a running Scan. With the flag set, a rejected start marks the row dispatched, and a start that throws an error leaves the row for the sweep's `startUndispatchedScans`.

The budget read lengthens the time that the row stays open before `scanTopic`, which is why this change fixes the delete.

### 5. A budget that cannot be read starts the first Scan

`isUserLiteLLMKeyBudgetExhausted` returns false if the owner has no key or the proxy read fails. If the call throws an error, such as a failed query for the owner's row, `startFirstScan` reports the error and treats the budget as not spent. The proxy still rejects a model call on a key whose budget is spent.

### 6. The sweep checks the budget before it starts an undispatched Scan row

`startUndispatchedScans` calls `isUserLiteLLMKeyBudgetExhausted` for the row's owner. If the budget is spent, the sweep calls `failUnstartedScan` with `SCHEDULED_SCAN_SPENT_BUDGET_REASON` and starts nothing. The sweep already starts such a row as a scheduled Scan, so the scheduled reason is the accurate one. `failUnstartedScan` in `worker/scan.ts` is the same conditional update that `startFirstScan` uses.

A row that a user started by hand is started as before. The manual scan route checked the budget a moment before it opened the row, and the stored reason says that a scheduled Scan did not start.

A budget read that fails at the proxy counts as not spent, so the row starts. A budget read that throws an error leaves the row for the next sweep, as any other failure in that loop does.

### 7. The key store also matches the user's role, plan, and budget override

The conditional update in `loadOrProvisionUserLiteLLMKey` already requires that the row has no key. It now also requires that the row's role, plan, and budget override equal the ones that the budget was computed from. If the update matches no row, the existing path deletes the new key and loads the key again, which creates a key at the current budget.

Reading the budget again after the store and replacing the key if it changed was considered and rejected. It leaves a moment in which the stored key has the older budget, and it adds a read to every first model call.

### 8. The account close deletes a key that the deleted row returns

`deleteUser` deletes the user row with `returning`, and deletes the returned key from the proxy if the close had not already deleted that key. A failed delete is reported and the close goes on, since the row is already gone.

### 9. A workflow that starts for a failed Scan runs no Source

`scanTopic` writes `dispatchedAt` after the workflow start returns, so a row can read as undispatched while its workflow is starting. `failUnstartedScan` can then mark that row failed.

`ingestForScan` sets `pickedUpAt` and then reads the Scan row. If the row is already `failed`, the stage throws a failure that Temporal does not retry, with the row's own reason, and the workflow saves that reason again. `failUnstartedScan` requires no `pickedUpAt`, so either the update runs first and no Source runs, or the worker picks the Scan up first and the update matches no row.

A manual start sets `isManual` on the open row before it starts the workflow, and `failUnstartedScan` requires a row that is not manual. So a Scan that a user started by hand is never failed with a reason about a scheduled Scan.

`startUndispatchedScans` updates `startedAt` only on a row that is still `running` and starts no workflow if that update matches no row.

Claiming the row in the database before the workflow start was considered and rejected. It needs a new column and a migration, and the ingest check gives the same result with the columns that exist.

### 10. A key store that throws an error is checked against the user's row

A store can throw an error after the key is stored, for example if the connection drops after the commit. Deleting the key in that case leaves the user's row with a key that the proxy no longer has. So `loadOrProvisionUserLiteLLMKey` and `replaceUserLiteLLMKey` read the row again after a store that throws an error, keep the key if the row has that key, and otherwise delete the key and throw the store's error.

`replaceUserLiteLLMKey` also deletes its new key if its update matches no row, which means the account was closed while the key was created.

### 11. A 404 from the proxy's key delete counts as deleted

The proxy responds 404 to a delete of a key that the proxy does not know. `deleteUser` deletes the user's key first and stops if that delete throws an error, so a close that failed after the key delete could never be tried again. `deleteLiteLLMKey` returns without an error on a 404.

## Risks / Trade-offs

- [A sweep dispatches the open first Scan during the budget read] → The sweep now runs the same check before it starts the row. If both reads find the budget spent, the first update marks the row failed and the second update matches nothing.
- [The call that created a key while its user's account is closing can still spend on that key] → The close deletes that key right after it deletes the row, so the call can spend on the key only until the close finishes.
- [The failed first Scan counts as the Topic's last completed Scan] → The sweep does not select the Topic again until its frequency window passes, and then the sweep's own budget check applies.
- [Creation adds one proxy call] → Creation does not wait for `startFirstScan`, so the call adds nothing to the request.

## Migration Plan

- There is no schema change and no backfill.
- Rollback: revert the change. A first Scan already marked failed with the new reason keeps its row, and the reverted code shows that reason as plain failure text instead of the budget label.

## Open Questions

None. The scope was settled with the user on 2026-10-01.
