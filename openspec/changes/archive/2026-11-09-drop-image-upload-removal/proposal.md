## Why

The image editor showed a Remove button under an uploaded image, which took the upload away and started a fresh render.
Regenerate already replaces an upload with a fresh render, so Remove repeats it.

## What Changes

- The image editor drops its Remove button on the web and in the mobile app. The month's regeneration count shows under
  the image prompt.
- The api drops `DELETE /api/topics/:id/image` and `DELETE /api/episodes/:id/image`, with their client calls, route
  contracts, and the `topic_image_remove` event. No released app version calls either route.
- An admin's report resolution still removes a reported upload.
- The docs drop Remove.

## Capabilities

### Modified Capabilities

- `topic-editing`: the editor shows the image with Regenerate and the month's count, and no Remove button.
- `topic-images`: an upload stays until Regenerate replaces it, and a Podcast Episode's image has no removal.
- `podcast-episode-pages`: the mobile Podcast Episode screen's menu names the screen in full.

## Impact

`packages/core/components/TopicImageEditor.tsx`, `packages/core/lib/topicImageEditor.ts`, both apps'
`TopicImageEditor.tsx`, `apps/api/topic/topicImagesRoute.ts`, `apps/api/podcast/podcastEpisodeImagesRoute.ts` and their
tests, `packages/pipeline/podcast/podcastEpisodeImageRenders.ts`, `packages/client/topicImageClient.ts`,
`packages/client/podcastEpisodeClient.ts`, the topic and podcast route contracts,
`packages/contracts/analyticsEvents.ts`, the stories, and the docs.
