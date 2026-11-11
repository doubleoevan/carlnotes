# Tasks

Until row 61 (`cafe-brews-news-open-mic-mentions`) merges, work in code, unit tests, and Storybook only. Do not start
the api, the worker, or Temporal from this worktree, do not run migrations against the dev database, and do not
deploy. Groups 1 to 8 run now. Group 9 runs after the rebase.

## 1. Renderer foundations

- [x] 1.1 Move the satori and resvg render and its fonts from `apps/api/share/previewImage.ts` into
      `packages/pipeline/cardElementPng.ts`, add Karla from `ui-tests/fonts/`, declare `satori` and `@resvg/resvg-js` in
      `packages/pipeline/package.json`, and repoint `apps/api/share/`. Verify the existing `apps/api/share/*.test.ts`
      pass and `bun scripts/check-package-boundaries.ts` is green
- [x] 1.2 Add `TOPIC_PODCAST_EPISODE_VIDEO_DOLLARS_PER_MINUTE` to `packages/models/budget.ts`, set from the fixture
      render's CPU seconds per film minute and the worker's Northflank price, with the arithmetic in its comment. This
      settles the design's open question
- [x] 1.3 Update `packages/pipeline/AGENTS.md` and `apps/api/AGENTS.md` for the moved modules and the new
      `topicPodcastEpisodeVideo/` folder. Verify `bunx knip` shows no orphaned export

## 2. Schema

- [x] 2.1 In `packages/db/schema/podcast.ts`, add `topicPodcastEpisodeVideos` (`topic_podcast_episode_videos`) with
      the columns in the design, `episode_listens.video_play_count`, and `topicPodcastEpisodeVideoSections`
      (`topic_podcast_episode_video_sections`), each column commented. Do not run `db:generate` yet; group 9 numbers
      the migration after row 61's. Verify with `bunx tsc -b`
- [x] 2.2 Add `loadSpendSince` in `packages/db/quotas.ts` summing the video rows' `cost` by the podcast episode's
      owner, with a test in `packages/db/quotas.test.ts` that stubs the connection pool
- [x] 2.3 Add the object key helpers (`toTopicPodcastEpisodeVideoKeys` and the four part keys) to
      `packages/db/store.ts`, with a key test

## 3. The film render

- [x] 3.1 `packages/pipeline/topicPodcastEpisodeVideo/videoTimeline.ts`: the intro, chapter, and sign-off spans on the
      24 fps grid from the chapter rows and the duration, gaps given to the earlier chapter. Unit test: 15 chapters with
      fractional times add no drift and cover the duration exactly
- [x] 3.2 `videoCaptions.ts`: proportional turn timing, snapping to `silencedetect` pauses within 1.5 seconds, cue
      splitting at two lines of 42 characters and 7 seconds, speaker names on a turn's first cue, cues lifted during the
      lower third's 8 seconds, and the WebVTT writer. Unit tests over a fixture script and fixture pauses. The
      proportional ceiling gets a `ponytail:` comment naming word timestamps as the upgrade
- [x] 3.3 `videoFrames.ts`: the still normalized with sharp, the cover-or-blurred-fill choice, and the lower third,
      intro, and sign-off PNGs from `cardElementPng`. Unit tests on the fill choice. Stories are not needed, since these
      are images, but each PNG is written to `ui-tests/output/` by an opt-in script for a visual check
- [x] 3.4 `videoEncode.ts`: the ffmpeg arguments for a segment (zoom, fill, lower third, espresso fades, the design's
      H.264 settings, video only), the concat join, and the final mux with AAC audio and `mov_text` captions. Argument
      unit tests, plus `topicPodcastEpisodeVideo.test.ts`, the fixture render from the design: ffprobe the duration,
      codecs, size, keyframes at part boundaries, and the captions track. It skips without ffmpeg
- [x] 3.5 `renderTopicPodcastEpisodeVideo.ts`: load the chapter rows and their Resources, and each chapter's image from
      its stored link preview row, or else a direct fetch with `packages/pipeline/linkPreview.ts` that stores no row.
      Fall back to the podcast cover illustration for an unsafe Resource, a missing image, or an unreadable one. Then
      render the three parts on temp files, join, upload, and write the ready row with its cost, all behind the spend
      cutoff check. A failure deletes the uploads, writes the failed row, reports the error, and sends
      `episode_video_render_failed`. Tests stub storage and the database
- [x] 3.6 `rebuildTopicPodcastEpisodeVideo.ts`: render the intro and the sign-off for the current image, join with the
      stored chapters part by stream copy, map audio and captions from the current film, swap the keys in one update,
      schedule the old objects for deletion after the grace, add the cost, and send `episode_video_rebuilt`. The fixture
      test asserts that the chapters part's bytes are unchanged after a rebuild
- [x] 3.7 Deletion: `markPodcastEpisodesRemoved` deletes the film rows and returns their keys, which
      `removePodcastEpisode` and the short podcast episode replacement in `publishPodcastEpisode` record, and
      `loadTopicPodcastEpisodeObjectKeys` (renamed from `loadTopicPodcastEpisodeAudioKeys`) adds them for topic
      delete. Extend the existing removal tests

## 4. Worker

- [x] 4.1 `apps/worker/workflows/renderTopicPodcastEpisodeVideo.ts`: the render and rebuild workflows and activities on
      the `episode-videos` queue, with a 45-minute timeout, 2 attempts, and a heartbeat per chapter
