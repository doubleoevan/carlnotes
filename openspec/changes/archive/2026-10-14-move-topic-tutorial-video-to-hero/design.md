## Context

The hero's headline is a shimmer: a muted heading in the flow at 28% opacity, with a full-color copy and a glint
stacked exactly over it, both without pointer events. The header already holds the video dialog's open state for the
menus.

## Goals / Non-Goals

**Goals:**

- A button beside "All of it." that opens the video's dialog, in the server-rendered html.
- The YouTube icon lined up with the menu's icons.

**Non-Goals:**

- Autoplaying the video as the dialog opens. The dialog keeps its thumbnail and play button.

## Decisions

- **The button sits beside the shimmer, not inside it.** Inside the heading it would take the muted heading's
  opacity, and on a narrow screen it would shift the centered heading away from the copies stacked over it. A flex row
  holds the shimmer block and the button, centered on a narrow screen and left-aligned on a wide one.
- **The button is a link to the watch page.** A primary click with no modifier key opens the dialog through the
  header's open state, and any other click, or a page without JavaScript, opens YouTube, which also leaves a crawler a
  link to the video. `toLinkClickHandler` gives the button, the player, and the header's home link one handler.
- **The icon's view box is `-2 -2 28 28`.** Lucide draws inside a two-unit margin of its 24-unit box, so the logo gets
  the same margin. The dialog's play button grows from `size-16` to `size-20` to keep its drawn size.
- **The play is the view, and the header holds the opener.** The header's open state is the opener itself, `hero`,
  `account-menu`, or `mobile-menu`, so the dialog knows where it came from. `YoutubePlayer` calls `onPlay` as the video
  starts, and the dialog sends `visit_video_played` with the video's id and the opener. A play inside YouTube's frame
  after that is YouTube's to count.
- **The player and title move into `TopicTutorialVideoDialog.tsx`.** With the card gone, the dialog is their only
  user, and `TopicTutorialVideoCard.tsx` is deleted.

## Risks / Trade-offs

- [The video leaves the homepage's body, which a search engine may weigh against the `VideoObject` block] → the button
  is a crawlable link to the watch page beside the page's h1.
