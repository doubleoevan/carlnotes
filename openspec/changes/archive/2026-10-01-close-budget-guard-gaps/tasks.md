## 1. The stored reason

- [x] 1.1 Export `FIRST_SCAN_SPENT_BUDGET_REASON`, "Carl ran out of coffee this month, so the topic's first scan didn't start", from `shared/scanFailure.ts`, and have `isBudgetError` match it by its exact text beside `SCHEDULED_SCAN_SPENT_BUDGET_REASON`
- [x] 1.2 Test that `isBudgetError` matches the new reason and that `toScanFailureLabel` reads it as `SCAN_SPENT_BUDGET_LABEL`

## 2. The first Scan's budget check

- [x] 2.1 In `startFirstScan` in `api/topic/helpers.ts`, call `isUserLiteLLMKeyBudgetExhausted(ownerId)` before the wait for the Sources' screens. A call that throws an error is reported and counts as not spent
- [x] 2.2 Add `failUnstartedScan(scanId, failureReason)` to `worker/scan.ts`, which marks a Scan failed with `finishedAt` now only if the row is still `running`, is not manual, and has no `dispatchedAt` and no `pickedUpAt`. Export it from `worker/index.ts`
- [x] 2.3 If the budget is spent, call `failUnstartedScan` with `FIRST_SCAN_SPENT_BUDGET_REASON`, start the Topic's Source screens with `screenPendingSources` without waiting, and start no Scan
- [x] 2.4 Pass `isExistingRow` to `scanTopic` in `startFirstScan`, so a start that Temporal rejects because a sweep already started the row keeps the row instead of deleting it
- [x] 2.5 Test that:
  - a spent budget marks the first Scan failed with the reason, starts no Scan, and starts the Source screens without the wait;
  - the update applies only to a row that is still running and undispatched;
  - a budget that is not spent screens the Sources and starts the Scan on its existing row;
  - a budget read that throws an error is reported and starts the Scan;
  - a creation with no first Scan row starts nothing;
  - `scanTopic` keeps an existing row and marks it dispatched if the start is rejected, and leaves the row untouched if the start throws an error.
- [x] 2.6 In `ingestForScan` in `worker/workflows/runTopicScanActivities.ts`, throw a failure that Temporal does not retry, with the Scan's own reason, if the Scan row is already `failed`. Test that no key is loaded and no Source runs

## 3. The sweep's undispatched Scan rows

- [x] 3.1 In `startUndispatchedScans` in `worker/schedule.ts`, call `isUserLiteLLMKeyBudgetExhausted` for the owner of each row that no user started by hand. If the budget is spent, call `failUnstartedScan` with `SCHEDULED_SCAN_SPENT_BUDGET_REASON` and start nothing
- [x] 3.2 Test that a scheduled row whose owner's budget is spent is failed and not started, that a manual row of the same owner still starts, and that a row whose owner's budget is not spent starts
- [x] 3.3 Make the relay's update of `startedAt` match only a row that is still `running`, and start no workflow if the update matches no row. Test that case, and that a budget read that throws an error leaves the row undispatched

## 4. The key's budget at the store

- [x] 4.1 In `loadOrProvisionUserLiteLLMKey` in `worker/litellm.ts`, make the conditional update also match the role, plan, and budget override that the key's budget was computed from
- [x] 4.2 Test that the update matches those three values, and that a budget override that changes while the key is created deletes the first key and stores a key at the new budget
- [x] 4.3 If the store throws an error, read the user's row again and keep the key if the row has that key. Do the same in `replaceUserLiteLLMKey`, which also deletes its new key if the user's row is gone. Test both

## 5. The account close

- [x] 5.1 In `deleteUser` in `api/users.ts`, delete the user row with `returning`, and delete the returned key from the proxy if the close had not already deleted that key. Report a failed delete and let the close go on
- [x] 5.2 Test that a key that the row delete returns and that the close did not read is deleted from the proxy, that a key that the close already deleted is not deleted twice, and that a failed delete is reported and does not fail the close
- [x] 5.3 Have `deleteLiteLLMKey` return without an error if the proxy responds 404, and test it

## 6. The team chat room turn

- [x] 6.1 Test that `runModelChatRoomTurn` reports a key that cannot be created, posts Carl's rejection as a reply to the prompt chat message, and makes no model call

## 7. Verification

- [x] 7.1 Run `bun run check` and keep it green
- [x] 7.2 As a dev user whose key budget is spent, create a Topic. Confirm that the Topic exists, its first Scan is failed with the budget reason, no Scan workflow started, and the Topic page shows "Carl hit this month's coffee budget." with its link to the plans page