- [x] 4.2 Start the render workflow as an abandoned child at the end of `recordPodcastEpisodeWorkflow`, only if
      `TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY` is above 0. Register its worker in `apps/worker/temporal.ts`. Verify
      `bun scripts/check-workflow-bundles.ts` and a workflow test with the Temporal test environment's time skipping,
      which runs in-process and touches no shared queue
- [x] 4.3 Add `startTopicPodcastEpisodeVideoRebuild` to `packages/pipeline/temporalClient.ts`, ignoring an
      already-started error, with a unit test. Document the queue and setting in `apps/worker/AGENTS.md` and the
      README's Development section

- [x] 4.4 `apps/worker/workflows/backfillTopicPodcastEpisodeVideos.ts` and its activities, modeled on the topic image
      backfill: the listing of each Topic's latest published podcast episode with no film row, public first, paged with
      `continueAsNew`; renders on the `episode-video-backfill` queue at
      `TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY`, platform billed; a failed row for missing inputs; and the
      summary of rendered, skipped, and failed counts, render seconds, and stored bytes. A listing test with the
      connection pool stubbed, and a workflow test in the Temporal test environment
- [x] 4.5 Start the backfill from `apps/worker/temporal.ts` once the workers poll, without waiting, and add
      `startTopicPodcastEpisodeVideoBackfillWorkflow` to `packages/pipeline/temporalClient.ts`. Add
      `scripts/backfill-topic-podcast-episode-videos.ts` and the `films:backfill` root script, and document both in the
      README's Development section and `apps/worker/AGENTS.md`

## 5. API and contracts

- [x] 5.1 Contracts: an optional `video` block (`videoUrl`, `captionsUrl`) on `podcastEpisode`, optional `hasVideo` on
      `podcastEpisodeSummary`, an optional `format` on the listen payload, the section state on the topic payload, and
      the route contracts. Verify `bun scripts/check-contract-freeze.ts` and `bun scripts/check-client-parity.ts`
- [x] 5.2 `GET/HEAD /api/episodes/:id/video.mp4` and `captions.vtt`, mirroring the audio route: access check, play
      token, listener count, `episode_played` with `format`, a 302 to a presigned url or JSON for mobile, and the stale
      check that starts a rebuild. Route tests for access, a stale film, and a podcast episode without a film
- [x] 5.3 The listen route takes `format` and adds to `video_play_count`. Extend `podcastEpisodeListens` tests
- [x] 5.4 `PUT /api/topics/:id/video-section` and the resolved open state in the topic read, with the rule from the
      design. Tests for an unseen film, a saved choice, and a newer film reopening the section
- [x] 5.5 Season reads filter to podcast episodes with a film for the films list. Test with a mix of films and none
- [x] 5.6 The film feed: `/topics/:id/podcast-video.xml`, `/podcast-video-feeds/:token.xml`, and the token file route
      `video.mp4`, sharing `share/podcastFeed.ts` with a format option. Both caches clear on a finished film. Feed
      tests: only films listed, a `video/mp4` enclosure, its own GUID, the same chapters, and one reset changing both
      feeds
- [x] 5.7 Add the client functions in `packages/client`. Verify `bunx tsc -b`

## 6. Shared UI and web

- [x] 6.1 Core store: `format`, the video adapter slot, the switch rule, and pause on unmount. Store unit tests for the
      switch at the same second, pause on unmount, and listen saves with `format`
- [x] 6.2 Nightshift contract and core `TopicPodcastEpisodeVideoPlayer` with its `…Elements` adapter. The web adapter
      wraps `<video>` with the `<track>`, `::cue` styles, fullscreen, and picture-in-picture. Stories for the poster,
      playing, captions off, and no picture-in-picture
- [x] 6.3 `TopicPodcastEpisodeVideoSection` under the topic header with the controlled, saved open state, the Watch
      button on the audio player card, and pills seeking the film. Stories and a component test for the open rule.
      Task 15.1 later removed the Watch button from the audio player card
- [x] 6.4 `PodcastEpisodesCard` video mode for Coffee Break films above Coffee Break podcast episodes, with the row play
      loading Topic Cinema, scrolling, and playing. Stories plus a test that no-script rendering lists every film of the
      season
- [x] 6.5 The inline player on `PodcastEpisodePage` at `#film`, `TopicPodcastEpisodeVideoDialog`, and the Video button
      on the home `PodcastEpisodeCard`. Stories for each. Task 16.6 later removed the Video button from podcast cards
- [x] 6.6 The Subscribe dialog's Films option in core `PodcastFeedDialog` and `usePodcastFeed`. Story and hook test
- [x] 6.7 The browser visit events in `packages/contracts/analyticsEvents.ts` and their sends. Tests assert ids only
- [x] 6.8 Run `stories-preview` for every changed story, and check light and dark themes at phone width

## 7. Mobile

- [x] 7.1 Add `expo-video` with its config plugin (`supportsPictureInPicture`, `supportsBackgroundPlayback`), and the
      mobile video adapter (`staysActiveInBackground`, `showNowPlayingNotification`, subtitle track toggle)
- [x] 7.2 Topic Cinema and Coffee Break films on the topic screen, the inline player on the podcast episode screen, and
      the Video full-screen `Sheet` from podcast cards, all from the core components. On-device stories for each.
      Task 16.6 later removed the Video button from podcast cards, so the sheet opens from a Brews News row, from the
      Topic roast since task 13.4, and from a film card of `home-and-profile-topic-podcast-episode-videos`
