# Proposal

## Why

A free account that uses CarlNotes spends its whole monthly budget. Its daily Scans pace themselves to whatever the
budget leaves. So each active free account costs about its budget, and lowering the budget lowers that cost by the same
amount. In the last 30 days the median free account spent $0.83, and one spent $3.64.

Films can come out incomplete. A render checks the Podcast Episodes cutoff before it starts and again before each
generated image. The Podcast Episode's own cost often pushes its owner past that cutoff, so the film either never
renders or stops drawing its images partway. A public film that other people watch then shows a few images for a whole
chapter.

## What Changes

- **The free plan's monthly budget drops from $3 to $2.** Every cutoff share stays the same. The plans page, the
  account page's spend meter, the admin console's estimated monthly spend and cutoff table, and the Plans and limits
  docs page all read the new budget. An existing key takes the $2 budget the next time it is replaced, at the monthly
  reset.
- **A recorded Podcast Episode's film renders in full.** The Podcast Episodes cutoff is checked once, when the Podcast
  Episode is planned. A first render and its generated images no longer check it, so a Podcast Episode that records
  always gets its whole film, billed to its owner. A rebuild for a new image still checks the cutoff. A rebuild that
  the cutoff stops leaves the complete film that plays now.

## Capabilities

### Modified Capabilities

- `monthly-budget-cutoffs`: the free plan's budget is $2, and a recorded Podcast Episode's film is never stopped by the
  Podcast Episodes cutoff.
- `topic-podcast-episode-video-rendering`: a first render and its generated images do not check the owner's spend
  cutoff.
- `admin-console`: the estimated monthly spend and the cutoff table's examples follow the $2 budget.
- `subscription-billing`: a plan card lists its coffee fund beside its scan estimate, and the paid-price requirement
  no longer says Free never changes.

## Impact

- **Contracts:** `packages/contracts/plans.ts` sets `PLANS.free.monthlyBudgetCents` to 200.
- **Pipeline:** `renderTopicPodcastEpisodeVideo.ts` and `generatedChapterImages.ts` drop their spend cutoff checks.
  `rebuildTopicPodcastEpisodeVideo.ts` keeps its check.
- **Docs:** the Plans and limits page shows a $2 monthly budget and about 20 scans a month on Free.
- **Out of scope:** an upgrade prompt when Podcast Episodes pause, and the cutoff shares themselves.
