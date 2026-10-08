## Why

A free topic gets one Coffee Break episode and then nothing more until its owner removes it. A full episode costs about
$0.53, so an episode after every brew would spend a free user's $3 monthly budget in a few days. A 10-minute episode
costs about $0.19, so a free topic can get a new episode after its brews and keep only the latest one, and its brews
keep half of the budget.

## What Changes

- A free topic's episode runs at most 10 minutes of talk and narrates at most 5 findings. The theme intro and outro
  stay as they are. A paid plan's episode stays at 30 minutes and 15 findings.
- A free topic records a short episode after every brew, and the episode's row is marked short. Publishing it removes
  the topic's earlier short episode, so a free topic keeps only its latest short one. Full episodes that the topic
  published while its owner was on a paid plan stay. The replaced episode keeps its chapter rows, so its findings still
  count as narrated and the next episode does not repeat them.
- A free topic records one episode at a time. A brew that succeeds while the topic's episode is still recording records
  none, and its findings wait for the next episode.
- Episodes pause at 50 percent of a free user's monthly budget instead of 80 percent. Paid plans stay at 80 percent.
- The free plan no longer rejects turning a topic's podcast on, since a free topic never runs out of episodes. The
  `podcastPlan` result of the settings tool, its 402 response, and its toast are removed.
- The edit topic modal's free hint says the free plan keeps each topic's latest 10-minute episode, with the upgrade
  link.
- The plans page's podcast lines read "Short podcast for latest brew only" on the free card and "Full podcasts
  for every brew" on a paid card. The docs describe the 10-minute, latest-only free episode.
- An episode in progress is **recording**, not rendering, matching what the player shows. The `episode_status` value,
  the workflow and its files, the activities, the speech call, the task queue (`episode-recordings`), the setting
  (`PODCAST_RECORDING_CONCURRENCY`), the Langfuse trace (`episode-recording`), and every comment and doc follow. The
  scan workflow's `episode-render-workflow` patch id keeps its string, since it is stored in workflow history.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `podcast-episode-rendering`: a free topic's episode is limited to 10 minutes and 5 findings, replaces the topic's
  earlier short episode, and records one at a time. Episodes pause at 50 percent of a free user's budget. A replaced
  episode keeps its chapters, so its findings count as narrated.
- `podcast-episode-player`: the edit topic modal's podcast switch shows the free plan's short, latest-only episode, and
  the switch is never rejected for the plan.
- `subscription-billing`: the plan cards' podcast lines describe the short, latest-only free episode and the long,
  kept paid ones.
- `authorization`: the gate's `podcastEpisode:render` capability, which allowed a free topic one episode, becomes
  `podcastEpisode:full`, which decides whether a topic gets full episodes or short, latest-only ones.
- `topic-tools`: `updateTopicFields` turns the podcast on for a free topic too, with no plan rejection.
- `domain-schema`: an episode row records whether it was recorded short, and a replaced episode keeps its chapters.

## Impact

- `worker/podcast/planPodcastEpisode.ts`, `podcastEpisodeScript.ts`, `writePodcastEpisodeScript.ts`,
  `generatePodcastEpisodeScript.ts`, `publishPodcastEpisode.ts`, `removePodcastEpisode.ts`, and
  `worker/prompts/outline-podcast-episode.md`, which takes the episode's minute limit as a variable. The prompt is
  synced to dev and prod after the deploy.
- `db/quotas.ts`: the free plan's one-episode check becomes a check for full episodes, and the episode budget share is
  set per plan in `shared/plans.ts`.
- `api/authorization.ts`, `api/podcast/helpers.ts`, `api/podcast/podcastEpisodes.ts`, `api/tool/topicTools.ts`,
  `api/tool/chatTools.ts`, and `shared/contracts.ts`: the `podcastEpisode:render` capability becomes
  `podcastEpisode:full`, and the payload's `canRenderPodcastEpisode` becomes `hasFullPodcastEpisodes`.
- `ui/src/components/topic/EditTopicModal.tsx`, `TopicScanButton.tsx`,
  `ui/src/components/podcast/PodcastEpisodePlayer.tsx`, `ui/src/clients/podcastEpisodeClient.ts`, and
  `ui/src/pages/PlansPage.tsx`.
- `docs/src/content/docs/feed/coffee-break.md`, `feed/editing-a-topic-in-chat.md`, and `account/plans-and-limits.md`.
- The rename: `worker/workflows/recordPodcastEpisode.ts` and `recordPodcastEpisodeActivities.ts` (moved), every podcast
  module that named rendering, `.env.example`, the README, and the AGENTS.md files. Migration 0099 renames the status
  value in place, so no row changes. Workflows running at deploy under the old names fail and are not retried.
- `db/schema.ts` and one generated migration: `episodes.is_short`, a boolean that defaults to false, so every existing
  episode reads as full. A replaced episode keeps the existing `removed` status.