- [x] 7.3 Add the platform deviations to `apps/mobile/parity.md`. Verify `bun scripts/check-component-parity.ts`
- [x] 7.4 On the simulator: play a fixture film from a local file, check fullscreen, picture-in-picture, captions,
      locked-phone audio, and that switching to audio returns the lock screen to `expo-audio`. Compare against the web
      at phone width in both themes. The device check was skipped at the user's request on 2026-11-10

## 8. MCP and docs

- [x] 8.1 The "Watch on CarlNotes" link in `McpViewPodcastPlayer` through `openMcpViewLink` to `#film`, with
      `hasVideo` in `mcpViewData.ts`. Add a story and a test host fixture assertion, and verify
      `bun run smoke:mcp-views`
- [x] 8.2 Add `topicPodcastEpisodeVideo` and its section state to the domain-model skill, and sync the Notion domain
      table
- [x] 8.3 Update `apps/docs/src/content/docs/feed/coffee-break.md` for Topic Cinema, Coffee Break films, and the film
      feed
- [x] 8.4 Add the copy to the Persona & Voice page in Notion: Topic Cinema, Coffee Break films, film, Watch, Video,
      Listen, and the sign-off lines
- [x] 8.5 Run `bun run check` without the smoke and database steps, and confirm it is green

## 9. After row 61 merges

- [x] 9.1 Rebase onto main, resolve conflicts, and run `bun run db:generate` so this migration follows row 61's. Read
      the generated SQL for the three schema changes only
- [x] 9.2 Place Topic Cinema and Coffee Break films around row 61's topic page sections, on web and mobile
- [x] 9.3 Add the Video button to row 61's Café Featured Podcasts and Brews News podcast episode rows. Stories for each.
      Task 16.6 later removed the Video button from the Café's podcast cards, and the Brews News row keeps it
- [ ] 9.4 End to end on the dev stack: record a Scan's podcast episode, watch the film render, play it in every
      surface, switch formats, regenerate the podcast episode image and confirm the rebuild, remove it and confirm
      deletion, and fetch both feeds
- [x] 9.5 Run the full `bun run check` and `scripts/preflight.sh`, all green
- [x] 9.6 Render one real podcast episode with `bun run films:backfill` on dev, and note its render time and file size.
      The first film of the dev backfill, a 29 minute 45 second podcast episode, rendered in 6 minutes 35 seconds
      with its own image draw and is 49 MB
- [ ] 9.7 Restart the dev worker and confirm the backfill starts on its own, gives each Topic's latest podcast episode a
      film, leaves older ones without, and that Topic Cinema and Coffee Break films show them. Restart again and confirm
      the backfill finds nothing and ends

## 10. The film's own image

- [x] 10.1 Image path: a `TopicImageFormat` (style prompt, aspect ratio, pixel size) through `renderTopicImageOriginal`
      and `toTopicImageOriginal`, and the `aspectRatio` option on `renderTopicImage`, with 3:2 as the default. Tests
      for the 16:9 request and the center crop to 1280 by 720
- [x] 10.2 Prompt: `packages/models/prompts/topic-podcast-episode-video-image-style.md`, registered in
      `FALLBACK_PROMPT_TEMPLATES`, built by `toTopicImagePrompt` with the style prompt's name, and added to the prompt
      check in `apps/worker/scan.smoke.ts`. A builder test
- [x] 10.3 Storage: `toTopicPodcastEpisodeVideoImageKey` in `packages/db/store.ts`, and the image's key in
      `toTopicPodcastEpisodeVideoKeys` so removing a podcast episode or its Topic deletes it. Key tests
- [x] 10.4 `packages/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage.ts`: the film format, the first
      draw, the scene input for a regeneration, and the replace that swaps the hash, schedules the old file, and starts
      the rebuild. Tests with the pool and the model calls stubbed
- [x] 10.5 The render draws the image before the intro and the sign-off and falls back to the podcast episode image on
      a failed draw. `toShownImage` picks the film's own image first, in the render, the rebuild, and the film route's
      stale check. Tests for the pick and for both rebuild choices
- [x] 10.6 Worker: the film branch in `renderTopicImageActivities.ts`, which reads the scene from the film's podcast
      episode and draws in the film format. Verify `bun scripts/check-workflow-bundles.ts`
- [x] 10.7 API: `topicPodcastEpisodeVideoImagesRoute.ts` with the poster, the regenerate under the shared limit, and
      the upload cropped to the frame. `posterUrl` on the `video` block, the film image's origin and prompt on the page
      for an editor, and `posterUrl` on the render poll. Route tests for the gate, the limit, the crop, and the poster
- [x] 10.8 Contracts and client: the optional fields, the two client functions, and their route contracts, all
      additive. The contract is refrozen with the rest of the change
- [x] 10.9 Shared UI: the `topicPodcastEpisodeVideo` kind of core `TopicImageEditor` with its `ButtonRow` and
      `UploadButton` elements, both apps' adapters, the controls under the film player on the podcast episode page and
      screen, and the poster from `video.posterUrl`. A web story with a play test, and the mobile story. Task 17.1
      later took the controls out of the page, task 17.2 removed `ButtonRow` and `UploadButton`, and tasks 17.4 to 17.6
      put the editor in the Edit film dialog
- [x] 10.10 Specs, this design's decision, the Coffee Break docs page, and the domain-model skill
- [ ] 10.11 After the first real film render: check the drawn image in the intro, the sign-off, and the poster, then
      regenerate and upload from the page on web and on a phone, and confirm the rebuild

## 11. Cinema and podcast sections

