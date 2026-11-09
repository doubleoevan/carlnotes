## Why

A link to a private or invite topic previews as the plain text card, while a public topic's card shows its image. The
card already shows a private topic's name, owner, and counts to anyone holding the link, so leaving the image off only
makes those links look broken.

## What Changes

- A private or invite topic's share card draws the topic's image, an upload included, the way a public topic's does.
- A podcast episode's card on such a topic draws the episode's image, or the topic's until it is drawn.
- The image files themselves stay gated by the topic's visibility. Only the drawn card shows the image.

## Capabilities

### Modified Capabilities

- `social-sharing`: every topic's card draws its image, whatever the topic's visibility.

## Impact

- `apps/api/share/topicImage.ts`, `apps/api/share/podcastEpisodeImage.ts`, and `apps/api/share/pageHead.ts`. A card's
  key already includes the image hash, so a private topic's card moves to a new url and draws once with the image.
