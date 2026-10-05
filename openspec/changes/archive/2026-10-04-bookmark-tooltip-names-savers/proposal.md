## Why

A Finding's row no longer shows the avatars of the teammates who kept it, so nothing on the row says who on the team
bookmarked it. The bookmark mark's tooltip is the place a user already looks when about to remove a bookmark.

## What Changes

- The bookmark mark's tooltip says "Remove your bookmark", then lists the user and each
  teammate who kept the Finding, in bold beside their avatars, the way the app's other tooltips set a heading over bullets.

## Capabilities

### New Capabilities

### Modified Capabilities

- `finding-bookmarks`: the bookmark mark's tooltip names who bookmarked the Finding

## Impact

- `ui/src/components/topic/TopicResource.tsx`, and `TooltipSection` exported from
  `ui/src/components/common/UpdateCountBadge.tsx` for reuse. The api already returns each Finding's team bookmarks.
