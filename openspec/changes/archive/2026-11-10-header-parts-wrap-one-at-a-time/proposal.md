# A header's parts wrap down one at a time

## Why

The profile page's and the team page's header moved every part below the avatar at once. A screen a little too
narrow for the description dropped the title and the counts with it, which wastes the width the title had.

## What Changes

- Each part of the header drops below the avatar on its own, as the screen narrows: the description first, then the
  counts, then the title.
- The parts sit in one grid, so each takes the whole width once it drops.

## Modified Capabilities

- `public-profiles`: the Café's header wraps its counts down before its name.
- `teams`: the team page's header wraps its description, then its counts, then its name.

## Impact

One grid and four cell classes in `apps/web/src/lib/styleClasses.ts`, read by both headers. The mobile app is
unchanged, since a phone shows every part below the avatar either way.
