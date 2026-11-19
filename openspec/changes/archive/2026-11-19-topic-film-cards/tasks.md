## 1. API and contracts

- [x] 1.1 Add the optional `topicPodcastEpisodeVideoCards` field to the topic response contract
- [x] 1.2 Build the Topic's film cards, newest first, in `loadTopicPodcast` with `loadPodcastEpisodeCards`, and return
  them on the topic read
- [x] 1.3 Cover the cards in the topic read's tests

## 2. Shared section

- [x] 2.1 Rewrite the shared `TopicVideoSection` as the film cards section with the filming card above the cards and the
  reads while a film renders
- [x] 2.2 Remove `topicVideoSectionStore`, `toTopicPageTopicVideoSection`, the films list's shared pieces, and their
  tests
- [x] 2.3 Add the `topic-videos` dialog surface and remove `visit_episode_videos_page_viewed`

## 3. Web

- [x] 3.1 Adapt the web `TopicVideoSection` to the topic page's collapsible section with the home's card grid
- [x] 3.2 Remove the films list from `PodcastEpisodesCard`, the topic route's film season read, and its stories and
  tests
- [x] 3.3 Update the topic page's skeleton, the section order test, and the web stories

## 4. Mobile

- [x] 4.1 Adapt the mobile `TopicVideoSection` with the mobile card grid
- [x] 4.2 Remove the mobile films list, its stories, and the topic screen's film list placement
- [x] 4.3 Update `apps/mobile/parity.md`

## 5. Docs and checks

- [x] 5.1 Update the AGENTS files, `Layout.mdx`, and the coffee break docs page
- [x] 5.2 Run the preflight gate
