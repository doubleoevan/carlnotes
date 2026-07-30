## Why

A topic's frequency was a bare "daily" or "weekly" label with no time-of-day control, so every topic implicitly scanned whenever the (currently unbuilt) scheduler happened to run it. Users want to say when: pick a time for a daily scan, and a time and day for a weekly one, using the same picker pattern Claude's own scheduled tasks use.

## What Changes

- **BREAKING**: `frequencies` gains a third value, `"weekdays"` (every Monday–Friday), inserted between `"daily"` and `"weekly"`. Any code matching on the frequency union exhaustively needs the new case.
- `topics` gains two columns: `scheduled_time` (time of day, default `09:00:00`) and `scheduled_day_of_week` (default `monday`, meaningful only when frequency is weekly).
- The edit-topic modal's Frequency field becomes a row of controls: the frequency select, a new `TimePicker` (a pill showing "09:00 AM" that opens a scrollable list of 30-minute slots, closing on selection), and — weekly only — a day-of-week select.
- The topic info popover/card's Schedule row now reads as a sentence: "Daily at 09:00 AM", "Weekdays at 09:00 AM", or "Weekly on Monday at 09:00 AM", instead of the bare frequency word.

## Capabilities

### New Capabilities
- `topic-scheduling`: a topic's frequency carries a time of day (and, for weekly, a day of week) that the owner sets from the edit modal and every viewer sees on the topic's info.

### Modified Capabilities
(none — no existing spec capability covers topic frequency or its editing UI)

## Impact

- Affected files: `shared/enums.ts`, `shared/contracts.ts`, `db/schema.ts` (+ migration), `api/topic/topics.ts`, `api/topic/feeds.ts`, `ui/src/components/topic/EditTopicModal.tsx`, `ui/src/components/TopicInfo.tsx`, `ui/src/lib/utils.ts`, and a new `ui/src/components/TimePicker.tsx`.
- No scheduler exists yet in this codebase — `scheduled_time`/`scheduled_day_of_week` are stored and displayed but, like `frequency` before them, have no operational effect until a scheduler is built to read them.
- Existing topics backfill to `daily`'s existing default frequency, `09:00:00`, and `monday` — no manual migration step for existing rows.
