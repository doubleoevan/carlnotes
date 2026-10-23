## 1. Spend reservations

- [x] 1.1 `packages/models/spendReservations.ts`: the Lua reserve, the release, the expiry, the Redis fallback to the
      recorded spend against the budget; the fakes' reserve script and `ZREM` in `db/redisFakeSpendReservations.ts`
- [x] 1.2 The maximums per call kind beside the limits they read, priced at the rates in `budget.ts`: the chat turn and
      podcast reply in `pipeline/chat/chatTurnCost.ts`, the transcription in `transcription.ts`, the spoken part in
      `speech.ts`, the scored Resource in `review/score.ts`
- [x] 1.3 The gates: `api/chat/room.ts` reserves before the post, `chatTurnAnswer.ts` before the private turn's first
      model call, and `voiceRoute.ts` before each transcription and spoken part; `chatTurnStream.ts`, the room turn,
      and `voiceRoute.ts` release after the spend row and on failure; the manual scan route and the sweep keep today's
      start checks
- [x] 1.4 `Budget.reservedDollars` with `reserveScanSpend`, `releaseScanSpend`, and `toCheckpointBudget`;
      `fetchAndScoreResource` reserves before the paid section through `reserveScoredResource`; `toResumedBudget`
      starts at zero
- [x] 1.5 Tests: a call with budget left starts even if its maximum does not fit, a second call is rejected while the
      first holds the rest, concurrent calls pass the budget by less than one call's maximum, settling returns the
      difference, an unsettled reservation expires, Redis down allows under today's check, four parallel review items
      against a nearly spent Scan budget start only while budget is left, a resumed budget holds no reservation, a turn
      is rejected before it posts once the spend and open reservations reach the budget
- [x] 1.6 Docs: the `models`, `db`, `pipeline`, and `api` AGENTS files and the README's chat paragraph; no setting is
      added, so `.env.example` is unchanged
- [ ] 1.7 Watch the rejections for a week after the deploy (manual step 22)
