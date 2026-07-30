## Context

No Finding trim exists — the prompt's "top 20 trim" is `MAX_TOPIC_SCAN_REPORT_FINDINGS = 20`, which only caps the scan report's text. Findings are upserted per `(topic, resource)` and accumulate forever; feeds and the topic page render every row. Consumed state is the model to copy: a per-user `consumptions` table, a route guarded by `isTopicFindingVisible`, an `isConsumed` flag on every payload finding, and a server-side include-consumed parameter on the homepage feed (the topic page filters client-side over its full payload).

No adapter captures engagement. The reddit adapter's listing type reads only `permalink`/`title`/`selftext` — the score is in the same response, just unmapped. Resolved with the user: **minimal capture** — a nullable `resources.engagement` filled by the reddit adapter, no extra API calls, youtube views deferred (they need a second `videos.list` request).

## Goals / Non-Goals

**Goals:**
- A per-topic kept-set size (`topics.max_results` ∈ {5, 10, 15, 20}, default 10) enforced by a real prune at scan close.
- Bookmarks: per-user, prune-exempt, pinned above the feed, toggleable per row, with a Bookmarked filter view.
- Three read-side sort modes (relevant / newest / trending) with the pinned group always on top.
- One additive migration; the reddit score captured with zero new API calls.

**Non-Goals:**
- Youtube view counts or any adapter needing extra requests — later change.
- Persisting sort or filter choices — UI state only.
- Retroactive pruning on edit — a lowered `max_results` waits for the next scan.
- Any new LLM scoring; trending is ranking over already-stored numbers.

## Decisions

### 1. The prune is one delete at scan close, and bookmarks are exempt by existence
After curation writes its Findings, one delete removes the topic's Findings that are neither in the top `max_results` by relevance score nor bookmarked by anyone (`NOT EXISTS` against `bookmarks`). Deleting a Finding cascades its `consumptions` rows — acceptable, the Finding is gone; bookmarked Findings are never deleted, so bookmarks never cascade away. `ponytail:` a bookmark placed while a scan is mid-prune can miss the exemption window; the next bookmark attempt re-pins and the window is seconds wide.

### 2. The kept set is real rows, not a display cap
Feeds and the topic page keep rendering every stored Finding — after the prune that is the auto-kept top N plus bookmarked extras. No display-side slicing, so counts, filters, and search stay truthful.

### 3. Backfill is the column default
Postgres fills existing rows when adding a NOT NULL column with a default, so `max_results integer NOT NULL DEFAULT 10` **is** the backfill — no separate UPDATE. The allowed values are one shared list (`maxResultsOptions` in `shared/enums.ts`) read by the database check, the zod payload validation, and the modal select, so the set can never drift.

### 4. Bookmarked is client-side everywhere, like Unread already is
Implementation corrected a design premise: the homepage provider always fetches with include-consumed and filters client-side — that is why All/Unread switches instantly. So the full payload is already present on both surfaces, and Bookmarked is the same kind of client-side filter over `isBookmarked`. The wire's include-consumed parameter is unchanged and no server view parameter is added.

### 5. Sorting is client-side over the delivered payload
Every kept Finding already ships with the payload; the payload gains `engagement` (from `resources`) and `isBookmarked`, so all three sorts are pure client work: partition by `isBookmarked`, sort each group by the active mode (relevant = relevance score; newest = published/fetched recency; trending = engagement descending with nulls falling back to recency), concatenate pinned first. Nothing is persisted.

### 6. Bookmarks copy consumptions exactly
Table (`user_id`, `finding_id`, unique pair, created timestamp, both cascades), a `setBookmarked` beside `setConsumed` guarded by the same `isTopicFindingVisible`, a route beside consume, and a left-join flag in both batched loaders — the same pattern in every layer, so nothing new has to be learned to read it.

### 7. UI controls, shaped by the user's design feedback during apply
`UnreadToggle` (All/Unread) became `FeedViewToggle` with a Bookmarked position, and the sort is `FeedSortMenu` — a "Sort"-labelled popover styled like the Tag Filters control, centered in the bar. Each finding row carries a right-side bookmark icon with a tooltip, filled when bookmarked and muted when not, that toggles the state. Refresh and the Tags "+" adopted the same bordered treatment, shared as one `MENU_BUTTON_CLASS` so the three controls cannot drift. Both bars render on the homepage and the topic page.

### 8. The topic info content is one shared component
The homepage popovers and the topic-page card had drifted into two near-identical implementations (including a byte-identical attachment pill). They now share `TopicInfo` with an `isCard` flag — the Attribution pattern — so the Max results row, and any future row, appears on both surfaces by construction. The card keeps its extras behind the flag: read-more notes, source summaries, and the visibility row.

### 8. Engagement refreshes on re-scan
The reddit adapter maps `score` from the listing it already fetches; the resource upsert updates `engagement` on conflict so a re-scan refreshes staleness. A Resource is global, so its engagement is one fact shared by every topic that kept it.

## Risks / Trade-offs

- **[Data loss by design] A topic's first scan after ship prunes it to its top 10** — existing topics may hold far more, and users have had no chance to bookmark. Accepted per the prompt; the bookmark feature ships in the same release, and anything pruned can resurface in a later scan if sources still carry it.
- **[Freshness] Engagement is only as fresh as the last scan that saw the post** → accepted; trending is a rough signal, not analytics.
- **[Sparse signal] Only reddit carries engagement at first** → trending visibly degrades to newest for other sources; the spec says so, and later adapters can join by filling the same column.

## Migration Plan

One additive Drizzle migration: `topics.max_results` (default 10, check constraint), `bookmarks`, `resources.engagement`. Ship order inside the change: schema → prune + adapter capture → api (route, view param, payload fields) → ui. Rollback is dropping the routes/UI; the schema additions are inert without the prune.

## Open Questions

- None — the one fork (trending's missing signal) was resolved with the user: minimal reddit capture now, youtube later.