- [x] 11.1 Podcast episode page, web: "Coffee Break Cinema" with the film player and the film's image controls, then
      "Coffee Break podcast" with the audio player card, both `CollapsibleSection`s with a closed divider, and no
      Coffee Break Cinema for a podcast episode without a film. The skeleton shows the podcast section. Task 16.7
      later put the podcast's section above the film's, and task 17.1 took the image controls out of the page
- [x] 11.2 Podcast episode screen, mobile: the same two sections from the app's `CollapsibleSection`, and the skeleton
- [x] 11.3 Core `TopicPodcastEpisodeVideoPlayer`: the play button over the film's frame, hidden while the film plays,
      with a press on the frame pausing it, and the control row without the gap. Both apps' frame buttons, labelled
      by the shared play button
- [x] 11.4 Mute in the film player's control row in place of Listen, on both apps, remembered for the session. The
      web's `IconButton` reports `aria-pressed`
- [x] 11.5 Watch on the audio player card in the highlighted button style on both apps. On the podcast episode page it
      opens Coffee Break Cinema, and the web scrolls to it. Task 15.1 later removed the Watch button
- [x] 11.6 Store: `playPodcastEpisodeAudio` and the card's play for the audio, the film's play for the film, each
      stopping the other at the shared second, a play of another podcast episode as audio, and
      `visit_episode_format_switched` for each switch of the loaded podcast episode. Store tests
- [x] 11.7 Web picture-in-picture across pages: one `<video>` element for the app in
      `apps/web/src/stores/topicPodcastEpisodeVideoElement.ts`, moved into a film player's frame by a layout effect and
      back to its hidden host before the frame leaves the document. A window closed away from the player pauses the
      film, and the audio or another film closes the window
- [x] 11.8 Stories for the play button over the poster, playing, paused, muted, and the card's Watch. The Topic Cinema
      test, the section order test for the podcast episode page, `apps/mobile/parity.md`, the agent guides, the Coffee
      Break docs page, and the domain-model skill. Task 15.8 later replaced the card's Watch story with `WithFilm`
- [x] 11.9 In the browser at 390 by 844 and 1280 by 900, light and dark, with a film patched into the page's read: both
      sections open and closed, play and pause by a press on the film, the film and the audio stopping each other,
      Watch, the Video dialog, Topic Cinema, and a film in picture-in-picture across a navigation
- [ ] 11.10 On a phone: the play button over the film, a press on the playing film, Mute, and the two sections on the
      topic screen and the podcast episode screen
- [ ] 11.11 Update the Persona & Voice page in Notion: Coffee Break Cinema, Mute and Unmute, and no Listen
- [ ] 11.12 Once the dev database has films again: the podcast episode page and the topic page with a real film and
      its own poster, and `bun run docs:embed` for the Coffee Break docs page

## 12. Imagined images for long chapters

- [x] 12.1 Settings: `imaginedChapterImageMinimumSeconds` (default 90) and `imaginedChapterImageLimit` (default 4, and
      0 turns imagined images off) in `packages/server/podcastEpisodeSettings.ts`, with parsing tests
- [x] 12.2 Storage: `toTopicPodcastEpisodeVideoChapterImageKey` in `packages/db/store.ts`, and a chapter image key for
      each chapter of a film's podcast episode in `toTopicPodcastEpisodeVideoKeys`, counted from the script in
      `removePodcastEpisode.ts`, so a removal, a short replacement, and a Topic's delete take the images. Key and
      removal tests
- [x] 12.3 One draw: `drawTopicPodcastEpisodeVideoImageOriginal` exported from `topicPodcastEpisodeVideoImage.ts`, the
      film image's scene, house style, format, and two attempts, which the film's own image and the imagined images
      share. No new prompt
- [x] 12.4 `packages/pipeline/topicPodcastEpisodeVideo/videoChapterStills.ts`: `prepareChapterFrames` settles each long
      chapter's still, picks the longest chapters with a safe Resource and no link preview image up to the limit, and
      returns the chapter frame load. `loadChapterLinkPreviewStillPng` in `topicPodcastEpisodeVideoInputs.ts` returns
      null where the podcast card showed
- [x] 12.5 The draw of one imagined image: the scene from the Finding's title and public relevance explanation alone,
      the image moderation before the store, the cost on the film row unless the platform pays, and the stored jpeg a
      second attempt reuses. Every failure leaves the podcast card and is reported
- [x] 12.6 The render calls `prepareChapterFrames` before the chapters part, on the owner's key or the master key for
      the backfill, and its `onProgress` heartbeats after each settled still and each encoded chapter
- [x] 12.7 Tests in `videoChapterStills.test.ts`: the pick by the minimum seconds, the length, the limit, an unsafe
      Resource, and a link preview image; the scene writer's inputs; each fallback; the reused image; and the
      backfill's key
- [x] 12.8 Specs, this design's decision, the Coffee Break docs page, the domain-model skill, and the agent guides
- [x] 12.9 Two real draws on dev through `loadImaginedChapterStillPngs`, on the platform's key: each took under 20
      seconds, passed the image moderation, and stored a 1280 by 720 jpeg that a second call reused
- [ ] 12.10 After the first real film render with a long chapter that has no link preview image: check the imagined
      image and its slow zoom in the film, the podcast card on a short chapter, and the film row's cost

## 13. The film in the topic info popup

