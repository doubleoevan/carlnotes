# Tasks

The iOS simulator runs only in part on this machine, which has little memory to spare. Each "verify in the simulator"
or "on device" check below that it could not reach is done instead in three ways:

- `bun test` against the shared logic and the mobile adapters' pure parts
- `bunx tsc -b`
- a review of the stories' source against the web reference

The device step itself goes on the checklist in 9.4 for the user to run, and the report names it as unverified.

## 1. Shared attachment types and rules

- [x] 1.1 Create the shared attachment types in contracts and switch the web and the pipeline to them.
  - Add `packages/contracts/attachmentTypes.ts` with the chat and Topic accept lists (as arrays),
    `TEXT_FILE_SUFFIXES`, `VIDEO_FILE_TYPES`, `DOCUMENT_FILE_TYPES`, `DOCUMENT_FILE_SUFFIXES`, and
    `TOPIC_ATTACHMENT_MAX_BYTES`.
  - Point `apps/web/src/lib/utils.ts` (`CHAT_FILE_PICKER_ACCEPT`, `FILE_PICKER_ACCEPT`) and
    `packages/pipeline/attach.ts`, which drops its `MAX_ATTACHMENT_BYTES`, at it.
  - Verify: `useChatAttachments.test.ts` still passes its accept-list assertions, and
    `bun scripts/check-package-boundaries.ts` passes.
- [x] 1.2 Add `packages/core/lib/chatAttachmentRules.ts`: kind from type and name, the per-kind limit and its label,
  the estimated data-URL length from a byte size, and the web's rejection lines word for word. Verify with
  `chatAttachmentRules.test.ts`, which covers each kind, a misreported CSV or DOCX resolved by its extension, the
  estimate at each limit's edge, and the exact message strings.
- [x] 1.3 Move the portable body of `useChatAttachments` into `packages/core/hooks/useChatAttachments.ts` (design
  decision 1).
  - Inputs: the `toSource` and `notify` adapters, plus a room mode that always sends `keep: false`.
  - Behavior: the four-per-question limit, keep counting against `CHAT_ATTACHMENT_KEEP_LIMIT`, `removeKeptAttachment`
    only after `sendDeleteKeptAttachment` resolves, and `clearDraft`.
  - Verify with core tests: a fifth file is rejected, the twenty-first kept file is read but not kept, a rejected
    kept delete leaves the item, room mode never keeps, and the size check runs before the source's read.
- [x] 1.4 Make the web's `useChatAttachments.ts` a thin wrapper that binds `FileReader`, `file.text()`, and `sonner`.
  The web `ChatRoomComposer.tsx` reads through the shared `toAttachment`. It keeps its own pending state, because it
  clears only the files a post sent and reads a selection in parallel. Moving it to the core hook would change that
  web behavior. Verify that the existing web chat tests pass unchanged, and that a new web integration test attaches
  real `File` objects (image, oversized image, fifth file, room mode, kept delete) with the same lines as before.
- [x] 1.5 Update `packages/core/AGENTS.md` and `packages/contracts/AGENTS.md` with the new modules. Verify that each
  new file path appears in its workspace guide.

## 2. Shared image resize rule

- [x] 2.1 Rename `packages/core/lib/avatarUpload.ts` to `imageUpload.ts`. Add `MAX_ATTACHMENT_IMAGE_PIXELS = 2048`
  and the pure `toResizedImage`, which returns the target size and PNG for transparent types or JPEG otherwise.
  Update every importer in both apps. Verify with `imageUpload.test.ts` (landscape, portrait, already small, PNG, WebP,
  GIF, HEIC, JPEG) and `bunx tsc -b`.
- [x] 2.2 Route the web avatar resize (`apps/web/src/components/avatar/AvatarUpload.tsx`) through `toResizedImage`
  with `MAX_AVATAR_PIXELS`. Verify that the existing avatar upload tests pass with the same output dimensions and
  formats.

## 3. Native picker menu and adapters

- [x] 3.1 Update the `expo-image-picker` plugin in `apps/mobile/app.config.ts` with the new `photosPermission` and
  `cameraPermission` strings and `microphonePermission: false` (design decision 9). Verify that
  `bunx expo config --type introspect` shows the iOS usage strings and the Android `CAMERA` permission.
- [x] 3.2 Add `apps/mobile/src/components/common/FilePickerMenu.tsx` and `useFilePicker`.
  - Behavior: the Files, Photo library, and Take photo action sheet; Files opens directly when images are not
    accepted; the camera takes photos only; permission requests run only after their source is picked; a denial
    message has Open Settings; cancel adds nothing.
  - Verify in the simulator: each source returns a `PickedFile`, cancel leaves state unchanged, and a denied camera
    shows the settings message.
