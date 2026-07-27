## 1. Schema and migration

- [x] 1.1 In `db/schema.ts`, add nullable `etag` and `lastModified` (`last_modified`) text columns to `resources`, next to the existing `fetchedAt`.
- [x] 1.2 In `db/schema.ts`, add non-null integer columns `reused`, `revalidated`, and `fetched` to `scans`, each defaulting to 0, next to the existing counts.
- [x] 1.3 Run `bun run db:generate` and confirm the migration is additive only (two `resources` columns, three `scans` columns), with no other table altered and no backfill.
- [x] 1.4 Update `db/schema.test.ts` for the new columns' presence, nullability, and defaults, matching the existing column tests' style.

## 2. Fetch reuse and conditional revalidation

- [x] 2.1 Add pure, offline-testable helpers (co-located with the fetch logic): `isContentStale(fetchedAt, now, ttlMs)` reading `CONTENT_TTL_MS` (env-overridable, default per design) and `conditionalHeaders({ etag, lastModified })` building `If-None-Match`/`If-Modified-Since` (omitting an absent validator).
- [x] 2.2 In `worker/scrape.ts`, change `fetchContent` to return `{ content, etag, lastModified }`, reading the origin validators from the Firecrawl response when exposed and null otherwise (preserve the existing throw-on-failure contract for `content`).
- [x] 2.3 In `worker/scrape.ts`, add a `revalidateContent(url, validators)` conditional GET: sends `conditionalHeaders(...)` bounded by its own short `AbortSignal.timeout` (env-overridable), and returns a `"not-modified" | "changed" | "failed"` outcome — never throwing.
- [x] 2.4 In `worker/review.ts` `fetchResourceContent`, implement the three-way decision — reuse (fresh) → revalidate (stale + validators) → Firecrawl fetch (fall-through) — storing `content`/`etag`/`last_modified` and refreshing `fetched_at` on each fetch, refreshing only `fetched_at` on a `304`, and returning the fetch outcome (`reused` | `revalidated` | `fetched`) alongside the text to score. A probe failure/timeout falls through to Firecrawl and never fails the Resource.

## 3. Paid-count cap and fetch-outcome counts

- [x] 3.1 Add `MAX_SCORED_RESOURCES_PER_SCAN` (env-overridable) and extend the review `Budget` with a paid count and `reused`/`revalidated`/`fetched` tallies.
- [x] 3.2 Replace the paid gate with `canPay(budget)` = under the USD ceiling AND paid count `< MAX_SCORED_RESOURCES_PER_SCAN`; check it once before the paid fetch-and-scoring section (leave the cheap embed/embed-filter stages ungated), keeping the existing deferred/carried behavior on trip.
- [x] 3.3 After the fetch decision, increment the matching outcome tally; treat the paid count as `reused + revalidated + fetched`.
- [x] 3.4 Thread the three counts through `ReviewSummary` and persist them to `scans.reused/revalidated/fetched` at close in `worker/scan.ts`; optionally add them to the report cost line.

## 4. Scheduled-scans sweep

- [x] 4.1 Add `worker/schedule.ts` with a pure `frequencyWindowMs(frequency)` (24h `daily`, 7d `weekly`) and a `loadScheduledTopics()` query selecting Topics with no Scan of any status whose `started_at` is within the window, so a failed Scan spends its window rather than leaving the Topic scheduled for every sweep.
- [x] 4.2 Reuse the existing daily-quota rule from one shared place (extract the per-user daily scan count/limit so both `api` and the worker read one source — no `worker`→`api` import and no duplicated rule).
- [x] 4.3 Implement `runScheduledTopicScans()`: for each scheduled Topic, skip when the owner is over quota (counted in the summary), else `await runTopicScan(topicId)` then `sendTopicScanEmail(topic, scan)`; isolate per-Topic failures; log a per-sweep summary of scheduled / scanned / over-quota.
- [x] 4.4 Add a thin `main` that runs one sweep and exits, and export `runScheduledTopicScans` from `worker/index.ts`.
- [x] 4.5 Fold each finished Scan into the summary with a pure `trackSweepOutcome`, counting a `failed`-status Scan as failed rather than scanned, since such a Scan returns normally and never reaches the caller's catch.
- [x] 4.6 Bound every proxy model call with `MODEL_TIMEOUT_MS` in `worker/models.ts`, so a stalled request aborts and fails its Scan instead of holding it `running` forever.
- [x] 4.7 Add `failStaleScans()` at the top of each sweep, marking Scans still `running` past `STALE_SCAN_MS` as `failed` with a reason.

