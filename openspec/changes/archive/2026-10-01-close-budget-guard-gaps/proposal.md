## Why

The budget guards on the scheduled sweep and the manual Scan left four gaps. A Topic's first Scan starts at creation with no budget check, so a user whose key budget is spent still costs the operator one ingest for each Topic that they create, and nothing limits how often a user can delete and create Topics. The sweep also starts any Scan row that was opened and never dispatched with no budget check. A LiteLLM key that a first model call creates can be stored with a budget that changed while the key was being created, and a key created while its user's account is closing is never deleted from the proxy.

## What Changes

- Topic creation reads the owner's key budget from the LiteLLM proxy before it starts the first Scan, with the same check that the scheduled sweep and the manual scan route run.
- If the owner's key has spent its whole budget, creation starts no Scan and no Source runs. The first Scan that creation opened is marked failed with a budget reason, so the Topic page says "Carl hit this month's coffee budget." with its link to the plans page.
- The Topic is still created, and its url Sources are still screened.
- If the owner has no key yet, or the budget read fails, the first Scan starts as before.
- The budget check runs before the wait for the Sources' screens, so a first Scan whose owner's budget is spent is not left open through that wait for a sweep to start.
- A first Scan row that a sweep already started is left in place. Before this change, creation deleted that row while the sweep's Scan was running on it.
- The sweep runs the same check on a Scan row that was opened and never dispatched. If the row's owner's key budget is spent, the sweep marks the row failed with the budget reason instead of starting it. A manual Scan's row is started as before, since the manual scan route checked the budget when it opened the row.
- A first model call stores its new key only if the user's role, plan, and budget override are still the ones that the key's budget was computed from. If any of them changed, the key is deleted and a new key is created at the current budget.
- Closing an account deletes a key that a model call created while the account was closing.
- A Scan that was marked failed before a worker picked it up runs no Source, even if a workflow starts for it afterward.
- A key store that throws an error is checked against the user's row, so a key that was stored is kept instead of deleted.
- A key that the proxy does not know counts as already deleted, so a close that failed after its key delete can be tried again.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scheduled-scans`: the requirement that Topic creation starts the first Scan's workflow gains the budget check. The requirement that the sweep starts no Scan for an owner whose key budget is spent now covers a Scan row that was opened and never dispatched, and the requirement that the sweep dispatches Scans that were never started gains the same exception.
- `user-auth`: a key created before a user's first model call is stored only at the user's current budget.
- `account-closing`: a key created while an account is closing is deleted from the proxy.

## Impact

- `api/topic/helpers.ts`: `startFirstScan` checks the budget first and marks the first Scan failed if the budget is spent. It hands the first Scan row to `scanTopic` as an existing row.
- `worker/scan.ts`: `failUnstartedScan`, which marks a Scan failed only if no user started it by hand and no worker picked it up.
- `worker/workflows/runTopicScanActivities.ts`: `ingestForScan` runs no Source for a Scan that is already failed.
- `worker/schedule.ts`: `startUndispatchedScans` checks the owner's key budget before it starts a row, and skips a row that stopped running.
- `worker/litellm.ts`: the conditional store in `loadOrProvisionUserLiteLLMKey` also matches the user's role, plan, and budget override. A store that throws an error keeps a key that the user's row has. `replaceUserLiteLLMKey` deletes its new key if the user's row is gone, and `deleteLiteLLMKey` treats a 404 as deleted.
- `api/users.ts`: `deleteUser` deletes a key that the deleted user row returns and that the close had not already deleted.
- `shared/scanFailure.ts`: a second stored budget reason, for a first Scan that never started, which `isBudgetError` matches.
- Every path that creates a Topic goes through `startFirstScan`: the editor, the new-topic chat, and the MCP `create_topic` tool.
- No schema change and no migration.
