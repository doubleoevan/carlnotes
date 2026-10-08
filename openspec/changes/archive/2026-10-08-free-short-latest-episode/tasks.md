## 1. Plan limits and the gate

- [x] 1.1 Add `FULL_PODCAST_EPISODE_MINUTES = 30` and `SHORT_PODCAST_EPISODE_MINUTES = 10` to
  `shared/podcastEpisodes.ts`, and replace `MAX_PODCAST_EPISODE_MINUTES` in `worker/podcast/podcastEpisodeScript.ts`
  and `evals/podcast-episode-script/podcastEpisodeScriptEval.ts` with the full constant
- [x] 1.2 Add `podcastEpisodeBudgetShare` to each plan in `shared/plans.ts` (0.5 free, 0.8 plus and premium), and read
  it in `isPodcastEpisodeBudgetShareExhausted` in place of `PODCAST_EPISODE_BUDGET_SHARE`
- [x] 1.3 Replace `canRenderPodcastEpisode(topic)` in `db/quotas.ts` with `hasFullPodcastEpisodes(ownerId)`: true for an
  admin or a paid plan, with no episode count. Update `db/quotas.test.ts`
- [x] 1.4 Rename the `podcastEpisode:render` capability to `podcastEpisode:full` in `api/authorization.ts`, delegating
  to `hasFullPodcastEpisodes`

## 2. Short episodes in the worker

- [x] 2.1 Add `isShort` to `podcastEpisodes` in `db/schema.ts` as `is_short`, a boolean that is not null and defaults
  to false, then run `bun run db:generate`
- [x] 2.2 In `planPodcastEpisode.ts`, read `hasFullPodcastEpisodes` for the topic's owner, skip a short episode while
  the topic has a recording short one, pick at most `SHORT_PODCAST_EPISODE_FINDINGS = 5` findings for a short episode,
  and create the row with `isShort`. Cover the five-finding pick in `planPodcastEpisode.test.ts`
- [x] 2.3 Read the row's `isShort` in the outline call for its minute limit, with no change to the workflow or its
  activity inputs. Give `checkPodcastEpisodeOutline` and `toCheckedPodcastEpisodeOutline` the episode's minute limit,
  and cover a 14-minute short outline's rejection message in `podcastEpisodeScript.test.ts`
- [x] 2.4 Add `{{maxMinutes}}` to `worker/prompts/outline-podcast-episode.md` (version 4, updated 2026-10-07) in place
  of its hardcoded 30s and the examples that only fit 30, and pass it from `buildOutlinePrompt` as a trusted value

## 3. Replacing a free topic's earlier short episode

- [x] 3.1 Split the row marking and listen deletion out of `removePodcastEpisode` so a replacement can share them and
  keep the chapters
- [x] 3.2 In `savePodcastEpisodeAsPublished`, for a short episode, remove the topic's other published short episodes in
  the same transaction, keeping their chapters and leaving every full episode published. After the commit, delete their
  audio and report a failed delete without throwing
- [x] 3.3 Check that a replaced episode is gone from the episode page, the feeds, the cover route, the episode lists,
  and the newest-episode lookup, and that its findings stay narrated for the next plan

## 4. The api and the ui

- [x] 4.1 Remove the `podcastPlan` result from `updateTopicFields` in `api/tool/topicTools.ts`, its texts in
  `api/tool/chatTools.ts` and `chatTools.test.ts`, and the 402 in `api/podcast/podcastEpisodes.ts`
- [x] 4.2 Rename the payload's `canRenderPodcastEpisode` to `hasFullPodcastEpisodes` in `shared/contracts.ts` and
  `api/podcast/helpers.ts`
- [x] 4.3 In `EditTopicModal.tsx`, show "The free plan keeps each topic's latest 10-minute episode" and the upgrade link
  "Upgrade for 30-minute episodes, every one kept" if the topic lacks full episodes, and remove the plan rejection's
  toast. Remove `planRejected` from `ui/src/clients/podcastEpisodeClient.ts`, and update `EditTopicModal.test.tsx`
- [x] 4.4 Drop the capability check from `TopicScanButton.tsx` and `PodcastEpisodePlayer.tsx`, so an enabled podcast
  alone predicts an episode
- [x] 4.5 Change the plan cards' podcast lines in `PlansPage.tsx` to "Short podcast for latest brew only" on the
  free card and "Full podcasts for every brew" on a paid card

## 5. Docs and smoke tests

- [x] 5.1 Update `docs/src/content/docs/feed/coffee-break.md`, `feed/editing-a-topic-in-chat.md`, and
  `account/plans-and-limits.md` for the short, latest-only free episode
- [x] 5.2 Update `api/podcast/podcastEpisodes.smoke.ts` and `worker/podcast/podcastEpisode.smoke.ts` for the removed
  plan rejection and the renamed payload field
- [x] 5.3 Update `worker/AGENTS.md`, `api/AGENTS.md`, and `db/AGENTS.md` where they name the old check or capability,
  and add the old names to the stale-name list in `.agents/commands/audit-structure.md`
- [x] 5.4 Run `bun run check`

## 6. Rendering becomes recording

- [x] 6.1 Rename the `rendering` status to `recording` in `shared/enums.ts` and the contracts, and write migration 0099
  as `ALTER TYPE episode_status RENAME VALUE 'rendering' TO 'recording'`
- [x] 6.2 Move `worker/workflows/renderPodcastEpisode.ts` and its activities to `recordPodcastEpisode.ts` and
  `recordPodcastEpisodeActivities.ts`, and rename the workflow, the activities, the speech call, the task queue, the
  setting, and the Langfuse trace, keeping the `episode-render-workflow` patch id
- [x] 6.3 Reword every comment, log line, test name, doc, and spec delta where render meant recording an episode
- [x] 6.4 Add the old names to the stale-name list, and run `bun run check` and both podcast smoke tests
