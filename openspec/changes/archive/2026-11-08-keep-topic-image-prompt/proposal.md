## Why

After a prompted regeneration, the Image prompt field in Edit topic opens empty, so an owner can't see which words drew
the current image or adjust them for the next try.

## What Changes

- The topic's current image keeps the image prompt it was drawn from, null for the house style and an upload.
- Edit topic's Image prompt field opens with that prompt, keeps it after a regeneration, and clears after an upload.
- Only a user who may edit the Topic receives the prompt.

## Capabilities

### Modified Capabilities

- `topic-images`: the current image keeps its image prompt, and the editor shows it.

## Impact

- `topic_images.image_prompt` (a nullable column, one migration), `replaceTopicImage`, the render activity and
  workflow, the upload route, the topic response's `imagePrompt`, the shared `TopicImageEditor`, and both apps' stories.
