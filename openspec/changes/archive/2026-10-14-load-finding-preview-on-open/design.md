## Context

`ResourceInfo` is the content of a finding's note popover. It rendered beside every finding row, and its effect
fetched the row's link preview on mount, whether or not the popover ever opened. The popover's content, by contrast,
mounts only while the popover is open. The chapter list already mounts its note only while open.

## Goals / Non-Goals

**Goals:** no preview requests until a note opens, and a small thumbnail for the video dialog.

**Non-Goals:** caching a preview across opens. The api already stores previews by url, so a reopen is one small read.

## Decisions

- The fetch moves into a `FindingLinkPreview` component rendered inside `PopoverContent`, so it starts when the
  popover opens and stops setting state if it closes. The card shows the existing loading card until the fetch
  settles.
- The thumbnail is converted with `cwebp -q 80` at its full 1672×941 size. Google accepts WebP for a VideoObject
  thumbnail, and the docs symlink follows the new file name.

## Risks / Trade-offs

- An opened note shows the loading card briefly before its preview, where it used to show the card at once.
