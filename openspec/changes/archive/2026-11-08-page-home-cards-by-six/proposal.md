## Why

The home's cards wrap two or three to a row, so a page of five leaves a gap in its last row, while six fills every row
at both widths. Six featured topics and five featured podcast episodes also fill barely one page each.

## What Changes

- Every card section on the home page shows six cards a page instead of five: the featured topics, the featured podcast
  episodes, the new podcast episodes, and Your topics, whose later pages the server returns six at a time.
- The home features up to twelve topics and twelve podcast episodes instead of six and five.

## Capabilities

### Modified Capabilities

- `home-page`: card sections page six at a time, and the featured sections hold up to twelve cards each.

## Impact

- `packages/contracts/home.ts` (`HOME_CARDS_PAGE_SIZE`, which replaces `YOUR_TOPICS_PAGE_SIZE`, and the featured
  counts), `apps/api/home/homeCardIds.ts`, `apps/api/home/homeRoute.ts`, both apps' home pages, the Your topics hook and
  its test, and `apps/api/AGENTS.md`.
