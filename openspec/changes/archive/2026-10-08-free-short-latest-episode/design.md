## Context

A free topic renders one Coffee Break episode and then none until its owner removes it. `canRenderPodcastEpisode` in
`db/quotas.ts` enforces that by counting the topic's recording and published episodes. The api's
`podcastEpisode:render` capability delegates to it, and so do the settings tool's rejection, the edit topic modal's
hint, the brew button, and the player's recording state.

Prod numbers from the last 30 days: a published episode averages $0.53 and 28 minutes, about $0.019 an audio minute. A
successful brew averages $0.116. Eight free users brewed, 12 times each on average and 23 at most. A free user's budget
is $3 a month, and episodes pause once spend reaches 80 percent of it.

Episode length is set by the outline, which aims for close to `MAX_PODCAST_EPISODE_MINUTES` (30) and covers every
finding it is given, up to `MAX_PODCAST_EPISODE_FINDINGS` (15). Ten findings already run about 25 minutes, so the
length comes from the minute limit, not the finding count.

## Goals / Non-Goals

**Goals:**

- A free topic gets a 10-minute episode after every brew and keeps only the latest one.
- A free user's brews keep half of the monthly budget.
- Paid plans behave exactly as they do today.

**Non-Goals:**

- Shorter theme music for short episodes. The intro and outro stay as they are.
- Per-plan episode lengths beyond free and paid. Plus and premium stay identical.
- A record of whether the owner or the app removed an episode.

## Decisions

**One gate value decides the kind of episode.** `canRenderPodcastEpisode(topic)` becomes
`hasFullPodcastEpisodes(ownerId)`: true for an admin or a paid plan. It drops the episode count query. The api's
capability becomes `podcastEpisode:full`, and the payload's `canRenderPodcastEpisode` becomes
`hasFullPodcastEpisodes`. Alternative: per-plan `podcastEpisodeMinutes` and `isEveryPodcastEpisodeKept` fields in
`PLANS`. Rejected because plus and premium would repeat the same values, and the admin override still needs code.

**The budget share is per plan.** `PLANS` gets `podcastEpisodeBudgetShare`: 0.5 on free, 0.8 on plus and premium.
`isPodcastEpisodeBudgetShareExhausted` reads it for the billed user. The share follows the billed user, while the
episode's length follows the owner, matching how the two checks already split.

**The length limits are shared constants.** `shared/podcastEpisodes.ts` gets `FULL_PODCAST_EPISODE_MINUTES = 30` and
`SHORT_PODCAST_EPISODE_MINUTES = 10`, since the plans page and the edit modal print them. `MAX_PODCAST_EPISODE_MINUTES`
in `worker/podcast/podcastEpisodeScript.ts` is replaced by the full constant, and the eval that imports it follows.
`planPodcastEpisode.ts` renames `MAX_PODCAST_EPISODE_FINDINGS` to `FULL_PODCAST_EPISODE_FINDINGS = 15` and adds
`SHORT_PODCAST_EPISODE_FINDINGS = 5`, about two minutes a finding.

**The episode row records `isShort`.** A new `episodes.is_short` boolean defaults to false. `planPodcastEpisode`
reads the gate once, picks the findings for that kind, and creates the row with the flag. The outline call reads the
flag from the row for its minute limit, and the publish reads it from the row it already loads, so the workflow and its
activity inputs do not change. A recording already in flight at deploy has a row that defaults to false, so it stays
full. Alternative: carry the flag in the plan through the workflow. Rejected because the publish needs to know which of
the topic's earlier episodes were short, and only a column can say that.

**The outline prompt takes `{{maxMinutes}}`.** `outline-podcast-episode.md` goes to version 4, replaces its three
hardcoded 30s with the variable, and drops the worked examples that only fit 30 minutes. `buildOutlinePrompt` passes it
as a trusted value, and `checkPodcastEpisodeOutline` rejects a plan over it. The segment and hosts prompts name no
length and stay as they are.

