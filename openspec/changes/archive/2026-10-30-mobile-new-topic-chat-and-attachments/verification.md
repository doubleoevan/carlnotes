# Mobile new-topic chat and attachments: implementation and QA report

The app now attaches photos, camera shots, and files in private chat, in rooms, on Topics, and on user and Team
avatars, all through one picker menu. It also builds a Topic with Carl in the new-topic chat, and offers the web's
chat-or-form choice on New topic and Edit topic. `bun run check` passes. The rendered comparison ran in part on
an iPhone SE simulator, as its section records. Every check marked unverified below waits for the user's device run.

## What is shared

Components in `packages/core/components/`, consumed by both apps through element adapters:

| Component | Shared responsibility |
| --- | --- |
| `TopicEditorChoice` | The New topic and Edit topic choice: titles, descriptions, "Do it myself", and the Carl label |
| `ChatTopicLimitNotice` | The plan's topic limit above the new-topic composer; the plans link only where an app supplies one |
| `TopicDraftCard` (existing) | The new-topic draft with every setting, now with removable waiting files |

Shared logic in core and contracts:

- `hooks/useChatAttachments` and `lib/chatAttachmentRules`: kinds, per-kind and per-question limits, kept files, room
  mode, and every rejection line.
- `hooks/useNewTopicDraft`: the waiting files, the team preset, the upload to the created Topic, and file release.
- `lib/chatCopy`'s `NEW_TOPIC_CHAT_COPY`, `lib/topicFeed`'s `isUserTopicFeedEmpty`, and `lib/nativeChatMarkdown`'s
  internal new-topic link, which keeps every other href to http and https.
- `lib/imageUpload`'s `toResizedImage`: the 2048-pixel attachment edge and the 512-pixel avatar edge, PNG for a
  source that can be transparent and JPEG otherwise.
- `contracts/attachmentTypes`: the chat and Topic accept lists, the Topic size limit, and the size line the api and
  the app both show.

## Platform adapters and adaptations

- **Picker menu.** The web's file input becomes a `Sheet` with Photo library, Take photo, and Files. An action with no
  image types opens Files directly. The camera asks for permission only when picked, and a denial offers Open
  Settings. Web reference: the phone browser's own file input menu.
- **Choice dialog.** The web's centered dialog becomes a bottom sheet with the same two buttons. Web reference:
  `apps/web/src/components/topic/TopicEditorChoiceDialog.tsx`.
- **Kept files.** The web's popover becomes the "Chat files" sheet. A file opens in the system preview instead of a
  browser tab. Web reference: `apps/web/src/components/chat/PrivateChatPanel.tsx`.
- **Room files.** Room images show as named rows that open the system preview, not inline images. Web reference:
  `apps/web/src/components/chat/ChatRoomMessageBubble.tsx`.
- **Empty Feed.** The app opens the new-topic chat once per launch for a user with no topics. The web opens it once per
  page load for an empty Feed.
- **Team edit sheet.** Its new topic stays on the form, as on web. Its picked image waits for the save, so its copy
  stays in the cache until the next launch clears it.
- **Provider photos.** A new OAuth user keeps the generated avatar. The provider photo shows only after the user picks
  it. Existing users with an `oauth` source keep it, by the user's decision.

## Rendered comparison (task 9.2): partly run

The new development client ran on an iPhone SE simulator (iOS 27.0, 375 points wide) in dark mode, at the default
text size, signed in to the dev account.

Verified on the simulator:

- The New topic action opens the choice sheet with Build with Carl above Do it myself, as on the web.
- The new-topic chat opens with its subtitle, the saved draft card, and the new-topic placeholder.
- The paperclip opens Add a file with Photo library, Take photo, and Files. Photo library opens the limited-access
  system picker, and two picked photos become chips with thumbnails and an X each.
- An X removes its chip. With the keyboard open, the draft card shrinks to its heading and the chips and composer stay
  above the keyboard.
- A sent photo shows as a file chip under the question, the question keeps the web's attachment note, and Carl's reply
  streams with Stop.

Fixed during the run:

- The composer shrank with the draft card above it and clipped its own bottom edge, worse once chips showed. It now
  shrinks only into a room's header.
- The draft card grew until the conversation had no height. Its scroll now stops at 192 points, the web's phone-width
  max-h-48.
- A file sent in the new-topic chat showed as kept until a reload, though the api keeps files for a topic alone. Both
  apps now add kept placeholders on a topic's page only, with a hook test.

Still unverified, because the simulator stopped responding to input while the host was swapping:

- light mode, the largest text size, and the screen reader
- the kept files sheet and room files
- the limit notice
- the user avatar overlay and menu, and the Team avatar choices
- the Topic attachment editor's picker

## Device checklist (task 9.4)

The camera permission changes the fingerprint, so these checks need a new development client. Each is unverified until
the user runs it:

- [ ] A photo and a PDF go into private chat.
- [ ] A photo goes into a room.
- [ ] A Topic is made with Carl with one file, and the file shows on the new Topic.
- [ ] A Team avatar is taken with the camera.
- [ ] Turning the camera off shows "Camera is off" with Open Settings.
- [ ] Cancelling a pick changes nothing.
- [ ] Signing out while a photo resizes discards the photo.
- [ ] A Topic file over 10 MB is rejected before upload, with the form intact.
- [ ] A transparent PNG avatar stays transparent.
- [ ] Each new story renders in both palettes: `Common/FilePickerMenu`, `Chat/ChatComposer` (the attachment stories),
  `Chat/ChatRoomMessageBubble` (Attachments), `Chat/ChatTopicLimitNotice`, `Chat/TopicDraftCard` (new-topic files),
  `Topic/TopicEditorChoiceSheet`, `Topic/TopicAttachmentEditor`, and `Avatar/UserAvatarPicker`.
- [ ] A 48-megapixel photo and a photo picked from Files attach without a memory spike, each decoded once at 2048
  pixels.
- [ ] The photo library stops selecting at the files a question still takes.
- [ ] A video or an 11 MB file sent in the new-topic chat stays in the chat, with its line, and is not on the draft.
- [ ] A previewed chat file's copy is gone after the app relaunches or the account changes.
