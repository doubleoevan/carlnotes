## Why

The Specials map rolled any city with fewer than ten people into its country, so most places never showed. The map
should show every place where someone visited or played, as finely as Cloudflare reports it.

## What Changes

- The api reads Cloudflare's `cf-postal-code` and `cf-metro-code` headers, and the daily counts store both as part of
  the place, so two postal codes in one city count apart.
- The ten-person city minimum and its rollup into the country are removed. Every place gets its own pin with any
  number of people.
- A pin sits at Cloudflare's coordinates, else at its country's center. Pins at one spot in one city share a pin
  titled by the city. A pin's title never shows the postal code.
- The privacy page, the Specials docs page, and the agent guides describe places down to the postal code.

## Capabilities

### New Capabilities

### Modified Capabilities

- `daily-view-and-play-counts`: the place includes the postal and metro codes, and every place shows as its own pin.
- `specials-dashboards`: the map pins each place down to the postal code.

## Impact

- `apps/api/requestPlace.ts`, `packages/contracts/dashboards.ts`, `packages/db/schema/dailyCounts.ts` with a
  migration, `packages/db/dailyCountBuffer.ts`
- `apps/worker/dashboards/`, `packages/core/lib/dashboardMapPins.ts`
- `apps/web/src/pages/PrivacyPage.tsx`, `apps/docs/src/content/docs/account/specials.md`
