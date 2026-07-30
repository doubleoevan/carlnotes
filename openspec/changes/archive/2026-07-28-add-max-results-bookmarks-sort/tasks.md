## 1. Schema and shared config

- [x] 1.1 Add `maxResultsOptions = [5, 10, 15, 20]` to `shared/enums.ts` as the one list the check, the payload validation, and the modal select all read.
- [x] 1.2 Add `topics.max_results` (integer, not null, default 10, database check against the allowed values) to `db/schema.ts` — the default doubles as the backfill for existing rows.
- [x] 1.3 Add the `bookmarks` table mirroring `consumptions`: user and finding references with cascades, created timestamp, unique per pair.
- [x] 1.4 Add nullable `resources.engagement` (integer).
- [x] 1.5 Generate the additive migration and confirm it only adds the column, the check, the table, and `engagement`. (`0020_round_scrambler.sql`, applied to the dev database.)
- [x] 1.6 Extend `db/schema.test.ts`: the max-results default and check, the bookmarks uniqueness and cascades, the nullable engagement.

## 2. Prune and engagement capture

- [x] 2.1 Add the prune at scan close in `worker/review.ts`: delete the topic's Findings that are neither in its top `max_results` by relevance score nor bookmarked by anyone, in one statement. (Also prunes on the nothing-new early return, so a lowered value still takes effect.)
- [x] 2.2 Extract the keep-set decision as a pure helper and unit-test it in `worker/review.test.ts`: under the cap keeps all, over the cap keeps the top N, bookmarked rows survive past the cap.
- [x] 2.3 Map the reddit post `score` into the emitted Resource's `engagement` in `worker/adapters/reddit.ts` — the field is already in the listing response.
- [x] 2.4 Refresh `engagement` on the resource upsert's conflict path, so a re-scan updates it. (The upsert lives in `worker/scan.ts`, not `worker/store.ts` as this task guessed — store.ts is object storage. Coalesced so a signal-less re-discovery never clears a captured value.)

## 3. API: bookmarks, view parameter, payload fields

- [x] 3.1 Add `setBookmarked` beside `setConsumed` in `api/topic/findings.ts`, guarded by `isTopicFindingVisible`, and the `POST /api/topic-findings/:id/bookmark` route beside consume.
- [x] 3.2 Keep the wire unchanged — implementation corrected the design: the provider already fetches the full payload and filters views client-side, so Bookmarked joins Unread as a client filter and no server view parameter exists. (Design decision 4 and the feed-api delta updated to match.)
- [x] 3.3 Carry `isBookmarked` (left-join like consumptions) and `engagement` on every topic finding in both batched loaders (`api/topic/feeds.ts`, `api/topic/findings.ts`) and in the `topicFinding` contract.
- [x] 3.4 Add `maxResults` to `updateTopicPayload` (validated against `maxResultsOptions`), write it in `createTopic`/`updateTopic`, and return it on `topicFeed` and `topicResponse`.

## 4. UI: filter, sort, pinned group, surfaces

- [x] 4.1 `UnreadToggle` became `FeedViewToggle` (All / Unread / Bookmarked) and the sort shipped as `FeedSortMenu`, a "Sort"-labelled popover styled like the Tag Filters control — both UI state only, per the user's design feedback during apply. Refresh, the Tags "+", and the topic page's Run now button adopted the same shared `MENU_BUTTON_CLASS` treatment. (The view later moved again on user request: `FeedViewToggle` was deleted and the All / Unread / Bookmarked views now live in the search bar's Filters menu as a radio group above a divider, with the resource-kind checks below; Bookmarked renders only with a session.)
- [x] 4.2 Partition each findings list by `isBookmarked`: the pinned group renders above the auto-kept group, each group sorted by the active mode, never interleaved (`toSortedFindingGroups`, applied in the provider and the topic page).
- [x] 4.3 Add the bookmark toggle to the finding row: a right-side icon with a tooltip, filled when bookmarked and muted when not, wired to the bookmark route.
- [x] 4.4 Both surfaces filter client-side over the shared provider's view and sort state, with the toggle and menu on each.
- [x] 4.5 Add the "Max results" row ("Carl's top {max_results}") — and since the popover and card had drifted into two implementations, the content is now one shared `TopicInfo` component with an `isCard` flag, so the row shows on the homepage popovers and the topic page alike.
- [x] 4.6 Add the "Max results" select to the edit-topic modal with the identical Carl's-top wording, defaulting to 10 for a new topic.

## 5. Docs and verification

- [x] 5.1 Sync the domain-model skill: the Bookmark noun (per-user marker, prune-exempt), the max-results prune, and engagement as a captured Resource fact.
- [x] 5.2 Run `bunx biome check . && bunx tsc -b && bun test` and fix any failures.
- [x] 5.3 Run `openspec validate add-max-results-bookmarks-sort --strict`.
