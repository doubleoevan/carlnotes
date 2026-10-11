## Context

Every resource a scan keeps has a 1024-wide embedding in `resources.embedding`, saved with `embedding_model`, and the
global duplicate check ranks through `resources_embedding_hnsw`. A public topic page ends with `loadMoreTopics`, five
plain links ordered by holding team, shared tags, and newest finding. A podcast episode page links only its own topic.
The search bar searches topic names, team names, and usernames on the server and filters the loaded feed's findings in
the browser. A topic table's name cell is `TopicNameLink`, a link with `LatestPodcastEpisodePlayButton` beside it, fed
by `loadLatestPodcastEpisodes`, which reads every topic's newest published episode in one `DISTINCT ON` query and then
their chapters and listens in one query each. Paged lists render through `toRenderedRows`: the shown page plus the
first fifty rows, with the rows off the page hidden once JavaScript runs.

pgvector 0.8.1 is installed in dev and prd, so iterative index scans are available. Neon's connection pooler runs in
transaction mode, so a session setting only holds inside a transaction. Prd has 43 topics, 103 published episodes, and
65,282 embedded resources. `bun test` runs offline against the connection pool and Redis stubs, so a plan check is a
smoke.

## Goals / Non-Goals

**Goals:**

- Rank related topics and episodes from stored embeddings, with no model call on a page render.
- Render the three tables on the server, inside the pages' existing parallel reads and edge cache.
- Find podcast episodes from the search bar by title, description, and meaning, never failing on a spent key.
- Keep every new read bounded and free of vectors and descriptions it does not show, and every ranking over a whole
  table index-backed.

**Non-Goals:**

- A search results page, and related findings.
- Ranking related rows by teams or recency. Their vectors and their topics' tags rank them.

## Decisions

### Vectors live in their own tables

`topic_vectors` (`topic_id` primary key, cascading on the topic) and `episode_vectors` (`episode_id` primary key,
cascading on the episode, with `topic_id`, cascading on the topic) each hold `embedding vector(1024)`,
`embedding_model`, `updated_at`, and a public and shown flag, with a partial HNSW `vector_cosine_ops` index over the
flagged rows, and `episode_vectors` also a full one named like `resources_embedding_hnsw`.
Both live in `db/schema/vectors.ts`, which reads `EMBED_DIMENSIONS` while it defines its columns. `topics.ts` and
`scans.ts` import each other, so a vector column in either could read that constant before it is set.
Many routes read whole `topics` and `episodes` rows, and a 4 KB vector on each of those reads would slow pages that
never use it. The episode vector keeps its topic id because episodes never change topics: the related episodes read
filters out the page's own topic on the vector row, and a topic delete, which keeps its episode rows, cascades their
vectors away with no worker code.

Alternative: a `vector` column on `topics` and `episodes`. Rejected by the row-width cost above.

### The means are computed in SQL, and an empty mean deletes the row

`worker/meanVectors.ts` holds the writes. `saveTopicVectors(topicId)` runs one upsert, `insert into topic_vectors select
topic_id, avg(resources.embedding), <model>, now(), <public and shown> from findings join resources join topics ...
where topic_id = $1 and rating is distinct from 'down' and embedding_model = <model> group by topic_id on conflict do
update`, and deletes the topic's row if the select found nothing. `savePodcastEpisodeVector` does the same over
`episode_chapters`. pgvector's `avg` returns a vector that is not unit length, which cosine distance ignores. "Kept
findings" follows `toTopicTableRows`'s kept count, which leaves out rated-down findings through `isFindingShown`, so a
finding a user marked off topic does not pull the topic's meaning toward it.