- [x] 3.3 Add the mobile image resize adapter. It runs `toResizedImage` through `expo-image-manipulator` into one
  cache folder, rejects an undecodable image with "That image couldn't be read. Try a JPEG or PNG.", and empties that
  folder at app start. Verify on a device that a camera photo becomes a JPEG of at most 2048 pixels with no EXIF, and
  that a transparent PNG stays transparent.
- [x] 3.4 Add the mobile file read adapter and `apps/mobile/src/components/chat/useChatAttachments.ts`. The adapter
  builds data URLs with `File(uri).base64()`, reads text with `.text()`, and shows messages with the native toast.
  Guard every pick, resize, and read by the starting account and delete cached files on send, remove, unmount, and
  sign-out (design decision 8). Verify with pure tests for the account guard, and a simulator check that signing out
  mid-resize leaves the next composer empty.
- [x] 3.5 Add React Native stories for `FilePickerMenu`: images accepted, Files only, the permission-denied message,
  and an upload error. Each story names its web reference (the file input). Verify that the stories render in the
  on-device Storybook in both palettes.
- [x] 3.6 Update `apps/mobile/AGENTS.md`: the picker menu, its sources, its permissions, resizing, and cache cleanup.
  Replace the lines that limit pickers to Topic files and avatars. Verify that the guide names `FilePickerMenu` and no
  longer says attachments are deferred.

## 4. Attachments in the mobile composers

- [x] 4.1 Give the mobile `ChatComposer` an attach button and removable chips with name, kind icon, and remove. Pass
  `attachmentState` from `PrivateChatPanel` into core `useTopicChat`. Verify in the simulator: a question with a PDF
  and a photo sends both, the history shows both chips, and a rejected turn shows the web's words with Retry.
- [x] 4.2 Add the private Topic chat's kept-files control: list, download through `toChatAttachmentUrl` to the system
  preview, and delete through the core hook. Leave it out of rooms and new-topic chat. Verify in the simulator: a kept
  delete removes the file only after the server accepts, and the room on the same Topic shows no kept files.
- [x] 4.3 Give `ChatRoomComposer` attachments in room mode. Wire `ChatRoomPanel`'s `onAttachmentDelete` to
  `sendDeleteChatRoomAttachment` with the web's permission rule, and open room files through
  `toChatRoomAttachmentUrl`. Verify in the simulator: a posted photo shows for another member, a rejected post keeps
  text, reply, and chips, and a member deletes only their own file.
- [x] 4.4 Add stories for the private and room composer chip states: empty, two chips, four long names at the largest
  text size, a rejection, upload progress, and the kept-files list. Verify the stories against the web composer at
  375 pixels in both palettes.
- [x] 4.5 Update `apps/mobile/parity.md`: delete the four chat-attachment entries, and change
  `topicClient.uploadTopicAttachment` to `web-only` with the reason in design decision 11. Verify that
  `bun scripts/check-client-parity.ts` passes.

## 5. New-topic chat on mobile

- [x] 5.1 Move `useNewTopicDraft` into `packages/core/hooks/` with generic files and the `openTopic`,
  `uploadAttachment`, and `notify` adapters. Keep the web wrapper's behavior. Verify with core tests (team preset, reset
  keeps the team, a created Topic uploads each file once, a rejected upload notifies "<name> didn't attach. <reason>")
  and that the existing web new-topic tests pass.
- [x] 5.2 Move `ChatTopicLimitNotice` into core with an optional plans link element. The web passes its link and
  mobile passes none. Verify that the web snapshot or test is unchanged and that the mobile story shows no link.
- [x] 5.3 Make `chatNavigation` keep a new-topic `ChatId`, use the web's new-topic default for a person with no room
  and no page Topic or Team, and add the selector's "Give Carl a topic. You know the one." row. Verify with updated
  `chatNavigation.test.ts` cases.
- [x] 5.4 Have `PrivateChatPanel` run the new-topic chat. It passes `draftState` and `attachmentState`, shows the
  placeholders for a first and a later Topic, shows the draft card with its files or the limit notice, and replaces
  the "available on the web" alert with the real `openNewTopicChat`. Its Clear asks first and drops the draft, the
  files, and their cached copies. Verify in the simulator against a dev api:
  - draft fill
  - a non-agreeing reply creates nothing
  - agreement opens the new Topic and its files land as Topic attachments
  - a quota rejection keeps the draft without a plans link
  - Clear, both cancelled and confirmed
  - a stopped creating reply keeps the conversation
- [x] 5.5 Add the empty-Feed welcome: the chat opens itself once per launch for a signed-in person with an empty Feed.
  Remove the AGENTS.md line about the empty Feed linking back to Topics. Verify in the simulator: a fresh account sees
  the chat once, and an invited account does not.
