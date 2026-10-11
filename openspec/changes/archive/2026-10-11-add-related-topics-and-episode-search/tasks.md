## 1. Schema and migration

- [x] 1.1 Add `topicVectors` (`topic_vectors`) and `podcastEpisodeVectors` (`episode_vectors`, with its topic id) to
  a new `db/schema/vectors.ts`, each with an HNSW `vector_cosine_ops` index
- [x] 1.2 Add the trigram GIN indexes `episodes_title_lower_trgm` and `episodes_description_lower_trgm` to `episodes`
- [x] 1.3 Generate the migration with `bun run db:generate`, check its SQL, and apply it to the dev database
- [x] 1.4 Add `runWithIterativeIndexScan` to `db/index.ts`

## 2. Vector writes

- [x] 2.1 Add `worker/meanVectors.ts` with `saveTopicVectors`, `savePodcastEpisodeVector`, and
  `deletePodcastEpisodeVectors`
- [x] 2.2 Write the topic's vector in `finishScan` once a scan saves as succeeded, reporting a failed write
- [x] 2.3 Write the episode's vector in the publish transaction, and delete vectors in `markPodcastEpisodesRemoved`
- [x] 2.4 Add `scripts/backfill-vectors.ts`, and run it against the dev database
- [x] 2.5 Tests: the mean queries and their model filter, the empty-mean delete, and the removal delete, with the
  publish write and the topic write checked in the episode and scan smokes

## 3. Related reads

- [x] 3.1 Add `api/topic/relatedTopics.ts` with `loadRelatedTopics`, and add it to `loadTopicPage`'s parallel reads
- [x] 3.2 Add `api/podcast/relatedPodcastEpisodes.ts` with the Other episodes read and the related episodes read, and
  add both to `loadPodcastEpisodePage`'s parallel reads
- [x] 3.3 Add `relatedTopics` to `TopicResponse`, and `topicPodcastEpisodes` and `relatedPodcastEpisodes` to
  `PodcastEpisodePageResponse`
- [x] 3.4 Tests: the visibility filters on all three tables, the related topic with no published episode, the latest
  episodes in one query, the fifty-row bound, and the topic page's query budget, with the visibility and status
  filters also checked on real rows in `api/podcast/relatedSmokeSections.ts`

## 4. Episode search

- [x] 4.1 Export the topic search's role filter, and add the episode view filter with the invite activation gate
- [x] 4.2 Add `api/podcast/podcastEpisodeSearch.ts` with the text match, the meaning match, the cached query vector,
  the billing, the visitor rate limit, and the text-match fallback, and mount `GET /api/episodes/search` ahead of
  `/episodes/:id`
- [x] 4.3 Add the episode search result to `shared/contracts/search.ts` and `searchPodcastEpisodes` to the ui's episode
  client
- [x] 4.4 Tests: the title-first order, the view filter, the fallback for a rate-limited visitor, a missing key, and a
  spent key, and the Redis query cache, over one shared `saveEnvSettings` helper that every test changing an
  environment setting now uses

## 5. Ui

- [x] 5.1 Add an initial page size to `usePagination`
- [x] 5.2 Add `RelatedTopicsSection` under Notes in the topic page's right column
- [x] 5.3 Add `PodcastEpisodeTitleLink` and `PodcastEpisodesSection`, and render Other episodes and Similar podcasts at
  the end of the episode page, with the play button renamed `PodcastEpisodePlayButton`
- [x] 5.4 Add the Podcasts result type, its icon, and `PodcastEpisodeResult` to the search bar
- [x] 5.5 Tests: five-row pages, fifty rows without JavaScript, no table with no rows, and no play button without an
  episode
- [x] 5.6 Give every table row's episode a `PodcastEpisodeSummary` with a chapter count instead of its chapters, the
  older profile, team, activity, and subscriptions tables included, through `api/podcast/podcastEpisodeShapes.ts`

## 6. Plans, docs, and verification

