## 1. Shared player

- [x] 1.1 Move the link preview card's YouTube player into `ui/src/components/common/YoutubePlayer.tsx`, with the
      thumbnail as an `AnchorLink` to the watch page that a plain click turns into the iframe
- [x] 1.2 Use `YoutubePlayer` in `LinkPreviewCard.tsx`

## 2. Homepage card

- [x] 2.1 Add `TopicTutorialVideoCard.tsx` with `TOPIC_TUTORIAL_VIDEO` and the card titled "A Fresh Brew with Carl ☕"
- [x] 2.2 Show the card in `HomePage.tsx` right above the topic sections for a visitor, on
      `!useIsSignedInBeforeSession()`
- [x] 2.3 Add `toVideoObjectLd` to `shared/seo.ts` and include its block in the home route's head
- [x] 2.4 Test the server-rendered card and its watch link in `-homeRoute.test.tsx`, and the block in `seo.test.ts`

## 3. Docs

- [x] 3.1 Embed the video in `docs/src/content/docs/quickstart.md` above "1. Sign in"
- [x] 3.2 Show the thumbnail in the embed through `srcdoc`, and symlink it into `docs/public/`
- [x] 3.3 Fill the quickstart's marker from `TOPIC_TUTORIAL_VIDEO` with `rehypeTopicTutorialVideo`, and drop the marker
      in `toSections`

## 4. Menus

- [x] 4.1 Add `YoutubePlayIcon` to `BrandIcon.tsx`, and `TopicTutorialVideoPlayer` for the card and the dialog
- [x] 4.2 Add `TopicTutorialVideoDialog.tsx` with the option and the dialog that shows the video's player
- [x] 4.3 Hold the dialog in `Header.tsx`, and show the option above "What CarlNotes Is" in `UserMenuItems` and the
      visitor's mobile drawer
- [x] 4.4 Give the tutorial video's player YouTube's play button over the full-color thumbnail

## 5. The video itself

- [x] 5.1 Fill `TOPIC_TUTORIAL_VIDEO` and the quickstart embed from the YouTube link: the id, title, description, and
      upload date
- [x] 5.2 Save the video's thumbnail to `ui/public/topic-tutorial-video-thumbnail.png`
- [x] 5.3 Leave the docs embedding to the release pipeline's docs-sync job, which re-embeds the quickstart on deploy
