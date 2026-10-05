## Context

Each topic Finding includes `teamBookmarks`, the active members of the owning team who bookmarked it, and that list can
include the user. The row's bookmark mark shows only for the user's own bookmark.

## Goals / Non-Goals

**Goals:**
- Say who kept a Finding without bringing the row's avatars back.

**Non-Goals:**
- No mark for a Finding that only a teammate bookmarked.

## Decisions

- The user is listed first by username, read from the session, and left out of the teammates that follow.
- The tooltip reuses `TooltipSection` and `TooltipLabel`, so it matches the update badge's tooltip. A tooltip line can
  take a marker, and the bookmark tooltip passes each person's avatar, which takes the place of the bullet.

## Risks / Trade-offs

- A touch screen has no hover, so a tap removes the bookmark without the tooltip, as before.
