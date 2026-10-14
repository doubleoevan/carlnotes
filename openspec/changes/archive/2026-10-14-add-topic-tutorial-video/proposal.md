## Why

A visitor who opens the homepage reads the pitch, but nothing shows them what making a topic looks like. A short
video of Carl making one answers that faster than any copy. It also gives search engines a video to index for the
homepage and the docs.

## What Changes

- The homepage shows a visitor a centered card right above the Featured topics section, titled "A Fresh Brew with
  Carl ☕" in the display font, that holds a YouTube video on making a topic. A signed-in user never sees it.
- The card is in the server-rendered html, so a crawler and a visitor without JavaScript get it. The video shows its
  thumbnail from this origin, and nothing reaches YouTube until the play button is pressed. Without JavaScript the
  thumbnail is a link to the video on YouTube.
- The homepage's structured data gains a `VideoObject` describing the video.
- The link preview card's YouTube player becomes a shared player that the homepage card uses too. A YouTube link
  preview gains the same link to the video on YouTube for a visitor without JavaScript.
- The docs quickstart embeds the same video behind the same thumbnail, and the docs sync leaves the embed's markup out
  of chat's text.
- The account menu and a visitor's mobile drawer gain an option, "A Fresh Brew with Carl" with YouTube's red play
  button, right above "What CarlNotes Is", that plays the video in a dialog.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feed-homepage`: a visitor's homepage shows the topic tutorial video card.
- `seo`: the homepage's structured data describes the topic tutorial video.
- `docs-site`: the quickstart page plays the topic tutorial video.
- `public-profiles`: the account menu and a visitor's mobile drawer play the topic tutorial video in a dialog.

## Impact

- `ui/src/components/common/YoutubePlayer.tsx` (new), `ui/src/components/common/LinkPreviewCard.tsx`
- `ui/src/components/topic/TopicTutorialVideoCard.tsx` (new), `ui/src/pages/HomePage.tsx`
- `ui/src/routes/_layout/index.tsx`, `shared/seo.ts`
- `shared/youtube.ts` (new): the video's details, and the watch page and player urls that `worker/linkPreview.ts`
  and `worker/ingest/youtube.ts` now build through
- `ui/src/components/topic/TopicTutorialVideoDialog.tsx` (new), `ui/src/components/layout/Header.tsx`,
  `ui/src/components/layout/UserMenu.tsx`, and `YoutubePlayIcon` in `ui/src/components/common/BrandIcon.tsx`
- `ui/public/` gains the video's thumbnail
- `docs/src/content/docs/quickstart.md`, `docs/src/rehypeTopicTutorialVideo.ts` (new), `docs/astro.config.mjs`,
  `docs/public/topic-tutorial-video-thumbnail.png` (a symlink), and `worker/docsSync.ts`, which the release pipeline's
  docs-sync job runs
- No new dependency. The content security policy already allows `www.youtube-nocookie.com` frames.
