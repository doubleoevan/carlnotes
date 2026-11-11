# Tasks

This change starts from row 62's branch (`topic-podcast-episode-videos`). Groups 1 to 3 run now, in code, unit tests,
and Storybook only, with no api, worker, Temporal, dev database migration, or deploy. Group 4 runs after rows 61 and 62
merge.

## 1. Data and the home

- [x] 1.1 Add `home_order` and `profile_order` to `topicPodcastEpisodeVideos` in `packages/db/schema/podcast.ts`, with
      comments, and add their release to row 62's removal path. Hold `db:generate` for group 4. Verify `bunx tsc -b`
- [x] 1.2 Add `homeTopicPodcastEpisodeVideos` and `newestTopicPodcastEpisodeVideos` to `packages/contracts/home.ts` as
      optional fields, and fill them from the cached query in `apps/api/home/homeRoute.ts` by the fallback and
      seven-day rules. Route tests: picks first, listener fallback one per Topic, seven-day window, private Topics
      excluded. Verify `bun scripts/check-contract-freeze.ts`
- [x] 1.3 `apps/api/podcast/topicPodcastEpisodeVideoHomeOrder.ts`, beside `podcastEpisodeHomeOrder.ts`, through
      `setHomeOrder`, clearing the home caches and sending `episode_video_home_order_change`. Tests for an admin, a
      non-admin, a private Topic, and a film that is not ready

## 2. Shared UI, web, and mobile

- [x] 2.1 Add the `video` variant to the Nightshift card contract and core `PodcastEpisodeCard`, with Watch opening row
      62's `TopicPodcastEpisodeVideoDialog`, on both apps' adapters. Stories for both variants, and verify
      `bun scripts/check-component-parity.ts`. Task 5.3 later replaced Watch with the play button labeled "Play film",
      and task 5.10 put it over the card's image
- [x] 2.2 Insert the two film sections into `HOME_SECTIONS` before `homePodcastEpisodes`, with the casing chosen in the
      design's decision 4. Add `packages/core/lib/sectionOrder.test.ts`, which holds the film-before-podcast pairs and
      asserts every page's list keeps them, including row 62's topic page pair
- [x] 2.3 Add Home films to the podcast episode page's action menu for an admin with a ready film on a public Topic,
      opening the rank dialog with the film list. Component test for who sees it
- [x] 2.4 Mobile home screen: the two sections through the core section, in the same order. Compare against the web at
      phone width in both themes. The device check was skipped at the user's request on 2026-11-10
- [x] 2.5 Send `visit_episode_video_dialog_opened` with the section's `surface` from each Watch, with a test that the
      event holds ids only. Run `stories-preview` for every changed story. The device check was skipped at the user's
      request on 2026-11-10. Task 5.3 later replaced Watch with the play button labeled "Play film", which sends the
      event

## 3. Docs

- [x] 3.1 Add `apps/web/src/nightshift/Layout.mdx` stating the films-above-podcasts rule and its three pairs. Verify it
      renders in Storybook
- [x] 3.2 Add featured film picks (`home_order` and `profile_order` on `topic_podcast_episode_videos`) to the
      domain-model skill's Home Podcast Episode and Topic Podcast Episode Video rows, and sync the Notion table
- [x] 3.3 Add Featured Films and New Films This Week, with the chosen casing, to the Persona & Voice page in Notion

## 4. After rows 61 and 62 merge

- [x] 4.1 Rebase onto main, resolve conflicts, and run `bun run db:generate` so this migration follows rows 61 and 62.
      Read the SQL for the two columns only
- [x] 4.2 Add the `topicPodcastEpisodeVideo` kind to row 61's profile order route, the rank dialog, and
      `social_profile_order_change`, with the limit of 12, conflict, release, and purge tests extended to films
- [x] 4.3 Add Featured Films to the Café payload and section list before Featured Podcasts, on web and mobile, with the
      public-only rule for visitors. Tests for the owner and a visitor, and the `sectionOrder` test covering the Café
- [x] 4.4 Add Featured films to the Café's action menu for the owner on web and mobile. Stories and a test for who sees
      it
- [ ] 4.5 End to end on the dev stack: pin and unpin films on the home and the Café, check the fallbacks, page through
      both, watch from each section, and confirm the PostHog events in a local capture
- [x] 4.6 Run `bun run check` and `scripts/preflight.sh`, all green

## 5. The film card's image and play button, and Featured films on the podcast episode page

- [x] 5.1 `videoPosterUrl` on the podcast episode summary in `packages/contracts/podcast.ts`, optional, filled in
      `apps/api/podcast/podcastEpisodeShapes.ts` from the ready film's image hash the summary read already loads.
      Verify `bun scripts/check-contract-freeze.ts` and `apps/api/queryBudgets.test.ts`
