# Design

## Approved decisions

These six answers shape the specs and the tasks. Each one is argued under Decisions below. The user approved all six as
recommended on 2026-11-10.

| # | Question | Decision |
|---|---|---|
| 1 | Identifiers | The names in D1, with six domain model rows added first |
| 2 | Who counts as free | The free plan with admins left out |
| 3 | A free user's manual Scan past the scheduled scans cutoff | It waits under the first Scan dispatch limit and responds as started. A manual Scan asked for while the Topic's first Scan waits responds as running and leaves that row alone |
| 4 | Which Podcast Episode is a Topic's first | The Topic has no published or removed Podcast Episode yet. A failed one does not count |
| 5 | What a dispatch limit of zero holds | Every Waiting Scan, in both cases. One limit with one meaning |
| 6 | Where the overrides live and how the cache clears | One row in a new `spend_control_settings` table with a nullable column per setting. Saving deletes two Redis keys |

## Context

See proposal.md for the motivation. The code this design builds on:

- `loadSpendSince` in `packages/db/quotas.ts` runs seven aggregate queries, one per spend table, either for one user or
  for every user. `apps/worker/dailySpend.ts` calls it for every user once per sweep.
- `packages/db/monthlyBudgetCutoffs.ts` holds the per-user monthly cutoffs, and their kinds live in
  `packages/contracts/plans.ts`.
- The sweep (`apps/worker/schedule.ts`) runs these steps in order: `startUndispatchedScans`, `failStaleScans`, the
  Source screens, the queue report, then `startScheduledTopicScans` over the scheduled Topics, with each owner's limits
  read in `scheduledTopicLimits.ts`.
- A new Topic's first Scan row is written inside the create transaction. After the response, `startFirstScan` reads the
  key budget, the monthly budget, and the manual scans cutoff. It waits for the url Source screens, then calls
  `scanTopic(..., "creation", true)`.
- A Scan row that is running and has no `dispatched_at` is what `startTopicScan` takes and what `startUndispatchedScans`
  relays. The relay starts every row as `manual` or `scheduled`, so a first Scan it relays loses its creation trigger.
  The trigger decides the speech tier in `recordPodcastEpisode.ts`: scheduled records on flex, anything else on
  standard.
- `failStaleScans` closes out dispatched Scans only. An undispatched row is never closed out, which is already what a
  Waiting Scan needs.
- A Topic is scheduled while it has no completed Scan in its frequency window. A Topic whose only Scan is a running,
  undispatched row is therefore scheduled, and the scheduled loop would take that row as a scheduled Scan.
- The minimum app version is one row per platform behind `cacheJson`, a one-minute Redis read. Saving it deletes the
  key. A failed read returns a sentinel object that `isStorable` keeps out of the cache.
- `users.plan` and `users.role` are on the user row and are what `loadUserAccess` reads. `users.email_verified` is
  Better Auth's flag. A password signup has an `accounts` row with `provider_id = 'credential'`.
- A manual scan overage needs a monthly Stripe subscription, so a free user never bills one.

## Goals / Non-Goals

**Goals:**

- A sweep reads the cutoff state once and passes it to each step that needs it.
- A request that does not involve a free user reads nothing new. A free user's request reads the cutoff state from Redis
  on a cache hit and adds no database query.
- Whether a Scan is waiting is a SQL filter over rows that already exist, shared by the relay, the scheduled loop, and
  the console's count.

**Non-Goals:**

- No per-user daily limit. The monthly budget cutoffs already bound each user.
- No new Scan status, column, or marker. A Waiting Scan stays an ordinary running, undispatched row.
- No change to `GLOBAL_DAILY_SPEND_ALERT_USD` or the `daily-spend` gauge line.
- No mobile admin screen.

## Decisions

### D1. Identifiers, cleared against the domain-model skill

These six rows go into the domain-model table before any code uses the nouns:

