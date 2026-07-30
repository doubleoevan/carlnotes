## Why

Topics accumulate Findings without bound — every scan upserts more rows and nothing ever keeps a topic to its best N, so feeds grow stale and long. Capping the kept set creates two immediate needs: a way for a user to keep a Finding past the cutoff (bookmarks) and better ways to read what's kept (sort modes). All three touch the feed and the kept set, so they ship together.

**Reconciliation notes:** the prompt for this change says "today the curation trim keeps a fixed top 20 findings" — that is stale against this codebase. The only 20 is `MAX_TOPIC_SCAN_REPORT_FINDINGS`, a cap on the scan report's text; no Finding trim or prune exists, so `max_results` *introduces* the prune rather than replacing a constant. Second, no adapter captures an engagement signal today (reddit reads only permalink/title/selftext; youtube only snippet fields), so trending needs the minimal capture decided with the user: a nullable `resources.engagement` column filled by the reddit adapter from the listing response it already fetches, no extra API calls, youtube views deferred.

## What Changes

**1. Max results (per-topic kept-set size)**
- `topics.max_results`: integer constrained to 5, 10, 15, or 20, defaulting to 10, with a migration backfilling existing topics to 10.
- Curation gains the prune: after a scan writes its Findings, the topic keeps only its top `max_results` by relevance score; rows past the cutoff are deleted unless bookmarked.
- Surfaced in two places with identical wording: the topic info box gains a "Max results" row rendering "Carl's top {max_results}" through the shared info component, and the edit-topic modal gains a "Max results" select offering Carl's top 5 / 10 / 15 / 20 (default 10 for a new topic, stored value for an existing one).
- **BREAKING for existing data:** a topic's first scan after this ships prunes it to its top 10 — before its users have had a chance to bookmark. Accepted per the prompt; called out in design Risks.

**2. Bookmarks (keep a Finding past the cutoff)**
- New `bookmarks` table keyed by user id and finding id, unique per pair, with a created timestamp — mirroring `consumptions`; bookmark state never lives on the Finding row.
- `POST /api/topic-findings/:id/bookmark` taking `isBookmarked`, guarded by the same visibility rule as consume; every topic finding in feed payloads carries `isBookmarked`.
- A bookmarked Finding is exempt from the `max_results` prune, so it persists across later scans and appears in addition to the auto-kept top N: a topic set to top 5 with eight bookmarks shows five auto-kept plus eight pinned. Bookmark and consumed stay independent.
- Display: bookmarked Findings pin to the top of the feed as a group above the auto-kept ones; the pinned group holds its position in every sort mode. Each row gets a right-side bookmark icon with a tooltip — filled when bookmarked, muted when not — that toggles the state, and a "Bookmarked" position joins All and Unread in the feed filter bar showing only bookmarked Findings.

**3. Sort menu (read-side ranking)**
- A "Sort"-labelled menu in the feed bar, styled like the Tag Filters control, with three modes: relevant (the current default, by relevance score), newest (by resource recency), and trending (by `resources.engagement` where captured, degrading to newest where null).
- The active sort orders the pinned group among itself and the auto-kept group among itself, never interleaving them: pinned always sits above auto-kept.
- Pure read-side ranking over the kept Findings; toggle state is a UI concern and is not persisted.
- The reddit adapter maps the post score it already receives into `resources.engagement`, refreshed on re-scan.

The domain-model skill stays in sync (Bookmark noun, the max-results prune, engagement as a captured resource fact).

## Capabilities

### New Capabilities
- `finding-bookmarks`: the bookmarks table and route, the prune exemption, the pinned group, the per-row toggle, and the Bookmarked filter view.

### Modified Capabilities
- `domain-schema`: `topics.max_results` (constrained, default 10, backfilled), the `bookmarks` table, `resources.engagement`, and this change's migrations.
- `curation`: the post-scan prune to the topic's `max_results`, sparing bookmarked Findings.
- `feed-api`: topic findings carry `isBookmarked` and `engagement`; the include-consumed parameter is unchanged, since the client already filters views over the full payload.
- `feed-homepage`: the filter bar gains Bookmarked and the Sort menu; the pinned bookmark group renders above auto-kept in every mode.
- `topic-detail-page`: the info card gains the "Max results" row; the findings section carries the same filter and sort bar.
- `topic-editing`: the modal gains the "Max results" select, validated against the allowed values.
- `source-ingestion`: the reddit adapter records the post score as the Resource's engagement.

## Impact

- **DB**: `topics.max_results`, `bookmarks` table, `resources.engagement`, one additive migration with the backfill; `db/schema.ts` + tests.
- **Worker**: the prune at scan close in `worker/review.ts`; the reddit adapter and the resource upsert in `worker/store.ts` carry engagement.
- **API**: bookmark route beside consume in `api/index.ts` + `api/topic/findings.ts`; the feed view parameter and payload fields in `api/topic/feeds.ts` and contracts; `maxResults` through create/update in `api/topic/topics.ts`.
- **UI**: the filter bar (All / Unread / Bookmarked) and Sort menu on the homepage and topic page; the pinned group and bookmark control on the finding row; the shared topic info content with the Max results row; the modal select.
- **Docs/skills**: domain-model skill gains Bookmark and the engagement fact.
- **No new dependencies.**
