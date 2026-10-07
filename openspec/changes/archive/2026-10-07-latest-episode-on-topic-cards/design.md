## Context

The topic page loads its latest episode through `loadTopicPodcast`, one topic at a time. The homepage feed builds every
topic from batched reads keyed by topic id, and its spec holds it to a fixed number of queries however many topics it
loads. An episode is listenable by the same rule as a finding: an invite topic shows a subscriber only what published
after the subscription activated, unless the user is an admin, the owner, or a member of a holding team.

## Goals / Non-Goals

**Goals:**

- Each homepage topic's latest episode, with its chapters, in a fixed number of queries.
- One field for the latest episode on both the feed and the topic page.
- One component for each repeated piece: the episode row, the episode details, the skip buttons, the finding list.

**Non-Goals:**

- Episodes other than the latest on the homepage.
- A speed control in the bottom player.

## Decisions

**One batched read.** `loadLatestPodcastEpisodes` reads each topic's newest published episode in one `distinct on`
query, then reads the chapters and the user's progress for the episodes it keeps, one query each. The newest episode
is the only one to check. An older episode published earlier, so it never passes an activation gate that the newest
one fails. The single-episode loader now calls the same batched chapter and progress reads.

**A batched access check.** `topicSubscriptionStartDates` applies `topicSubscriptionStartDate`'s rule to many topics
with one read each for the user's access, the topics a team of the user holds, and the subscriptions' activation times.
A topic that is not invite-only takes no read at all. `subscriptionActivatedAt` now calls the batched activation read.

**The field moves to the feed.** `latestPodcastEpisode` leaves `topicPodcast` for `topicFeed`, which `topicResponse`
extends, so the topic page and the homepage read the same field and the response holds one copy.

**The pill finds its own chapter.** `TopicResource` takes the topic's latest episode, and `FindingChapterPill` finds the
chapter that narrates the finding. The row and its note render the same pill, and a chapter's note passes its own
episode. The topic page's wrapper row goes away, and the homepage card and the topic findings section share one
`TopicFindingList`.

**The play button lives in the note icon's component.** `TopicInfoPopover` renders the play button before the note
icon, so the homepage card and the topic page heading both get it. Inside the heading, hovering the play button closes
the heading's note hint, the way the chat mention badge already does, so the episode's tooltip shows instead. The
icons keep a 28px tile with a tap area that reaches past it, so they sit close together on a phone too.

**Canonical control labels.** The skip and speed labels follow the podcast apps: "Skip back 15 seconds", "Skip forward
30 seconds", and "Playback speed". Each label is the button's accessible name and its tooltip.

## Risks / Trade-offs

- [The homepage payload grows by each topic's chapters] → about 15 chapters a topic, each a title, a url, and four
  numbers. The pill needs them to play a chapter.
- [`latestPodcastEpisode` moves on the topic response] → the ui and the smoke test move with it in this change. No
  external client reads the field.
