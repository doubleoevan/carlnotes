## 1. Hero button

- [x] 1.1 Add `TopicTutorialVideoButton` to `TopicTutorialVideoDialog.tsx`, a watch link that a primary click turns into
      the dialog, and move the player and title in from `TopicTutorialVideoCard.tsx`
- [x] 1.2 Put the button beside the shimmer headline in `Header.tsx`
- [x] 1.3 Remove the card from `HomePage.tsx` and delete `TopicTutorialVideoCard.tsx`
- [x] 1.4 Test the hero's watch link in `-homeRoute.test.tsx`

## 2. Icon

- [x] 2.1 Give `YoutubePlayIcon` a `-2 -2 28 28` view box, and the dialog's play button `size-20`

## 3. Analytics

- [x] 3.1 Add `visit_video_played`, have the header hold the dialog's opener, and send the event with the video's id and
      the opener as the dialog's video starts