| Noun | Identifiers | Notes |
|---|---|---|
| Free-plan Spend | `loadFreePlanSpendCents`, `freePlanSpendCents` | the UTC day's spend billing non-admin free users |
| Daily Spend Cutoff | `DailySpendCutoffKind = "podcastEpisodes" \| "scheduledScans" \| "chat"`, `DailySpendCutoffState`, `packages/db/dailySpendCutoffs.ts`, `loadDailySpendCutoffState`, `isDailySpendCutoffPassed` | sits with the monthly budget cutoffs. `podcastEpisodes` reuses the monthly kind's word on purpose, since both stop the same spending |
| First Scan | `toFirstScanFilter`, `isFirstScanWaiting` | a Topic's earliest Scan row, written with the Topic. Derived, never stored |
| First Scan Dispatch Limit | `FIRST_SCAN_DISPATCH_LIMIT`, `firstScanDispatchLimit` | sits with `SCAN_DISPATCH_LIMIT` in `apps/worker/scanQueue.ts` |
| Waiting Scan | `toWaitingScanFilter`, `waitingScanTopicIds`, `waitingScanCount`, `skippedWaitingScan` | a running, undispatched row that the first Scan dispatch limit applies to. "Held" is a rejected prefix, so the word is waiting |
| Spend Control Settings | `spend_control_settings`, `SpendControlSettings`, `apps/api/spendControlSettings.ts`, `spendControlSettingsPayload`, `POST /admin/spend-control-settings` | the one row of admin overrides, plumbing beside `mobile_minimum_versions` |

The remaining names:

- **Settings.** The unverified accounts switch is `isUnverifiedFirstScanLimitOn`, stored as
  `is_unverified_first_scan_limit_on`. The signup alert is the `hourly-signups` threshold condition, its default comes
  from `HOURLY_SIGNUP_ALERT_COUNT`, and its column is `hourly_signup_alert_count`.
- **Doppler.** The cutoff defaults are `PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD`,
  `SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD`, and `CHAT_DAILY_SPEND_CUTOFF_USD`.
- **Sweep summary.** The new counts are `skippedOverDailySpendCutoff` and `skippedWaitingScan`.
### D2. Free means the free plan with admins left out

The free-plan spend sums the rows whose billed user has `plan = 'free'` and whose role is not admin, using the
`isAdminRole` rule in SQL. An admin's `plan` column is `free`, but the codebase treats an admin as unlimited everywhere
else: `scansRemainingToday`, `hasFullPodcastEpisodes`, and the monthly budget cutoffs all give an admin no limit. If
admins counted, a day of admin smoke tests and backfills could pass a cutoff and pause real free users. It would also
mean pausing an admin's own scheduled Scans. The same predicate decides who a cutoff touches.

The plan alone was the alternative. It is simpler by one condition, and it lets admin test spend trigger real pauses.

### D3. A free user's manual Scan past the scheduled scans cutoff waits

`runManualScan` keeps every existing check: the gate, the daily quota, the monthly budget cutoff, and the key budget.
Then it checks two things:

1. **The Topic's first Scan is waiting.** The response is `running` and the row is not touched. The first Scan the user
   is waiting on is the Scan they asked for. Without this check, "Run now" would take the waiting row through
   `startTopicScan` and jump the queue. That would matter most for the unverified accounts switch.
2. **The billed user is free, not an admin, and the scheduled scans cutoff is passed.** The route opens the row the way
   `startTopicScan` does today, taking an open undispatched row if one exists, with `is_manual = true`. It starts no
   workflow and responds `started` with the remaining scans. The row is now a Waiting Scan, and a sweep starts it with
   the manual trigger.

Rejecting the Scan was the alternative. It means a button that does nothing, or copy, which the brief rules out. A
waiting manual Scan counts against the day's quota when it is opened, as any manual Scan does. The relay re-stamps
`started_at` when it starts the row.

### D4. A Topic's first Podcast Episode is its first published one

The podcast episodes cutoff skips a new Podcast Episode only if its Topic already has a Podcast Episode whose status is
`published` or `removed`. A removed Podcast Episode was published once, and its cost and number still stand. So:

- If the first Scan kept nothing and recorded nothing, the Topic's next successful Scan records its first Podcast
  Episode.
- If the first Podcast Episode failed, the next one still records.