- [x] 13.1 `TopicPodcastEpisodeVideoInfoSection` in `packages/core/components/`: the section labeled
      `TOPIC_PODCAST_EPISODE_VIDEO_NAME` ("Coffee Break film", beside `FILMS_NAME` in
      `packages/contracts/podcastEpisodes.ts`), only for a latest podcast episode with a ready film, from the `video`
      the topic payloads already include. No payload field is added
- [x] 13.2 The row: core's `PodcastEpisodeRow` takes a `playButton` in its play button's place, so the film's row
      keeps the row's title link and its date, length, and latest line
- [x] 13.3 The poster's play button: the `thumbnail` size of core's `PodcastEpisodeVideoButton` with a `posterUrl`,
      drawn by both apps' adapters as the 16:9 poster with the 3px corner under the film player's round play button.
      `toPodcastEpisodePosterUrl` in `packages/core/lib/podcastEpisodePlayback.ts` is the poster the film player and
      the thumbnail share
- [x] 13.4 The press opens the Video dialog on web and the Video sheet on mobile and reports
      `visit_episode_video_dialog_opened` with the new `topic-info` value of `TopicPodcastEpisodeVideoDialogSurface`
- [x] 13.5 Web and mobile `TopicInfo` render the section right above the podcast's, in the popover and the sheet only
- [x] 13.6 Stories: `WithPodcast` and `WithFilm` in the web's `TopicInfo.stories.tsx`, and `WithFilm` beside
      `WithPodcast` in the mobile's
- [x] 13.7 Tests: `TopicPodcastEpisodeVideoInfoSection.test.tsx` for the ready film only, the poster, and the
      `topic-info` value, and `TopicInfo.test.tsx` for the film's row above the podcast's on the page the server
      renders
- [x] 13.8 The spec's requirement, `apps/mobile/parity.md`, and the agent guides of core, web, and mobile
- [x] 13.9 In the browser at 390 by 844 and 1280 by 900, light and dark, on a topic with a real film: the part above
      the podcast's, the dialog over the open popover, the film playing, and the close returning focus to the play
      button. A topic with no film shows no part
- [ ] 13.10 On a device, iOS then Android: the part in the Topic roast sheet, the Video sheet over that sheet, and
      the close returning to the Topic roast sheet

## 14. The film player's card and early controls

- [x] 14.1 Core `TopicPodcastEpisodeVideoPlayer`: `isCard` draws each app's `Card` element, in its podcast player
      card's style, around the film's frame, the seek bar, the control row, and the player's children. Core
      `TopicPodcastEpisodeVideoSection` passes it for Topic Cinema, and the Video dialog and sheet leave it out. Task
      17.1 later removed the player's `children`
- [x] 14.2 The podcast episode page and screen pass `isCard`, with the film's image controls as the player's children,
      so they sit inside the card under the control row. Task 17.1 later took the image controls out of the card and
      removed the `children` prop
- [x] 14.3 The skips and the speed show before the film is loaded: the player always renders its `Controls` element,
      which takes `onSkip` and `onSpeedPress`, and both apps' `SkipPlaybackButtons` and `PlaybackSpeedButton` take
      the press in place of the loaded podcast episode's
- [x] 14.4 Store: `skipTopicPodcastEpisodeVideoBy` starts a film that is not loaded a skip away from its start
      position, and `cycleTopicPodcastEpisodeVideoPlaybackRate` steps the speed and starts it. Each acts as before on
      a loaded film. `toPodcastEpisodeStartSeconds` is the start position that every load shares. Store tests for
      the three presses before load
- [x] 14.5 The web scans core's `PlaybackControlButtons.tsx` for its classes, so the speed is 44 by 44 on a phone as
      the skips are
- [x] 14.6 The film's image controls: `TopicPodcastEpisodeVideoPromptRow` in core's `TopicImageEditor` puts the image
      prompt, Regenerate, and Upload on one line from the web's `sm` breakpoint, and keeps the image prompt on its
      own line below it and in the mobile app, whose image editors have no wide layout. Upload has no icon on either
      app. Task 17.2 later removed the prompt row and the Upload button for the standard layout
- [x] 14.7 Stories: the player's `Poster` with the early controls, `Card`, `StartedBySkipForward`, and
      `StartedBySpeed` on the web, `Card` on mobile, and the image editor's film stories with the one-line row and
      `TopicPodcastEpisodeVideoOnPhone`. The Topic Cinema test checks the card and the early controls. Task 17.7 later
      replaced the image editor's film stories with the standard layout's
- [x] 14.8 The spec's two new requirements and the image controls requirement, this design's decisions,
      `apps/mobile/parity.md`, and core's agent guide
- [x] 14.9 In the browser at 390 by 844 and 1280 by 900, light and dark, on a topic with a real film: the card on the
      topic page and the podcast episode page, the three controls before any play, a press on each from a fresh load
      starting the film, the image controls on one line at 1280 and on two at 390, and the Video dialog without a card
- [ ] 14.10 On a device, iOS then Android: the card on the topic screen and the podcast episode screen, the three
      controls before any play and a press on each, the image controls inside the card with Upload without an icon,
      and the Video sheet without a card

## 15. No Watch in the podcast card, and the theme song credits beside the section titles

- [x] 15.1 Core `PodcastEpisodePlayerCard` has no `WatchButton` element and no `onWatch`, and both apps' adapters
      drop the button. The film's own play and early controls, and the card's play, still give the source to each
      other at the shared second
- [x] 15.2 Store: `watchPodcastEpisode` and `watchInTopicPodcastEpisodeVideoSection` are gone, and
      `playInTopicPodcastEpisodeVideoSection` holds the show and scroll request itself. `PodcastEpisodeFormat`, the
      store's format, and `visit_episode_format_switched` stay. The store tests switch formats through the film's play