Every topic with an embedded kept finding keeps a vector, since a signed-in user's related topics include the private
and invite topics they may open, and a private topic's page lists related topics to its own users. The vector saves
`is_public_and_shown`, the topic's `isPublicAndShown`, now in `db/index.ts` so the worker and the api apply one rule. A
partial HNSW index, `topic_vectors_public_and_shown_embedding_hnsw`, covers the flagged vectors, so the shared ranking
never walks past private topics, which are the default and will outnumber public ones. No read needs an index over every
topic vector, so the table has none. Every scan end writes the topic's vectors: `finishScan` whatever the scan's status,
`stopScan`, since a stopped scan keeps the findings it has, and `failScan`, since a stage that threw may have written
some. Each catches and reports a failed write so a derived vector never fails a scan, and the next scan writes it again.
Both visibility writes, the editor's save and the topic tools' field update, call `saveTopicVectorsOnVisibilityChange`,
which writes the vectors again if the visibility changed, so a topic's flags follow its visibility at once. `setRating`,
the one write of a finding's rating for the topic page and the mcp tool, writes the topic's vectors again too, since a
finding rated down leaves the mean and the shown count. That is one average over the topic's kept findings, a few
milliseconds, and ratings are rare, and a failed write is reported and never fails the rating. A chapter's own rating is
a different column that no vector reads. The episode's vector is written inside `savePodcastEpisodeAsPublished`'s
transaction, after its chapters are inserted, so a published episode always has one. `markPodcastEpisodesRemoved`
deletes the vectors of the episodes it marks, which covers a removal by hand and a short episode's replacement, both of
which run through it.

An episode vector also saves `is_topic_public_and_shown`, its topic's `isPublicAndShown` at publish, and
`saveTopicVectors` writes it again on the topic's episode vectors whose flag differs, at the same moments the topic's
own vector is written. A partial HNSW index, `episode_vectors_public_and_shown_embedding_hnsw`, covers the flagged
vectors, and the public related episodes read and a visitor's meaning match rank through it, so neither walks past the
episodes of private, invite, and not yet shown topics. Every vector stays for a signed-in user's meaning match, which
ranks through the full index. The flag only narrows a read: every read still checks the topic itself, so a flag a
failed write left out of date can hide an episode until the next scan, and never shows one that may not be shown.

### A related row is near once the model's common direction is taken out, nearer for shared tags, and within a limit

Plain cosine distance between mean vectors listed everything. Every embedding the model makes shares a large common
direction, and a topic whose findings range widely, like a family news topic, sat near every other topic. A page
listed every other topic in some order, and on production's 25 listed topics a literary agents topic's nearest was
that family topic at 0.42, nearer than its real neighbor, a writing prompts topic, at 0.51.

`api/topic/relatedness.ts` scores a candidate by the cosine distance between its vector and the page's after
subtracting the centroid, the average of up to 20,000 current-model resource embeddings, cached in Redis for a day
under `embedding-centroid:<model>`. Then 0.1 comes off for each tag the two topics share, counting two at most, with
tags compared lowercased and with everything but letters and digits left out, so "AI & Engineering" matches
"ai-engineering". A related topic and a related episode each keep a score within their own limit, 0.75 for both. On
production, measured read-only, 23 of 25 topics and 66 of 70 episodes list at least one at these limits. The topics
that belong together scored up to about 0.74, such as the two restaurant topics at 0.25 and the basketball pair at
0.74, while an ankle surgery topic had nothing within 0.85. Topics at 0.8 would add one more listed topic and mostly
loose pairs, like a hip-hop topic and a podcast topic, so their limit stays at 0.75. Episodes at 0.7 listed only 55 of
70, and the episodes 0.75 adds are mostly real pairs, like the poet's episodes and the writing prompts. The resource
centroid is one stable vector for both tables, unlike a centroid of the topic vectors, which swings with a few topics.

A ranking takes the 200 nearest candidates by plain cosine distance through the HNSW index, in a CTE, and scores
those. The centered distance has no index, and the plain order already holds the centered neighbors among its first
200 at any size the app will see soon. Tags are a nudge on the vectors: few topics have tags yet, and a shared tag
alone never lists a topic far from the page. The UI calls the tables Similar topics and Similar podcasts. The code
keeps "related".

### A signed-in user's related rows follow the view rules, ranked for that user alone

A user should learn about a topic their team added, so the related tables list what the user may already open, never
less and never more. Each table merges two reads by score. The public read ranks the public shown topics or episodes
once per page and caches the result in Redis for everyone, as below. For a signed-in user, a second read scores the
topics or episodes they reach through their account. `toAccessibleRelatedTopicScoresQuery` covers a topic they own, a
topic a team of theirs owns or holds, and an invite topic that names their verified email or that they subscribe to.
`toAccessibleRelatedPodcastEpisodeScoresQuery` covers the published episodes of a topic they have a role on, and an
invite topic's episodes published after their subscription activated. `toMergedRelatedIds` keeps each id once at its
lowest score, most related first, up to fifty, since a user's own public topic is in both reads.

