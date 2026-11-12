# Proposal

## Why

A wave of free signups can run up a bill that nothing stops. `apps/worker/dailySpend.ts` warns once the day's spend
passes `GLOBAL_DAILY_SPEND_ALERT_USD`, and that is all. The monthly budget cutoffs bound each user alone, so a thousand
new free accounts each inside their own budget still add up to an unbounded day. This change adds three cutoffs on the
day's free-plan spend. Past them, the least important free spending pauses first, and it starts again on its own when
the UTC day turns. Nobody's work is refused or dropped. A new Topic's first Scan is never skipped. At most it waits its
turn under a dispatch limit, because that first result is when a founder decides whether CarlNotes is worth paying for.
Spend is what passes every cutoff. Signup counts only raise an alert.

## What Changes

- **Free-plan spend.** One number: the UTC day's recorded spend billed to users on the free plan, admins left out. It
  is summed by the same query `loadSpendSince` runs today, filtered to those users. A paid user's spend never counts,
  and nothing here ever pauses or slows a paid user or an admin.
- **The podcast episodes cutoff** (65 dollars by default). Past it, a free user's repeat Podcast Episodes are skipped
  at the plan step, the way a monthly budget cutoff skips one today. A Topic's first Podcast Episode still records.
- **The scheduled scans cutoff** (100 dollars by default). Past it, a free user's scheduled Scans do not start. Their
  Topics stay scheduled, and no failed Scan is saved. Every new Topic's first Scan starts under the first Scan dispatch
  limit instead of at once. A free user's manual Scan waits under the same limit, so the button still does something.
- **The chat cutoff** (150 dollars by default). Past it, a free user's chat turns and voice requests are rejected before
  any model is called, and the chat says Carl is taking a break until midnight UTC. It is the one cutoff a user is told
  about, since a chat turn cannot wait silently. The highest cutoff bounds the most a day of free spending pauses at.
- **The first Scan dispatch limit** (5 by default). This is how many waiting Scans one sweep starts, oldest first,
  beside the existing scan dispatch limit. While the limit applies, the api writes the first Scan row as it does today
  and does not start it. The sweep then starts it with the creation trigger, so its Podcast Episode still records on the
  standard speech tier. A waiting Scan is never closed out as stale and never marked failed for a spent key. A limit of
  zero keeps every waiting Scan waiting until the limit is raised.
- **The unverified accounts switch.** It is off by default and set by hand from the admin console. While it is on, the
  first Scan dispatch limit applies to the first Scans of accounts that signed up with a password and have not verified
  their email, whatever the day's spend.
- **Derived, never stored.** Whether each cutoff is passed is computed from the free-plan spend and the settings. The
  free-plan spend is read through a one-minute Redis cache keyed by the UTC day, so the day turning clears it. Whether
  a Scan is waiting is also derived, from its row, its owner, and the settings. No status, marker, or column records
  either one. If the spend or the settings cannot be read, every cutoff counts as unpassed and the failure is reported.
  Nothing is ever paused on a guess.
- **Settings and overrides.** The three cutoffs, the first Scan dispatch limit, and the signup alert threshold each
  default from Doppler. The admin console overrides each one with no deploy or restart, the way the minimum app version
  works. Clearing an override returns that setting to its default.
- **Admin console.** A collapsible Limits section. It shows today's free-plan spend, each cutoff with its value and
  whether it is passed, the first Scan dispatch limit with how many Scans are waiting, the unverified accounts switch,
  and the override form. It is behind the existing `admin:console` gate and on the web only.
- **Signup alert.** Each sweep counts the accounts created in the past hour and, past a threshold (50 by default),
  reports through the existing threshold reporting. It pauses nothing.
- **Nothing a user feels.** No notice, warning, dialog, email, or copy is added, except the paused chat turn's own line,
  which names neither spend nor a cutoff. A waiting Scan is a running Scan row that has not been dispatched, and the
  Topic page already shows that as a Scan under way. Implementation confirms this in the browser.
- **Bug fixed along the way.** Today `startUndispatchedScans` starts a first Scan that its creator never dispatched as a
  scheduled Scan. That loses the creation trigger, so its Podcast Episode records on the flex tier. The relay will start
  a Topic's first Scan with the creation trigger.
- **Docs.** A Spend control section in the README (none exists today), a spend control settings section in the
  deployment guide, the worker and api AGENTS.md files, and new domain model rows for the nouns below.
- **Domain nouns**, added to the domain-model skill before code uses them: Free-plan Spend, Daily Spend Cutoff, First
  Scan, Waiting Scan, First Scan Dispatch Limit, and the Spend Control Settings row.

## Capabilities

### New Capabilities

- `daily-spend-cutoffs`: the free-plan spend, the three daily spend cutoffs and what each pauses, how the cutoff state
  is derived and cached, the first Scan exemption, the first Scan dispatch limit and the Waiting Scans it starts, the
  unverified accounts switch, a free user's manual Scan past the scheduled scans cutoff, the settings with their
  defaults and overrides, and the rule that a user sees nothing.

### Modified Capabilities

- `scheduled-scans`: the relay of never-dispatched Scans leaves Waiting Scans to the first Scan dispatch limit and
  starts a Topic's first Scan with the creation trigger. Topic creation leaves the first Scan waiting while the limit
  applies. The sweep reports an hour of signups past the threshold.
- `admin-console`: the console shows the day's free-plan spend, the cutoffs, the first Scan dispatch limit with its
  waiting count, and the unverified accounts switch, and saves and clears the overrides.

## Impact

- **Worker:** `apps/worker/schedule.ts` (the sweep reads the cutoff state once, pauses free owners' scheduled Topics,
  and skips Topics whose Scan is waiting), `apps/worker/scanQueue.ts` (the relay splits Waiting Scans from the rest),
  and `apps/worker/dailySpend.ts` (the signup alert).
- **Api:** `apps/api/topic/saveHelpers.ts` (`startFirstScan` leaves the row waiting), `apps/api/topic/scans.ts` (a
  manual Scan past the cutoff waits, and one asked for while the Topic's first Scan waits returns running),
  the chat pause in `apps/api/chat/chatTurnAuthorization.ts`, `voiceAuthorization.ts`, and `room.ts`,
  `apps/api/admin.ts`, `apps/api/adminConsole.ts`, and a new spend control settings module beside
  `apps/api/mobileMinimumVersions.ts`.
- **Packages:** a new `packages/db/dailySpendCutoffs.ts` beside `monthlyBudgetCutoffs.ts`. `loadSpendSince` gains a
  free-plan filter. A new `spend_control_settings` table and its migration.
  `packages/pipeline/podcast/planPodcastEpisode.ts` gains the podcast episodes cutoff. `packages/contracts/admin.ts` and
  `payloads.ts` get the console types and the save payload.
- **Web:** `apps/web/src/pages/AdminPage.tsx` and a new `apps/web/src/components/admin/DailySpendCutoffsCard.tsx` with
  its story.
- **Settings:** new Doppler settings `PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD`,
  `SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD`, `CHAT_DAILY_SPEND_CUTOFF_USD`, `FIRST_SCAN_DISPATCH_LIMIT`, and
  `HOURLY_SIGNUP_ALERT_COUNT`, each with a default, so a deploy without them behaves as described.
- **Mobile:** the chat routes the mobile app reaches add the `chat paused` 429, and the client parity lists
  `billingClient.sendSpendControlSettings` as web-only.
- **Out of scope:** Topic images, Topic Post Discussions, films, and Personal sources summaries never pause on a daily
  spend cutoff. They stay under the monthly budget cutoffs alone.
