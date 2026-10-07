## Context

`loadLatestPodcastEpisodes` reads each topic's newest published Podcast Episode, checks the user's access to each topic,
and loads the chapters and the user's progress, in a fixed number of queries for any number of topics. The homepage feed
and the topic page use it, and `LatestPodcastEpisodePlayButton` draws the button and its tooltip. The topic tables read
three row types: `Topic` from `toTopicTableRows` (the profile page, the team page, and the team topics under a team
row), `OwnerTopic` from `loadTopics` (the activity page and the admin console's subtables), and `SubscriptionRow` from
`loadActivity`.

## Goals / Non-Goals

**Goals:**

- The latest Podcast Episode plays from every topic table, with the same tooltip.
- Each table's response stays at a fixed number of queries.

**Non-Goals:**

- The activity page's sent invites table, whose rows are invites.
- A play button for any Podcast Episode but the latest.

## Decisions

**One loader for every table.** `toTopicTableRows`, `loadTopics`, and the subscription rows call
`loadLatestPodcastEpisodes`. Its parameter narrows to the topic fields that it reads, the id, name, owner, and
visibility, so each caller passes the rows that it already has. `api/podcast/helpers.ts` imports
`api/topic/helpers.ts`, so `toTopicTableRows` moves into its own `api/topic/topicTableRows.ts` instead of importing
the loader back.

**The access check reads the viewer.** An invite topic's Podcast Episode is listenable only after the user's
subscription activated, so the loader takes the user viewing the table. `loadActivity` takes the viewer in place of
`isOwnView`, and `loadTopics`, `loadAdminUserTopics`, and `loadAdminTeamTopics` take the viewer too. The activity page
of another user and the admin console are admin only, and an admin passes every check.

**The admin console is included.** Its topic subtables load on expand, one user's or one team's topics at a time, and
the loader adds its fixed set of queries to that one request.

**One topic name cell.** The three tables each drew a topic's link with its update count badge. `TopicNameLink` in
`ui/src/components/table/` draws that cell with the play button beside the name in a flex row, so a name that wraps
in the narrow topic column keeps the button beside it instead of under it.

## Risks / Trade-offs

- [A response carries each listed topic's chapters] → a table of a few dozen topics adds a few dozen chapter lists to
  its payload. The tooltip reads the chapter count, and the player plays the chapters without a second request.

## Migration Plan

No schema change. The new fields go out with the api and the ui in one deploy.