The rules are the ones the searches already apply in SQL, moved so every read imports one copy:
`toTopicViewFilter`, `toTopicAccessFilter`, and `toTopicRoleFilter` into `api/topic/permissions.ts`, and
`toPodcastEpisodeViewFilter` with the new `toPodcastEpisodeAccessFilter` into `api/podcast/podcastEpisodeRows.ts`. The
check after the merge applies the full view rule, public shown or reached through the account, so a visitor's check is
the public rule alone. An admin's related rows are what their own account reaches, never every topic, since a related
table is for finding work near one's own, not for moderation.

The user's read scores its rows without an index and is never cached. The set a user reaches is their own topics,
their teams', and their invites and subscriptions, a few dozen at most, so scoring each one is a short sequential pass.
Ordering by the score itself, which no index can serve, keeps the planner off the HNSW indexes, whose first `ef_search`
results would cut the set short outside an iterative scan, and the plan smoke checks that neither user read scans an
HNSW index. The cost is one query on a signed-in page load, within the topic page's query budget of twenty. The Redis
ranking holds public shown rows alone, and the response with a user's own rows is a signed-in response, which
`setRenderedCacheHeaders` marks private, so no private topic reaches a shared cache or a visitor's page. A page with a
session cookie renders in the browser, so a visitor's server-rendered HTML never includes one either.

Other episodes lists the topic's other published episodes that the user may listen to, through the same activation gate
the episode page itself applies: `loadSubscriberActivatedAt`, and `toPublishedAfterActivationFilter` in the read. An
invite topic's subscriber sees the episodes published after their subscription activated, and a user with a role sees
them all.

Alternatives: one ranking per user through the HNSW index with the access filter, which walks deep into the index for a
narrow filter and needs a per-user cache that would rarely hit, and leaving private topics out, which hides a team's
new topic from the members who could open it.

### The public related reads use iterative index scans inside one transaction, and their rankings are cached

The public related topics and related episodes reads find their candidates by
`embedding <=> (select embedding from <table> where <key> = $1)`, the form pgvector documents for a row's nearest
neighbors, which the HNSW index serves. Their visibility filters, public and shown on the joined topic or the episode
vector's flag, run after the index, so a plain HNSW scan of `ef_search` 40 candidates can return fewer than it asks.
Each read runs in a transaction that first sets `set local hnsw.iterative_scan = strict_order`, so the scan continues
until the candidates fill or the scan's tuple limit is reached, in exact distance order. One helper,
`runWithIterativeIndexScan` in `db/index.ts`, opens the transaction for all three ranked reads, the search's included.

A one-time filter guards each read: no rows unless the page's own vector exists, since a null source vector would
otherwise order every row by null.

The ranked ids and their scores are cached in Redis for fifteen minutes through `cacheJson`, under
`related-topic-scores:<topic id>` and `related-podcast-episode-scores:<episode id>`, so the transaction runs at most
once per topic or episode per fifteen minutes for every replica and every user. The scores let a user's own rows merge
into the cached ranking. A vector changes only after a scan or a publish, so the ranking barely moves within that time.
Every read checks the merged rows again by id against the user's view rules, `toTopicViewFilter` on a topic and a
published status with `toPodcastEpisodeViewFilter` on an episode, so a topic the user may no longer open or an episode
removed leaves the table at once, and the cache can only show fewer rows than the ranking, never a row that may not be
shown. `toRowsInIdOrder` puts the checked rows back in the ranked order.

A poll reload of the topic page, which repeats every three seconds at first and less often as the scan runs on, skips
the related topics read, and `toPolledTopicPage` keeps the page's own. It cannot change while the scan runs, and it was
recomputed on every poll before.

Alternatives: over-fetching a fixed multiple of fifty, which pgvector 0.8 makes unnecessary, and a role-level
`hnsw.iterative_scan` default, which would drop the transaction but would also apply to every other vector read. A
read with a distance cutoff and too few close rows, like the docs retrieval, would then walk up to pgvector's 20,000
entry scan limit each time instead of stopping at its first candidates. With the cache, the transaction is rare enough
that its three extra round trips do not matter.

