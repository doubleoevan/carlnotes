# Design

## Context

See proposal.md for why. This section covers only the current code the approach depends on.

- **Already shared.**
  - Core `useTopicChat` takes `attachmentState`, `draftState`, and `effects` adapters. Mobile passes none, so it
    falls back to text.
  - Core `useChatConversationLoad` already loads `topicDraft`, `topicsRemaining`, `topicLimit`, and `isFirstTopic`.
  - Core `TopicDraftCard` already takes `attachmentFiles` and a `Files` element. Mobile already adapts it.
  - `safeChatMarkdown` owns `NEW_TOPIC_CHAT_WORDS`, `NEW_TOPIC_CHAT_HREF`, and `isSafeHref`.
  - `chatRejectionCopy` owns `toChatTopicLimitCopy`.
  - `packages/core/lib/avatarUpload.ts` owns the 512-pixel avatar rule and the transparent types.
  - Contracts own every chat limit (`CHAT_MAX_ATTACHMENTS`, the per-kind data limits, `CHAT_ATTACHMENT_KEEP_LIMIT`,
    `CHAT_ROOM_ATTACHMENT_LIMIT`) and the attachment payload.
- **Still web-local.**
  - `useChatAttachments`: the kind table, the size labels, keep counting, the file-type lists, and file reading.
  - Two accept strings in `apps/web/src/lib/utils.ts`.
  - `useNewTopicDraft`, `TopicEditorChoiceDialog`, `ChatTopicLimitNotice`, and `KeptAttachmentsButton`.
  - The room composer's own pending-file state.
  - The Topic attachment maximum, `MAX_ATTACHMENT_BYTES`, lives in `packages/pipeline/attach.ts`, which the app cannot
    import.
- **Mobile today.**
  - The composers are text-only, and `ChatRoomComposer` posts `attachments: []`.
  - `toNativeChatMarkdown` never links the invitation, and a test enforces that.
  - `PrivateChatPanel` alerts "New-topic chat is available on the web."
  - `chatNavigation` drops a new-topic `ChatId`.
  - `ChatRoomPanel` passes a no-op `onAttachmentDelete`.
  - The Topic editor uses `expo-document-picker` with its own type list.
  - Avatars use `expo-image-picker`'s library and `expo-image-manipulator`.
  - The `expo-image-picker` plugin sets `cameraPermission: false`.
  - `runtimeVersion` uses the fingerprint policy.
- **Server.** `toSignupAvatarSource` returns `oauth` whenever the provider sent a photo. The column already defaults
  to `generated`.

## Goals / Non-Goals

**Goals:**

- Each rule lives in one module that both apps import. The apps differ only in how they read a file, ask for
  permission, and show a message.
- Requests stay the same: the web's payloads, limits, and messages, and every api route and contract.

**Non-Goals:**

- Resizing chat images on the web. The web keeps rejecting an image over the data limit, as it does today.
- Recording video, voice, or podcast chat on mobile.
- Changing a stored avatar source for existing users. The user decided this.
- A new upload client or a second composer, draft card, or form.

## Decisions

### 1. The attachment state machine moves to core, and file reading stays in each app

- `packages/core/hooks/useChatAttachments.ts` takes over the web hook's portable body:
  - the list and kept-file state
  - the live counts across awaits
  - the four-per-question check
  - the keep decision against `CHAT_ATTACHMENT_KEEP_LIMIT`, and `keep: false` always for a room
  - `addPastedText`, `removeAttachment`, `removeKeptAttachment` (calling `sendDeleteKeptAttachment`), and `clearDraft`
- The hook takes two adapters:
  - `toFileReader(file) => ChatAttachmentFileReader`, which gives the name, the type, and the size, and reads the data
    URL or the text only after the hook has classified the file and checked its size
  - `notify(line)`
- Each app keeps its `useChatAttachments.ts` as a thin wrapper with the same name. The web binds `FileReader` and
  `sonner`. Mobile binds `expo-file-system`'s `File(uri).base64()` and `.text()`, and its toast.
- The web room composer keeps its own pending state and reads each file through the shared `toAttachment`, because
  it clears only the files a post sent and reads a selection in parallel. Mobile's room composer uses the core hook in
  room mode.

The pure rules go in `packages/core/lib/chatAttachmentRules.ts`:

- the kind for a file from its type and name
- the per-kind limit and its `toDataUrlSizeLabel` label
- the estimated data-URL length from a byte size: `ceil(bytes/3)*4` plus the prefix
- the rejection lines, word for word from the web: unsupported, too large, and "4 attachments max per question."

The type lists move from the web into `packages/contracts/attachmentTypes.ts`:

- `TEXT_FILE_SUFFIXES`, `VIDEO_FILE_TYPES`, `DOCUMENT_FILE_TYPES`, and `DOCUMENT_FILE_SUFFIXES`
- the chat accept list and the Topic accept list, as arrays both pickers read
- `TOPIC_ATTACHMENT_MAX_BYTES`

`packages/pipeline/attach.ts` imports the Topic maximum from contracts instead of declaring it.

