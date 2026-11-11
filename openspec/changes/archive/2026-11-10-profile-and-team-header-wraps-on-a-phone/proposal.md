# Profile and team headers wrap on a phone

## Why

On a phone the avatar sits beside the name, which leaves the name and the counts about 280 pixels of a 390 pixel
screen. A team's title wraps to two lines and its counts break mid-line, so the header reads cramped.

## What Changes

- The profile page's and the team page's header keeps the name, the summary line, and the description beside the
  avatar on a wide screen, and drops them below it at phone width, where they take the whole width.
- The mobile app's two headers always place them below the avatar, which is what the web does at that width.

## Modified Capabilities

- `public-profiles`: the Café's header places its name below the avatar at phone width.
- `teams`: the team page's header does the same.

## Impact

Two class lists on the web and two on mobile. No payload, route, or copy changes.
