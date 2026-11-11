## Why

A Coffee Break podcast episode reaches only listeners today. The same recording, with each Finding's image and title on
screen, works for people who watch rather than listen, for a podcast app's video feed, and for a quick look at what an
episode covers. Nearly every input already exists: the audio, the chapter times, the transcript, and each Finding's
link preview. So a film adds a second format, and its only model spend is the draw of its own image and of up to four
imagined chapter images. This is row 62. It builds beside row 61 (the Café, Brews News, and Open Mic) and runs end to
end only after row 61 merges.

## What Changes

- **The film.** After a podcast episode publishes and its image is drawn, the worker renders a film from the podcast
  episode's own audio with ffmpeg. The intro and the sign-off show the film's own image, or the podcast episode's image
  until the film has one. Each chapter shows its Finding's link preview image, which slides in from one edge. The image
  gets a slow zoom and a blurred fill, and a lower third names the Finding's title and source domain. Captions come from
  the transcript, and a fade through espresso marks each chapter change.
- **The film's own image and Edit film.** The first render draws a 16:9 image for the film's intro, sign-off, and
  poster, in a film house style. An editor regenerates or uploads it from Edit film in the action menu of the podcast
  episode page and of the topic page, under the shared monthly regeneration limit. A new image rebuilds the intro and
  the sign-off at once.
- **Imagined images.** A chapter of 90 seconds or longer whose Finding has no link preview image gets an imagined
  image, drawn from the Finding's title and public relevance explanation alone, up to four a film. Any other chapter
  with no image shows the Carl and Vienna podcast card.
- **Backfill of each Topic's latest podcast episode.** Every podcast episode published after this ships gets a film.
  Of the older ones, only each Topic's latest gets one, through a backfill the worker starts on boot in every
  environment, so a deploy or a dev restart needs no manual step. It runs on its own queue at a concurrency of 1, bills
  nobody, skips a podcast episode it cannot render, and finds nothing on the next boot. `bun run films:backfill` starts
  or joins it by hand.
- **Three parts and a fast rebuild.** The film is stored in R2 as an intro, the chapters, and a sign-off, each encoded
  with the same settings, and joined by stream copy into the film that plays. If a film with no image of its own
  shows a podcast episode image that changes, the next play starts a rebuild: only the intro and the sign-off render
  again, and the rebuild rejoins them with the untouched chapters. A film nobody plays costs nothing to keep current.
- **Billing and failure.** A render counts against the topic owner's plan, as the recording does. A render skipped
  for a spent budget stays skipped, and the backfill never renders it later. A failed render never touches the audio.
  That podcast episode has no film section, no play button over a film, no Video button on its Brews News row, no film
  card, no row in Coffee Break films, and no item in the film feed. Removing a podcast episode or its Topic deletes its
  film.
- **One player, two formats.** The podcast player gains a format, audio or film, over one listen position, so a switch
  continues from the same second. A play counts toward plays in either format, and the listen state records how many
  were film plays. Nothing autoplays. The poster is the film's own image, or the podcast episode's until the film has
  one, and play is a press on the button over it. A film that ends plays nothing after it. Native fullscreen and
  picture-in-picture work where the platform supports them.
- **Picture-in-picture across pages.** On the web, a film in picture-in-picture keeps playing while the viewer opens
  other pages. Its window's return button opens the film in the Video dialog on the page the viewer is on.
- **Topic Cinema.** A collapsible section at the top of the topic page, titled Coffee Break Cinema, holds the inline
  player with the latest film. It opens if the user has not seen the latest film, stays collapsed otherwise, and
  remembers each user's choice per Topic. It is hidden until the Topic has a film. While the film plays, the current
  chapter highlights its Finding, and a press on a Finding's chapter pill jumps the film to that chapter. The podcast
  episode page has the inline player too, in a section of the same title under its Coffee Break podcast section. The
  theme song's credits sit right after the title of each film section and each podcast section, and beside no Podcast
  Episode title.
- **Coffee Break films.** A collapsible list on the topic page, directly above Coffee Break podcast episodes, built from
  the same list component. It has the same seasons, rows, latest mark, and five-to-a-page paging. A row loads its film
  into Topic Cinema and scrolls there. Removal stays on the podcast episodes list.
- **Video button.** On Brews News podcast episode rows, a Video button beside Play opens the player in a modal on web
  and in a full-screen sheet on mobile. Podcast cards keep Play alone.
- **Topic roast.** The topic info popup shows a Coffee Break film row right above Coffee Break podcast, for a Topic
  whose latest podcast episode has a ready film. The play button over its poster opens the same modal or sheet.