- [x] 5.2 Core `PodcastEpisodeCard`: the video variant shows the film's own image in the card's frame, and the
      podcast episode's image without one. Tests for both, and for the podcast card keeping the podcast episode's
- [x] 5.3 The film card's button is each app's `PodcastEpisodePlayButton` under the label "Play film", through the
      card size of `PodcastEpisodeVideoButton`. `isHighlighted` and the "Watch" label are gone from core and both
      adapters
- [x] 5.4 Core `TopicPodcastEpisodeVideoDialog` takes `shouldPlayOnLoad`, which the film card's button passes: the
      film plays once it loads, and a refused play unloads it back to the poster
- [x] 5.5 "Featured films" right above "Featured podcasts" in the podcast episode page's and screen's action menu, for
      the Topic's owner on a ready film, from `isTopicPodcastEpisodeVideoProfileOrderShown` in core's
      `lib/podcastEpisodeHomeOrder.ts`, opening `ProfileRankDialog` for films. Tests for who sees it
- [x] 5.6 Stories for the film card with the film's image, without one, and its dialog, and the button's `Card` story,
      on both apps. The specs, this design's decision 1, the Coffee Break docs page, the domain-model skill,
      `apps/mobile/parity.md`, and the agent guides
- [x] 5.7 In the browser at 390 and 1280 wide: the home's Featured films card with the film's image in the podcast
      card's frame and the podcast card's round play button, and at 1280 a press opening the dialog with the film
      playing in Chromium
- [ ] 5.8 In the browser as the owner of a public Topic with a film: Featured films right above Featured podcasts on
      the podcast episode page, and its dialog. The dev account does not own the one Topic with a film
- [ ] 5.9 On a device, iOS then Android, and in Safari on an iPhone: the film card's image, its play button, the
      sheet or dialog playing the film or staying on the poster, and Featured films in the podcast episode screen's
      menu for the Topic's owner
- [x] 5.10 The film card's play button sits centered over the card's image at the film player's size, the card's last
      child after the title's link, and the title row holds only the title. The card's test, both apps' stories, the
      spec, this design's decision 1, `apps/mobile/parity.md`, and the agent guides. In the browser at 390 and 1280
      wide: the button centered over the Featured films card's image, a press playing the film in the dialog, and a
      press on the image around it opening the podcast episode's page

## 6. Featured Films on the team page

- [x] 6.1 `topicPodcastEpisodeVideoCards` on the team page payload in `packages/contracts/teams.ts`, optional, filled in
      `apps/api/team/teamPage.ts` from the Topics the reader may open through the Café's film read and the batched
      card read. Tests in `apps/api/team/teamPage.test.ts` for a member, a visitor, and a team with no film. Verify
      `bun scripts/check-contract-freeze.ts`
- [x] 6.2 `TEAM_SECTIONS` in `packages/core/lib/cardSections.ts` gains Featured Films right before Featured Podcasts,
      under the Café's title. `sectionOrder.test.ts` covers the team page's pair, its titles against the Café's, and
      both apps' files
- [x] 6.3 Web `TeamPage.tsx` and mobile `teams/[teamId].tsx` render the section through `PagedCardsSection` over the
      film card, six a page with the count beside the title, hidden with no film
- [x] 6.4 `team-videos` on `TopicPodcastEpisodeVideoDialogSurface` in `packages/contracts/visitAnalytics.ts`, passed
      by both apps' team film cards
- [x] 6.5 No Featured films option on the team page's action menu. A team has no pins of its own, as with its
      podcasts
- [x] 6.6 The spec, this design's team page note, `Layout.mdx`, the Coffee Break and Teaming up docs pages,
      `apps/mobile/parity.md`, and the api and core agent guides
- [x] 6.7 In the browser at 390 and 1280 wide: a team page's Featured Films right before Featured Podcasts with its
      count, and a film card's play button opening the dialog
- [ ] 6.8 On a device, Android then iOS: the team screen's Featured Films section, its card, and the Video sheet
- [x] 6.9 The `public-profiles` delta adds Featured Films to the Café's fixed section order. It modifies a requirement
      that `cafe-brews-news-open-mic-mentions` adds, so that change archives first

## Workflow follow-up

- Row 64 renders these sections in its Café and directory MCP views, with the film card's play button on its playback
  switch.
- Deploy only after rows 61 and 62 are live and the user approves. Archive with
  `openspec archive home-and-profile-topic-podcast-episode-videos --yes` through `/ship`.
