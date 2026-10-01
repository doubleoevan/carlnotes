## 1. Proxy timeouts and the budget read

- [x] 1.1 Add `LITELLM_ADMIN_TIMEOUT_MS`, five seconds, to `worker/litellm.ts`, and pass `signal: AbortSignal.timeout(LITELLM_ADMIN_TIMEOUT_MS)` to the `/key/generate`, `/key/delete`, and `/key/info` requests
- [x] 1.2 Add `readLiteLLMKeyBudget(key)`, which reads `/key/info` and returns `{ spendDollars, maxBudgetDollars }`, or null on a response that is not ok, a network failure, or a timeout. Make `readLiteLLMKeySpend` for the admin console return the spend from `readLiteLLMKeyBudget`
- [x] 1.3 Add `isUserLiteLLMKeyBudgetExhausted(userId)`, which reads the stored key without creating one and returns whether its spend has reached its maximum budget, and false with no key or a failed read. Export it from `worker/index.ts`
- [x] 1.4 Test that:
  - each admin request is sent with a timeout signal;
  - `readLiteLLMKeyBudget` parses the spend and the maximum budget, and returns null for a response that is not ok and for a request that throws an error;
  - `isUserLiteLLMKeyBudgetExhausted` is true only at or past the maximum budget, and false with no key or a failed read.

## 2. Signup that survives a proxy failure

- [x] 2.1 In the user create hook in `api/auth.ts`, catch a failed or timed-out `provisionLiteLLMKey`, report it to Sentry, and return the user's data with no `litellmVirtualKey`. The Turnstile check, the username, and the avatar source stay as they are
- [x] 2.2 Test the hook with a key creation that throws an error: the hook returns the user's data with no key and reports the failure. Test the hook with a key creation that succeeds: the key is in the data. Update the hook's comment and the `litellmVirtualKey` comment in `db/schema.ts`

## 3. The key before the first model call

- [x] 3.1 Replace `loadUserLiteLLMKey` with `loadOrProvisionUserLiteLLMKey(userId): Promise<string>` in `worker/litellm.ts`, and export it from `worker/index.ts`:
  - it returns the stored key without calling the proxy;
  - for a missing key, it creates one at the user's budget, `userBudgetCents`, and stores it with an update where the key is null, setting `litellmKeyCreatedAt` to now;
  - if that update matched no row, it deletes its own key and returns the stored one;
  - if the update itself fails, it deletes its own key and throws the update's error;
  - if the proxy cannot create a key, it throws an error.
- [x] 3.2 Move every caller to it: `api/chat/privateChat.ts`, where the key load moves from the chat's authorization into the chat turn, `api/chat/roomTurns.ts`, `api/chat/roomAttachments.ts`, `api/tool/topicTools.ts`, `api/topic/topics.ts`, and the review stage in `worker/workflows/runTopicScanActivities.ts`. Move the paths that read the stored key directly to `loadOrProvisionUserLiteLLMKey` too: the MCP search tool in `api/mcp/results.ts`, and the topic attachment summaries in `worker/workflows/processAttachmentActivities.ts`
- [x] 3.3 Call it at the start of `ingestForScan`, before any Source runs, without passing the key across the activity boundary
- [x] 3.4 Test that:
  - a stored key is returned with no proxy call;
  - a missing key is created at the user's budget and stored with its creation time;
  - a lost race deletes the created key and returns the stored one;
  - a failed creation throws an error and never returns undefined;
  - a key replacement still creates the new key at the user's budget, stores it, and deletes the old key;
  - a Scan whose owner's key cannot be created fails before its Sources run.

## 4. The sweep's budget check

- [x] 4.1 Export `SCHEDULED_SCAN_SPENT_BUDGET_REASON` from `shared/scanFailure.ts`, a reason that `isBudgetError` matches. Test that `toScanFailureLabel` reads it as "Carl hit this month's coffee budget."
- [x] 4.2 Add `loadBudgetExhaustedOwnerIds(scheduledTopics)` to `worker/schedule.ts`:
  - it calls `isUserLiteLLMKeyBudgetExhausted` for each distinct owner, a few owners at a time through `runWithConcurrency`;
  - it returns the owners whose key budget is spent;
  - an owner with no key, or whose read failed, is left out.
- [x] 4.3 Pass that set into `startScheduledTopicScans`:
  - after the daily scan limit and the daily topic limit checks, a Topic whose owner is in the set gets a Scan row: status `failed`, not manual, cost zero, started and finished now, no dispatch, and the budget reason;
  - a Topic whose Scan is still running gets no row;
  - the Topic is counted in a new `TopicSweepSummary.skippedOverBudget`;
  - the sweep's log line reads "over budget".
- [x] 4.4 Test that:
  - the Topics of an owner whose budget is spent start nothing, each Topic gets a failed Scan row with the budget reason, and the summary counts each Topic as over budget;
  - the Scans start if the budget read fails or the owner has no key;
  - each owner's budget is read once;
  - a Topic over its owner's daily scan limit, or past the daily topic limit, gets no row;
  - a Topic whose Scan is still running gets no row.

## 5. The manual Scan's budget check

- [x] 5.1 Export `SCAN_SPENT_BUDGET_LABEL`, "Carl hit this month's coffee budget.", from `shared/scanFailure.ts`, and have `toScanFailureLabel` return it for a budget error
- [x] 5.2 In `runManualScan` in `api/topic/scans.ts`, after the gate allows the request and before closing out stale Scans, return `{ status: "budget" }` if `isUserLiteLLMKeyBudgetExhausted` is true for the requesting user, whose key the Scan bills. The route responds to that result with a 402 and `SCAN_SPENT_BUDGET_LABEL`
- [x] 5.3 Map the 402 to `"budget"` in `sendManualScan` in `ui/src/clients/topicClient.ts`. In `TopicScanButton`, show `SCAN_SPENT_BUDGET_LABEL` in an error toast with the See plans action and stop the optimistic scan
- [x] 5.4 Test that:
  - a manual Scan whose key budget is spent returns 402 with the copy, creates no Scan row, and bills no overage;
  - a failed budget read starts the Scan;
  - an admin's manual Scan checks the budget of the key that the Scan bills, the admin's own;
  - the client maps the 402 to `"budget"`.

## 6. Docs and smoke suites

- [x] 6.1 In each smoke suite whose fixture users make a model call, have the cleanup delete any key that a fixture user was given, then delete the users
- [x] 6.2 Update `worker/AGENTS.md` for the sweep's budget check and the key created before the first model call, `api/AGENTS.md` for the user create hook, and the README if the README says that a proxy failure fails signup

## 7. Verification

- [x] 7.1 Run `bun run check` and keep it green
- [x] 7.2 With the dev proxy stopped, sign up a password user. Confirm that signup responds within about five seconds and that the user has no key. Start the proxy, send that user's first chat turn, and confirm that a key is created, stored with its creation time, and billed for the turn
- [x] 7.3 Give a dev user a budget override of zero and replace their key, so its spend has reached its maximum budget. Run the sweep for one of their scheduled Topics, and confirm that no Scan starts, the Topic page shows "Carl hit this month's coffee budget.", and the summary counts one Topic over budget
- [x] 7.4 As that user, press Run now on the Topic page, and confirm the 402, the toast with See plans, and that no Scan row was created