- **Film feed.** Each Topic gets a second feed beside its audio feed. It lists the same podcast episodes with their
  films, chapters, and artwork. The Subscribe dialog gains a Films option.
- **Mobile.** The topic screen gets Topic Cinema and Coffee Break films, the podcast episode screen gets the inline
  player, and the Brews News rows and the Topic roast open the Video sheet. The film supports native fullscreen and
  picture-in-picture, and its audio keeps playing with the phone locked or the app in the background. This adds
  `expo-video`.
- **MCP.** The findings view's podcast player gains a "Watch on CarlNotes" link that opens the film on carlnotes.com.
  In-host film playback is row 64.
- **Analytics.** PostHog events hold ids only: film plays, format switches, section collapse and expand, film list
  pages, modal opens, render failures, and partial rebuilds.
- **Docs.** The domain model gains `topicPodcastEpisodeVideo`. The Coffee Break docs page covers Topic Cinema, Coffee
  Break films, and the film feed. The Persona & Voice page adds their copy.

## Capabilities

### New Capabilities

- `topic-podcast-episode-video-rendering`: the film's render after publish, its encoding, captions, transitions and
  the slide-in, the film's own image with its regeneration and upload, imagined chapter images, three stored parts and
  the joined film, the partial rebuild on a changed image, billing, failure, and deletion.
- `topic-podcast-episode-video-player`: the shared player's film format, the Topic Cinema section and its remembered
  collapse, the inline player on the podcast episode page, the Video modal and sheet, Coffee Break films, chapter
  highlighting and jumps, the Edit film dialog, the film row in the Topic roast, picture-in-picture across pages, and
  the mobile and MCP surfaces.

### Modified Capabilities

- `podcast-episode-player`: listen state records each play's format and continues one position across formats.
- `podcast-episode-pages`: the theme song's credits sit right after the film and podcast section titles, on both
  pages and both apps, and no longer beside a Podcast Episode's title.
- `podcast-feeds`: a film feed per Topic beside the audio feed, and a Films option in the Subscribe dialog.
- `mcp-views`: the findings view's podcast player links to the film on carlnotes.com.
- `monitoring-analytics`: the Topic Cinema events and their id-only properties.

## Impact

- **Schema** (`packages/db/schema/podcast.ts`): a new `topic_podcast_episode_videos` table, one row per podcast episode
  with a film; `episode_listens.video_play_count`; a new `topic_podcast_episode_video_sections` table for each user's
  collapse choice per Topic. One generated migration, numbered after row 61's.
- **Worker and pipeline**: a new `packages/pipeline/topicPodcastEpisodeVideo/` folder for the frame layouts, captions,
  ffmpeg arguments, parts, join, and rebuild. `recordPodcastEpisodeWorkflow` gains a best-effort film step after the
  image. The render and a new rebuild workflow run on their own `episode-videos` task queue, and the backfill on
  `episode-video-backfill`. The satori and resvg render moves from `apps/api` into `packages/pipeline` so the worker can
  use it. Karla joins the server fonts.
- **API** (`apps/api/podcast/`): a film route beside `audio.mp3` that redirects to a presigned url and starts a rebuild
  if the film is stale; a captions route; the film feed and its per-listener token file routes; the collapse choice
  route; the film image's poster, regenerate, and upload routes; the `format` field on the listen route; a `video`
  block on the podcast episode contract.
- **Shared UI** (`packages/core`, `packages/nightshift`): the player store's format, a `TopicPodcastEpisodeVideoPlayer`
  with a video surface adapter, `TopicPodcastEpisodeVideoSection`, `TopicPodcastEpisodeVideoDialog`, a films mode of
  `PodcastEpisodesCard`, `PodcastEpisodeVideoButton` for the Brews News row's Video button and the Topic roast's play
  button, `TopicPodcastEpisodeVideoInfoSection`, and the film kind of `TopicImageEditor`.
- **Web, mobile, MCP views**: the topic page and screen, the podcast episode page and screen, both action menus, the
  Topic roast, row 61's Brews News rows, the Subscribe dialog, and the findings MCP view.
- **Dependencies**: `expo-video` in `apps/mobile`; `satori` and `@resvg/resvg-js` declared by `packages/pipeline`.
- **Contract freeze**: the new contract fields are optional, so released mobile versions keep reading.
- **Storage**: the design expected about 200 MB for a 30-minute film at the recommended settings. Real 30-minute films
  measured 49 to 85 MB. R2 holds roughly double the film's own size, about 100 to 170 MB, because the chapters part is
  kept for rebuilds.
