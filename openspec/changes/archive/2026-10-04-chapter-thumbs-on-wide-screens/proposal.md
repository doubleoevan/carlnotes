## Why

On a phone, each chapter row's thumbs take most of the row, and a chapter's title is cut to about twenty characters.
A chapter whose Finding is still in the Topic opens that Finding's note, which already has the same thumbs.

## What Changes

- Chapter thumbs show only from the `sm` breakpoint up. On a phone, a chapter's title takes the row, and its Finding is
  rated from the note that the row opens.
- The Coffee Break docs page tells a phone user to tap a chapter to rate its finding.

## Capabilities

### New Capabilities

### Modified Capabilities

- `podcast-episode-player`: chapter thumbs show on a wide screen only

## Impact

- `ui/src/components/podcast/PodcastEpisodeChapters.tsx` and `docs/src/content/docs/feed/coffee-break.md`.
- A chapter whose Finding was filtered out can be rated on a wide screen only.