The size check runs before the read on both apps. The web's outcome stays the same: the same file is rejected with the
same words. The web skips reading a file it would reject.

*Alternatives considered:*

- A mobile copy of the hook. Rejected by the DRY rule and the parity rules.
- Moving `FileReader` into core. Not allowed, because core holds no DOM globals.

### 2. The picker menu is one native module that every file action calls

- `apps/mobile/src/components/common/FilePickerMenu.tsx` plus the hook `useFilePicker({ accept, isMultiple,
  maxPhotos, onPicked })`. The hook opens the app's own `Sheet` on both platforms, with Photo library, Take photo, and
  Files, and goes straight to Files for an action that takes no images.
- Every choice returns `PickedFile { uri, name, mimeType, byteSize, width?, height? }`.
- Each choice uses an installed module:
  - Files: `expo-document-picker`, with the shared accept list
  - Photo library: `launchImageLibraryAsync`
  - Take photo: `launchCameraAsync` with `mediaTypes: images`
- The library offers video only where `accept` includes video.
- The web reference is the file input, which iOS and Android browsers already show as the same three choices. So this
  is the native form of that input, not a new interaction.

Callers:

- chat composers, private and room
- the Topic attachment editor's link and the prompt paperclip, replacing `pickTopicAttachments`
- the user avatar after its overlay tap
- the Team avatar on the Team screen and in `EditTeamModal`

*Alternative considered:* `expo-camera`. Rejected because the system camera through `expo-image-picker` needs no new
dependency and no camera UI of our own.

### 3. Image resizing generalizes the avatar rule

- `packages/core/lib/avatarUpload.ts` becomes `packages/core/lib/imageUpload.ts`. It keeps `MAX_AVATAR_PIXELS`,
  `AVATAR_JPEG_QUALITY`, `TRANSPARENT_IMAGE_TYPES`, and `AVATAR_ACCEPT`, and adds `MAX_ATTACHMENT_IMAGE_PIXELS = 2048`.
- A pure function, `toResizedImage({ width, height, mimeType, maxPixels })`, returns the target size and the output
  format: PNG for a transparent type, otherwise JPEG.
- The web avatar path and the mobile avatar and attachment paths all call it.
- Mobile runs the plan with `expo-image-manipulator`, which re-encodes the image and drops its EXIF metadata. That
  turns HEIC from the camera or Files into JPEG, which the chat's `data:image/` payload and the model accept.
- Every image a user picks on mobile is re-encoded, from any of the three sources. Video and documents are never
  re-encoded.

2048 pixels keeps a 12-megapixel JPEG near 1 MB, far under the 6 M-character chat limit. It also leaves screenshots
legible to the model.

### 4. The new-topic draft hook moves to core with navigation and upload adapters

- `useNewTopicDraft<AttachmentFile>` moves to `packages/core/hooks/`, generic over the file type. Its adapters:
  - `openTopic(topicId)`
  - `uploadAttachment(topicId, file)`
  - `notify(line)`
- The rejected-upload line keeps the web's wording: "<name> didn't attach. <reason>".
- The web wrapper binds TanStack navigation, `uploadTopicAttachment`, and `sonner`.
- The mobile wrapper binds `router.push` to the Topic route, `uploadTopicAttachmentBody` with the `{ uri, name, type }`
  multipart file, and the native toast.
- `publishTopicChanged` already lives in core.
- The create, clear, and new-conversation behavior is already in core `useTopicChat`.

On mobile:

- `chatNavigation` stops dropping `{ kind: "private", newTopic: true, initialTeam? }` and adds the web's default:
  new-topic chat when no room exists and the page has no Topic or Team.
- The selector gets the web's "Give Carl a topic. You know the one." row.
- `PrivateChatPanel` passes `draftState` and `attachmentState`, and replaces the alert with the real
  `openNewTopicChat`.
- The limit notice is a small core component, `ChatTopicLimitNotice`, with an optional plans link element. The web
  passes its link. Mobile passes none, so no pricing link appears.
- The empty-Feed welcome is a module-scope flag in a mobile store, set when the chat opens by itself. That gives "once
  per launch", the native form of the web's "once per page load".

### 5. The choice between chat and the form becomes a core composition

- `TopicEditorChoiceDialog` becomes core `TopicEditorChoice`. It holds the labels ("Do it myself", "Build with Carl",
  "Edit with Carl") and the mode logic, and takes `Dialog` and `Button` elements.
- The web keeps its dialog, the same classes, and the same tests.
- Mobile renders it in its bottom sheet. That is the documented native exception for a web dialog.
- Mobile's `useNewTopicDialog` (in `TopicHomeActions`, `PageActionMenu`, and the Team screen) opens the choice
  instead of the form. `EditTeamModal`'s New topic row opens the form directly, as the web's does, so the saved Topic
  joins its picker.
- `TopicPageActions` opens the choice for Edit topic.

### 6. The invitation becomes an internal action through one exact match

- `toNativeChatMarkdown` links the invitation phrase to `NEW_TOPIC_CHAT_HREF` the way the web's
  `toNewTopicChatLinkedMarkdown` does.
