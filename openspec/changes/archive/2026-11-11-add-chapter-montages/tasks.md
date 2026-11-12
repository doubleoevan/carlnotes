# Tasks

## 1. Approval and names

- [x] 1.1 Confirm that decisions 1 to 12 in `design.md` are approved, and fold any change into the design, the two
      spec deltas, and these tasks before any code. Verify: `openspec validate add-chapter-montages --strict` passes
      after the edits.
- [x] 1.2 Add a Resource Image row to `.agents/skills/domain-model/SKILL.md` and extend the Topic Podcast Episode
      Video row with the montage, the shot, the distinct image rule that replaces the 90 second rule, the 2752 by
      1536 original, and the render version. Verify: the rows hold every name in design decision 7, and no row says
      clip or floor.

## 2. Schema and stored keys

- [x] 2.1 Add the `resource_images` table (the Resource, its position, the object key, the stored width and height,
      whether it is the link preview image, the source url) and `resources.images_fetched_at` in
      `packages/db/schema/scans.ts`, and `render_version` (default 1) and `failed_render_version` on
      `topic_podcast_episode_videos` in `packages/db/schema/podcast.ts`. Run `bun run db:generate`. Verify: the
      migration holds only this table and these three columns, and `bunx tsc -b` passes.
- [x] 2.2 In `packages/db/store.ts` add `toResourceImageKey`. In `packages/db/topicPodcastEpisodeVideoKeys.ts` give
      the film's part, chapters, and captions keys the render version (version 1 keeps today's names), add the film
      image's large original key, number the generated image keys with the first at today's key, and list the new keys
      in `toTopicPodcastEpisodeVideoKeys`. Verify: `topicPodcastEpisodeVideoKeys.test.ts` covers each key at version
      1 and 2 and the removal list, and the api's chapter image route test still passes untouched.
- [x] 2.3 Describe the table, the columns, and the keys in `packages/db/AGENTS.md`. Verify: every new name in 2.1
      and 2.2 appears there.

## 3. Resource Images

- [x] 3.1 Write `packages/pipeline/resourceImages/resourceImageCandidates.ts`: the images a page's Markdown shows
      outside any link, in order, as absolute urls, without the ones the name rule drops. Verify:
      `resourceImageCandidates.test.ts` covers a related story's linked image, an author's linked avatar, the name
      rule, a relative url, and the order.
- [x] 3.2 Write `resourceImageFilter.ts`: the type, size, and shape rules, the difference hash through sharp, one
      copy of each picture with the larger kept at the earlier place, and the limit of six with a link preview image
      that the content does not show placed first. Verify: `resourceImageFilter.test.ts` covers each scenario of the
      `resource-images` spec's filter, copy, and limit requirements, with images built by sharp.
- [x] 3.3 Write `fetchResourceImages.ts`: load a Resource's stored images, or fetch them once from its stored
      Markdown and its link preview image (a YouTube video's largest thumbnail first), each fetch through
      `fetchLinkPreviewImage` with an 8 MB limit, stored as a jpeg within 2560 by 1440, then record the fetch. An
      unsafe Resource fetches nothing and loses any stored image. Verify: `fetchResourceImages.test.ts` covers an
      unsafe Resource getting none, a Resource judged unsafe later losing its images, a dead image dropped alone, a
      second load fetching nothing, a Resource with no stored Markdown, a YouTube video, and no request to Firecrawl.
- [x] 3.4 Add `resourceImages/` to `packages/pipeline/AGENTS.md`, to the root `AGENTS.md` module map, and to the Film
      row of the routing table. Verify: `bash scripts/check-structure.sh` and
      `bun scripts/check-package-boundaries.ts` pass.

## 4. The shot plan

- [x] 4.1 Write `packages/pipeline/topicPodcastEpisodeVideo/videoShots.ts` with `toVideoShots`: lengths drawn from a
      hash of the seed, cuts moved to caption breaks, the last shots' shared remainder, the image order, and the
      moves. Verify: `videoShots.test.ts` covers no shot on screen over 8 seconds across 200 seeds and chapter
      lengths from 1 to 420 seconds, no image twice in a row, the loop order, a cut on a caption break, a cut that
      stays with no break near, a break that is passed over, a 6 second and a 9 second chapter, no move twice in a
      row, a mean between 5.5 and 6.5 seconds, and the same shots for the same seed.
- [x] 4.2 Add each image's zoom limit and each move's speed to `videoShots.ts`. Verify: tests cover a 2560 by 1440
      image at 2, a 1200 by 630 image at 1.25, an 800 by 1067 image at 1.48, a zoom that slows to end on its limit,
      and a pan's zoom and travel.

## 5. A chapter's images

- [x] 5.1 Rework `videoChapterImages.ts` to settle each chapter's images in order: its Resource Images, the generated
      images that the distinct image rule needs, then the podcast card, with the film's own image for a chapter left
      with the podcast card alone. Spread a film's limit so every chapter gets its first missing image first, number
      the stored images, bill each draw as today, and return the count drawn. Verify: `videoChapterImages.test.ts`
      covers 120 seconds with three images drawing none, 180 seconds with one drawing four, 45 seconds with none
      drawing one, a chapter with only the generated image and the podcast card, an unsafe Resource, a limit of zero,
      a limit of 3 across three chapters, a second attempt reusing stored images, and the cost added unless the
      platform pays.
- [x] 5.2 Give each further generated image the next of six framings, passed to the scene writer as its framing.
      Verify: a test shows the second draw's framing differs from the first and its scene input is still the title
      and the public relevance explanation alone.
- [x] 5.3 In `packages/server/podcastEpisodeSettings.ts` remove `imaginedChapterImageMinimumSeconds` and raise the
      limit's default to 40. Update `packages/server/AGENTS.md`, `apps/worker/AGENTS.md`, and the README. Verify:
      `bunx knip` passes and a search for `IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS` finds nothing outside
      `openspec/`.

## 6. The film's own image at 2752 by 1536

- [x] 6.1 Confirm Google's price for `gemini-3.1-flash-image` at 2K against its price list, then give
      `renderTopicImage` an optional image size and `TOPIC_IMAGE_COST_DOLLARS` the 2K price. Verify: a test in
      `packages/models` shows the size in the request body and the 2K cost, and the design's $0.101 is corrected if
      the list differs.
- [x] 6.2 Draw a film's own image on that model at 2K, store the original beside the 1280 by 720 poster copy, keep
      the hash and the poster key as they are, read the original for the intro and the sign-off if it exists, and
      delete it with the film and with a replaced image. Verify: `topicPodcastEpisodeVideoImage.test.ts` covers both
      files stored, the cost added, an existing film with no original, and a regenerate storing both.

## 7. The encoder, the parts, and the render

- [x] 7.1 In `videoEncode.ts` add the shot's arguments (its move at a frame offset, the earlier still's 10 frame
      crossfade, the lower third timed in the segment's time, the 7 frame espresso fades at a segment's ends) and the
      intro's and sign-off's zoom curve, and remove the slide. Verify: `videoEncode.test.ts` covers each move's
      expression, a first shot with no crossfade, a lower third only in runs inside the first 8 seconds, fades only
      at a segment's ends, and the curve at 0, 6.6, and 40 seconds, backward for the sign-off, and for a 5 second
      intro.