- [x] 15.3 The podcast episode page and screen no longer hold the film section's open state, which only Watch
      changed. Both sections open on every visit
- [x] 15.4 `PodcastThemeSongNote` on both apps: the Lucide `Headphones` in the note's raised tile, in the 28px icon
      button on the web and with a hit slop on mobile, labeled "Theme song credits", with no class of its own
- [x] 15.5 The credits leave the podcast episode page's header and the title in the player card, on both apps, with
      the nudge and the wrappers that only served them
- [x] 15.6 The credits are the `titleNote` of the film section and the podcast section on the topic page and the
      podcast episode page, on both apps, outside the section's toggle. The mobile `CollapsibleSection` puts a title
      note right after the title, with the aside and the count at the far right, as the web's does
- [x] 15.7 The topic page's film section reads "Coffee Break Cinema" from
      `TOPIC_PODCAST_EPISODE_VIDEO_SECTION_TITLE` in core's `podcastEpisodeCopy.ts`, the podcast episode page's
      constant under its new name
- [x] 15.8 Stories: `BesideSectionTitle` for the credits on both apps, with a play test on the web, and `WithFilm`
      of the player card without Watch. Tests: the section's title and the credits outside the toggle, no credits
      beside the card's title, the six files that show the credits, and the store's format switches
- [x] 15.9 The player spec's requirements, the `podcast-episode-pages` delta, this design's decision, the proposal,
      the Coffee Break docs page, the domain-model skill, `apps/mobile/parity.md`, and the agent guides
- [x] 15.10 In the browser at 390 by 844 and 1280 by 900, light and dark, on a topic with a real film and on its
      podcast episode page: no Watch in the card, the headphones right after both section titles and nowhere else,
      a press opening the credits without toggling the section, the title still toggling it, the film's play and the
      card's play taking over from each other at the same second, and one headphones on a topic with no film
- [ ] 15.11 On a device, iOS then Android: the headphones right after both section titles on the topic screen and
      the podcast episode screen, its sheet, a long title with the note at the largest text size, the mention badge
      right after the comment section's title, and no Watch in the card
- [ ] 15.12 Update the Persona & Voice page in Notion, which still says Topic Cinema: the topic page's film section
      is Coffee Break Cinema, and the player card has no Watch
- [ ] 15.13 Run `bun run docs:embed` for the Coffee Break docs page

## 16. The picture-in-picture window's return button

- [x] 16.1 `apps/web/src/stores/topicPodcastEpisodeVideoElement.ts`: once the window closes on a page with no film
      player, a film that still plays names its podcast episode for the layout, and a paused one goes back to the
      audio. A film that goes back into picture-in-picture clears the name
- [x] 16.2 `ReturnedTopicPodcastEpisodeVideoDialog` in the layout shows the named podcast episode's film in the
      Video dialog, and closing it clears the name
- [x] 16.3 A film player that takes the film element back in the same commit keeps the film playing, so the dialog
      and a remount do not pause it
- [x] 16.4 In Chromium: return on the home page opens the dialog with the film playing on, the dialog's
      picture-in-picture control sends it back, and closing the dialog pauses it
- [x] 16.7 Put the podcast's section above the film's section on the podcast episode page, on both apps, with the
      section order test
- [x] 16.6 Drop the Video button from the podcast card on the home, the Café, and a team, with its three analytics
      values, its props, its stories, and its test. The Brews News row keeps its Video pill
- [ ] 16.5 In Safari on an iPhone: the window's return button opens the dialog and its close button does not, since
      both send the page the same event and the film's paused state tells them apart

## 17. Edit film in the action menu

- [x] 17.1 The film card on the podcast episode page and screen holds the film, its seek bar, and its controls alone.
      The core player's `children` prop is gone
- [x] 17.2 Core `TopicImageEditor`: the film kind in the standard layout, with no Upload button, button row, or wide
      prompt row in core or either adapter, and the `aspectRatio` of the `Image` element, 16:9 for a film
- [x] 17.3 `toTopicPodcastEpisodeVideoImageUrls` in `packages/contracts/topicImages.ts`: the film's image in the block
      from the poster, or the podcast episode's image until the film has its own, and the render's and the upload's
      poster replacing it
- [x] 17.4 `EditImageDialog` on both apps titled "Edit film" for a film, with the "Image" label and the close button
      alone
- [x] 17.5 "Edit film" with the `Clapperboard` icon right above "Edit podcast" in the podcast episode page's and
      screen's action menu, from `isTopicPodcastEpisodeVideoEditShown` and each app's
      `toEditTopicPodcastEpisodeVideoOption`
- [x] 17.6 "Edit film" right after "Share topic" in the topic page's and screen's action menu, for the Topic's latest
      film, from `toTopicPageEditedPodcastEpisode`, with `useTopicPodcastEpisodeVideoEditableImage` reading the podcast
      episode's page for the dialog
- [x] 17.7 Stories: the image editor's film stories in the standard layout on both apps. Tests:
      `podcastEpisodeEditor.test.ts` for who sees the option and the image the block opens with, and
      `TopicActions.test.tsx` for the option's place in the topic page's menu
- [x] 17.8 The image controls requirement, the card requirement, the autoplay requirement, this design's decision,
      the Coffee Break docs page, the domain-model skill, `apps/mobile/parity.md`, and the agent guides of core, web,
      and mobile
