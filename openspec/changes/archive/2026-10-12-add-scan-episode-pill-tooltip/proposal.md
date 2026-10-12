## Why

A scan history row's podcast episode pill shows only `E8`, while every other podcast episode button on the topic page,
the play button, the episodes card, and the player's title, shows the episode's tooltip on hover. A user reading the
brew diary has no way to tell what an episode covers without playing it.

## What Changes

- The scan history row's podcast episode pill shows the same tooltip as the other podcast episode buttons: the Coffee
  Break podcast, the season and episode number, the title in bold, and the date, length, chapter count, and AI voices
  note.
- The topic page's scan history sends each Scan's published Podcast Episode as its summary, the same shape a table row
  and the play button read, instead of its id, season, and number alone.

## Capabilities

### New Capabilities

### Modified Capabilities

- `scan-history`: the scan history row's podcast episode pill shows the Podcast Episode's tooltip.

## Impact

- `api/podcast/helpers.ts`: `loadTopicPodcast` reads each Scan's Podcast Episode summary through
  `loadPodcastEpisodeSummaries`, one chapter count query beside the reads it already runs in parallel.
- `shared/contracts/podcast.ts`: the new `publishedPodcastEpisodeSummary`, a summary with its season and number, which
  `shared/contracts/topics.ts` uses for a scan's `podcastEpisode` and the pill takes.
- `ui/src/components/podcast/PodcastEpisodePill.tsx`: `PodcastEpisodeNumberPill` wraps its button in
  `PodcastEpisodeTooltip`.
