# Spec Delta

## Purpose

Lets the mobile app take files, photos, and camera shots wherever the web takes a file. The checks, resizing,
permissions, and cleanup are the same everywhere, and every upload uses the protocol its endpoint already expects.

## ADDED Requirements

### Requirement: One picker menu offers the sources an action accepts

Every mobile action that takes a file SHALL open one native picker menu. The menu SHALL offer Files, and SHALL also
offer Photo library and Take photo when the action accepts images. The actions are the chat attachment button in
private and Team chat, the Topic attachment editor's add link and prompt paperclip, the user avatar, and the Team
avatar. An avatar SHALL offer Photo library, Take photo, and Files with an image filter.

#### Scenario: A chat attachment is added

- **WHEN** a user presses the attach button in a chat composer
- **THEN** the menu offers Files, Photo library, and Take photo, and each returns its file to that composer

#### Scenario: A Topic file is added

- **WHEN** an owner presses "add an attachment" in the Topic form
- **THEN** the menu offers Files, Photo library, and Take photo, and the picked file joins the form's pending files

#### Scenario: The menu is dismissed

- **WHEN** the user dismisses the menu or cancels a system picker
- **THEN** nothing is added, no message shows, and the composer or form keeps its state

### Requirement: The camera takes photos only

Take photo SHALL capture a still image. The app SHALL NOT record video or ask for the microphone. A video SHALL reach
an action only from the photo library or Files, and only where that action accepts video.

#### Scenario: A user wants to send a video to chat

- **WHEN** a user picks a video from the photo library in a chat composer
- **THEN** it is checked against the chat's video limit, and the camera offers no video mode

### Requirement: Permissions are asked in context and only for the source picked

The app SHALL ask for camera access only when the user chooses Take photo. It SHALL ask for photo library access
only when the platform requires it for Photo library. It SHALL NOT ask at launch or sign-in. The usage strings SHALL
say plainly what the access is for, covering chat, Topic files, and avatars. A denied permission SHALL show a short
message that names the source and offers the system settings. Nothing else is affected.

#### Scenario: Camera access is denied

- **WHEN** a user chooses Take photo and denies camera access
- **THEN** a message says the camera is off for CarlNotes with a button to open settings, and Files and Photo library
  still work

#### Scenario: Files needs no permission

- **WHEN** a user chooses Files
- **THEN** no permission prompt appears

### Requirement: A file is checked by kind and size before it is read

Each picked file SHALL be checked against the receiving action's accepted kinds and limits before its bytes are read
or uploaded. Chat uses the shared chat kinds, per-kind limits, and per-question limit. Topic files use the Topic
attachment kinds and maximum size. Avatars use the avatar kinds. A rejected file SHALL show the same rejection words
as the web. Accepted files in the same choice SHALL still be added.

#### Scenario: A file of an unaccepted kind is picked

- **WHEN** a user chooses a `.zip` file for chat
- **THEN** the web's unsupported-file message shows, and the file is neither read nor sent

#### Scenario: A fifth file is picked for one question

- **WHEN** a question already holds four attachments and the user chooses another
- **THEN** "4 attachments max per question." shows and the fifth is not added

#### Scenario: An oversized document is picked

- **WHEN** a PDF whose encoded size would pass the chat PDF limit is picked
- **THEN** the web's size message with the limit's label shows before the file is read into memory

### Requirement: Large images are resized under shared rules

Before a library or camera image is attached to chat or a Topic, the app SHALL apply the shared rules. An image whose
longest edge passes the shared limit is scaled down to it. PNG, WebP, and GIF sources are re-encoded as PNG so they keep
transparency. Every other source, HEIC included, is re-encoded as JPEG. Re-encoding SHALL drop EXIF metadata. An image
still over the chat limit after resizing SHALL be rejected with the size message. Avatars keep their own 512-pixel
rule.

#### Scenario: A camera photo is attached to chat

- **WHEN** a user takes a 12-megapixel photo for chat
- **THEN** the attachment is a JPEG no longer than the shared edge limit, under the chat image limit, with no EXIF
  segment

#### Scenario: A transparent PNG keeps its background

- **WHEN** a user attaches a transparent PNG logo
- **THEN** the attachment is a PNG whose transparent pixels stay transparent

#### Scenario: An image that cannot be decoded

- **WHEN** a picked image cannot be decoded or resized
- **THEN** "That image couldn't be read. Try a JPEG or PNG." shows and nothing is attached

### Requirement: Uploads use the protocol each endpoint already expects

A chat attachment SHALL be sent as the data URL or clipped text that the chat payload already accepts. A Topic
attachment and an avatar SHALL be sent as a native multipart file to their existing routes. No route, payload, or web
request SHALL change for mobile.

#### Scenario: The same file reaches chat and a Topic

- **WHEN** a user attaches a PDF in chat and later adds it to a Topic
- **THEN** chat receives it as a `data:application/pdf` URL inside the turn's JSON, and the Topic route receives a
  multipart `file` field

### Requirement: Cancellation, failures, and cached copies leave no trace

A cancelled pick or capture SHALL add nothing. A failed upload SHALL show the server's reason in the web's words and
keep the form state or the room composer's text and files, and a rejected private turn SHALL show Retry, so the user
can try again. Temporary files the pickers or the resizer create SHALL
be deleted once they are sent, removed, cancelled, or abandoned when their screen closes.

#### Scenario: A Topic file upload fails

- **WHEN** a Topic attachment upload is rejected as too large
- **THEN** the rejection shows, the form stays open with its other fields, and the cached copy is deleted

#### Scenario: A composer closes with files waiting

- **WHEN** a user closes chat while two picked photos wait in the composer
- **THEN** their cached copies are deleted

### Requirement: A pick never outlives its account

A pick, resize, or upload that finishes after sign-out or an account switch SHALL be dropped. Its file SHALL NOT be
added to the new account's composer, form, or avatar, and its cached copy SHALL be deleted. Signing out SHALL clear
every waiting attachment.

#### Scenario: The account switches during a resize

- **WHEN** a user signs out while a photo is still resizing for chat
- **THEN** the resized photo is discarded and the next account's composer is empty