- [x] 17.9 In the browser at 1280 by 900 in light and 390 by 844 in dark, on a topic with a real film: no image
      controls in the film card, "Edit film" in both menus, the dialog measured against the Edit podcast dialog, the
      file picker from a press on the image, one real regeneration with the pulsing image and the "Dreaming" line, the
      finished render with its poll stubbed, and no option on a topic with no film
- [ ] 17.10 With the Temporal worker running: a real regeneration through to the new image in the dialog and as the
      film player's poster, and the rebuilt intro and sign-off. The check's one real regeneration stayed pending,
      since no worker ran
- [ ] 17.11 On a device, iOS then Android: "Edit film" in both menus, the sheet with the film's image at 16:9 under
      the camera badge, the picker, a regeneration, and the new poster on the screen
- [ ] 17.12 Run `bun run docs:embed` for the Coffee Break docs page

## 18. Chapters with a preview image slide in

- [x] 18.1 `videoTimeline.ts`: `SEGMENT_SLIDE_SECONDS`, 0.9 seconds, beside the fades' length
- [x] 18.2 `videoEncode.ts`: `slideDirection` on `VideoSegmentEncode`. A sliding segment's graph has an espresso
      `color` source, the zoomed still overlaid at a position that is one back ease of `t`, the lower third over
      that, and the fade out alone. A short chapter's slide takes half its length at most
- [x] 18.3 `toSlideDirection` in `videoEncode.ts`: left, right, top, or bottom from the first byte of a SHA-256 of
      the podcast episode's id and the chapter's position, with no `Math.random()`
- [x] 18.4 `videoChapterStills.ts`: `isLinkPreviewImage` on the chapter frame, true for the Finding's link preview
      image alone. `videoParts.ts` gives those chapters their direction, and the intro and the sign-off none
- [x] 18.5 Tests: `videoEncode.test.ts` for the sliding graph, each edge's start and resting place, the overshoot,
      the short chapter, the unchanged fading graph, and the stable direction, `videoChapterStills.test.ts` for the
      still that is marked, and the fixture film with two sliding chapters
- [x] 18.6 A sample of four 8-second chapters, one from each edge, at `.playwright-mcp/film-slide-in-preview.mp4`
      with its frames at `.playwright-mcp/film-slide-in-frames.jpg`: the first frame all espresso, and every frame
      after the slide the same picture as a fading chapter's
- [x] 18.7 The fade requirement, the slide requirement, and this design's transitions decision
- [ ] 18.8 After the next real film render: watch a chapter with a link preview image slide in and settle, the
      chapter after it, and a chapter with the podcast card fade in

## 19. Fixes from the verification

- [x] 19.1 A render skipped for its owner's spent budget writes a failed film row with the reason `spend-cutoff`, as a
      podcast episode missing its inputs does, so the backfill's listing leaves it out and never renders it on the
      platform's bill. Tests: the skip's row in `renderTopicPodcastEpisodeVideo.test.ts`, and the listing's film join
      without a status in `backfillTopicPodcastEpisodeVideosActivities.test.ts`
- [x] 19.2 The film route's stale rebuild checks the spend cutoff of the podcast episode's owner, read with the ready
      film's files, as the render and the rebuild do. Route tests with an owner who is not the Topic's
- [x] 19.3 `renderTopicImageActivities.test.ts`: a film's image drawn from an editor's image prompt is still sent in
      the film house style, and a topic's is sent without it
- [x] 19.4 Specs: a film that ends plays nothing after it, the control row's two groups, every `surface` value of
      `visit_episode_video_dialog_opened`, the "Watch on CarlNotes" link, and the mobile film surfaces. The proposal,
      this design, and the Coffee Break docs page say what the app does

## 20. The podcast card while the hosts answer hot takes

- [x] 20.1 `videoHotTakes.ts`: `toHotTakesStartSeconds` returns where the hosts turn to hot takes in each chapter, from
      the script, the usernames of the hot takes it read, and the captions' turn times. `loadHotTakesStartSeconds`
      reads the usernames. `isUsernameSpoken` is exported from `podcastEpisodeScript.ts`
- [x] 20.2 `videoTimeline.ts`: a `hot-takes` segment after a chapter's own, and `HOT_TAKES_MINIMUM_SECONDS`, 4
      seconds, under which the chapter keeps its image
- [x] 20.3 `videoParts.ts` encodes the segment from the podcast card with a "Hot takes" lower third, a fade in, and a
      fade out. `videoEncode.ts` gives it a chapter's zoom and lower third fade
- [x] 20.4 `videoCaptions.ts`: a caption sits above the hot takes' lower third too, and the turn times are exported
- [x] 20.5 Tests: the timeline's cut and its minimum, and the start of a chapter's hot takes and of the closing ones
- [x] 20.6 The rendering requirement and this design's transitions decision
- [ ] 20.7 After the next real film render of a podcast episode that read a hot take: watch the cut to the podcast
      card, its lower third, and the sign-off after it

## 21. A chapter's tooltip on the film's seek bar

- [x] 21.1 `GET /api/topic-podcast-episode-video-images/:podcastEpisodeId/chapters/:position/image.jpg` in
      `topicPodcastEpisodeVideoImagesRoute.ts` serves a chapter's imagined image through `serveImageFile`, the
      poster's gate and cache headers, and is not found for a chapter with none and for a podcast episode with no
      ready film. `toTopicPodcastEpisodeVideoChapterImageUrl` in `contracts/topicImages.ts` builds its path from the
      podcast episode's id and the chapter's position, so the podcast episode payload is unchanged
