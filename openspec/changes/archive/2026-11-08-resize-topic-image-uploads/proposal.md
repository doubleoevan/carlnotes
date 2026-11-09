## Why

On the web, a topic image upload over 10 MB, or a heic or gif, is rejected outright, though most phone photos are one of
those. The avatar picker already shrinks and converts such files, and the mobile picker does too.

## What Changes

- The web topic image picker shrinks a picked photo to at most 2048 pixels on its longest edge and re-encodes it as a
  jpeg or png before it uploads, through the same resizer the avatar picker uses, now shared in
  `apps/web/src/lib/imageResize.ts`.
- The picker offers the avatar picker's types, heic and gif included, under the renamed `PICKED_IMAGE_ACCEPT`.
- A file the browser can't decode shows the unreadable image note. The api's 10 MB and type checks stay.

## Capabilities

### Modified Capabilities

- `topic-images`: the picker shrinks and converts a picked photo instead of rejecting it.

## Impact

- `apps/web/src/lib/imageResize.ts` (new), `apps/web/src/components/avatar/AvatarUpload.tsx`,
  `apps/web/src/components/topic/TopicImageEditor.tsx`, `packages/core/lib/imageUpload.ts`, the avatar pickers in both
  apps, and the Topic and podcast visions docs page.