### Each read selects only what its column needs

The ranking reads select ids and scores alone. The check after the cache selects the topic's id, name, owner, and
visibility, which `TopicNameLink` and the latest episode read need, and an episode's columns. The Other episodes read
selects `podcastEpisodeColumns`, ordered by `published_at desc` through `episodes_topic_published_idx`.

Every table row's episode is a `PodcastEpisodeSummary`: its page, title, description, numbering, length, publish time,
and chapter count, with no chapters, covers, audio url, or progress. The description shows in both episode tables and
in the episode's tooltip, and costs no query, since every episode read already selects it. It adds about 200
characters a row, roughly 3 to 5 KB gzipped for a fifty-row table. The tooltip shows the count, and a press fetches
the full episode with its chapters before it plays, as it always has. The related topics' latest episodes
load through `loadLatestPodcastEpisodeSummaries`, one query for every row and one chapter count, and both episode
tables count their chapters through `loadPodcastEpisodeSummaries`. On the dev database the chapters were about three
quarters of the tables' data: 25 KB of the episode page's 74 KB gzipped, from 36 rows. The profile, team, activity,
and subscriptions tables read the same summaries, since their name cell is the same `TopicNameLink`. The home feed
keeps full episodes, whose chapters tag the findings they narrate, and so do the topic page's and the episode page's
own episodes.

### The new reads join each page's parallel reads

`loadTopicPage` adds `loadRelatedTopics(topic, userId)` to its `Promise.all`. `loadPodcastEpisodePage` adds the Other
episodes and related episodes reads to its `Promise.all` for every topic the user may open. The rows are included in
`TopicResponse.relatedTopics` and in `PodcastEpisodePageResponse.topicPodcastEpisodes` and `relatedPodcastEpisodes`, so
the server renders them and the edge caches the page as before.

### The episode search reads text first and meaning second

`GET /api/episodes/search?q=` in `api/podcast/podcastEpisodeSearch.ts`, mounted ahead of `/episodes/:id`, returns up to
`USER_SEARCH_LIMIT` rows of `{ id, title, topicName, pagePath }`:

1. The text match reads `lower(title) like %q%` or `lower(description) like %q%` through two new trigram GIN indexes,
   `episodes_title_lower_trgm` and `episodes_description_lower_trgm`, ordering title matches first, then newest. The
   query's LIKE wildcards are escaped first, so a typed `%` or `_` matches itself.
2. If the text match leaves room, the meaning match ranks `episode_vectors` against the query's vector under the same
   view filter, leaving out the text matches' ids, inside `runWithIterativeIndexScan`, and keeps a match within a
   cosine distance of 0.6. On the dev database a relevant episode sat between 0.40 and 0.55 from its query and an
   unrelated one past 0.62, so without the floor every query, two letters included, listed episodes about nothing it
   asked. The docs retrieval keeps its sections within 0.5 the same way.

A query is cut to 200 characters before either read.

The view filter, `toPodcastEpisodeViewFilter` in `api/podcast/podcastEpisodeRows.ts`, builds on `toTopicRoleFilter` from
`api/topic/permissions.ts`, and an invite topic passes only for its owner, its teams' members, or a subscriber whose
subscription activated before the episode published, the same gate `loadPublishedPodcastEpisodeRows` applies one topic
at a time. An admin's search has no filter, as the topic search does.

### The query vector is cached, billed, and rate limited

The query embeds through `embedRetrievalQuery`, with the query instruction chat retrieval uses. Its vector is cached
under `podcast-episode-search-vector:<model>:<sha256 of the normalized query>` for a day through `cacheJson`, which
stores no vector for a query it could not embed, where the normalized query is lowercased with its spaces collapsed.
`loadUserOrPublicLiteLLMKey` bills a user's embedding to their own key and a visitor's to `LITELLM_PUBLIC_KEY`, as
`api/mcp/results.ts` bills. A visitor's cache miss counts one hit on a Redis rate limit window,
`rate-limit:podcast-episode-search:<client address key>`, at twenty a minute, through `incrementRateLimitWindow`, which
counts in memory while Redis is down. A cache hit costs no embedding and counts nothing. Over the limit, with no public
key, or on `isBudgetRejection`, the route returns the text matches alone. Any other embedding failure is reported and
returns the text matches alone.

