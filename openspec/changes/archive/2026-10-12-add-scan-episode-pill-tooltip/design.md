## Context

`PodcastEpisodeTooltip` in `ui/src/components/podcast/PodcastEpisodeDetails.tsx` reads a `PodcastEpisodeSummary`. The
scan history's podcast episode carried only its id, season, and number, so the pill in a scan history row had nothing
to show in a tooltip.

## Goals / Non-Goals

**Goals:**

- The scan history pill shows the same tooltip as the other podcast episode buttons.

**Non-Goals:**

- A tooltip on a chapter pill, which plays one chapter and already names it in its label.

## Decisions

- The scan's podcast episode becomes `publishedPodcastEpisodeSummary`, the podcast episode summary narrowed to a
  published one with its season and number, so the pill and the tooltip read one shape. The summaries come from `loadPodcastEpisodeSummaries`, which the
  topic tables already use, in the same parallel batch as the latest podcast episode and the latest season.
- The pill wraps its own button in the tooltip, as `PodcastEpisodePlayButton` does, so every caller gets the tooltip.

## Risks / Trade-offs

- One more query per topic page load, a grouped chapter count over the topic's published episodes that a scan
  recorded. A topic page already reads every published episode of the topic.