- [x] 6.1 Add the related topics, related episodes, episode meaning, and episode text plans to
  `api/searchPlans.smoke.ts`, and run it
- [x] 6.2 Update `api/AGENTS.md`, `worker/AGENTS.md`, `db/AGENTS.md`, and `ui/AGENTS.md` for the new files
- [x] 6.3 Run `bun run check`
- [x] 6.4 Verify in the browser: Similar topics on a public topic page, both tables on a public episode page, a play
  button in each playing in the podcast player, fifty rows with JavaScript off, and a search by meaning under Podcasts

## 7. Performance follow-ups

- [x] 7.1 Cache the related topic and related episode ids in Redis for fifteen minutes, and check each cached row's
  visibility again on every read
- [x] 7.2 Skip the related topics read on a topic page poll reload, and keep the page's own
- [x] 7.3 Save a topic's vector with whether it is public and shown, moving `isPublicAndShown` into `db/index.ts`, and
  save the vector again after a save that changes the visibility
- [x] 7.4 Match by meaning only for a query of three characters or more
- [x] 7.5 Record in the design why the episode vectors stay for every published episode, why the transaction stays,
  why two-character text matches stay, and why the fifty rows stay
- [x] 7.6 Save whether an episode vector's topic is public and shown, with a partial HNSW index, and rank the related
  episodes and a visitor's meaning match through it
- [x] 7.7 Save a topic's vectors after every scan end, stopped and failed scans included

## 8. Relatedness and the tables' finish

- [x] 8.1 Add `api/topic/relatedness.ts`: the centroid cached in Redis, the score with its shared tag bonus, and the
  limits, and rank both related reads by it over their 200 nearest candidates
- [x] 8.2 Remove More topics: `loadMoreTopics`, `MoreTopicsSection`, and `TopicResponse.moreTopics`
- [x] 8.3 Rename the tables Similar topics, Other episodes, and Similar podcasts, give Similar podcasts a description
  column, and make every column sortable
- [x] 8.4 End a table's card at its last row if no pagination shows under it, with or without JavaScript
- [x] 8.5 Add the description to `PodcastEpisodeSummary` and the episode tooltip, open the tooltip on titles and play
  buttons, and leave the AI voices note out of the tooltip
- [x] 8.6 Tighten the pager's spacing and the topic page's Notes header to the other sections' rhythm
- [x] 8.7 Tests and smokes: the score's SQL and centroid cache, the tag bonus and far topic in the related smoke, the
  flag in the episode smoke, the stopped and failed scan saves, and the new plans
- [x] 8.8 Set each limit from production's coverage: 0.75 for topics, and 0.75 for episodes
- [x] 8.9 Return a 503 and a `Retry-After` for a page rendered without a read it needs, reported and never cached at
  the edge

## 9. Related sections follow the user's access

- [x] 9.1 Save a vector for every topic with an embedded kept finding, with its public and shown flag and a partial HNSW
  index in place of the full one
- [x] 9.2 Move the topic and episode view rules in SQL into `api/topic/permissions.ts` and
  `api/podcast/podcastEpisodeRows.ts`, each split into the part a user reaches through their account and the full rule
- [x] 9.3 Cache the public rankings with their scores, score a signed-in user's own topics and episodes without an index
  on every load, merge the two by score, and check each row against the user's view rules
- [x] 9.4 Load Similar topics on every topic page with a vector, and both tables on every episode page the user may
  open, with Other episodes behind the invite activation gate
- [x] 9.5 Tests, the plan smoke, and the related smoke: a visitor and a user with no access see no private or invite
  topic or episode, and the owner, a team member, and a subscriber each see theirs
- [x] 9.6 Run the backfill on dev, and update the module docs, the README, and the docs page
- [x] 9.7 Write a topic's vectors again after a rating change, reporting a failed write without failing the rating
- [x] 9.8 Split the three largest ui files this change touched: `TeamPage.tsx`, `TopicResource.tsx`, and
  `AdminUsersTable.tsx`