### The tables reuse the table pieces

`RelatedTopicsSection` renders a `TableCard` table in a `CollapsibleSection`, whose one cell is `TopicNameLink`.
`PodcastEpisodesSection` renders both episode tables, Other episodes with an Episode column and Similar podcasts with a
Podcast column, each with a description column, and its title cell, `PodcastEpisodeTitleLink`, pairs an `AnchorLink`
with `PodcastEpisodePlayButton` the way `TopicNameLink` does. A one-column table takes `TABLE_ONLY_COLUMN_CLASS`, so
its one column fills the table with no frozen column's rule. Every column sorts through `usePaginatedRowSort`, which
takes an initial page size, and the three tables start at five. Rows render through `toRenderedRows`, so a browser
without JavaScript sees the first fifty in the ranked order. A table with no pagination under it ends its card at the
last row, rounded off by the card: `ONE_PAGE_TABLE_CARD_CLASS` for a table of one page, and
`SCRIPTED_PAGINATION_TABLE_CARD_CLASS`, the same until JavaScript shows the pagination, for a longer one.

### Similar topics replaces More topics

More topics, five plain links by holding team, shared tags, and newest finding, sat at the end of the same page as
Similar topics, which ranks by meaning and tags and holds up to fifty server-rendered links. `loadMoreTopics`,
`MoreTopicsSection`, and `TopicResponse.moreTopics` are gone, and a topic page load sends two fewer queries.

### A page rendered without its data returns a 503

A route's server read that fails returned its fallback, and the page rendered as a normal 200: a homepage with "0
topics", which the edge then shared for up to two minutes. `readWithDegradedFallback` in `ui/src/lib/loadOnServer.ts`
now marks such a render with `DEGRADED_RENDER_HEADER` through Start's `setResponseHeader`, which Start merges into the
response. Start sets a page's status from its router alone, so the api reads the header instead: it returns a 503 with
`Retry-After: 60`, takes the header off, and reports the page, and `setRenderedCacheHeaders` keeps any non-200 out of
the edge. The page still renders with its fallback, so a visitor with JavaScript loads the rest in the browser, and a
crawler retries it later instead of indexing an empty page. Every server read that falls back goes through the helper:
the homepage's feed, the invite head, the topic page's linked season, and `loadPageOnServer`'s head and page reads.

### An episode's tooltip opens on its titles and play buttons, with its description

`PodcastEpisodeTooltip` adds the description under the details line, and opens on every episode play button and
linked title: the table cells, the episodes card's rows, and the player card on the episode page. The AI voices note
stays on the details line outside a tooltip, where the page already shows it, and leaves the tooltip.

### The search bar adds a Podcasts type

`SEARCH_RESULT_TYPES` gains `podcasts` with the Podcast icon, and a `PodcastEpisodeResult` row shows the title and
the topic's name and links to the episode's page. The rows sit after topics in the combined list that the arrow keys
walk.

### Shared pieces the change gives one home

- `embedRetrievalQuery` in `worker/chat/retrieveDocs.ts` embeds a question or a query with the query instruction.
  Chat retrieval had four copies of that call, and the search would have been the fifth.
- `saveEnvSettings` in `shared/savedEnvSettings.ts` saves the settings a test changes and returns the restore. The
  search tests need it, and every test that changes an environment setting now uses it.
- `hasEnoughFindingsToList` in `db/index.ts` is the finding count behind `isPublicAndShown`. It counts the findings
  no user rated down, the same count the topic page
  head indexes by, so a topic the sitemap lists never renders `noindex`.
- `api/topic/relatedness.ts` holds what both related reads share: the cache time, the candidate count, the score with
  its centroid and tag bonus, and `toRowsInIdOrder`.
- `PodcastEpisodeSummary` includes the description, so every table row and tooltip reads one shape, and
  `PodcastEpisode` extends it, chapter count included.
- `LatestPodcastEpisodePlayButton` is now `PodcastEpisodePlayButton`, since a table row's episode need not be its
  topic's latest, and the chapters table's column width is now `TABLE_WIDE_FIRST_COLUMN_CLASS`, which both episode
  tables share.

