# Tasks

## 1. Domain model

- [x] 1.1 Add the Free-plan Spend, Daily Spend Cutoff, First Scan, Waiting Scan, First Scan Dispatch Limit, and Spend
  Control Settings rows to `.agents/skills/domain-model/SKILL.md` with the identifiers from design D1, and verify
  `.claude/skills/domain-model` reads the same file and `grep -n "Waiting Scan" .agents/skills/domain-model/SKILL.md`
  finds the row

## 2. Settings and the cutoff state

- [x] 2.1 Add `packages/db/schema/spendControlSettings.ts` with the single-row table from design D6, export it from the
  schema index, run `bun run db:generate`, and verify the generated migration creates only `spend_control_settings`
  with its `id = 1` check
- [x] 2.2 Add the `billedPlan` option to `loadSpendSince` in `packages/db/quotas.ts`, joining `users` with a free plan
  and a role that is not admin in each of the seven aggregates, and verify a `packages/db/quotas.test.ts` case leaves a
  paid user's and an admin's spend out and keeps a free user's
- [x] 2.3 Add `packages/db/dailySpendCutoffs.ts` with the Doppler defaults (`PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD`
  65, `SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD` 100, `CHAT_DAILY_SPEND_CUTOFF_USD` 150, `FIRST_SCAN_DISPATCH_LIMIT` 5,
  `HOURLY_SIGNUP_ALERT_COUNT` 50), the cached settings read and free-plan spend read with their unavailable sentinels,
  `loadDailySpendCutoffState`, and `isDailySpendCutoffPassed`. Verify with `packages/db/dailySpendCutoffs.test.ts`: each
  cutoff passes at its amount and not a cent below it, an override replaces a default and clearing it returns the
  default, an invalid or empty Doppler value reads as the default, the cache key carries the UTC day and a new day reads
  fresh, and a failed spend or settings read leaves every cutoff unpassed, reports once, and is not cached
- [x] 2.4 Add `toFirstScanFilter`, `toWaitingScanFilter`, and `isFirstScanWaiting` to the same module, with the
  unverified check (`email_verified = false` and a `credential` account) read only when the switch is on. Verify with
  tests covering: a paid owner's or an admin's row never waits, a free First Scan waits past the scheduled scans cutoff,
  a free manual row waits past it, the switch makes only an unverified password account's First Scan wait, a verified or
  OAuth account's does not, and the earliest row of a Topic is its First Scan while a later row is not
- [x] 2.5 Add the Spend control section to the README (none exists today): what the three cutoffs pause, the first Scan
  dispatch limit, the unverified accounts switch, and the signup alert. Add a spend control settings section to
  `apps/docs/deployment.md` naming the four Doppler settings with their defaults and the console overrides. Update
  `packages/db/AGENTS.md` for the new module and table. Verify the prose wraps at 120 and `bunx biome check .` passes

## 3. The sweep

- [x] 3.1 Change `startUndispatchedScans` in `apps/worker/scanQueue.ts` to take the cutoff state, relay rows that are
  not waiting with their trigger (`manual`, `creation` for a First Scan, else `scheduled`), start Waiting Scans oldest
  first up to the first Scan dispatch limit with no key budget read, and return the Topic ids still waiting. Verify with
  `apps/worker/scanQueue.test.ts`: 12 Waiting Scans with a limit of 5 start the 5 oldest, a limit of zero starts none, a
  Waiting first Scan whose owner's key is spent still starts, an orphaned First Scan starts with the creation trigger,
  and a non-waiting row with a spent key is still marked failed
- [x] 3.2 Change `apps/worker/schedule.ts` to read the cutoff state once at the top of the sweep, pass it to the relay,
  load the free non-admin owners among the scheduled Topics in one query only while the scheduled scans cutoff is
  passed, and skip those owners' Topics and the still-waiting Topics before the quota read, under the
  `skippedOverDailySpendCutoff` and `skippedWaitingScan` counts and in the summary line. Verify with
  `apps/worker/schedule.test.ts`: a free user's Topic writes no Scan row past the cutoff, stays scheduled, and starts on
  the first sweep after the day turns; a paid user's Topic starts past the cutoff; and a Topic whose first Scan waits is
  not taken as a scheduled Scan
- [x] 3.3 Confirm `failStaleScans` leaves a six-hour-old Waiting Scan running, and verify with a case in
  `packages/pipeline/staleScans.test.ts`
