## Context

`scans.owner_id` is the ledger a Scan lands on. Two readers use it: `scansToday` for the daily quota, and `isMonthlySpendExhausted` for the monthly budget sum. The pipeline separately looks that user up to bill the run to their LiteLLM virtual key.

`runManualScan` already knows two distinct users — the acting `userId` and `topic.ownerId` — and passed the owner.

## Goals / Non-Goals

**Goals:**
- An admin's Scan costs the Topic owner nothing.
- An owner's own Scan behaves exactly as it does today.
- No schema change and no backfill.

**Non-Goals:**
- Changing who may scan. The gate's authority and quota decisions are untouched.
- Changing scheduled Scans, which have no actor.
- Recording both the actor and the owner. That is a second column, and nothing needs to read it.

## Decisions

### Pass the actor, not the owner

`runManualScan` receives the acting user and already uses it for the overage report and the result email. It passes the Topic's owner only to `runTopicScan`, which is the one place the ledger is decided.

Chosen: pass `userId`. Since `userId` *is* the owner whenever an owner scans their own Topic, one argument covers both cases without a branch — there is no `isAdmin ? admin : owner` conditional to get wrong later.

Rejected: an `actorId` column beside `owner_id`, splitting quota from spend so the owner's cost reporting keeps the spend. It needs a migration and a backfill, and it buys a reporting nicety at the cost of a second attribution to keep consistent. The owner's Activity table already shows the Scan and its cost, because it groups by topic rather than by `owner_id`.

### `owner_id` keeps its name and its meaning

The column means "whose ledger this Scan is on", and it still does. The doc comment on `runTopicScan` explains it as surviving the Topic's deletion, which is about durability and stays true.

Renaming it to `charged_user_id` would describe it better, but it is referenced across the schema, quotas, authorization, and the admin console for no behavior change.

## Risks / Trade-offs

- **An admin's spend is charged to the admin budget.** `ADMIN_BUDGET_CENTS` is a backstop, not a plan, so a careless admin scanning many Topics spends against that ceiling. That is the intended place for it to land, and it is visible in the admin console.
- **The owner's Activity cost column includes a Scan they did not pay for.** It groups by topic, so an admin's run shows up there while their spend meter, which reads their own LiteLLM key, does not. The two figures answer different questions, but a reader could take the cost column for their own spend.
- **The rule lives in a call-site argument, not a pure function**, so it has no offline unit test. The spec scenario names it and the argument sits under a comment that says why.
