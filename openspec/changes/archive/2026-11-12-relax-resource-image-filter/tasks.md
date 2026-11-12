## 1. Filter

- [x] 1.1 Replace the third-of-the-frame rule with a 200 pixel shortest side, and widen the shape to 9:16 through 4.5:1
- [x] 1.2 Drop an image with fewer than 64 colors on a 256 pixel copy, unless its gray pixels show 12 or more levels
- [x] 1.3 Take `avatar` and `gravatar` out of the rejected url words

## 2. Fetch

- [x] 2.1 Send `CarlNotes/1.0 (+https://carlnotes.com)` on every image and page tag fetch
- [x] 2.2 Fetch an http image url over https first, then over http

## 3. Fetch again

- [x] 3.1 Record the image filter version with each fetch, and fetch again under an older version after deleting the
  stored images
- [x] 3.2 Add `resources.images_filter_version` in migration 0167
- [x] 3.3 Raise the film render version to 3

## 4. Film image style

- [x] 4.1 Take the dark, empty lower third out of the film house style prompt and the film image's framing, since the
  lower third's plate keeps the title readable
- [x] 4.2 Key generated chapter images by style version, draw them again on a re-render, delete the older style's
  once the film is saved, and serve the older one until then

## 5. Own topic pages

- [x] 5.1 Drop a discovered Resource that is the Scan's own topic's page on CarlNotes, before review pays for it

## 6. Topic Cinema

- [x] 6.1 Open Topic Cinema on every page load, and drop the saved choice: its route, its client call, the topic
  read's open state, and the schema's reads of `topic_podcast_episode_video_sections`, whose table a later
  migration drops once the api that this deploy replaces is gone

## 7. Intro and sign-off

- [x] 7.1 Plan the intro's and the sign-off's shots over the film's image and each chapter's first image, with the
  first and last moves fixed
- [x] 7.2 Encode them shot by shot with a lower third that stays, and drop the single-push encode
- [x] 7.3 Load the audio, timeline, and captions once for the render and the rebuild, and give the rebuild the chapter
  images

## 8. Dashboards, the Topic Posts section, Topic Post images, and the account plan

- [x] 8.1 Show the New Topic button in the header row of one's own Topic and Podcast Dashboards and of every Team
  Dashboard
- [x] 8.2 Put the Topic Posts section's button and cards in one card, and its page buttons under the card
- [x] 8.3 Pulse a Topic Post's empty image frame on its card and its page until the image is stored
- [x] 8.4 Move the plan and its button from the bottom of both budget cards to the right of the account page's header
  row, with a placeholder at the button's height while the plan loads

## 9. Tests

- [x] 9.1 Cover the small photo, the banner, the silhouette, the avatar, and the new thumbnail and link preview sizes
- [x] 9.2 Cover the https-first fetch, the user agent, and the fetch under an older filter
- [x] 9.3 Cover the intro's and the sign-off's shots, each chapter's first image once, and a lower third that stays
