## Context

`topics.frequency` has existed since the earliest schema as a bare `"daily" | "weekly"` enum with no time component, and no scheduler in this codebase reads it yet — scans only run via the manual "Brew now" owner-triggered path. The user asked for a time picker matching the one Claude's own scheduled-tasks feature uses (shown via screenshots: a frequency dropdown with a separate pill button beside it reading "09:00 AM", opening a checkmarked list on click), plus a new "Weekdays" frequency, plus a day-of-week picker for weekly.

## Goals / Non-Goals

**Goals:**
- A topic's schedule (frequency, time of day, and for weekly, day of week) is fully editable and displayed.
- The time picker matches the reference pattern in spirit — a trigger showing the formatted time, opening a list, closing on selection — using whichever concrete implementation actually scrolls reliably in this modal.
- Sensible defaults for a new topic: daily at 09:00 AM.

**Non-Goals:**
- No scheduler. `scheduled_time`/`scheduled_day_of_week` are stored and shown, exactly like `frequency` already was, with no code yet consuming them to actually trigger a scan.
- No timezone handling — the stored time is naive local time, matching how the rest of the app has no per-user timezone concept today. Revisit if a scheduler is ever built.
- No "Hourly" frequency, despite it appearing in the reference screenshots — that's Claude's own scheduled-tasks product, not a value CarlNotes was asked to offer.

## Decisions

- **`TimePicker` is built on the shared `Select` primitive**, the same one `Frequency`, `Visibility`, `Max results`, and the day-of-week field already use in this exact modal — not a custom `Popover` + scrollable `div`, and not a native `<input type="time">`. Two earlier attempts (a single scrolling column, then a two-column AM/PM grid) both used a hand-rolled Popover with a plain `overflow-y-auto` container; both left real scrolling broken when nested inside this modal's Dialog, discovered only once a user actually tried to reach a PM time. `Select`'s own scroll-up/down buttons and viewport management are the only approach in this codebase already proven to scroll correctly in this exact nested context, so it's the reliable choice, not just the smaller diff.
- **30-minute increments (48 options)**, matching common scheduling-UI defaults (Google Calendar, Notion) rather than 15-minute (96 options, a much longer list) or 60-minute (too coarse for "09:00 AM" precision).
- **No custom checkmark rendering** — `SelectItem`'s own built-in indicator (used by every other select in this modal) is what shows the current selection, rather than a bespoke one `TimePicker` draws itself. A user found a hand-drawn checkmark next to the pill's own already-visible value redundant.
- **Day-of-week also uses the existing `Select` primitive** — seven options is exactly what `Select` is for, and it was already the plan before `TimePicker` converged on the same primitive.
- **`scheduled_time` and `scheduled_day_of_week` always have a value**, not nullable, mirroring how `frequency` and `max_results` already work in this schema. `scheduled_day_of_week` is simply unused/unread when frequency isn't weekly, rather than being null — this avoids threading nullability through the UI and API for a field that's cheap to always default.
- **`scheduled_time` stores as Postgres `time` (naive, no timezone)**, read back with its seconds trimmed to match the "HH:MM" shape the UI and the update payload both use.

## Risks / Trade-offs

- Naive local time with no timezone will need revisiting once a scheduler exists and has to decide whose clock "09:00 AM" means — flagged as a non-goal above, not solved here.
- `frequencies` is a shared `pgEnum` also used (unused) by `subscriptions.frequency`; adding `"weekdays"` widens that column's allowed values too, harmlessly, since nothing reads it.
- The reference screenshots' "Hourly" option was deliberately not carried over — if the user actually wants it, that's a small follow-up (one more enum value, no time-of-day change needed since hourly has no single time).
