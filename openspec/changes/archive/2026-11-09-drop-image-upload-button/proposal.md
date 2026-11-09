## Why

The image editor draws a camera over the image, and a click or tap on the image already uploads. The Upload button below
it repeats that control in Edit topic, Edit podcast, and both image dialogs.

## What Changes

- The image editor drops its Upload button on the web and in the mobile app. A click or tap on the image uploads.
- The actions row shows Remove for an upload and the month's regeneration count, and is left out with neither.
- The docs describe uploading from the image.

## Capabilities

### Modified Capabilities

- `topic-editing`: the editor shows the image with Regenerate, and Remove for an upload, without an Upload button.
- `topic-images`: the Edit topic image dialog opens without an Upload button.
- `mobile-feed`: the mobile editor uploads from a tap on the image, without an Upload button.

## Impact

`packages/core/components/TopicImageEditor.tsx`, `packages/core/lib/topicImageEditor.ts`, both apps'
`TopicImageEditor.tsx`, the web editor's stories, and `apps/docs/src/content/docs/topics/topic-and-podcast-visions.md`.
