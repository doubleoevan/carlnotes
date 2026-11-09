## Why

A Topic's image can be changed only from inside the Edit topic form, and a Podcast Episode's title, description, and
image can't be changed at all. An editor who sees a poor image or title has no direct way to fix it. The admin
console's Home card repeats the Rank dialog that the topic and podcast episode pages already offer.

## What Changes

- For a user who may edit the Topic, the Topic page's image shows the camera overlay on hover, and a click opens the
  Edit topic image dialog with the topic image editor.
- The Podcast Episode page's image does the same for the same users, and opens the Edit podcast image dialog.
- The Podcast Episode page's actions menu offers Edit podcast to the same users. It opens a dialog laid out like Edit
  topic that edits the Podcast Episode's title, description, and image.
- A Podcast Episode's image can be regenerated from an image prompt, uploaded, and an upload removed, with the Topic
  image's rules and the same monthly regeneration count.
- The mobile app offers Edit podcast in the episode menu and opens the same image dialogs from a tap on either image.
- The admin console drops its Home card.

## Impact

- `episodes` gains `image_origin` and `image_prompt`, and `topic_image_renders` gains a nullable `podcast_episode_id`.
- New api routes: `PATCH /api/episodes/:id`, and `POST /api/episodes/:id/image/regenerate`, `POST /api/episodes/:id/image`,
  and `DELETE /api/episodes/:id/image`. The render poll returns a Podcast Episode's image for its renders.
- The podcast episode page response gains `canEditPodcastEpisode`, the image's origin and prompt, and the user's
  regeneration count. The admin console response loses its two pin lists.
