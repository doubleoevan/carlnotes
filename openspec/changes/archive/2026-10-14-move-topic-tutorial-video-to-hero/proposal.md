## Why

The homepage card puts a large thumbnail between the hero and Featured topics. A YouTube button beside the hero's
headline offers the same video in less space, and opens it in the dialog the menus already use. The menu option's
YouTube icon also sits about two pixels left of the icons around it.

## What Changes

- The homepage card goes. A visitor's hero shows YouTube's play button right after "All of it.", which opens the video
  in the dialog. Without JavaScript, or with a modifier key, the button opens the video on YouTube.
- The YouTube icon gets the same inner margin as the menu's other icons, so it lines up with them.
- The homepage keeps its `VideoObject` structured data.
- A play in the video's dialog sends PostHog `visit_video_played` with the video's id and where the dialog was opened
  from: the hero, the account menu, or the mobile menu.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feed-homepage`: the video card is replaced by a button beside the hero's headline that opens the video's dialog.
- `public-profiles`: the menus' dialog no longer refers to the homepage card, and the hero's button opens it too.
- `monitoring-analytics`: a play of the video is a visit event naming the video and its opener.

## Impact

- `ui/src/components/layout/Header.tsx`: the button beside the headline.
- `ui/src/components/topic/TopicTutorialVideoDialog.tsx`: the hero button, and the player and title that move in from
  `TopicTutorialVideoCard.tsx`, which is deleted.
- `ui/src/pages/HomePage.tsx`: the card's removal.
- `ui/src/components/common/BrandIcon.tsx` and `ui/src/components/common/YoutubePlayer.tsx`: the icon's margin.
- `ui/src/routes/_layout/-homeRoute.test.tsx`: the hero's watch link in place of the card's.
- `shared/analytics.ts`, `ui/src/components/layout/UserMenu.tsx`, and `ui/src/components/layout/HeaderMenu.tsx`: the
  play event, and each opener naming itself.