## Risks / Trade-offs

- [A small table plans around its index] With 43 topics the planner sorts the whole vector table instead of scanning
  the HNSW index, and on 150 episodes it reads `episodes_topic_published_idx` whole instead of combining the two
  trigram indexes, each faster at that size. → The plan smoke turns sequential scans and sorts off for each ranked
  read, and sequential and plain index scans off for the text match, so each plan has to use its index. The manual
  EXPLAIN runs with the same settings: `set local enable_seqscan = off` and `set local enable_sort = off` before a
  ranked read, and `set local enable_seqscan = off` and `set local enable_indexscan = off` before the text match. On
  the dev database each read then finished within a millisecond.
- [Rows add page weight] Up to fifty rows per table are in every page's html and its hydration data, for people and
  crawlers alike. → Each row is a summary with a chapter count instead of chapters. On the dev database a table's data
  is about 2 KB gzipped and its markup about 2 to 3 KB, for 15 to 18 rows. Every paged table keeps fifty rows for a
  visitor without JavaScript, and gzip already folds the rows' repeated markup.
- [A transaction per ranked read] Each ranking sends four statements instead of one. → The ranked ids are cached for
  fifteen minutes, so a page load reads Redis and checks the cached ids instead.
- [A stale ranking] A cached ranking misses a topic that turned public, or a vector that moved, for up to fifteen
  minutes. → Every read checks the cached rows again, so nothing that may not be shown appears, and the next ranking
  picks up the rest.
- [A second copy of each topic's visibility] The vectors' flags must follow every save and scan. → They are written
  together with the topic's own vector, and every read checks the topic again, so an out-of-date flag only hides a
  public topic or its episode until the next scan.
- [Private topics in the related reads] A private topic's name could leak through a shared cache. → The Redis ranking
  holds public shown rows alone, a user's own rows are never cached, a signed-in response is never shared at the edge,
  and a test and the related smoke check that a visitor and a user with no access never see one.
- [Limits set on a small sample] The two 0.75 limits come from production's 25 listed topics and 70 episodes.
  → They are constants in `api/topic/relatedness.ts`. Recheck them against the backfilled tables as topics grow.
- [The centroid's cost] The centroid averages up to 20,000 resource embeddings, about 80 MB read. → It runs once a day
  per model, cached in Redis, and never while Redis has it.
- [Candidates past 200] A candidate outside the 200 nearest by plain distance is never scored. → Each page lists up to
  fifty, and the plain and centered orders agree on the nearest. Raise the candidate count if a topic's list runs
  short at scale.
- [A rating's write] Every rating writes the topic's vectors again. → One average over at most a few hundred kept
  findings, and ratings are rare. A failed write is reported and never fails the rating, and the next scan writes the
  vectors again.
- [The first search of a word] An uncached query waits for its embedding, about half a second on the dev proxy, and
  the Podcasts rows arrive after the topic, team, and user rows, which are their own requests. → The query vector is
  cached by its lowercased words, and a query under three characters, a partial word while typing, embeds nothing.
  The first search of a user with no LiteLLM key also creates one, as the mcp search does. Keys are created at signup,
  so that path only runs if signup's key creation failed.
- [Two-character text matches] A pattern under three characters cannot use a trigram index, so a two-character search
  reads every episode title. → That costs well under a millisecond at hundreds of episodes, and the topic, team, and
  user searches share the same two-character minimum. A longer minimum would stop a search for a word like "AI".
- [The public key's spend] Visitor searches spend the public key. → Cached vectors, the per-address limit, and the
  text-match fallback on a spent key.

## Migration Plan

1. The migrations add the two vector tables, each with its public and shown flag and that flag's partial HNSW index,
   the episode vectors' full HNSW index, and the two trigram indexes. The deploy's migrate job runs them before the
   app releases.
2. After the deploy, run the backfill once against prd:
   `doppler run -p carlnotes -c prd -- bun scripts/backfill-vectors.ts`. Until then the tables are empty and the
   related tables render nothing, which is the same as a page with no related rows.
3. Rollback: the app ignores the tables if it is rolled back. The migration's tables and indexes can stay.

No new environment variable.

## Open Questions

None.
