# Proposal

## Why

The line Carl writes above the news and an updates list is called an opener, which says where it sits and not what it
is. It recaps the user's unread Findings, so the product and the code call it a recap.

## What Changes

- Customer copy says **AI recap**, and code says `updatesRecap`: `readUpdatesRecap`, `useUpdatesRecap`, the
  `updates-recap` prompt and eval, and the `recap` field of the updates list and the MCP view.
- `GET /api/updates/recap` returns `{ recap }`, and an admin's `GET /api/profiles/:userId/recap` replaces the profile's
  opener route. `GET /api/updates/opener` stays and returns `{ opener }` for the 0.1.0 mobile app.
- The day's stored line moves to a key named for the recap, so each user's first visit after the deploy writes one new
  recap that day.
- The `updates_requested` event keeps its `hasOpener` property, so its history in PostHog stays whole.
- The prompt's and graders' model-facing text keeps its words, so the model writes the same line.

## Capabilities

### New Capabilities

### Modified Capabilities

- `updates`: the recap's requirements take the new name, the new route, and the 0.1.0 route.
- `home-page`, `mcp-server`, `mcp-views`, `project-docs`, `public-profiles`: their text says recap.

## Impact

- `apps/api/topic/updatesRecap.ts`, `packages/pipeline/updatesRecap.ts`, `packages/core/hooks/useUpdatesRecap.ts`,
  `packages/models/prompts/updates-recap.md`, and `evals/updates-recap/` replace their opener names.
- `packages/contracts/topicRouteContracts.ts` keeps `updatesClient.fetchUpdatesOpener` for the frozen 0.1.0 contract.
- After the deploy, `bun run prompts:sync:prd` creates the `updates-recap` prompt in the registry. Until then the
  bundled template writes the recap.
