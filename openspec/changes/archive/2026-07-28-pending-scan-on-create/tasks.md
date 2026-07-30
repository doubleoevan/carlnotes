## 1. Create is atomic and hands off to the sweep

- [x] 1.1 Wrap `createTopic`'s inserts (topic, owner subscription, invitees, sources, first Scan) in one `db.transaction`, and drop the in-process `processTopicScan` call

## 2. The sweep claims the pending Scan

- [x] 2.1 `runTopicScan` claims the topic's newest running Scan when one exists, re-stamping `startedAt`, and opens a fresh row only when none is running
- [x] 2.2 `loadScheduledTopics` computes due-ness over completed Scans only, via a pure helper the tests can reach

## 3. Manual scan refusal

- [x] 3.1 `runManualScan` returns a `running` outcome when the topic already has a running Scan, mapped to 409 in `api/index.ts`

## 4. Verification

- [x] 4.1 Pure tests: due-ness ignores running rows (new-topic case), and the claim decision picks the existing row over opening a second
- [x] 4.2 Full gate: `scripts/check-comment-groups.sh`, `bunx biome check .`, `bunx tsc -b`, `bun test` (121 pass)
- [x] 4.3 Live: seeded a bare topic with a pending Scan, and the dev sweep's next pass claimed it — the same scan id went running to succeeded with no second row
