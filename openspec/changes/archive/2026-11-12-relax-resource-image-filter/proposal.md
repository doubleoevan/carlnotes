# Proposal

## Why

A film's chapter drops the real pictures of its page and keeps the stock ones. A 480 by 450 photo of Lillian Von
Stauffenberg and her mother, the only picture on the Tory Burch blog page that a chapter narrates, never reached the
film for two reasons. The site's CDN answers 403 to a fetch with no user agent, and the photo covers less than the
third of the frame that the filter asks for. A chapter about Jennifer Abrams Wang showed a stock gray silhouette from
a people-directory page instead, because its url names nothing the word list rejects.

The filter was meant to keep out favicons, logos, and placeholders. It should judge an image by what it shows, not by
how much of the frame it covers or what its url says.

## What Changes

- **Flat graphics are dropped by their pixels.** An image with fewer than 64 colors on a 256 pixel copy is a
  silhouette, an identicon, a logo, or an icon, and is dropped. A stock silhouette has 11, a logo 32, a flat
  illustration 770, and a photo over 1,000. A black-and-white photo passes on 12 or more levels of its gray pixels
  instead.
- **A smaller image is kept.** The shortest side must be at least 200 pixels, in place of a third of the frame. A
  480 by 450 photo and a 400 by 400 profile photo pass, and a favicon or a thumbnail does not. A film already shows a
  small image at no more than its own size over a blurred backdrop, and limits its zoom to what its pixels hold.
- **A banner is kept.** The shape may run from 9:16 to 4.5:1, in place of 2:3 to 21:9, so a 4:1 profile banner fits.
- **An avatar is no longer rejected by its url.** A person's own photo is a picture of the page. The color check drops
  a default avatar.
- **The fetch names itself, and tries https first.** Every image and page tag fetch sends the user agent
  `CarlNotes/1.0 (+https://carlnotes.com)`. An http image url is fetched over https first, then over http if that
  fails.
- **Every film shows what the new filter keeps.** A Resource records the version of the image filter its fetch ran
  under, and a Resource fetched under an older version deletes its images and fetches again. The film render version
  goes to 3, so the backfill re-renders every film, and each re-render fetches its Resources' images again.
- **Generated images fill the frame.** The film house style asked for a calm, dark lower third, so the image model
  painted a dark curtain across the bottom of the film image and every generated chapter image. The style now asks
  for a scene painted to the bottom edge, and the lower third's espresso plate keeps the title readable.
  Generated chapter images are keyed by the style they were drawn in, so the backfill draws every chapter's images
  again in the new style and deletes the old ones.
- **The intro and the sign-off cut through the chapters.** The intro opened on one slow push into the film's image for
  as long as 40 seconds. It now opens on the film's image, cuts through the first image of each chapter in chapter
  order, and returns to the film's image as the first chapter starts. The sign-off cuts through the same images and
  pulls back from the film's image as it fades. Their shots are cut and moved as a chapter's are, and the title stays
  on screen throughout.
- **A topic never finds itself.** 62 of the 68 Findings on carlnotes.com are pages of their own topic, mostly its own
  podcast episodes. The review now drops a topic's own pages before it pays for them, and keeps the docs, the release
  notes, and other topics' pages.
- **Topic Cinema opens on every page load.** It no longer collapses once the user plays the latest film, and saves no
  choice, like the Coffee Break podcast section. A collapse lasts for that visit.
- **Specials offers a new topic.** A person's own Topic and Podcast Dashboards, and every Team Dashboard, have the
  New Topic button in the header row, where the Activity page and the team page have it.
- **The Topic Posts section sits in a card.** The button that starts a draft and the Topic Post cards sit in one card
  like the comment thread's, and the page buttons sit under the card like the scan history's.
- **A Topic Post's image pulses until it is drawn.** A draft's card and a published Topic Post waiting for its image
  show the empty frame pulsing, on the card and on the Topic Post's page.
- **The account page shows the plan once.** The plan and its button leave the bottom of both budget cards and sit at
  the right of the account page's header row, where the Activity page has its New Topic button.
- **A Topic Post's title sits in its body's card.** The editor shows the toolbar, then one card with the title over a
  divider and the body under it, on the web and on mobile. A note's code block insets its text from its fill.

LinkedIn banners and profile photos stay out of reach: Firecrawl returns a LinkedIn profile's text without images or
tags, and LinkedIn answers a direct fetch with its 999 status.

## Capabilities

### Modified Capabilities

- `resource-images`: the kept-image filter, the guarded fetch, and when a Resource's images are fetched again.
- `topic-podcast-episode-video-player`: Topic Cinema opens on every page load and saves no choice.
- `curation`: a topic's own CarlNotes pages are dropped before review.
- `specials-dashboards`: one's own Dashboard and every Team Dashboard have the New Topic button.
- `monthly-budget-cutoffs`: the plan and its button sit once in the account page's header row, not in each budget card.
- `topic-posts`: the Topic Posts section's card and page buttons, and the pulsing frame of an image not yet drawn.
- `topic-podcast-episode-video-rendering`: the film image's house style no longer asks for a dark lower third, and the
  intro and the sign-off cut through each chapter's first image.

## Impact

- `packages/pipeline/resourceImages/resourceImageFilter.ts` and `resourceImageCandidates.ts`.
- `packages/pipeline/resourceImages/fetchResourceImages.ts` and `packages/pipeline/linkPreview.ts`.
- `packages/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoRows.ts`: the render version goes to 3.
- `packages/models/prompts/topic-podcast-episode-video-image-style.md` goes to version 2.
- `packages/pipeline/topicPodcastEpisodeVideo/videoImageParts.ts` renders the intro and the sign-off from the shots
  `videoShots.ts` plans, and `videoAudio.ts` loads the audio, timeline, and captions that the render and the rebuild
  share. `videoEncode.ts` loses the single-push encode.
- `packages/pipeline/review/ownTopicPages.ts`, called first in `packages/pipeline/review/index.ts`.
- Migration 0167 adds `resources.images_filter_version`, 0 for every Resource fetched so far.
  `topic_podcast_episode_video_sections` stays for one release, since the migration runs before the new api deploys and
  the api it replaces still reads the table. A later migration drops it.
- Both apps' Dashboard pages and the web's Dashboard header.
- `packages/core/components/AccountPlan.tsx` with both apps' adapters and account pages, and the plan row leaves
  `AccountBudget.tsx` and the account skeleton.
- `packages/core/components/CardsSection.tsx` passes the page buttons to a section's frame, and both apps' Topic Posts
  sections and card elements.
- After the deploy, `bun run films:backfill` re-renders every film.