- The mobile `ChatMarkdown` link renderer checks for the exact `NEW_TOPIC_CHAT_HREF` before `isSafeHref`, and renders
  that one link as a pressable that calls `openNewTopicChat`. Any other href goes through `isSafeHref` unchanged.
- The test that asserts plain text is replaced by tests for these cases:
  - the phrase links
  - `#anything-else` stays inert
  - `javascript:` stays inert

### 7. Kept files and room files reuse the existing clients

- Private Topic chat shows a "kept files" control beside the composer. It is the native counterpart of
  `KeptAttachmentsButton`, built on the same core list logic.
- The control lists names, downloads through `toChatAttachmentUrl` into the cache and opens the system preview, the
  way `TopicAttachmentLink` does, and deletes through the core hook.
- The control is absent in rooms and in new-topic chat, because the server stores no kept files there. That keeps
  private files out of rooms by construction.
- `ChatRoomPanel` wires `onAttachmentDelete` to `sendDeleteChatRoomAttachment` and downloads through
  `toChatRoomAttachmentUrl`. Which attachments a user may delete follows the web's rule, read from where the web
  room panel decides it.

### 8. Each pick records its account, and cached copies are tracked

- Each pick and resize records the session's user id when it starts. A result that comes back under a different id,
  or after sign-out, is dropped and its file deleted. This reuses the account-change guard mobile chat uses for late
  stream events. The read that follows runs in the chat screen's own draft, which remounts for each account.
- Every cached URI the pickers or the manipulator create is recorded in the composer's or form's file list. It is
  deleted when the file is sent, removed, cancelled, or unmounted, and when the account signs out.
- The pickers, the resizer, and the system preview's downloads write into their own cache folders, which are emptied
  at app start and when the account changes. That catches files a crash or another account left behind.

### 9. Permissions are asked when a source is picked, with plain strings

The `expo-image-picker` plugin config sets three values:

- `photosPermission`: "Choose photos to attach in chat, add to a topic, or use as an avatar."
- `cameraPermission`: "Take a photo to attach in chat, add to a topic, or use as an avatar."
- `microphonePermission: false`

When each permission is asked:

- `requestCameraPermissionsAsync` runs only after Take photo.
- The library uses the system picker. It needs no full-library grant on iOS 14+ or Android 13+, so the app asks only
  where the platform requires it.
- A denial shows a short message with an Open Settings button, through `Linking.openSettings`.

### 10. An OAuth sign-up records the generated source

- Delete `toSignupAvatarSource`, and stop writing `avatarSource` in the sign-up hook. The column default,
  `generated`, applies.
- Update the existing test to assert that an OAuth sign-up with a photo stores `generated`.
- Existing `oauth` rows are untouched, as the user decided.
- The account toggle already turns the provider photo on and off on both apps.

### 11. Parity and docs record what is reused

- `apps/mobile/parity.md` deletes the four chat-attachment entries, since mobile now reaches them.
- `topicClient.uploadTopicAttachment` becomes `web-only`, with the reason "The browser's File upload. The app uploads
  to the same route through `topicClient.uploadTopicAttachmentBody`". That mirrors `sendTeamAvatar`.
- The final report sorts the work into three groups:
  - actual component reuse: core `TopicDraftCard`, `TopicEditorChoice`, `ChatTopicLimitNotice`, `ChatPill`, and
    `ChatRoomMessageBubble`
  - shared logic: `useChatAttachments`, `chatAttachmentRules`, `useNewTopicDraft`, `imageUpload`, and the attachment
    types
  - native replacements: the picker menu, file reading, the kept-files sheet, and the choice sheet

## Risks / Trade-offs

- **[Base64 reads of large video hold up to about 19 MB in JS memory]** → The same limit as the web. The size check
  runs before the read, so an oversized video is never loaded.
- **[The native permission strings need a new binary]** → The fingerprint runtime keeps an EAS Update from reaching
  older builds. The release goes through the store path and the version gate, and the release notes say so.
- **[Moving the web hook could change web behavior]** → The existing web tests stay as they are. One web integration
  test drives the wrapper through real `File` objects, and `useChatAttachments.test.ts` keeps its accept-list
  assertions, now against the contracts lists.
- **[Renaming `avatarUpload.ts` touches both apps]** → It is one import change per caller. The boundary and `tsc -b`
  checks catch a missed import.
- **[A native action sheet instead of the web's direct file input adds a step]** → The browser on a phone shows the
  same three choices. When an action accepts no images, the menu skips the sheet and opens Files directly.

## Migration Plan

1. Land the contracts and core modules, then switch the web to them with its tests green.
2. Land the mobile adapters, composers, new-topic chat, choice sheet, and pickers behind the new native config.
3. Ship the api change to the OAuth sign-up source with the web deploy. It is independent of the app.
4. Build a new development client and store build. The camera string changes the fingerprint, so the old builds keep
   their text-only chat until they update.

Rollback: revert the commit. No data migration runs. The api change only affects sign-ups after the deploy.