- [x] 5.6 Add stories for the new-topic panel: empty first Topic, filled draft with files, loading draft, limit notice,
  and created. Each names its web counterpart. Verify in both palettes and at the largest text size.

## 6. Chat or form, and the invitation

- [x] 6.1 Move `TopicEditorChoiceDialog` into core `TopicEditorChoice` with `Dialog` and `Button` elements. The web
  keeps its classes. Verify that the existing web `TopicEditorChoiceDialog` tests pass.
- [x] 6.2 Render the choice in the mobile bottom sheet:
  - Mobile `useNewTopicDialog` (`TopicHomeActions`, `PageActionMenu`, the Team screen) opens it, and a Team presets
    the form and the draft. `EditTeamModal`'s New topic row opens the form directly, as on the web.
  - `TopicPageActions` Edit topic opens it, and "Edit with Carl" opens the private Topic chat.
  - Verify in the simulator: each entry, and that Do it myself opens the existing form unchanged.
- [x] 6.3 Make `toNativeChatMarkdown` link the invitation to `NEW_TOPIC_CHAT_HREF`, and render that exact href in
  mobile `ChatMarkdown` as an action that opens the new-topic chat. Every other href goes through `isSafeHref`.
  Replace the plain-text test with tests for these cases:
  - the phrase links
  - `#other` stays inert
  - `javascript:` stays inert
  - a chunk split mid-link stays inert
  Verify with `bun test packages/core`.
- [x] 6.4 Add stories for the choice sheet (new, new from a Team, edit) and update the `ChatMarkdown`
  `NewTopicInvitation` story to show the action. Verify on device.

## 7. Topic attachment editor and avatars

- [x] 7.1 Replace `pickTopicAttachments` with the picker menu, using the shared Topic accept list and
  `TOPIC_ATTACHMENT_MAX_BYTES` checked before upload. Resize images from the library and camera. Keep context editing
  and removal as they are. Verify in the simulator: a camera photo and a document upload, and an oversized file is
  rejected before upload with the form intact.
- [x] 7.2 Route the user avatar (after its overlay tap), the Team avatar on the Team screen, and `EditTeamModal`
  through the picker menu: Photo library, Take photo, and Files limited to images. Use the 512-pixel rule, and keep
  the existing multipart routes. Verify in the simulator: each source updates the avatar, and a transparent PNG stays
  transparent.
- [x] 7.3 Add stories for the Topic attachment editor (pending files, an upload error, context open) and for the
  avatar pickers (overlay shown, upload error). Verify on device in both palettes.

## 8. Provider photo consent

- [x] 8.1 Delete `toSignupAvatarSource` in `apps/api/auth.ts` and stop writing `avatarSource` at sign-up, so the
  column default `generated` applies. Update its test to assert that an OAuth sign-up with a photo stores `generated`
  and that `toPublishedAvatarFromUser` publishes no photo for it. Verify with `bun test apps/api`.

## 9. Docs and integration

- [x] 9.1 Update the user docs: `feed/chat.md` (attachments and kept files in the app), `feed/making-a-topic-in-chat.md`
  (the app's new-topic chat and the chat-or-form choice), `topics/attachments.md` (photo and camera choices),
  `teams/group-chat.md` (room files), and `get-the-app.md`. Wrap prose at 120 characters, then run `bun run docs:embed`.
  Verify that `bun run build:docs` passes.
- [ ] 9.2 Compare rendered web and mobile states at 375 pixels in light and dark, at the largest text size, with a
  screen reader, and with the keyboard open. Cover the composer chips, the kept files, the room files, the new-topic
  draft card, the limit notice, the choice sheet, the picker menu, and the avatar choices. Record the web references,
  the adaptations, and any unverified gaps in the change's report.
- [x] 9.3 Run `bun run check` and verify that it passes: Biome, package boundaries, component parity, client parity,
  purchase paths, contract freeze, `tsc -b`, workflow bundles, and `bun test`.
- [x] 9.4 Write the device checklist for the user in the change's report, without building a development client or
  booting a simulator here. The new development client is needed because the fingerprint changes. On it, the user
  checks:
  - a photo and a PDF go into private chat
  - a photo goes into a room
  - a Topic is made with Carl with one file
  - a Team avatar is taken with the camera
  - the camera's denied-permission message shows
  - cancelling a pick changes nothing
  - signing out mid-resize discards the photo
  - each new story renders in both palettes
  Verify that the report lists each check as unverified until the user runs it.

## Workflow follow-up

- Ship through `/ship`, which archives the change with `openspec archive mobile-new-topic-chat-and-attachments --yes`.
- After deploy, cut a store build through the store release path, since the camera permission needs a new binary.
