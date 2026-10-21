## 1. Spend reservations

- [ ] 1.1 `packages/models/spendReservations.ts`: the Lua reserve, `settle`, `release`, the expiry, the Redis fallback
      to `isMonthlySpendExhausted`; the fake Redis server's sorted set commands and `EVAL`
- [ ] 1.2 The maximums per call kind beside the rates in `budget.ts`: the chat turn and podcast reply, the
      transcription, the spoken part, the scored Resource
- [ ] 1.3 The gates: `api/chat/room.ts`, the private chat turn authorization, and `voiceAuthorization.ts` reserve where
      they check today; `chatTurns.ts` and `voiceRoute.ts` settle after the cost row and release on failure; the manual
      scan route and the sweep read the remaining budget less open reservations
- [ ] 1.4 `Budget.reservedDollars` with `reserveScanSpend`, `settleScanSpend`, `releaseScanSpend`, and
      `toCheckpointBudget`; `fetchAndScoreResource` reserves before the paid section; `toResumedBudget` starts at zero
- [ ] 1.5 Tests: concurrent reservations never exceed the remaining budget, settling returns the difference, an
      unsettled reservation expires, Redis down allows under today's check, four parallel review items against a nearly
      spent Scan budget score only what fits, a resumed budget holds no reservation, a turn whose maximum does not fit
      is refused before it posts
- [ ] 1.6 Docs: the `models` AGENTS file, the README's budget paragraphs, `.env.example` if a setting is added; watch
      the refusals for a week (manual step 22)
