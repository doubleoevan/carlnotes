## Why

A Topic can watch the web, reddit, YouTube, and any feed, but it is deaf to podcasts — the one medium where the best thinking on a niche subject often lands first and never gets written down. Podcasts are RSS underneath, so the ingester the app already has does most of the work: what is missing is a way to name a show without hunting down its feed url, and a way to score an episode on something better than its title.

## What Changes

- Add a `podcast` Source kind with its own ingester. A Source names one show by its podcast id; iTunes resolves that id to the show's RSS feed (keyless, free), and the feed supplies the episodes. Episodes land as Resources of the existing `listen` kind, so no new Resource kind is introduced. It is a custom Source a reader adds, not a default one.
- Expose iTunes's **show search**, and wire it into source suggestion so a Topic can be offered podcasts. The model proposes a show by name — a podcast id is a number it would invent — and the lookup that verifies the name is the same step that rewrites it into the id a Source stores. A name matching no show is dropped like any other unreadable suggestion.
- Establish the **default Source set** as one shared registry that each ingester registers into, replacing the hardcoded web-scout constants in the topic editor and the topic page. Web search is its only member today; the registry is what lets the next default Source join with one line.
- Capture a feed entry's `podcast:transcript` URL onto the Resource at ingest, and add the transcript branch to curation's fetch stage: a `listen` Resource with a transcript fills its content from the transcript instead of scraping the episode page, and one without a transcript scores on its show-notes snippet rather than spending a Firecrawl credit on a page that is mostly a play button.
- Keep the `domain-model` skill in sync: the Source kind list gains `podcast` (and `url`, which shipped without being recorded there).

## Capabilities

### New Capabilities

None. Podcasts are a new Source kind inside capabilities that already exist.

### Modified Capabilities

- `source-ingestion`: adds the podcast ingester's requirement (iTunes lookup by id, RSS episode ingestion, `listen` Resources, keyless and zero-cost), iTunes show search, the transcript-URL capture, and the default Source set registry.
- `source-suggestion`: verification gains the podcast candidate, which it resolves from a show name into a podcast id rather than only confirming, and dedupe runs a second time on what resolution returned.
- `curation`: the fetch stage gains the transcript branch, so a `listen` survivor is no longer routed through Firecrawl.
- `domain-schema`: the Source `kind` set gains `podcast`, and `resources` gains a nullable `transcript_url`.
- `topic-editing`: the edit modal's default Sources group covers a registered set rather than the single web scout, and the add picker offers `podcast`, taking a show's podcast id.
- `topic-detail-page`: the Sources section lists every registered default Source, on or muted off, rather than naming the web scout on its own.

## Impact

- `shared/enums.ts`: `podcast` joins `sourceKinds` and `editableSourceKinds`; a new default-Source registry lands beside them.
- `db/schema.ts` + one generated migration: the `source_kind` enum gains a value and `resources` gains `transcript_url`.
- `worker/ingest/`: new `podcast.ts` and `podcast.test.ts`; `feed.ts` parses `podcast:transcript` and resolves an entry's address; `index.ts` registers the ingester.
- `worker/review/score.ts` and `worker/scrape.ts`: the fetch stage branches on the transcript before reaching Firecrawl, reading it through a bounded plain GET.
- `api/topic/topics.ts`: `toSourceSummary` covers the podcast config.
- `ui/`: `TopicSourceEditor`, `EditTopicModal`, `TopicSettingsCard`, and `lib/utils.ts` read the registry instead of the `WEB_SOURCE` constant.
- `.agents/skills/domain-model/SKILL.md`: the Source kind row.
- No new dependency, no new API key, no new environment variable. iTunes is keyless and rate-limited rather than billed.
- **Overlaps `youtube-caption-transcripts`.** Both change how curation's fetch stage picks a survivor's content path, and both edit the same requirement. That change reads a caption track from the host's own api and holds that kind alone must not select the path; this one reads a url the feed itself declared and lets a transcript-less episode score its show notes. Whichever lands second reconciles them into one router: a declared transcript url first, then a host caption track, then Firecrawl.
