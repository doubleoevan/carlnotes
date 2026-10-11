## Why

A public topic page ends with five plain "More topics" links, and a public podcast episode page links nothing past its
own topic, so a visitor who likes one topic or episode has no way to find the ones like it. The search bar finds a
podcast episode only through its topic's name. Every resource a scan keeps already has an embedding, so similar topics
and episodes can be ranked from stored vectors without a model call on any page render.

## What Changes

- A topic's vector, the mean of its kept findings' resource embeddings, and a published podcast episode's vector, the
  mean of its chapters' resource embeddings, each over resources embedded with `EMBED_MODEL_NAME` alone, computed in
  SQL with pgvector's `avg` and stored in their own tables. The worker writes a topic's vector after every scan ends and
  an episode's when it publishes, and removing an episode deletes its vector. Each vector saves whether its topic is
  public and shown, with a partial HNSW cosine index over the ones that are.
- A related score: the cosine distance between two vectors once the model's average resource embedding is taken out
  of both, less a bonus for each tag the two topics share, kept within a limit so an unrelated topic is never listed.
- A Similar topics table at the bottom of a topic page's right column, under Notes: the other topics related to it
  that the user may open, up to fifty, each as the topic table's name link with its latest episode's play button. A
  visitor sees public shown topics, and a signed-in user also sees their own topics, their teams' topics, and the
  invite topics they are invited to or follow, so they find a team topic they did not know about. It replaces the five
  More topics links.
- An Other episodes table and a Similar podcasts table at the bottom of an episode page: the topic's other published
  episodes newest first, and the related published episodes of other topics, each title linked with its play button
  beside its description, each limited to the episodes the user may listen to.
- The public shown rows are ranked once per page and cached in Redis for everyone. A signed-in user's own rows are
  scored for them on each load without an index and never cached, so no private topic reaches a shared cache or a
  visitor's page.
- Each new table loads with its page's data so it renders on the server, shows five rows a page with JavaScript,
  sortable by every column, and the first fifty without, and does not render with no rows.
- A podcast episode's tooltip shows its description, and opens on its linked titles as well as its play buttons.
- A Podcasts result type in the search bar: a new route returns the published episodes the user or visitor may see,
  title and description matches first, then the nearest by meaning. The query is embedded with chat retrieval's
  instruction, cached in Redis by normalized query, and billed the way the mcp search bills. A signed-out visitor is
  rate limited per client address, and a rate-limited visitor or a spent key gets text matches alone, never an error.
- A pg_trgm GIN index on episode titles and on episode descriptions for the search's text match.
- A one-off script that backfills the vectors of existing topics and published episodes.

## Capabilities

### New Capabilities

- `related-topics-and-episodes`: the topic and podcast episode vectors, the related score, the Similar topics table
  on a topic page, the Other episodes and Similar podcasts tables on an episode page, the episode tooltip, and the
  backfill.
- `podcast-episode-search`: the search bar's Podcasts results, the episode search route, its query vector cache, its
  billing, its visitor rate limit, and its text-match fallback.

### Modified Capabilities

- `seo`: the paged-list requirement names the three new tables among those that hold fifty rows for a visitor without
  JavaScript.
- `topic-detail-page`: the More topics requirement is removed, since Similar topics replaces it.
- `static-serving`: a page that renders without a read it needs returns a 503, never cached at the edge.

## Impact

- Database: migrations adding `topic_vectors` and `episode_vectors`, each with a public and shown flag and a partial
  HNSW cosine index over the flagged rows, the episode vectors' full HNSW index for a user's meaning search, and trigram
  GIN indexes on `lower(episodes.title)` and
  `lower(episodes.description)`. A topic delete cascades to its episodes' vectors. pgvector 0.8.1 is installed in dev
  and prd, so the related queries use iterative index scans.
- Worker: the scan finish, stop, and fail paths and the episode publish and remove paths write and delete vectors.
- Api: the topic page read and the episode page read gain the new rows, a visibility change saves the topic's vectors
  again, and a page rendered without a read it needs returns a 503. A new `/api/episodes/search` route. The topic and
  episode view rules in SQL move into `api/topic/permissions.ts` and `api/podcast/podcastEpisodeRows.ts`, which the
  searches and the related reads share.
- Shared contracts: `shared/contracts.ts` splits into one module per domain under `shared/contracts/`, imported by
  path. `TopicResponse.relatedTopics` in place of `moreTopics`, `PodcastEpisodePageResponse.topicPodcastEpisodes` and
  `relatedPodcastEpisodes`, the description on `PodcastEpisodeSummary`, and the episode search result.
- Ui: the topic page's right column, the episode page, the search bar's filters and results, and a page size option on
  the table pagination hook.
- No new dependency. No model call on any page render.
