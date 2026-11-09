## 1. Shrink before upload

- [x] 1.1 Move the avatar resizer to `apps/web/src/lib/imageResize.ts` with the longest edge as an argument, and point
  the avatar upload at it
- [x] 1.2 Resize the web topic image pick to 2048 pixels, offer `PICKED_IMAGE_ACCEPT`, and show the unreadable image
  note for a file that doesn't decode
- [x] 1.3 Update the Topic and podcast visions docs page