- [x] 7.2 In `videoParts.ts` render each chapter and each segment where the hosts answer Comments as its shots: the
      stills composed once, one run for each shot, the stills deleted after the segment, and every shot joined into
      the chapters part by stream copy. Verify: the parts' tests cover the run count, the two stills of a run, the
      cleanup, and the podcast card and the film's image taking turns in that segment.
- [x] 7.3 In `renderTopicPodcastEpisodeVideo.ts` write the captions before the chapters part and give the shot plan
      their breaks, the seeds, and the film's own still. Verify: `renderTopicPodcastEpisodeVideo.test.ts` passes
      with the new order.
- [x] 7.4 Extend the fixture render in `topicPodcastEpisodeVideo.test.ts` with a 40 second chapter of three images
      and a chapter with no Resource Image, and keep the film at `FILM_FIXTURE_OUTPUT` if it is set. Verify: the
      test passes with the film's frames equal to its audio's, and the kept film is watched for both chapters: the
      cuts, the moves, the crossfades, the lower third across the first cut, and the fades.

## 8. The render version

- [x] 8.1 Add `TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION` at 2. A first render stores its version. A render of a
      ready film at the version returns skipped. A render of a ready film below it leaves the row ready, uploads under
      versioned keys, and swaps the keys, the size, the length, and the version in one guarded update that sends the
      replaced files to deletion after the grace. Verify: tests cover a current film skipped, the swap, a failed
      re-render leaving the row unchanged with its uploads deleted, and a new film stored at the version.
- [x] 8.2 Make the failure mark and a re-render with missing inputs keep a ready row ready and write
      `failed_render_version`. Verify: `topicPodcastEpisodeVideoRows` tests cover a ready row kept and a rendering
      row marked failed as today.
- [x] 8.3 Give the rebuild's keys the row's version and its swap a check on the chapters key. Verify:
      `rebuildTopicPodcastEpisodeVideo.test.ts` covers a rebuild that loses to a re-render, which swaps
      nothing and leaves its uploads pending deletion.

## 9. The backfill

- [x] 9.1 Extend `listBackfillPodcastEpisodeIds` to page the ready films below the current version after the Topics
      with no film, public Topics first, without a film whose failed version is the current one, and to return the
      films left. Verify: `backfillTopicPodcastEpisodeVideosActivities.test.ts` covers a film at the current version
      left out, a film failed at this version left out, a film failed at an earlier version listed, and a cursor
      with no kind read as a Topic cursor.
- [x] 9.2 Log the counts so far and the films left after each batch, add the generated image count to the summary in
      `packages/contracts/topicPodcastEpisodeVideoWork.ts`, and print it from
      `scripts/backfill-topic-podcast-episode-videos.ts`. Verify: `backfillTopicPodcastEpisodeVideos.test.ts` covers
      a skipped current film, a failed re-render that the backfill moves past, and the progress line, and
      `bun scripts/check-workflow-bundles.ts` passes.
- [x] 9.3 Update the backfill's lines in `apps/worker/AGENTS.md` and the `films:backfill` line of the README.
      Verify: both say the backfill re-renders films below the current render version and logs its progress.

## 10. Integration

- [x] 10.1 Run `bun run check`. Verify: every step is green.
- [x] 10.2 On dev, re-render one real film by calling the render that the activity wraps, since the dev worker runs
      the earlier code, and watch it: one long chapter and one chapter with no Resource Image. Verify: the old film
      played until the swap, the row reads version 2, its Resources have stored images, and the backfill's listing no
      longer names it. The worker's progress line is read in the backfill's workflow test, in Temporal's test
      environment, and in the worker's log after the deploy.
- [x] 10.3 Time one chapter's encode in that render and read its peak memory. Verify: both are within a quarter of
      design decision 5's montage row, or the design is corrected.

## Workflow follow-up

- Ship through `/ship`, and archive with `openspec archive add-chapter-montages --yes`.
- Remove `TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS` from Doppler in dev and prd if it is
  set.
- Rename `TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_LIMIT` to
  `TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT` in Doppler in dev and prd if it is set.
- After the deploy, follow the worker's log for the backfill's progress lines. Leave
  `TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY` at 1, since at 2 one replica can take both renders beside its
  own film.
