# Proposal

## Why

A film holds one still for a whole chapter, and a chapter runs 119 seconds on average in prod and up to 5 minutes, so
most of a film is a slow drift over one picture. Cutting each chapter into shots of 5 to 8 seconds over the images of
the Finding's own page makes the film move, and it has to land before launch so every film a visitor plays has the
new look.

## What Changes

- **Chapter montage.** Each chapter cuts through a fixed order of images: the Resource's own images with its link
  preview image among them, then the chapter's generated images, then the Carl and Vienna podcast card, then again from
  the start. No image is on screen longer than 8 seconds. Shots run 5 to 8 seconds, average about 6, and cut on
  caption breaks. Each shot zooms in, zooms out, pans left, or pans right at 8 percent a second, limited by what the
  image's pixels hold. Shots crossfade over 0.4 seconds.
- **Resource Images.** A Resource's images are fetched once, the first time a film narrates it, from the Markdown
  the Scan already stored for its page. They pass a filter (the page's own content, a photo or illustration type, a
  third of the frame, a shape from 2:3 to 21:9, no logo, avatar, icon, ad, or tracking pixel, one copy of each
  picture), and at most six are stored in R2, within 2560 by 1440. An unsafe Resource has none. The Scan and Firecrawl
  are untouched: no new format, no second scrape, no credits.
- **Generated images fill what the page lacks.** A chapter gets one distinct image for every 30 seconds, and at least
  two. Generated images make up the difference, billed and recorded on the film as today. This replaces the rule of one
  generated image for a chapter of 90 seconds with no image, four a film. The film's limit stays a setting, with a
  default of 40, and the 90 second setting goes.
- **Faster fades, and no slide.** A chapter opens and closes with a 0.3 second fade through espresso, down from 1.2
  seconds. **BREAKING** for the film's look: a link preview image no longer slides in from an edge.
- **The intro and the sign-off zoom hard.** The intro pushes in at 12 percent a second, then creeps in to 2.5 times
  as the first chapter starts. The sign-off is the same move backward. A new film's own image is drawn at 2752 by 1536
  so the zoom stays sharp, and the 1280 by 720 poster file stays as it is.
- **The segment where the hosts answer Comments** cuts between the podcast card and the film's own image, so it
  follows the 8 second rule too.
- **Render version.** A film row records the version it was rendered at. A new film renders at the current version.
  The backfill re-renders every ready film below it, on the platform's bill, and logs its progress. The old film plays
  until the new one is stored, a failed re-render leaves the old film, and a second run does nothing for a film
  already current. A Podcast Episode with no film stays as it is today.
- **Docs.** The domain model and the workspace guides describe Resource Images, the montage, and the render version.

No screen, copy, api, or Scan change. The twelve decisions approved on 2026-11-11 are listed first in `design.md`,
with the measurements behind them.

## Capabilities

### New Capabilities

- `resource-images`: the images of a Resource's own page, filtered and stored for the films that narrate it.

### Modified Capabilities

- `topic-podcast-episode-video-rendering`: a chapter shows a montage in place of one still, generated images follow
  the distinct image rule, the fades shorten and the slide goes, the intro and the sign-off zoom to 2.5 times, the
  film's own image is drawn larger, a film has a render version, and the backfill re-renders films below the current
  one.

## Impact

- **Pipeline:** `packages/pipeline/topicPodcastEpisodeVideo/` (the shot plan, the chapter stills, the encoder's
  arguments, the parts, the render, the rebuild's swap guard, the film row writes, the film image's size) and a new
  `packages/pipeline/resourceImages/`. `linkPreview.ts` is reused as it is.
- **Worker:** `apps/worker/workflows/backfillTopicPodcastEpisodeVideos.ts` and its listing activity. The workflow
  keeps its activities and its shape, so a deploy mid-run replays cleanly.
- **Database:** one migration: a `resource_images` table, `resources.images_fetched_at`, and
  `topic_podcast_episode_videos.render_version` and `failed_render_version`.
- **Storage:** `resources/<id>/images/`, version-suffixed film keys, more generated images a film, and a large
  original beside each new film image. A montage film measured 34 percent more video bits than today's.
- **Models and settings:** `packages/models` gains the image model's 2K size and its price.
  `TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS` is removed, and the limit's default rises from
  4 to 40.
- **Cost:** about 20 generated images a film at $0.034, where a film has at most 4 today, and $0.067 more for each
  new film's own image. The prod backfill draws an estimated 1,500 to 2,500 generated images, $50 to $85, on the
  platform's key, and scrapes nothing.
- **Not touched:** `apps/api`, `apps/web`, `apps/mobile`, the MCP views, the Scan, and the contracts the mobile app
  froze.