Tying the exemption to the first Scan's own Podcast Episode was the alternative. A Topic whose first Scan found nothing
would then never get its first Podcast Episode until the next day, and the first result is the point of the exemption.
The check is one `exists` on the Topic's Podcast Episodes with a status of `published` or `removed`, served by
`episodes_topic_published_idx`, since only a published Podcast Episode has a publish time. Implementation confirms that
removing one keeps its publish time, and filters on the status alone if it does not. It is read only for a free billed
user past the cutoff.

### D5. A limit of zero keeps every Waiting Scan waiting

The first Scan dispatch limit is one number with one meaning: how many Waiting Scans a sweep starts. At zero it starts
none, whichever case made each Scan a Waiting Scan. The admin console shows the waiting count beside the limit, so a
zero is visible and deliberate.

The alternative was to make zero hold only the unverified accounts' first Scans while everyone else kept the default.
That gives one setting two meanings depending on the day's spend. It would also need a second limit to express "hold
everyone", which is exactly what an admin facing a runaway day wants.

### D6. One settings row and two cache keys

**The table.** `spend_control_settings` has one row, with `id integer primary key default 1 check (id = 1)`. Each
override is its own nullable typed column, and null means the Doppler default:

- `podcast_episodes_cutoff_cents integer`
- `scheduled_scans_cutoff_cents integer`
- `chat_cutoff_cents integer`, added by its own migration after the table's first
- `first_scan_dispatch_limit integer`
- `hourly_signup_alert_count integer`
- `is_unverified_first_scan_limit_on boolean not null default false`
- `updated_at`, and `updated_by_user_id` with on delete set null

A row per setting keyed by name, like `mobile_minimum_versions`, was the alternative. It would store a boolean and
dollar amounts in one value column. Typed columns keep each override's type in the schema, and one row reads in one
query.

**The cache keys.**

- `spend-control-settings`, for 60 seconds, holds the row merged onto the Doppler defaults.
- `free-plan-spend:<YYYY-MM-DD>`, for 60 seconds, holds `{ freePlanSpendCents }` for that UTC day. The day is in the
  key, so the day turning starts a fresh key and the old one expires on its own. The TTL is also clamped to the time
  left in the day.

**Saving.** `POST /admin/spend-control-settings` upserts the row and then calls `deleteRedisKeys` on both keys, the way
`saveMobileMinimumVersion` drops its own key. Every replica reads the new values on its next read. Whether a cutoff is
passed is computed on read from the two cached values and never cached itself.

**A failed read.** Each loader returns its own sentinel object on a database error and reports the error. `isStorable`
keeps a sentinel out of Redis, so the next read tries again. A sentinel for either value makes every cutoff unpassed and
the unverified switch off. The first Scan dispatch limit then applies to nothing, and nothing is paused on a guess. The
sweep reads once per run, so a failure is reported once per sweep, not once per Topic.

### D7. Waiting is a SQL filter over existing rows

`toWaitingScanFilter(cutoffState)` in `packages/db/dailySpendCutoffs.ts` matches a row that has all of these:

- `status = 'running'`, `dispatched_at is null`, and `topic_id is not null`
- an owner who is free and not an admin, joined on `users`
- one of the following:
  - the scheduled scans cutoff is passed and the row is a First Scan or `is_manual`
  - the switch is on, the row is a First Scan, the owner has `email_verified = false`, and the owner has a
    `credential` account

`toFirstScanFilter` is `not exists` an earlier Scan of the same Topic, ordered by `started_at` and then `id`. It is
served by `scans_topic_started_idx`.

A stored marker, such as an `is_first_scan` column or a `trigger` column, was the alternative. The derived filter needs
no migration on `scans`, follows the brief's derive-don't-store rule, and changes on its own when the day turns or a
setting changes. Rows that stop waiting become ordinary undispatched rows, and the relay starts them on the next sweep.

### D8. The sweep reads the cutoff state first and passes it down

The sweep's new order:

1. `loadDailySpendCutoffState()`, once.
2. The queue report sizes the sweep's dispatch first. `startUndispatchedScans({ cutoffState, dispatchableScanCount })`
   splits the undispatched rows with the filter. Rows that are not waiting are relayed oldest first up to the
   dispatchable count, and the rest wait for the next sweep with their Topics counted as waiting. They start with the
   trigger fixed: `manual` if `is_manual`, `creation` for a First Scan, otherwise `scheduled`. Waiting rows are started
   oldest first by `started_at`, up to `firstScanDispatchLimit`, with their trigger and no key budget read. The api
   already read the key budget before leaving the row waiting. The step returns the Topic ids still waiting.
3. `failStaleScans` and the screens, as today.
4. `startScheduledTopicScans` gets `waitingScanTopicIds` and `dailySpendCutoffOwnerIds`. The second set holds the free,
   non-admin owners among the scheduled Topics, read in one query, and only if the scheduled scans cutoff is passed.
   - A Topic whose Scan is still waiting counts as `skippedWaitingScan`.
   - A Topic of an owner in the cutoff set counts as `skippedOverDailySpendCutoff`.
   - Both checks come before the quota read, so a paused Topic costs no query. Neither writes a row.
5. The signup alert runs with the day's spend report.

Waiting starts do not count against `SCAN_DISPATCH_LIMIT`. The orphan relay has its own allowance of the same size,
which keeps a day's worth of rows that stop waiting at midnight, or after an unavailable cutoff state, from starting in one
sweep.

### D9. The free-plan spend reuses the spend query

`loadSpendSince` gains `billedPlan?: "free"`. When it is set, each of the seven aggregates inner joins `users` on its
billed user column with `plan = 'free'` and a role that is not admin. `loadFreePlanSpendCents` calls it with the day's
start, and `toSpendCents` turns the result into cents.

A separate query was the alternative. It would be an eighth copy of the table list, and it would drift the next time a
spend table is added. The join reads each user's current plan, which D2's risk note covers.

### D10. Where the api reads the cutoffs

- **`startFirstScan`.** After `loadFirstScanFailureReason`, it calls `isFirstScanWaiting(ownerId)`. That reads
  `loadUserAccess` first, which the create request already memoized. Only for a free, non-admin owner does it go on to
  the cutoff state and, if the switch is on, the unverified check, which is one query for `email_verified` and the
  credential account. If the first Scan waits, it calls `screenPendingSources(topicId)` and returns without starting.
  This runs after the response, so the create route's in-request query count does not change.
- **`runManualScan`.** It reads the waiting first Scan check, which is one query by Topic over the same filter. It reads
  the cutoff state only for a free, non-admin billed user, once per request through the request memo. On a cache hit
  that adds no database query. On a miss it adds the settings row and the seven spend aggregates, at most once a minute
  across every replica, and concurrent misses in one process share one load. A waiting manual row opens under a
  transaction-scoped advisory lock on the Topic, so two requests at once open one row.
- **The chat room.** A Carl-addressed chat room message from a free user past the chat cutoff is rejected privately
  before the budget reservation, as a spent budget is, and nothing posts.
- **The query budget.** `apps/api/queryBudgets.test.ts` gains tests for the manual scan route as a paid user, as a free
  user on a cache hit, and on a cache miss, and for the topic create route.

### D11. The signup alert sits in `dailySpend.ts`

`reportDailySpend` already counts the day's signups. It gains a count of accounts created in the past hour and a
`hourly-signups` crossing at or above the threshold, which is the override or `HOURLY_SIGNUP_ALERT_COUNT`, 50 by
default. A failed count is reported and the sweep goes on.

`reportThresholdCrossing` stays quiet for an hour within one process. The cron sweep exits after each run, so repeated
crossings reach Sentry as one grouped issue by the condition's fingerprint, and the alert rule fires once per issue.

### D12. The console reads fresh, and validates on save