- [x] 3.4 Add the hourly signup count and the `hourly-signups` crossing to `reportDailySpend` in
  `apps/worker/dailySpend.ts`, with the threshold read from the settings. Verify with `apps/worker/dailySpend.test.ts`:
  64 signups in the hour cross at the default of 50, 12 do not, and a failed count is reported without stopping the
  report
- [x] 3.5 Update `apps/worker/AGENTS.md` for the relay's Waiting Scans, the first Scan dispatch limit beside
  `SCAN_DISPATCH_LIMIT`, the scheduled scans cutoff in the sweep, and the signup alert, and verify the entries name the
  real files

## 4. Podcast Episodes

- [x] 4.1 Add the podcast episodes cutoff to `loadPodcastEpisodeSpendSkipReason` in
  `packages/pipeline/podcast/planPodcastEpisode.ts`. Past the cutoff, skip a free, non-admin billed user's new Podcast
  Episode if its Topic has a published or removed one, and confirm whether a removed Podcast Episode keeps its publish
  time to pick the filter design D4 names. Verify with `planPodcastEpisode.test.ts`: a repeat Podcast Episode is
  skipped, a Topic's first records, a Topic with only a failed one records, a paid billed user records, and an
  unreadable cutoff state records

## 5. The api

- [x] 5.1 Change `startFirstScan` in `apps/api/topic/saveHelpers.ts` so that after the budget reads it checks
  `isFirstScanWaiting`, and if the first Scan waits, starts the url Source screens without waiting and returns without
  starting. Verify with `apps/api/topic/saveHelpers.test.ts`: past the cutoff a free owner's first Scan row stays
  running and undispatched with the screens started, a paid owner's starts with the creation trigger, a spent monthly
  budget still fails it first, and a failed cutoff read starts it
- [x] 5.2 Change `runManualScan` in `apps/api/topic/scans.ts` to respond `running` without touching the row while the
  Topic's first Scan waits, and, past the scheduled scans cutoff for a free non-admin billed user, open the manual row
  without starting it and respond `started`. Have `stopTopicScan` in `packages/pipeline/scan.ts` save a waiting Scan
  with no workflow as stopped, so Stop takes effect before the sweep starts it. Verify with
  `apps/api/topic/scans.test.ts` and `packages/pipeline/scan.test.ts`, including that a paid user's manual Scan
  starts at once past the cutoff and that the MCP `start_scan` tool returns the same results
- [x] 5.3 Add the query budget tests to `apps/api/queryBudgets.test.ts` for the manual scan route as a paid user (no new
  read), as a free user on a cutoff cache hit (no new database query), and on a cache miss (at most the settings row
  and the seven spend aggregates), and for the topic create route's in-request count, unchanged. Verify each test
  passes and fails if the cache is bypassed
- [x] 5.4 Add `apps/api/spendControlSettings.ts` (the fresh console read, the save that upserts the row and deletes both
  Redis keys), `spendControlSettingsPayload` in `packages/contracts/payloads.ts`, `AdminDailySpendCutoffs` on
  `AdminConsoleResponse` in `packages/contracts/admin.ts`, the `dailySpendCutoffs` field on `GET /admin/console`, and
  `POST /admin/spend-control-settings` behind `admin:console`. Verify with `apps/api/admin.test.ts`: a non-admin is
  rejected on both routes, a save clears the cached state so the next cutoff read uses it, an empty value clears an
  override, invalid values are rejected and leave the row unchanged, and the waiting count matches
  `toWaitingScanFilter`
- [x] 5.5 Update `apps/api/AGENTS.md` for the spend control settings module, the console route, and the waiting first
  Scan in topic creation and the manual scan route, and verify the entries name the real files
- [x] 5.6 Add the chat cutoff to `apps/api/chat/chatTurnAuthorization.ts` as `loadChatSpendRejection`, the `chatPaused`
  status, and its 429 with `CHAT_PAUSED_ERROR` from `packages/contracts/chat.ts`, read by the Topic, team, and new-topic
  chat turns and the chat room's voice gate, with the chat kept open. Reject a free poster's chat room message to Carl
  privately in `apps/api/chat/room.ts` with `CHAT_PAUSED_ERROR` before anything posts, and map that reason to the
  room's `chatPaused` rejection in `packages/core/hooks/useChatRoom.ts`. Map it to the `chatPaused` rejection in
  `packages/client/chatClient.ts` and `voiceClient.ts`, with its line in `packages/core/lib/chatRejectionCopy.ts`.
  Verify with `apps/api/chat/chatTurnAuthorization.test.ts`, `voiceAuthorization.test.ts`, `room.test.ts`, and
  `packages/client/chatClient.test.ts`: a free user past the cutoff is paused, a Plus user is not, a spent budget comes
  first, and only the cutoff's 429 reads as paused

