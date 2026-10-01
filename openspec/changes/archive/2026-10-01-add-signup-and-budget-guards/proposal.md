## Why

A traffic surge can stop signup and can spend money on Scans that cannot finish. Signup waits on the LiteLLM proxy with no timeout and fails if key creation fails, so a slow proxy stops every signup exactly when the surge is hitting the proxy. The scheduled sweep starts Scans for owners whose key budget is already spent, and each of those Scans pays for Exa, TwitterAPI.io, and Firecrawl during ingest before its first model call is rejected.

## What Changes

- The proxy's admin calls, `/key/generate`, `/key/info`, and `/key/delete`, time out after five seconds instead of waiting without limit.
- A signup whose key creation fails or times out still creates the user, with no key, and reports the failure to Sentry. Password and OAuth signup alike stay up while the proxy is down.
- A user with no key gets one before their first model call. `loadUserLiteLLMKey` becomes `loadOrProvisionUserLiteLLMKey`. The new function creates a missing key at the user's current budget and stores the key. The function throws an error if the proxy cannot create the key. A user's model call is never billed to the master key. A Scan creates its owner's missing key before ingest, so a key that cannot be created fails the Scan before any ingest spend.
- The sweep reads each owner's key budget from the proxy once per sweep, before it starts any Scans. An owner whose key has spent its whole budget gets no Scan started. The sweep saves a failed Scan for each of that owner's scheduled Topics instead. `isBudgetError` matches the failed Scan's reason, so the Topic page says "Carl hit this month's coffee budget." with its See plans action instead of showing nothing. The sweep's summary counts these Topics as over budget.
- The scheduled Topics of an owner whose budget cannot be read, or who has no key yet, are scanned as before.
- A manual Scan takes the same check before it starts. If the key that the Scan bills, the requesting user's own, has spent its whole budget, the scan route rejects the request with a 402 before a Scan row is created, a Source runs, or an overage is billed. The Topic page shows "Carl hit this month's coffee budget." with See plans. If the read fails, the Scan starts as before.
- The design states the worst-case monthly operator spend on Exa, TwitterAPI.io, and Firecrawl per fully active user on each plan.
- The Turnstile check on password signup is unchanged, and OAuth signup stays one click with no check, by decision. Ingest spend stays on the operator's account and is not charged against a user's budget, by decision. The free plan's pricing is out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `user-auth`: the key-at-signup requirement no longer fails signup on a proxy failure. The key is created before the user's first model call instead, with a timeout, and a user's model call is never billed to the master key.
- `domain-schema`: a null LiteLLM key on a user row now also means that the proxy could not create a key at signup and that no model call has created a key since.
- `scheduled-scans`: the sweep reads each owner's key budget once per sweep. For each scheduled Topic of an owner whose budget is spent, the sweep saves a failed Scan with the budget reason instead of starting a Scan. The sweep's summary counts these Topics as over budget.
- `scan-history`: a manual Scan whose key has spent its budget is rejected before it starts, with the budget copy and See plans.

## Impact

- `api/auth.ts`: the user create hook catches a key creation failure and creates the user with no key.
- `worker/litellm.ts`: a timeout on every proxy admin call, `loadOrProvisionUserLiteLLMKey`, and a budget read from `/key/info`.
- Every caller of `loadUserLiteLLMKey`: `api/chat/privateChat.ts`, `api/chat/roomTurns.ts`, `api/chat/roomAttachments.ts`, `api/tool/topicTools.ts`, `api/topic/topics.ts`, and `worker/workflows/runTopicScanActivities.ts`, which also creates a missing key before ingest. The private chat loads the key in the chat turn instead of in its authorization.
- The paths that read the stored key directly: the MCP search tool in `api/mcp/results.ts` and `api/mcp/toolCaller.ts`, and the topic attachment summaries in `worker/workflows/processAttachmentActivities.ts`.
- `worker/schedule.ts`: the per-owner budget read, the failed Scan row for an owner over budget, and the summary count.
- `shared/scanFailure.ts`: the reason stored on a scheduled Scan that never started because its owner's budget is spent, and the budget copy exported for the manual rejection. `isBudgetError` matches the stored reason.
- `api/topic/scans.ts`: the manual scan route's budget check and its 402. `ui/src/clients/topicClient.ts` and `ui/src/components/topic/TopicScanButton.tsx`: the rejection's toast with See plans.
- Smoke suites whose fixture users make model calls: their cleanups delete the keys that those users are now given.
- No schema change and no migration. The existing nullable `users.litellm_virtual_key` records a missing key.
