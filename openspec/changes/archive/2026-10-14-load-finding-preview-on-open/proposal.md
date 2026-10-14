## Why

Every finding row requested its link preview when the row rendered, so a homepage with a few hundred findings sent a
few hundred preview requests on load, each one able to fetch a third-party page. Over the dev server's six
connections, they blocked every request queued behind them, so the topic tutorial video's thumbnail took seven seconds
to show. The video's thumbnail was also a 1.7 MB PNG.

## What Changes

- A finding's note popover requests its link preview when it opens, never when its row renders.
- The topic tutorial video's thumbnail is a 73 KB WebP in place of the 1.7 MB PNG, for the app and the docs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `link-previews`: the finding popup requests its preview when it opens.

## Impact

- `ui/src/components/topic/ResourceInfo.tsx`: the preview fetch moves into `FindingLinkPreview`, inside the popover's
  content, which mounts only while the popover is open.
- `shared/youtube.ts`, `ui/public/topic-tutorial-video-thumbnail.webp`, `docs/public/topic-tutorial-video-thumbnail.webp`:
  the WebP thumbnail and its docs symlink, in place of the PNG.
