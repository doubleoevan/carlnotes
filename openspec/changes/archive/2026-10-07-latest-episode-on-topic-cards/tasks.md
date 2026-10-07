## 1. The latest episode in the feed

- [x] 1.1 Move `latestPodcastEpisode` from `topicPodcast` to `topicFeed`, and have the topic page, the player, the
  episodes card, and the smoke test read it there
- [x] 1.2 Add `loadLatestPodcastEpisodes`, one `distinct on` read with batched chapter and progress reads that the
  single-episode loader shares
- [x] 1.3 Add `topicSubscriptionStartDates` and `subscriptionActivatedAtByTopicId`, the batched access check, and
  build `subscriptionActivatedAt` on the batched read
- [x] 1.4 Load the latest episodes in the feed's data batch

## 2. The chapter pill everywhere

- [x] 2.1 Add the play icon to the chapter pill, a pause icon while its chapter plays
- [x] 2.2 Give `TopicResource` the latest episode, with `FindingChapterPill` in the row and in its note, and pass a
  chapter's episode to its note
- [x] 2.3 Share `TopicFindingList` between the homepage card and the topic findings section
- [x] 2.4 Share the chapter's play or pause as `togglePodcastEpisodeChapterPlayback` in the player store

## 3. The play button, the roast row, and the controls

- [x] 3.1 Move the episodes card's row into `PodcastEpisodeRow.tsx` and show it in the topic roast popover above Carl's
  Prompt, with no remove button and no hover highlight
- [x] 3.2 Move the player card's details into `PodcastEpisodeDetails.tsx` with a tooltip size, and share `PodcastEpisodeTooltip`
- [x] 3.3 Add `LatestPodcastEpisodePlayButton` to `TopicInfoPopover`, closing the heading's note hint on hover
- [x] 3.4 Share the skip and speed buttons in `PlaybackControlButtons.tsx` with tooltips, and add skip forward to the
  bottom player
- [x] 3.5 Give the bottom player's title the podcast tooltip

## 4. Tests and docs

- [x] 4.1 Test that a visitor gets a public topic's latest episode with its chapters and none from an invite topic
- [x] 4.2 Update the Coffee Break docs page and `ui/AGENTS.md`, and add the moved names to the stale-name list
- [x] 4.3 Move the player store's stateless helpers, `toChapterIndexAt` and the lock screen's media session, into
  `ui/src/lib/podcastEpisodePlayback.ts`, which keeps the store under 400 lines
