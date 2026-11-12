# Tasks

## 1. Free budget

- [x] 1.1 Set `PLANS.free.monthlyBudgetCents` to 200 in `packages/contracts/plans.ts`, and verify the plans tests and
  the admin console's worst-case monthly spend tests pass
- [x] 1.2 Show Free's $2 monthly budget and about 20 scans a month in
  `apps/docs/src/content/docs/account/plans-and-limits.md`

## 2. Full films

- [x] 2.1 Drop the Podcast Episodes cutoff check from `renderTopicPodcastEpisodeVideo.ts` and its failed row for an
  owner past the cutoff, and update the render tests so a render never reads the owner's spend
- [x] 2.2 Drop the per-draw cutoff check from `generatedChapterImages.ts`, and update the chapter image tests so an
  owner past the cutoff still draws every image
- [x] 2.3 Update the film entries in `packages/pipeline/AGENTS.md`

## 3. Verification

- [x] 3.1 Run `bash scripts/preflight.sh` green
