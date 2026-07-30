## 1. Schema and contracts

- [x] 1.1 Add `"weekdays"` to `shared/enums.ts`'s `frequencies`, and a new `daysOfWeek` enum
- [x] 1.2 Add `topics.scheduled_time` (Postgres `time`, default `09:00:00`) and `topics.scheduled_day_of_week` (new `day_of_week` pgEnum, default `monday`) to `db/schema.ts`; generate and apply the migration
- [x] 1.3 Add `scheduledTime`/`scheduledDayOfWeek` to `shared/contracts.ts`'s `topicFeed` (auto-inherited by `topicResponse`) and `updateTopicPayload`, the latter validating `scheduledTime` as `HH:MM`

## 2. API

- [x] 2.1 Thread `scheduledTime`/`scheduledDayOfWeek` through `createTopic` and `updateTopic` in `api/topic/topics.ts`
- [x] 2.2 Include both fields in `loadTopicPayload`'s response and `buildTopicFeed`'s response (`api/topic/feeds.ts`), via a shared `toScheduledTimeLabel` helper that trims the seconds Drizzle's `time` column returns

## 3. UI

- [x] 3.1 New `ui/src/components/TimePicker.tsx`: built on the shared `Select` primitive (the same one `Frequency`/`Visibility`/`Max results`/day-of-week already use in this modal), listing every 30-minute increment across the day
- [x] 3.2 New `formatTime12h`/`formatSchedule` helpers in `ui/src/lib/utils.ts`, unit tested
- [x] 3.3 `EditTopicModal.tsx`: extract a `ScheduleFields` subcomponent (frequency select, `TimePicker`, and — weekly only — a day-of-week select) to keep the modal's own complexity within the lint budget; Max results and Visibility now share one row, Visibility on the right
- [x] 3.4 `TopicInfo.tsx`'s Schedule row uses `formatSchedule` instead of the bare frequency word

## 4. Verification

- [x] 4.1 Run the full gate: `scripts/check-comment-groups.sh`, `bunx biome check . --diagnostic-level=error`, `bunx tsc -b`, `bun test`
- [x] 4.2 Verify in the browser: the frequency select offers Daily/Weekdays/Weekly; the time picker opens, every option from 12:00 AM through 11:30 PM is genuinely reachable and selectable (not just present in the DOM behind broken scrolling), and it closes on selection; the day select appears only for weekly; a full edit-save-reload round trip persists all three fields; the info card's Schedule row reads the formatted sentence

## 5. Design rework during apply (user feedback)

- [x] 5.1 The time picker's first cut used a single scrolling column of 48 slots in a custom `Popover`; the user reported no way to reach PM at all. Redesigned as two columns (AM left, PM right) sharing one scroll, so both are always in view together rather than PM being reachable only by scrolling past all 24 AM slots first.
- [x] 5.2 The user then reported the checkmark was unnecessary and the list still stopped scrolling partway through (visually confirmed: stuck at 3:00). The custom `Popover` + plain `overflow-y-auto` div — in both its single- and two-column forms — never actually scrolled reliably once nested inside the edit modal's Dialog. Rebuilt `TimePicker` on the shared `Select` primitive instead, dropping the two-column layout and the custom checkmark: `Select`'s own scroll-up/down buttons and viewport handling are the only mechanism in this codebase already proven to scroll correctly in this exact nested context, and its `SelectItem` already carries the standard indicator every other field in the modal uses.
