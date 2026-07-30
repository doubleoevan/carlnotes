# Tasks

## 1. Charge the actor

- [x] 1.1 `api/topic/scans.ts`: pass the acting `userId` to `runTopicScan` in place of `topic.ownerId`, with a comment stating that the run is charged to whoever fired it.

## 2. Verify

- [x] 2.1 Run the gate: `bash scripts/preflight.sh`.
- [x] 2.2 Against the live database, confirm a Scan stamped with an admin on another user's Topic leaves that owner's remaining scans and monthly spend untouched, and that a Scan stamped with the owner still draws them down.