**A replaced episode reuses the `removed` status and keeps its chapters.** Every reader that hides a removed episode
already checks `status === "removed"` or reads published rows only: the episode page, the feeds, the cover route, the
episode lists, and the newest-episode lookup. A new `replaced` status would need an update to each of those checks.
Chapter rows are the record of what was narrated, so keeping them is what keeps the findings narrated. A chapter's
rating still counts in rescoring, the way it does on a published episode.

**The replacement happens in the publish transaction, and only to short episodes.** For a short episode,
`savePodcastEpisodeAsPublished` marks the topic's other published short episodes removed, clears their script and
audio fields, and deletes their listens in the same transaction that publishes the new one, so the topic never shows
two short episodes or none. Full episodes that the topic published while its owner was on a paid plan are never
replaced, so an owner who moves to free keeps that archive. After the commit, the replaced episodes' audio objects
are deleted. A failed delete is reported and not thrown, since the publish already committed. The marking and listen
deletion are shared with `removePodcastEpisode`, which also deletes the chapters.

**A free topic records one short episode at a time.** `planPodcastEpisode` skips a short episode if the topic already
has a recording short one. This is the old count query narrowed to recording short episodes. It prevents two short
recordings racing to replace each other and paying twice.

**The podcast plan rejection goes away.** A free topic never runs out of episodes, so the `podcastPlan` result of
`updateTopicFields`, the route's 402, the client's `planRejected`, and the modal's toast are deleted. The brew button
and the player stop checking the capability, since an enabled podcast always records.

**An episode in progress is recording.** The player already says "Carl and Vienna are recording", and the code now
matches it. `episode_status`'s `rendering` value is renamed in place with `ALTER TYPE ... RENAME VALUE`, which keeps
every row. The generated drop-and-recreate was replaced, since its cast fails on a row still recording. The workflow
type, its files, the task queue, the concurrency setting, and the Langfuse trace name are renamed too: the app is not
launched, so no running workflow has to survive the deploy. The `patched("episode-render-workflow")` id is the one
exception. It is stored in every scan workflow's history, and renaming it would break a scan that replays. A feed's
rendered XML, a cover image, an email, and a React component still render, since those are a different word.

## Risks / Trade-offs

- [A free user still uses the budget fast] → At about $0.19 an episode plus $0.116 a brew, episodes pause at $1.50.
  The average free user gets about 5 episodes and loses no brews. The heaviest gets about 5 episodes and about 18 brews,
  where today they get 23. "After every brew" holds until the share is reached, as it does on paid plans.
- [A brew during a free recording gets no episode] → A scheduled recording waits on the flex tier for up to six hours.
  That brew's findings are unnarrated, so the next episode picks them first.
- [The registry serves the old outline prompt] → Until `prompts:sync`, the registry's version names no
  `{{maxMinutes}}`, so the prompt loader uses the bundled version 4 and logs that it did. The smoke run showed it.
- [A listener mid-episode loses the audio] → The replaced episode's audio url responds as missing, the same as for a
  removed episode.
- [A podcast episode is recording at deploy] → Its workflow type and task queue no longer exist, so it stops and its
  row stays `recording`. A row from before the deploy has `is_short` false, so it never blocks a short episode, but
  its topic page shows it recording until a later episode publishes. Right before the deploy, count prod's episodes in
  `rendering`, and deploy at zero. Any row left in progress after the deploy is marked `failed` with one update, so
  its page offers Brew to try again.

## Migration Plan

1. Deploy. The deploy runs the generated migration that adds `episodes.is_short`, defaulting to false.
2. Run `bun run prompts:sync` and `bun run prompts:sync:prd` for the outline prompt's version 4. Until then the
   prompt loader uses the bundled version 4, since the registry's version names other variables.
3. A free topic's existing episode was recorded full, so it is never replaced. The topic's first short episode
   publishes beside it, and each later short one replaces the short one before it.

Rollback: first run `ALTER TYPE episode_status RENAME VALUE 'recording' TO 'rendering'` and
`ALTER TABLE episodes ALTER COLUMN status SET DEFAULT 'rendering'`, since the reverted code reads and writes
`rendering`. Then revert the code. `episodes.is_short` can stay, since nothing else reads it. A replaced episode stays
removed, and its audio is already gone.
