## Why

A topic's latest Podcast Episode plays from its homepage card and its topic page heading, but not from the tables that
list topics: the profile page, the teams page, the team page, the activity page, and the admin console. A user looking
at a list of topics has to open each topic to hear its latest episode.

## What Changes

- Every topic table row shows the play button of the topic's latest Podcast Episode beside the topic's name, with the
  tooltip that the button beside the note icon shows. A topic with no Podcast Episode that the user may listen to shows
  no button.
- The tables: the profile page's topics, the team topics under a team row on the teams page and the profile page, the
  team page's topics, the activity page's topics and subscriptions, and the admin console's user and team topic
  subtables.
- `Topic`, `OwnerTopic`, and `SubscriptionRow` gain `latestPodcastEpisode`, which each response reads for all its topics
  in a fixed number of queries.
- The activity payload and the admin console's topic subtables name the user viewing them, so the Podcast Episode access
  check reads the viewer.
- One `TopicNameLink` component draws a topic's name, its update count badge, and its play button in every topic table.

## Capabilities

### New Capabilities

### Modified Capabilities

- `podcast-episode-player`: the latest Podcast Episode plays from every topic table

## Impact

- `shared/contracts.ts`: `latestPodcastEpisode` on `Topic`, `OwnerTopic`, and `SubscriptionRow`.
- `api/podcast/helpers.ts`: `loadLatestPodcastEpisodes` takes only the topic fields that it reads.
- `api/topic/topicTableRows.ts`: `toTopicTableRows`, moved out of `api/topic/helpers.ts`, reads the latest Podcast
  Episodes. `api/profiles.ts` selects each topic's owner for it.
- `api/activity.ts`, `api/admin.ts`, and `api/team/helpers.ts`: the owned topics and the subscriptions read the latest
  Podcast Episodes as the viewer.
- `ui/src/components/table/`: `TopicNameLink.tsx`, used by `TopicsTable`, `OwnerTopicsTable`, and
  `TopicSubscriptionsTable`.
