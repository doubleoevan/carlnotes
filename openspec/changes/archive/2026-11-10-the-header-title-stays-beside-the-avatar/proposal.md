# A header's title stays beside the avatar

## Why

The title dropped below the avatar on a phone, which left the avatar alone on a line and pushed everything down.
The title belongs beside the avatar at every width, and it wraps to a second line where it must.

## What Changes

- The profile page's and the team page's title stays beside the avatar at every width.
- The counts and the description still drop below the avatar one at a time, the description first.

## Modified Capabilities

- `public-profiles`: the Café's name never drops below the avatar.
- `teams`: the team page's heading never drops below the avatar.

## Impact

One cell class in `apps/web/src/lib/styleClasses.ts`.