- [x] 21.2 `topicPodcastEpisodeVideoChapterImages.ts` on the web lists the images a chapter's tooltip tries, in the
      film's order: the Finding's link preview image from the existing link preview read, the imagined image, and the
      podcast card from `/podcast-cover-placeholder.jpg`
- [x] 21.3 `TopicPodcastEpisodeVideoChapterTooltip.tsx`: the tooltip primitive with the title in the heading style, two
      lines at most, over a 16:9 frame 240 pixels wide with the 3px corner. The image loads once the tooltip shows,
      the podcast card shows the band the film cuts, and a chapter whose every image fails shows the title alone
- [x] 21.4 The web's `PodcastEpisodeSeekBar` takes `hasChapterTooltips`, which the film player sets. The frame around
      the bar reads the hovered segment from the pointer on the seek control, shows the tooltip after the primitive's
      delay, and moves it at once to the next segment. A hover never seeks, and the audio player card's bar is as it
      was
- [x] 21.5 Stories: the link preview image, the podcast card, a long title, and no image
- [x] 21.6 Tests: which images a chapter gets, and the route's file, cache headers, view gate, and not-found cases
- [x] 21.7 `apps/mobile/parity.md` records the tooltip as a platform difference, since a phone has no hover
- [x] 21.8 The player spec's requirement, and a browser check on the topic page at 1280x900, light and dark: the
      first, a middle, and the last segment show the title over the link preview image, the podcast card, and the
      imagined image, the tooltip stays inside a 520 pixel window, a hover leaves the position alone, and a press
      seeks. The podcast episode page and the Video dialog show the same tooltip, above the dialog
- [ ] 21.9 Open the four stories in Storybook, which was not running for this change
- [x] 21.10 The image's frame shows the loading note until the image loads. Checked on the topic page with each image
      held for four seconds, then with none held: three chapters each end on their image with the note gone

## 22. Fixes from the performance and security audits

- [x] 22.1 `runFfmpeg` takes an abort signal, and every film ffmpeg run passes one and its own time limit. A
      segment's encode gets a minute plus twelve times its length
- [x] 22.2 The render and the rebuild heartbeat every 30 seconds, pass the attempt's cancellation down, and upload
      nothing once cancelled. A render gets four hours an attempt and 3 attempts, which the backfill reads from the
      render workflow's one set of options. This replaces 4.1's 45 minutes, 2 attempts, and heartbeat per chapter
- [x] 22.3 Caption text escapes `&`, `<`, and `>` in the WebVTT file
- [x] 22.4 The podcast card still is composed once per worker process, and a segment's still and lower third are
      deleted once it is encoded
- [x] 22.5 A chapter's imagined image is cached for an hour at its url, which names no version
- [x] 22.6 `PUT /api/topics/:id/video-section` returns 404 unless its `podcastEpisodeId` is a published podcast
      episode of that topic
- [x] 22.7 A stale film's spend check and rebuild start run at most once a minute for each podcast episode, on a
      rate limit slot that every replica shares

## 23. The filming card while a film renders

- [x] 23.1 The podcast episode payload has an optional `isVideoRendering` beside `video`, true only while the film
      row's status is `rendering`. `loadTopicPodcastEpisodeVideos` reads the ready and the rendering film rows in the
      one read that read the ready rows, so the topic page sends no new query, and `contracts/0.1.0.json` is frozen
      again with the field
- [x] 23.2 Core's `UnpublishedPodcastEpisodeCard` draws the recording, failed, and film rendering states in one
      frame. `isVideoRendering` picks the line, each app's `ProgressLine` element draws it after its hidden emoji, and
      both lines' words live in `lib/podcastEpisodeCopy.ts`
- [x] 23.3 `toTopicPodcastEpisodeVideoDisplay` decides between the film player, the rendering card, and nothing, and
      `toTopicPagePodcastEpisodeVideoSection` gives a Topic with no ready film an open section on its latest podcast
      episode while that film renders. A Topic with a ready film keeps that film's section
- [x] 23.4 Topic Cinema shows the card through its `RenderingCard` element, and the podcast episode page and screen
      show it in Coffee Break Cinema, on web and mobile
- [x] 23.5 `useTopicPodcastEpisodeVideoRenderingPoll` reads the page again every 30 seconds while it shows the card,
      on `lib/limitedPoll.ts`, which the Topic Post discussion poll now shares: paused in the background and offline,
      one read at a time, for at most four hours. A failed poll read keeps the topic page shown
- [x] 23.6 Stories for the rendering state beside both apps' card and film section stories, tests for the display
      logic, the poll, the web section, and the api's flag, and the Coffee Break docs page, the workspace guides, and
      `apps/mobile/parity.md`
- [ ] 23.7 Compare the filming card on the topic screen and the podcast episode screen with the web on a device, and
      on the web with a film row that is rendering

## Workflow follow-up

- Deploy only after row 61 is pushed and merged, and after the user approves. Set
  `TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY` and size the worker's ephemeral disk first.
- `TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS` (default 90) and
  `TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_LIMIT` (default 4) need no value. Set the limit to 0 to turn
  imagined images off.
- After the prod deploy, watch the first automatic backfill run and confirm scans are not slowed.
- Run `bun run prompts:sync` for dev and `prompts:sync:prd` after the deploy, so the registry serves the film image
  house style.
- Archive with `openspec archive topic-podcast-episode-videos --yes` through `/ship`.
- [x] 9.8 Run `bun run docs:embed` for the Coffee Break docs page, since it writes the shared database
