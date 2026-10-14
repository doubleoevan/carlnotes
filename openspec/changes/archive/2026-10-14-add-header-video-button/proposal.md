## Why

A signed-in user never sees the hero, so the video's button beside its headline never reaches them. The header's
wordmark is on every page they open.

## What Changes

- A signed-in user's header shows YouTube's play button right after the "CarlNotes" wordmark, which opens the video's
  dialog, the same button the hero shows a visitor.
- A play from that dialog reports `header` as its opener.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-profiles`: a signed-in user's header opens the topic tutorial video beside the wordmark.
- `monitoring-analytics`: the play event's openers gain `header`.

## Impact

- `ui/src/components/layout/Header.tsx`: the button beside the wordmark.
- `ui/src/components/topic/TopicTutorialVideoDialog.tsx`: the `header` opener.
