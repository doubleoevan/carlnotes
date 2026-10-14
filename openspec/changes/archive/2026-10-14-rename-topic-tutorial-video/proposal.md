## Why

The topic tutorial video is called "Brew with Carl" now. Its old name, "A Fresh Brew with Carl", is still on the menu
option, the dialog's title, the hero and header tooltips, and the video's structured data.

## What Changes

- The topic tutorial video's name in `shared/youtube.ts` becomes "Brew with Carl", so every place that reads it shows
  the new name: the menu option, the dialog title "Brew with Carl ☕", the tooltip "Watch Brew with Carl", and the
  VideoObject name.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-profiles`: the menu option, the dialog title, and the header tooltip use the new name.
- `feed-homepage`: the hero tooltip uses the new name.

## Impact

- `shared/youtube.ts`: the `TOPIC_TUTORIAL_VIDEO` name.