## 6. The admin console

- [x] 6.1 Add `apps/web/src/components/admin/DailySpendCutoffsCard.tsx` with its story, built from Card, Label, Input,
  Switch, and the budget override's number input. It shows the free plan budget on a meter with a circle at each cutoff
  over the list of what each stops and the estimated monthly spend's table of daily signup rates with a per day column,
  each limited by the highest cutoff, beside the month without cutoffs, over the most this month and the past days
  slider, and a second table of how long after midnight UTC each typed cutoff is passed at those rates over a slider for
  each cutoff, drawn by `apps/web/src/components/admin/EstimatedMonthlySpend.tsx` from
  `packages/db/worstCaseMonthlySpend.ts` and `packages/core/lib/worstCaseMonthlySpend.ts`, with a ring of the time left
  until midnight UTC at its top center. The spend meter is `FreePlanSpendMeter.tsx`, drawn with the account meter's
  `MeterBar`, `MeterMarker`, and `MeterCutoffList`, and the typed overrides are `spendControlDraft.ts`. Below it a ring
  of the waiting count against the first scan limit and a ring of the past hour's signups against the signup alert each
  get their own row with the ring at the left and the title and field beside it, vertically centered, drawn with
  `components/common/MeterRing.tsx` like the clock. The switch shows as the permission that allows unverified email
  sign-ups to scan. A divider separates the cutoffs, each limit, and the permission. Each cutoff's field takes the place
  of its amount in the list, each other field sits under its section's title with what it counts after it, and each
  field shows an override as its value and the default as its placeholder. The cutoffs save together from a Save daily
  cutoffs button beside Reset and Defaults, with the meter's circles at the typed cutoffs, and each other field saves
  on its own when it loses focus. Saves run one after another and send only their own fields over the last saved
  values, and a value outside the save contract's bounds is never sent. Place it in a collapsible Limits section
  counting its cutoffs, limit, alert, and permission in `apps/web/src/pages/AdminPage.tsx`. Verify the story renders below and past each cutoff and
  the jsx-conventions check passes
- [x] 6.3 Add the shared ring as `packages/core/components/MeterRing.tsx` with each app's renderer in
  `components/common/MeterRing.tsx` and their stories, and the UTC day and month reset math in
  `packages/core/lib/utcResets.ts` with its test. Split the account budget in
  `packages/core/components/AccountBudget.tsx` into a coffee fund card and a brews card, each with its title at the top
  left and its rings centered at the top: the days until Coffee fund reset with the amount at the top right, and the
  day's Scans used beside the hours until Brew limit reset. Move the plan line and the plan button from the page header
  to each card's bottom left, the plan line with the button right after it, and match the loading skeleton. Put the
  budget and the settings in expandable Budget and Settings sections with icons on both apps, giving each app's
  `AccordionSection` an optional icon, and keep the Settings section's forms mounted while it is closed. An admin's
  read-only view of another account shows no upgrade link, and the two clocks wrap at the largest text size. Verify
  both apps render them
- [x] 6.2 Verify in the browser on the built ui at :3000 as an admin: save a cutoff below the day's free-plan spend and
  see it marked passed, clear it and see the default, turn the switch on and off, and screenshot the card in light and
  dark

## 7. Integration checks

- [x] 7.1 With the scheduled scans cutoff overridden below the dev day's free-plan spend, create a Topic as a free test
  user, and verify in the browser that the Topic page shows a Scan under way with no message about spend or waiting.
  Then run one sweep (`doppler run -- bun apps/worker/schedule.ts`) and verify the first Scan starts with the creation
  trigger and its Podcast Episode records on the standard tier
- [x] 7.2 Run the full gate (`bun run check`) and verify it is green, including the contract freeze check showing no
  route the mobile app reaches changed

## Workflow follow-up

- Ship through `/ship`, which archives the change with `openspec archive daily-spend-cutoffs --yes`.
- After the deploy, set any Doppler default that should differ from the built-in one, in `prd`.
