## 1. Read the latest Podcast Episode for every topic row

- [x] 1.1 Add `latestPodcastEpisode` to `Topic`, `OwnerTopic`, and `SubscriptionRow` in `shared/contracts.ts`
- [x] 1.2 Narrow `loadLatestPodcastEpisodes` to the topic fields that it reads: the id, name, owner, and visibility
- [x] 1.3 Read the latest Podcast Episodes in `toTopicTableRows`, moved into `api/topic/topicTableRows.ts` so that it
  can import the loader, with the profile page's loader selecting each topic's owner
- [x] 1.4 Pass the viewer to `loadActivity`, `loadTopics`, `loadAdminUserTopics`, and `loadAdminTeamTopics`, and read the
  latest Podcast Episodes for the owned topics and the subscriptions

## 2. Draw the play button in every topic table

- [x] 2.1 Move `TopicNameLink` into `ui/src/components/table/TopicNameLink.tsx` with the play button beside the name, and
  use it in `TopicsTable`, `OwnerTopicsTable`, and `TopicSubscriptionsTable`

## 3. Tests and docs

- [x] 3.1 Test that the table rows include each topic's latest Podcast Episode and leave it null without one
- [x] 3.2 Update `api/AGENTS.md` for the topic table rows module, and the Coffee Break docs page for the tables' play
  buttons