## 5. Topic-scan email

- [x] 5.1 Extract the raw-`fetch` Resend call from `api/auth.ts` into `worker/email.ts` `sendEmail({ to, subject, content })` (log-and-swallow, never throws) and point `sendVerificationEmail` at it, so `api` imports the one helper (`api`→`worker` is already allowed).
- [x] 5.2 Add `worker/notify.ts` with `newFindingsForScan(scan)` (Findings carrying this `scan_id`, joined to `resources` for title/url/explanation) and `loadTopicSubscribers(topicId, frequency)` (direct `subscriber_user_id` users plus `subscriber_audience_id` audience members, filtered to `subscriptions.frequency`, deduped by email; returns each subscriber's user id + address for the unsubscribe token).
- [x] 5.3 Add `sendTopicScanEmail(topic, scan)`: only for a scheduled, `succeeded` Scan with ≥1 new Finding and ≥1 matched recipient; build a Topic-named subject and content listing each new Finding's title, Resource link, and relevance explanation; send to each recipient via `sendEmail`.

## 6. Runner wiring, config, and docs

- [x] 6.1 Add a `schedule` package script (`doppler run -- bun worker/schedule.ts`) for a platform cron, and a `dev:worker` loop for local runs; update the README Development section in the same change (per the package-script rule).
- [x] 6.2 Add `CONTENT_TTL_MS`, `MAX_SCORED_RESOURCES_PER_SCAN`, and the probe-timeout knob to `.env.example` with one-line comments; confirm `RESEND_*` and `FIRECRAWL_*` entries already document their use.

## 7. Tests and verification gate

- [x] 7.1 Offline unit tests (mirroring `worker/review.test.ts` style): `isContentStale` TTL predicate boundaries, `conditionalHeaders` construction from each validator combination, the `304`→reuse decision, and `canPay` halting when the paid count reaches `MAX_SCORED_RESOURCES_PER_SCAN` under the USD ceiling.
- [x] 7.2 Sweep and email unit tests: `frequencyWindowMs` and scheduled-Topic selection, over-quota skip, `loadTopicSubscribers` (frequency match, audience expansion, email dedupe), and `newFindingsForScan` selecting only this Scan's Findings.
- [x] 7.3 Run the gate — `bunx biome check .`, `bunx tsc -b`, `bun test` — and extend `worker/scan.smoke.ts` only if a live reuse/email path is worth a by-hand check.

## 8. Designed email and one-click unsubscribe

- [x] 8.1 Add react-email as the email template layer: `@react-email/components` + `@react-email/render` (runtime), `react-email` + `@react-email/ui` (dev), an `emails/` project referenced by the worker, a `dev:email` preview script, and `.react-email/` gitignored.
- [x] 8.2 Author `emails/topic-scan-email.tsx` — a designed, image-free, deliverability-safe template (coffee header, top summary, spaced Finding cards, footer) with `PreviewProps`; render it in `notify.ts` via `renderTopicScanEmail`, replacing the hand-rolled HTML string.
- [x] 8.3 Add signed unsubscribe tokens in `worker/unsubscribe.ts` (HMAC over `{ userId, topicId }`, keyed on `BETTER_AUTH_SECRET`), give `sendEmail` an optional `headers`, and have `notify.ts` send per-recipient with a `List-Unsubscribe` header + a body unsubscribe link.
- [x] 8.4 Add `api/unsubscribe.ts` (verify token, delete the direct subscription, coffee-toned confirmation and invalid pages) and public `GET`/`POST /api/unsubscribe` routes; cover the token round-trip/tamper and the pages with tests.
