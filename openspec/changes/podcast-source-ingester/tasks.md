## 1. Schema and shared vocabulary

- [x] 1.1 Add `podcast` to `sourceKinds` and `editableSourceKinds` in `shared/enums.ts`, and add the `DEFAULT_SOURCES` registry (`search` → the web scout) beside them
- [x] 1.2 Add the nullable `transcriptUrl` column to `resources` in `db/schema.ts` and update the `sources.kind` comment to name the new kind
- [x] 1.3 Generate the Drizzle migration for the enum value and the new column, and confirm it alters nothing else

## 2. Podcast ingester

- [x] 2.1 Write `worker/ingest/podcast.ts`: read `config.podcastId`, resolve it through the iTunes lookup to the show's `feedUrl`, fetch that feed through `fetchFeed(feedUrl, { resourceKind: "listen" })`, cap the episodes, and return cost `0` with no `fallbackMode`
- [x] 2.2 Fail the Source alone, naming the id, when the config carries no id, iTunes returns no results, or the show publishes no feed
- [x] 2.3 Expose `searchPodcasts(term)` returning each show's podcast id, name, author, and feed url, sharing its request and parsing with the lookup
- [x] 2.4 Register `podcast: podcastIngester` in `worker/ingest/index.ts`
- [x] 2.5 Write `worker/ingest/podcast.test.ts` covering iTunes-to-show mapping and the entries it skips

## 3. Transcript capture in the feed parser

- [x] 3.1 Teach `parseFeed` in `worker/ingest/feed.ts` the `podcast:transcript` custom field, picking the plain-text or WebVTT entry when several are listed and the first otherwise, and set `transcriptUrl` on the emitted Resource
- [x] 3.2 Extend `worker/ingest/rss.test.ts` (or add cases to the podcast tests) for an entry with one transcript, several transcripts, and none
- [x] 3.3 Fall through a feed entry's link to its absolute guid and then its enclosure when the link is the feed's own channel link, so a show that stamps one link on every episode stops collapsing into a single Resource

## 4. The transcript branch in curation's fetch stage

- [x] 4.1 Add a bounded plain-GET transcript fetch beside `fetchContent` in `worker/scrape.ts`, reusing the private-host guard and a byte cap, with WebVTT/SRT cue timestamp and index stripping as its own exported pure function
- [x] 4.2 Branch `fetchResourceContent` in `worker/review/score.ts` ahead of Firecrawl: a `transcript_url` fetches and stores the transcript, a `listen` Resource without one scores its snippet with no fetch, everything else keeps the Firecrawl path — all three counting as `fetched`
- [x] 4.3 Fall back to the snippet on a failed transcript fetch, without attempting Firecrawl afterward
- [x] 4.4 Extend `worker/review/score.test.ts` for the three branches, the cue-stripping function, and the transcript-fetch failure fallback

## 5. The default Source registry in the api and ui

- [x] 5.1 Cover the podcast config in `toSourceSummary` in `api/topic/topics.ts` (the show's podcast id) and extend `api/topic/topics.test.ts`
- [x] 5.2 Delete `WEB_SOURCE` from `ui/src/lib/utils.ts` and point its readers at `DEFAULT_SOURCES` through an `isDefaultSource` helper
- [x] 5.3 Render the default group in `TopicSourceEditor` from the registry: one row per registered kind, on with a ✕ and off with a turn-on control
- [x] 5.4 Add `podcast` to the custom add picker's placeholder record ("podcast id…") and to `toSourceConfig` in `EditTopicModal`, and stage every registered default kind for a new Topic instead of the single `search` row
- [x] 5.5 Render the default Source lines in `TopicSettingsCard` from the registry, each on or muted off, and give `podcast` its icon in `SOURCE_ICON`

## 6. Podcasts in source suggestion

- [x] 6.1 Add the `podcast` bullet to `worker/prompts/suggest-sources.md`, naming a show the way a listener would search for it and never a feed url or a number, and bump the prompt version
- [x] 6.2 Key a `podcast` candidate in `toSourceKey` by its trimmed lowercase value, so a name and the id it becomes are distinct keys on purpose
- [x] 6.3 Turn `isReadable` into `toConfirmedSource`, returning the source to stage or null, so a `podcast` candidate's show name can be replaced by the podcast id its Source stores
- [x] 6.4 Resolve a `podcast` candidate through `searchPodcasts`, dropping one that matches no show or a show with no feed, and dropping it on a declined lookup too since there is no stored value to keep
- [x] 6.5 Dedupe a second time on what verification returned, against the Topic's Sources and the candidates already taken in the same reply
- [x] 6.6 Extend `worker/suggest.test.ts` for the podcast source key, including that a name and an id are different keys and that a podcast is not keyed as a feed

## 7. Documentation and verification

- [x] 7.1 Update the Source row of `.agents/skills/domain-model/SKILL.md` to the current kind list, adding `podcast` and the `url` kind that shipped unrecorded
- [x] 7.2 Run `bunx biome check .`, `bunx tsc -b`, and `bun test`
- [x] 7.3 Apply the migration, then run a real scan against a Topic carrying a podcast Source and confirm the Scan records `listen` Findings, zero ingestion cost, and a fetch count that shows no Firecrawl credit spent on transcript-less episodes
- [x] 7.4 Cap the episodes a show contributes, sized from what the live scan measured against the Scan's scored-resource ceiling
- [x] 7.5 Re-run `bun run smoke:scan` against the id-named podcast Source, since the live run that passed used the earlier topic-discovery shape
- [x] 7.6 Bump the `suggest-sources` frontmatter version past whatever landed before this change, since every source ingester edits the same prompt and each needs its own version for a trace to name its wording. The deploy uploads it as a candidate on its own, so promoting it to production in Langfuse waits until every source change has shipped

## 8. Archive order

- [ ] 8.1 Archive `youtube-caption-transcripts` before this change: it RENAMEs the curation fetch requirement, and this change's curation delta modifies the requirement under its new name with the identical merged text