`GET /admin/console` adds `dailySpendCutoffs: AdminDailySpendCutoffs`. It holds the free-plan spend in cents, each
cutoff with its amount, its default, whether it is overridden, and whether it is passed, the dispatch limit with the
same fields and `waitingScanCount` from `toWaitingScanFilter`, the signup alert threshold with `hourlySignupCount` from
`countHourlySignups`, the count the signup alert checks, and the switch. These are read straight from the database, not
through the cache, so the console never lags its own save. The card draws the spend, the waiting count, and the signup
count on the account page's meter pieces, `MeterBar`, `MeterMarker`, and `MeterCutoffList`, which `SpendMeter` renders
too. The estimated monthly spend's table limits each rate's month to the highest typed cutoff for each day left, since
past that cutoff every kind of spend a cutoff pauses has stopped, and shows the month without cutoffs beside it and the
most this month under it. A second table under it shows, for each cutoff as typed, how long after midnight UTC an even
day of each rate's spend per day passes it, and a slider for each cutoff follows its field, so an admin sets the cutoffs
against that table before saving them together from a Save daily cutoffs button, beside a Reset to the saved values and
a Defaults that empties every cutoff, while the meter's circles follow the typed cutoffs. Every other setting saves when
its field loses focus, like the budget override, and sends the saved cutoffs, so a typed cutoff waits for its own Save.

`spendControlSettingsPayload` takes each override as a number or null, and the switch as a boolean:

- cutoffs in dollars above zero, stored as cents
- the dispatch limit as an integer of zero or more
- the threshold as an integer of one or more

A Doppler value that is unset, empty, or invalid reads as the built-in default, following `toPositiveCents`,
`toWholeNumber`, and `toPositiveInteger`. Zero is invalid for a cutoff and the threshold, and valid for the dispatch
limit. A cutoff has no off value. To stop pausing for a day, raise the cutoff.

**The card.** `DailySpendCutoffsCard` is built from Card, Label, Input, Switch, and Button, the way
`MobileMinimumVersionsCard` is, with a story beside it. A ring at its top center shows the time left until midnight UTC,
when the cutoffs reset, read from `useNow` each minute. The first scan dispatch limit is labeled "First scan limit"
there. The unverified accounts switch shows inverted as "Allow unverified email sign-ups to scan" and is on while the
switch is off. The admin console names the section Limits. The admin console is web only, so it needs no mobile parity
row.

## Risks / Trade-offs

- **Waiting Scans start in a burst when the day turns.** Every Waiting Scan becomes an ordinary undispatched row at
  midnight UTC, and the relay starts them oldest first, up to its dispatch allowance each sweep. → Their spend lands on
  the new day, so the new day's cutoffs bound what follows. This is the brief's "everything paused starts again".
- **The plan is read now, not when the spend happened.** A user who upgrades mid-day takes their earlier spend out of
  the free-plan spend, and a cutoff can come unpassed. → This errs toward not pausing, and the brief rules out guessing.
- **The cutoffs are soft by up to a minute plus in-flight work.** Scans already running when a cutoff passes finish, and
  the cache can lag a minute. → Each cutoff is a daily soft bound, not a hard limit. The monthly budget cutoffs and the
  key budgets remain the hard per-user limits.
- **A Waiting first Scan can start before a url Source finishes screening.** The api no longer waits for the screens. →
  A Scan already skips a url Source that has not screened clean. Screens take seconds, and a sweep comes minutes later.
- **The First Scan derivation depends on the earliest row surviving.** A failed first Scan is the earliest row, so a
  later Scan of that Topic is correctly not a First Scan. A Topic whose rows were all deleted would make its next row a
  First Scan. → No path deletes an existing first Scan row: `scanTopic` keeps a row it did not open.
- **The free-plan spend sum is seven joined aggregates over the day's rows.** → It runs at most once a minute per key
  across replicas, plus once per console open. The joins use the spend tables' existing user and time indexes.

## Migration Plan

1. One Drizzle migration creates `spend_control_settings`. An empty table means every setting reads its default, so no
   seed row is needed.
2. Deploy the usual way: the migration runs before the app. The new Doppler settings are optional because every one has
   a built-in default. Set them in `prd` only to move a default.
3. Rollback: revert the app. The table is unread without the code and harmless to leave.
4. The dev database is shared across worktrees. If a parallel worktree's migration has a newer `when`, apply this one's
   SQL by hand in dev and regenerate the migration at ship time.
