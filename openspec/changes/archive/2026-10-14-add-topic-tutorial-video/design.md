## Context

The homepage renders on the server for a request with no session cookie, and in the browser otherwise. The hero
already shows only to a visitor, through `useIsSignedInBeforeSession`, which trusts the page load's session cookie
until Better Auth's session request finishes. The link preview card already has a YouTube player: a thumbnail served
from this origin with a play button that swaps in a `www.youtube-nocookie.com` iframe. The content security policy
allows that frame host on every page, the docs included, and allows images from this origin only.

## Goals / Non-Goals

**Goals:**

- One YouTube player for the link preview card and the homepage card.
- The card and the video's structured data are in the server-rendered html.
- The homepage loads nothing from YouTube until the play button is pressed.

**Non-Goals:**

- A video sitemap. The `VideoObject` block is enough for one video.
- Showing the card to a signed-in user, or on any page but the homepage.

## Decisions

- **A thumbnail that links to YouTube.** The shared `YoutubePlayer` renders the thumbnail as an `AnchorLink` to the
  video's watch page. A plain click is stopped and swaps in the iframe. A click with a modifier key, or any click
  without JavaScript, follows the link. The alternative, a button, does nothing without JavaScript and gives a crawler
  no link.
- **The thumbnail is a file in `ui/public/`.** The policy allows images from this origin only, and the link preview
  card already serves its thumbnails from here. Allowing `i.ytimg.com` would send every visitor's homepage load to
  YouTube.
- **The video's details live in `shared/youtube.ts`.** `TOPIC_TUTORIAL_VIDEO` holds the id, name, description, upload
  date, and thumbnail path, once. The card, the dialog, and the home route's head read it, and so does the docs build,
  so a new video changes one constant. `toVideoObjectLd` in `shared/seo.ts` builds the block beside the site's other
  JSON-LD builders.
- **The card shows on `!useIsSignedInBeforeSession()`.** It is the hero's rule, so a signed-in page load never flashes
  the card while its session request is pending.
- **One dialog in `Header`.** The header renders the desktop account menu and the mobile drawer, so it holds the
  dialog's open state and mounts the dialog once. A menu's option closes its menu and opens the dialog. A dialog inside
  a menu would unmount with the menu's content.
- **The dialog shows the card's player.** `TopicTutorialVideoPlayer` renders the thumbnail and play button in both, so
  the dialog loads nothing from YouTube until play is pressed and never starts with focus inside YouTube's frame.
- **The mobile drawer widens to the account menu's `w-52`,** so the option's name fits on one line.
- **The docs build fills a marker with the embed.** The quickstart writes `<div data-topic-tutorial-video></div>`, and
  `docs/src/rehypeTopicTutorialVideo.ts`, a rehype plugin in the docs config, replaces it with an iframe built from
  `TOPIC_TUTORIAL_VIDEO`. The docs have no React, so the frame's `srcdoc` document shows the thumbnail and YouTube's
  play button as a link to the `www.youtube-nocookie.com` player, and pressing it navigates the frame to the player,
  which autoplays. The plugin runs at build time only, so the built page is the same static html and no browser loads
  more code. Astro hands a page's html to a rehype plugin as raw text, so the plugin matches the marker's text. The page
  stays `.md` so `worker/docsSync.ts`, which reads `.md` files only, keeps embedding it, and `toSections` drops the
  marker, `TOPIC_TUTORIAL_VIDEO_MARKER` in `shared/youtube.ts`, so it never reaches chat's text.
- **The docs reuse the app's thumbnail through a symlink.** `docs/public/topic-tutorial-video-thumbnail.png` links to
  the file in `ui/public/`, so one file serves both sites. Astro copies the linked file into the built docs, and the
  image's build stage has the whole repo.

## Risks / Trade-offs

- [Astro caches a page's render and reuses it while the page and the config are unchanged] → after a change to the
  plugin alone, a local build runs with `--force`. The image's build starts with no cache.
