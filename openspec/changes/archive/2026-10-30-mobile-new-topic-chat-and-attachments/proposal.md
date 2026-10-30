# Proposal

## Why

The mobile chat ships text only. On a phone a user cannot attach a file, make a Topic with Carl, or pick "chat or
form", and the app's pickers offer only the photo library. Each of these works on the web. Carl's answers already
invite users to "Give Carl a topic", and the app shows that invitation as dead text or an "available on the web"
alert. The parity inventory lists the attachment clients as deferred until this change.

One privacy defect sits in the same area. An OAuth sign-up publishes the provider photo at once
(`toSignupAvatarSource` in `apps/api/auth.ts`). The user-avatars spec says the photo stays private until the user opts
in.

## What Changes

- **Shared attachment rules in core.** The web's `useChatAttachments` keeps its file reading. Its portable parts move
  to `packages/core`: the attachment list state, the kind table and size labels, the four-per-question limit, the
  kept-file counting against the 20-file limit, the chat accept list, and the rejection copy. Web and mobile read
  files through their own adapters. Web payloads, limits, and toasts stay the same.
- **Attachments in the mobile composers.** The private and Team composers gain an attach button, removable chips,
  and the web's limits. A private Topic chat keeps files the web's way and lists kept files with delete. A Team room
  posts files with `keep: false` and deletes its own files through the existing room route. A private kept file never
  appears in a room.
- **New-topic chat on mobile.** This is the web's conversation with no Topic and no Team. The draft card shows every
  setting, including Team and visibility. The limit notice replaces the card without a plans link. The new Topic opens
  only after the server creates it, and then the draft's files upload to it as Topic attachments. Clear asks first and
  removes the stored draft.
- **Chat or form.** The mobile New topic action and Edit topic open the web's choice between the form and Carl. "Build
  with Carl" opens the new-topic chat. "Edit with Carl" opens the private chat about the Topic. Carl's "Give Carl a
  topic" phrase and the `openNewTopicChat` tool open the new-topic chat on mobile, the way they do on the web. Other
  links keep the shared http and https rule.
- **Native pickers.** One picker menu offers Files, Photo library, and Take photo wherever an action accepts images.
  That covers chat attachments, the Topic attachment editor, and the user and Team avatars. The menu checks kind and
  size before reading. It resizes large images under shared rules, keeps transparency for PNG, WebP, and GIF, asks
  for each permission only when it is needed, cleans up cached copies, and drops results from an account that has
  signed out. The camera takes photos only.
- **Provider photo consent.** An OAuth sign-up records the generated avatar, so the provider photo is published only
  after the account toggle turns it on. Users whose source is already `oauth` keep it.

## Capabilities

### New Capabilities

- `mobile-file-pickers`: the native picker menu (Files, Photo library, Take photo) and when each choice is offered.
  Also the in-context permissions, kind and size checks before reading, the shared image resize, cancellation, upload
  errors, cache cleanup, and account changes.

### Modified Capabilities

- `mobile-chat`: composers take attachments with chips and kept files, and rooms delete their own files. The
  new-topic chat, the chat-or-form choice, the new-topic invitation and tool, and the limit notice ship natively. The
  deferred-media requirement now names only voice and podcast chat.
- `topic-attachments`: the chat accept list is shared by both clients' chat pickers.
- `user-avatars`: an OAuth sign-up publishes nothing. The app's native picker resizes and re-encodes under the same
  rules as the browser and offers the camera and Files.

## Impact

- **Packages:**
  - `packages/core`: new attachment state and rules, the chat accept list, image resize rules, and the `chat-or-form`
    choice composition.
  - `packages/contracts`: the kind and type lists move here from web-local constants.
- **Web:** `useChatAttachments`, `ChatRoomComposer`, `TopicEditorChoiceDialog`, and `utils.ts` switch to the shared
  modules. Behavior stays the same, and the existing tests keep passing.
- **Mobile:**
  - Components: `ChatComposer`, `ChatRoomComposer`, `PrivateChatPanel`, `ChatRoomPanel`, `ChatMarkdown`,
    `chatNavigation`, `TopicHomeActions`, `TopicPageActions`, `EditTopicModal`, `TopicAttachmentEditor`,
    `UserAvatarPicker`, the Team avatar in `teams/[teamId].tsx`, and `EditTeamModal`.
  - Other files: `avatar/avatarUpload.ts`, new picker and attachment adapters, and Storybook stories.
- **Mobile config:** the `expo-image-picker` plugin gets a camera usage string, and its photo string is widened past
  avatars. The camera string changes native permissions, so it needs a new development and store build and cannot
  ship over the air. No new dependency is added: `expo-image-picker` provides the camera.
- **API:** `apps/api/auth.ts` deletes `toSignupAvatarSource` and stops writing `avatarSource` at sign-up, so the
  column default `generated` applies. No route or payload changes. The
  contract freeze is unaffected.
- **Inventory and docs:**
  - `apps/mobile/parity.md` retires the five deferred attachment entries. `uploadTopicAttachment` becomes web-only,
    since the app uses `uploadTopicAttachmentBody`.
  - `apps/mobile/AGENTS.md`, `packages/core/AGENTS.md`, and the user docs pages for chat, the new-topic chat,
    attachments, group chat, and getting the app are updated.
