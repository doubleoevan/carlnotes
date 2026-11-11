## Context

See proposal.md for why. This section covers only the current state that shapes the approach.

- **Recording.** `recordPodcastEpisodeWorkflow` (`apps/worker/workflows/recordPodcastEpisode.ts`) ends with
  `publishPodcastEpisode`, then a best-effort `drawPodcastEpisodeImageActivity`. It runs on the `episode-recordings`
  queue at `PODCAST_RECORDING_CONCURRENCY` (16). The audio is a 64 kbps mono MP3 at `episodes/<id>/audio.mp3`.
  Chapter rows hold `startSeconds` and `endSeconds`, already shifted by the theme intro's 40-second lead. The outro
  overlaps the last word by 20 seconds.
- **Transcript timing.** There is none below the chapter. `PodcastEpisodeScript` holds turns, and one speech call
  records a whole chapter. The cold open is in chapter 0, a transition is in its segment's first chapter, and the
  sign-off and goodbye are in the last chapter.
- **Images.** The podcast episode image is a 1264 by 848 original (`toPodcastEpisodeImageOriginalKey`). It is drawn
  after publish, and a podcast episode without one shows its Topic's image. An editor can replace it. A Finding's link
  preview is fetched lazily, keyed by url, through `loadOrFetchLinkPreview` in `apps/api/chat/linkPreviews.ts`. Its
  image is stored at `link-previews/<id>/image` with no dimensions. An unsafe Resource gets no image.
- **Text rendering.** satori and resvg draw the share cards and covers in `apps/api/share/previewImage.ts`, with
  Architects Daughter as the only server font. The worker cannot import `apps/api`.
- **Player.** One core store (`packages/core/stores/podcastEpisodePlayerStore.ts`) drives one registered audio adapter
  per app: an `<audio>` element on web and `expo-audio` on mobile. Listen state saves through `POST
  /api/episodes/:id/listen` every 30 seconds and on pause. The docked player shows whatever is loaded. Chapter pills
  and the Finding highlight read the store's position.
- **Lists.** The topic page's Coffee Break podcast episodes list is core `PodcastEpisodesCard`, with season tabs, five
  rows to a page, a latest mark, and a remove button. Without script it renders up to `NO_SCRIPT_ROW_LIMIT` (50)
  rows of the season. Collapsible sections never persist their state on either platform.
- **Mobile.** Expo SDK 58 with `expo-audio`. Background playback is on. There is no video library.
- **Build order.** Row 61 (`cafe-brews-news-open-mic-mentions`) is in flight in another worktree that shares the dev
  database, the Temporal queues, port 3000, and the Better Auth url. It adds the Café's Featured Podcasts and the
  Brews News rows, and it reshapes the topic page.

## Goals / Non-Goals

**Goals:**

- Render a film from inputs the podcast episode already has, with no model call but the draws of the film's own image
  and of its long chapters' imagined images.
- Keep the expensive part, the chapters, immune to an image change.
- One player store, one position, and one listen row across both formats.
- Build and test everything in code, unit tests, and Storybook before row 61 merges.

**Non-Goals:**

- Films for podcast episodes published before this ships, other than each Topic's latest.
- In-host film playback in MCP views. That is row 64.
- Burned-in captions, per-word timing, or a transcription call.
- Editing a film's script, chapters, or audio, or rendering a film again by hand. An editor changes the film's image
  alone, from Edit film.

## Decisions

### Approved

These four were asked for in the brief. Each states its recommendation and the alternatives. The user approved all of
them as written on 2026-11-09, with the rest of the approach below.

**1. Size and encoding: 1280 by 720 at 24 fps, H.264 High at `-preset veryfast -crf 28`, AAC-LC 96 kbps mono.**

- Video: `libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -r 24 -preset veryfast -crf 28 -tune stillimage
  -maxrate 1500k -bufsize 3000k -g 48 -keyint_min 48 -sc_threshold 0`. Every part opens on a keyframe, and a
  keyframe follows every two seconds, so the stream copy join is clean and seeks land fast.
- Audio: the podcast episode's MP3 transcoded once to AAC-LC at 96 kbps, mono, 44.1 kHz. That matches the source,
  so nothing is lost that the MP3 had.
- Container: MP4 with `+faststart`, so the first frame plays before the whole file loads.
- Expected size: a 30-minute film is about 200 MB at these settings, since a slow zoom moves every pixel and spends
  bits. The chapters part is kept too, so storage is about 400 MB for a full podcast episode and 140 MB for a short
  one. The fixture test prints the real numbers, and the first real render is checked against them. Real 30-minute
  films measured 49 to 85 MB.
- Alternatives: 1080p doubles the size and the encode time for no gain, since most link preview images are 1200
  pixels wide or less. 30 fps adds a quarter more frames to a slideshow. HEVC is smaller but not playable in every
  browser.

**2. Caption style: soft captions, never burned in. Each cue is two lines of at most 42 characters, and a cue that
starts a turn names its speaker.**

- One WebVTT file per film, served at its own route. Web and MCP add it as a `<track kind="captions" default>`.
  The same cues are muxed into the MP4 as a `mov_text` track, which iOS and Android players show inline, in
  fullscreen, and in picture-in-picture.
- Web styles cues through `::cue` with Nightshift values: Karla 500, the hero band's latte on espresso at 75 percent.
  Native players draw cues in the viewer's system caption style. That is a platform difference, and the right one for
  accessibility.
- The toggle is the player's captions button, on by default. It sets the track mode on web and the subtitle track on
  mobile. The choice is kept for the session only.
- Timing: each chapter's turns share the chapter's span in proportion to their characters. Each turn boundary then
  moves to the nearest pause within 1.5 seconds, found by one `silencedetect` pass over the podcast episode audio.
  A cue is then cut at sentence or clause breaks to fit two lines and at most 7 seconds. The cue that opens a turn
  starts with "Carl:" or "Vienna:".
- Alternatives: burned-in captions cannot be turned off and cost a re-encode for every caption fix. A transcription
  call with word timestamps is exact but adds model spend to every film, which the brief rules out. Proportional
  timing alone drifts by seconds inside a long turn, and the pause pass fixes most of that for one cheap ffmpeg run.

**3. Transitions: a slow 1.2-second fade through espresso between chapters, and between the intro, the chapters, and
the sign-off. A chapter's link preview image slides in instead of fading in.**

- Each segment fades in from espresso over its first 1.2 seconds and out to espresso over its last 1.2 seconds, and a
  segment shorter than both fades splits its length between them. The fades live inside each segment, so segments
  still join by stream copy, and the audio never dips. The lower third keeps its own 0.4-second fade.
- A chapter that shows its Finding's link preview image replaces the fade in with a slide, as if Carl pulled the page
  up by hand. The still starts outside the frame on one edge, moves fast, passes its place by 2.5 percent of the frame,
  and settles back within 0.9 seconds, or within half of a shorter chapter. It is one back ease of the time in the
  overlay's position, over an espresso `color` source, so the first frame is still espresso and the join is unchanged.
  The few frames past its place show a sliver of espresso at the edge it came from, at most 32 pixels wide or 18 high,
  which reads as the film's own color. The edge is the first byte of a SHA-256 of the podcast episode's id and the
  chapter's position, so it varies across a film and a retry draws the same parts. The zoom runs under the slide, and
  the lower third fades in at its place. An imagined image, the podcast card, the intro, and the sign-off keep the
  fade in. An 8-second segment encodes in about 2 seconds either way.
- While the hosts answer hot takes, the film shows the podcast card, which fades in and out and never slides. A
  chapter's hot takes come after its Finding, and the closing hot takes are recorded at the end of the last chapter,
  so each stretch runs from one turn to the end of its chapter's recording. `videoHotTakes.ts` finds that turn: the
  first one that names a writer whose hot take the script read, or the first closing turn if a closing turn names one.
  The turn's time comes from the captions' turn times, so the cut lands on a pause. `toVideoTimeline` ends the chapter
  there and adds a `hot-takes` segment, encoded like a chapter with a "Hot takes" lower third. A cut that would leave
  either side under 4 seconds is not made. The closing stretch holds the podcast card through the goodbye, since the
  hosts are the ones talking. A username that is also an ordinary word could start the stretch early. Storing each
  hot take's turns in the script would be exact, and is not needed for the usernames people pick.
- The lower third fades in 0.6 seconds into a chapter and out at 8 seconds. Captions start above it while it shows,
  and drop to the bottom once it fades. On web this uses the cue's line setting. Native caption tracks ignore line
  settings, so for those 8 seconds a native caption may cover the lower third. That is the one named deviation.
- Alternatives: a crossfade needs both chapters in one filter graph. That ties the parts together and rules out
  joining them by stream copy. A hard cut is free but jars at the change of image.

**4. Collapse state: a server row per user and Topic, `topic_podcast_episode_video_sections`.**

- Columns: `user_id`, `topic_id`, `is_open`, and `podcast_episode_id`, the latest film when the user chose.
- Rule: if the user has a row and its podcast episode is still the latest film, the row decides. Otherwise the
  section opens if the user has no play of the latest film in either format, and stays collapsed if they do. A new
  film the user has not seen therefore reopens a section that was closed on an older film. A signed-out visitor sees
  it open.
- The topic payload includes the resolved state, so the first render is right and nothing jumps.
- Alternatives: localStorage on web and AsyncStorage on mobile need no route. But they hold a device's choice, not a
  user's. They cannot follow the user to another device, and the first render cannot know them.

### The rest of the approach

**Data.** A `topic_podcast_episode_videos` table (`topicPodcastEpisodeVideos`) has one row per podcast episode that has
a film. It holds the podcast episode, a status (`rendering`, `ready`, `failed`), the error, the four object keys, the
film's byte size and duration, `rendered_image_hash` (the image the intro and sign-off were drawn from), the film's own
image (`image_hash`, `image_origin`, `image_prompt`), and a `cost`. `episode_listens` gains `video_play_count`.
`play_count` stays the total of both formats, so every count that exists keeps its meaning.

**Storage.** All keys sit under `episodes/<id>/video/`. The keys are `chapters.mp4`; `intro-<imageHash>.mp4`,
`sign-off-<imageHash>.mp4`, and `film-<imageHash>.mp4`; `captions.vtt`; and the film's own image,
`image-<imageHash>.jpg`. All the parts are video only. The film joins the three parts by the concat demuxer with
`-c copy`, then maps the AAC audio and the `mov_text` captions. Because a rebuilt film gets a new key, a presigned url
that is still open never serves a half-written file.

**Where it runs.** A new `episode-videos` task queue has its own worker, with `TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY`
defaulting to 1, so long CPU-bound renders never take slots from recordings. `recordPodcastEpisodeWorkflow` starts
`renderTopicPodcastEpisodeVideoWorkflow` as an abandoned child after the image step, with the workflow id
`episode-video-<podcastEpisodeId>`. The recording finishes without waiting, and a film failure can never fail the
podcast episode. The render is one activity with a four-hour timeout, 3 attempts, and a heartbeat every 30
seconds. The prod worker has one core per instance, where a film renders in about three times its length, so a
30-minute film takes about 80 minutes. Each ffmpeg run has its own time limit and stops when the attempt is cancelled,
so a timed-out attempt never renders beside its retry. It works on temp files, deletes each segment's stills once the
segment is encoded, and uploads the parts and the film at the end.

**Backfill.** The user changed "no backfill" to a backfill of each Topic's latest podcast episode on 2026-11-09.

- `backfillTopicPodcastEpisodeVideosWorkflow` is modeled on `backfillTopicImagesWorkflow`: one workflow under the
  fixed id `episode-video-backfill`, so a second start joins the one running, paged 100 Topics at a time with
  `continueAsNew`, public Topics first and then private and team Topics.
- A page lists each Topic's latest published podcast episode, published before the backfill started, with no film row
  in any status. Every podcast episode published after the worker boots gets its film from the recording instead.
- It runs on its own `episode-video-backfill` task queue with `TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY`,
  default 1. The workflow renders that many at a time, and the queue's worker runs that many activities.
- The render is the same activity as a new film's, with platform billing: no spend cutoff, and a cost of zero.
- A podcast episode missing its audio, transcript, or chapters is written as a failed row with the reason
  `missing-inputs` and a warning log. A render that fails every attempt is marked failed. Either way the next listing
  skips it, so nothing is retried in a loop.
- A new film's render that was skipped for its owner's spent budget is a failed row too, with the reason
  `spend-cutoff`, so the listing skips it and the platform never pays for a film the owner's plan did not cover.
- The worker starts the backfill once its workers poll, in every environment, and does not wait for it. With nothing
  missing, the first page is empty and the workflow ends. `bun run films:backfill` starts or joins it and prints the
  summary: rendered, skipped, and failed counts, the total render seconds, and the stored bytes.

**Frames.**

- satori and resvg move from `apps/api/share/previewImage.ts` into `packages/pipeline/cardElementPng.ts`, and the fonts
  move with them to `packages/pipeline/assets/fonts/`. Karla joins Architects Daughter from `ui-tests/fonts/`.
  `apps/api/share/` imports them back.
- Each chapter's still is the Finding's link preview image. It is read from the stored link preview row for the
  chapter's url if one has an image. Otherwise it is fetched directly with the fetchers in
  `packages/pipeline/linkPreview.ts`, and no row is stored. Storing a row would mean encrypting its text with the chat
  key in `apps/api/chat/`, and the chapters part renders only once.
- An unsafe Resource, read from the chapter's own Resource, gets no image. So do a failed fetch and an image that
  cannot be decoded. Each of these uses the podcast cover illustration (`apps/docs/design/podcast/cover-base.png`),
  which is Carl and Vienna's podcast card.
- The image is normalized to PNG with sharp, which the pipeline already uses. It is composed at 5120 by 2880, four
  times the film's size, and read once per segment. The zoom moves a whole pixel of the still at a time, so it moves a
  quarter of a film pixel at a time and stays smooth. The backdrop is the image scaled to cover, blurred, and darkened.
  The image itself is scaled to fit, at most its own size on the film, and centered. A 16:9 image of 1280 pixels or
  wider skips the backdrop and covers the frame.
- `zoompan` scales the composed frame from 1.0 to 1.35 over the chapter's length, at 1280 by 720. The intro zooms
  in from 1.0 to 1.8 over its length, and the sign-off runs the same zoom backward, from 1.8 to 1.0, so both moves
  are easy to see on parts that run under a minute. Every zoom follows a cosine ease, slow at both ends and about
  one and a half times the even speed in the middle, which reads as a camera move and makes the motion easier to see.
- The Carl and Vienna podcast card is the square cover illustration cut to a 16:9 band under the cover's title band,
  at its full width, so it covers the frame like any wide image.
- The lower third is a transparent PNG from satori: the Finding's title in Karla 600, two lines at most, and the
  source domain under it, on an espresso plate.
- The intro shows the film's image, its own or else the podcast episode's, with a lower third of its title and its
  details line, for example "AI Agents · S2026 E14". The sign-off shows the image with "Coffee Break podcast with Carl
  and Vienna" and "Carl and Vienna are AI voices".

**Exact lengths.** A segment's frame count comes from its boundaries on the 24 fps grid: `round(end × 24) − round(start
× 24)`. Rounding never adds up across 15 chapters, and the film's chapter times match the audio's to within one frame.
Gaps between chapter rows go to the earlier chapter. The intro covers 0 to the first chapter's start, and the sign-off
covers the last chapter's end to the podcast episode's duration.

**Rebuild.**

- The film route compares `rendered_image_hash` with the image the film shows now: its own, or else the one the podcast
  episode shows, its own or its Topic's.
- If they differ and the podcast episode's owner, the user the render and the rebuild bill, is under the podcast
  episode spend cutoff, the route starts `rebuildTopicPodcastEpisodeVideoWorkflow` with the id
  `episode-video-rebuild-<id>`. An already-started error is ignored, the same way `startTopicImageWorkflow` handles it.
- The route serves the current film at once. The rebuild renders the intro and the sign-off, joins them with
  `chapters.mp4` by stream copy, and maps the audio and captions from the current film. Then it swaps the keys in one
  update and schedules the old objects for deletion after `REPLACED_IMAGE_GRACE_MS`.
- The play that finds a stale film shows the old intro, and the next play shows the new one. Holding the play for a
  rebuild of about 20 seconds was rejected, since that wait sits on the tap the user just made.

**Billing.**

- A render costs `TOPIC_PODCAST_EPISODE_VIDEO_DOLLARS_PER_MINUTE` per film minute, set in `packages/models/budget.ts`.
  The rebuild costs the same rate for the minutes it renders.
- Both add to the video row's `cost`, which `loadSpendSince` sums by the podcast episode's owner beside `episodes.cost`.
- The render and the rebuild are skipped once the owner passes the `podcastEpisodes` spend cutoff, the same check that
  `planPodcastEpisode` makes. A skipped render writes a failed row with the reason `spend-cutoff`, with no error report
  and no failure event. Every reader asks for a ready row, so the podcast episode simply has no film, and the backfill,
  which lists podcast episodes with no film row, never renders it on the platform's bill.

**Deletion.**

- `toTopicPodcastEpisodeVideoKeys` reads a video row's keys. `removePodcastEpisode`, the short podcast episode
  replacement, and `deleteTopic` add those keys to the pending deletions in the same transaction that removes the row.
- A failed render deletes its temp files and any uploaded part.

**Player.**

- The core store gains `format: "audio" | "video"` and a second adapter slot, `registerTopicPodcastEpisodeVideoAdapter`.
  The web adapter wraps a `<video>` element. The mobile adapter wraps an `expo-video` player.
- The store sends play, pause, seek, and rate to the adapter of the current format.
- A switch pauses one adapter, seeks the other to the same position, and plays it if the first was playing.
- A film frame that goes away while its film plays pauses it where it stood. That happens when the modal closes or
  the page changes. The dock stays, and its play continues as audio from that spot. A film in picture-in-picture on
  the web is the exception, in the decision below.
- Listen saves send `format` with `isPlaybackStart`, so the server adds 1 to `video_play_count` beside `play_count`.

**Player component.** Core `TopicPodcastEpisodeVideoPlayer` composes the film's frame with the play button over it,
the existing seek bar split by chapters, the playback control buttons, a captions button, a Mute button, and fullscreen
and picture-in-picture buttons wherever the adapter reports support. It takes a
`TopicPodcastEpisodeVideoPlayerElements` adapter for the frame and the buttons, the same pattern as
`PodcastEpisodePlayButtonElements`. The poster is the film's own image, or the podcast episode image at its page size
for a film with none. Native controls are off inline and appear in native fullscreen.

**Surfaces.**

- `TopicPodcastEpisodeVideoSection` is a `CollapsibleSection` whose open state is controlled and saved through `PUT
  /api/topics/:id/video-section`. It sits directly under the topic header, above the Coffee Break podcast player.
- The Coffee Break films list is `PodcastEpisodesCard` in a `video` mode: no remove button, a row play that loads the
  film into the section and scrolls to it, and season fetches filtered to podcast episodes with a film.
- `TopicPodcastEpisodeVideoDialog` is the web `Dialog` and the mobile `Sheet` at full height, each holding the player.
  The Brews News row gains a Video button beside Play, shown only if the podcast episode has a film. A podcast card
  keeps Play alone, since each Topic's latest podcast episodes all have films and the film cards open them.

**Mobile.**

- `expo-video` is configured with `supportsPictureInPicture`, `supportsBackgroundPlayback`, `staysActiveInBackground:
  true`, and `showNowPlayingNotification: true`. The film's audio keeps playing with the phone locked.
- The lock screen shows play, pause, and seek for the film. It does not show the audio player's chapter skips, because
  `expo-video` owns the session while the film plays. That is a named deviation.
- Playing the audio again returns the lock screen to `expo-audio`.

**MCP.** The findings view's podcast player shows a "Watch on CarlNotes" link if the podcast episode has a film. The
link opens the podcast episode page on carlnotes.com through `openMcpViewLink`, and its anchor `#film` scrolls to the
inline player.

**Platform deviations.**

| Component | Platform | Reason | What differs |
|---|---|---|---|
| `TopicPodcastEpisodeVideoDialog` | mobile | a phone has no room for a centered dialog | a full-height `Sheet` instead of a `Dialog` |
| captions | iOS, Android | native players draw `mov_text` in the system style and ignore cue lines | system caption style; a cue may cover the lower third for its first 8 seconds |
| lock screen | iOS, Android | `expo-video` owns the media session while the film plays | play, pause, and seek, without chapter skips |
| picture-in-picture | Firefox | no picture-in-picture API for pages | the button is hidden |
| picture-in-picture across screens | iOS, Android | `expo-video` ties picture-in-picture to the film's view on iOS and to the whole activity on Android | leaving the film's screen pauses the film, as before |
| theme song credits | mobile | a phone has no room for an anchored popup | the headphones button opens the credits in a `Sheet` |

**Analytics.**

- Server events:
  - `episode_played` gains `format`.
  - `episode_video_render_failed` has `topicId`, `podcastEpisodeId`, and a short `reason` code.
  - `episode_video_rebuilt` has `topicId`, `podcastEpisodeId`, and `renderSeconds`.
- Browser visit events:
  - `visit_episode_format_switched` has `podcastEpisodeId` and `format`.
  - `visit_episode_video_section_toggled` has `topicId` and `isOpen`.
  - `visit_episode_videos_page_viewed` has `topicId`, `season`, and `page`.
  - `visit_episode_video_dialog_opened` has `podcastEpisodeId` and `surface`. This change sends `home-news` and
    `profile-news` from a Brews News row's Video button and `topic-info` from the Topic roast's play button. The film
    cards of `home-and-profile-topic-podcast-episode-videos` send `home-videos`, `newest-videos`, `profile-videos`, and
    `team-videos`.
- All of them hold ids only.

**The renderer's proof before row 61 merges.** `topicPodcastEpisodeVideo.test.ts` builds a fixture podcast episode
with ffmpeg's `lavfi` (a 2-second intro, three 3-second chapters, and a 2-second sign-off of sine audio), two fixture
images, and one missing image. It renders the three parts, joins them, and asserts the following with `ffprobe`:
the duration, the codecs and sizes, a keyframe at every part boundary, and a `mov_text` track. It then rebuilds with a
new image and asserts that the chapters part's bytes are untouched. It skips when ffmpeg is missing, like the audio
join test.

### The film's own image

The user approved this on 2026-11-10. Each film gets an image of its own for its intro, its sign-off, and its poster.
The chapters keep the Findings' images.

- **The image.** 16:9 at the film's frame size, 1280 by 720, full frame with no paper edge or border, in film lighting
  and the app's palette, with a calm dark lower third where the title sits. A new house style prompt,
  `topic-podcast-episode-video-image-style.md`, says so. The scene comes from the topic image's scene writer over the
  podcast episode's title, description, tags, and chapter titles, in one fixed wide framing.
- **One image path.** `renderTopicImageOriginal` takes a `TopicImageFormat`: the style prompt, the aspect ratio the
  image model draws at, and the pixel size of the crop. The topic format stays 3:2 at 1264 by 848, and the film format
  is 16:9 at 1280 by 720. `renderTopicImage` sends the format's aspect ratio in `imageConfig`.
- **Storage.** One jpeg at `episodes/<id>/video/image-<imageHash>.jpg`, with no derived sizes, since the frame render
  and the poster both want the frame size. The poster route,
  `GET /api/topic-podcast-episode-video-images/:podcastEpisodeId/:hash/poster.jpg`, serves it behind the Topic's
  visibility, immutable at its hash. `podcastEpisode.video.posterUrl` names it.
- **When it is drawn.** Inside the render activity, after the row is written as rendering and before the intro and the
  sign-off, on the owner's key, or the master key for the backfill. The cost adds to the film row's `cost`. A draw gets
  two attempts. A failed draw is reported and the film renders with the podcast episode image. A second render attempt
  finds the stored image and draws nothing.
- **Which image a render picks.** `toShownImage` returns the film's own image first, then the podcast episode's, the
  Topic's, and the podcast card. The render, the rebuild, and the film route's stale check all read it. So a film with
  its own image never rebuilds for a changed podcast episode image.
- **Regenerate and upload.** `POST /api/episodes/:id/video/image/regenerate` and `POST /api/episodes/:id/video/image`,
  for whoever passes `topic:edit` on the podcast episode's Topic, on a podcast episode with a ready film. A regeneration
  is a `topic_image_renders` row of kind `regenerate` that names the film in `topic_podcast_episode_video_id`, so the
  one `imageRegenerationLimit` count includes it. The render workflow is the topic image's own. An upload is
  center-cropped to the frame and counts against nothing, like the other images' uploads.
- **Rebuild.** `replaceTopicPodcastEpisodeVideoImage` stores the file, swaps the hash, schedules the replaced file for
  deletion after `REPLACED_IMAGE_GRACE_MS`, and starts the existing rebuild at once, since an editor who changed the
  image is looking at the film. The stale check on play stays as the fallback.
- **Controls.** The shared `TopicImageEditor` gains the kind `topicPodcastEpisodeVideo`, in the standard layout at
  the film's 16:9 frame. Both apps open it from Edit film in the action menu, for a user who may edit the podcast
  episode. The decision "Edit film in the action menu" below holds the details.
- Alternatives: drawing the image in its own workflow step would retry on Temporal's schedule, but it changes the
  render and backfill workflows' histories. Derived poster sizes would save bytes on a phone, but one 1280 by 720 jpeg
  is about 120 KB. A separate regeneration limit for films would need a new plan field for no gain.

### Cinema and podcast sections, the play button over the film, Mute, and picture-in-picture across pages

The user asked for these on 2026-11-10, after seeing the podcast episode page: "two collapsible sections. Coffee Break
Cinema containing the video and Coffee Break Podcast containing the podcast. Play button on top of video", then "can
picture in picture let us keep playing while we browse around? can we have mute button instead of listen button on
topic page. watch button should be highlight".

- **Sections.** The podcast episode page shows "Coffee Break podcast" and then "Coffee Break Cinema", both the page's
  `CollapsibleSection`, as the topic page uses it. The film's section led at first, and task 16.7 put the podcast's
  section above it. Coffee Break Cinema keeps its player mounted while closed, like Topic Cinema, and its card holds
  the film alone. An editor changes the film's image from Edit film in the action menu, in the decision below. Neither
  section's state is saved: both open on every visit, like the topic page's Coffee Break podcast section. Topic
  Cinema's saved row answers "has this user seen the Topic's latest film", which is not a question about one podcast
  episode's page, and the page's payload does not have it. The loading skeleton shows the podcast section and no film
  section, as the topic page's skeleton shows no Topic Cinema.
- **While a film renders.** The podcast episode payload has an optional `isVideoRendering` beside `video`, true only
  while the film row's status is `rendering`, from the one read of the film rows, which reads both statuses. The film
  section then shows the recording card's frame with "🎬 Carl and Vienna are filming..." in the player's place: on the
  podcast episode's page, and in Topic Cinema while the Topic has no ready film and its latest podcast episode's film
  renders. A Topic with a ready film keeps that film in Topic Cinema. The app builds the rendering section from
  `latestPodcastEpisode`, so `topicPodcastEpisodeVideoSection` names a ready film alone for Coffee Break films, Edit
  film, the details line, and the film feed, and a client that reads neither field shows what it showed before. That
  section opens on each visit, since the saved choice is read for a ready film. A page showing the card reads again
  every 30 seconds, paused in the background, for at most four hours, the time limit of one render attempt. A failed row
  shows nothing.
- **Play over the film.** The play button moves from the control row to the middle of the film's frame. It is one
  button that fills the frame: paused, its highlighted round button shows over the poster, which reads on a light or a
  dark image. Playing, the round button hides, a press on the frame pauses, and keyboard focus shows it again. The label
  stays "Play" or "Pause" with the podcast episode's number. The control row keeps the skips and speed at the left,
  and captions, Mute, picture-in-picture, and fullscreen at the right.
- **The skips and speed start the film.** The skips and the speed show before the film is loaded. A press on one
  starts the film as the play button does: skip forward 30 seconds past the start position, skip back 15 seconds
  before it and never before zero, and the speed at the next speed. The start position is the audio's second if
  the podcast episode is loaded, or its saved progress. Core's `skipTopicPodcastEpisodeVideoBy` and
  `cycleTopicPodcastEpisodeVideoPlaybackRate` hold the rule for both apps.
- **A card on a page.** On the topic page and the podcast episode page the film, its seek bar, and its control row
  sit in one card in the podcast player card's style. The core player's `isCard` draws it, so no page has its own
  copy, and the Video dialog and sheet keep their own frame. On a phone the card leaves too little width for seven
  44-point controls, so the control row wraps to two rows there.
- **Mute replaces Listen.** The film player's Listen button is gone. Mute turns the film's sound off, for watching with
  captions, and lasts for the session like the captions choice. The audio has its own sound.
- **Both players on one page.** The store keeps one loaded podcast episode, one position, one speed, and one format.
  Each player's play button names its format: the film's play takes the source for the film, and the card's play
  takes it for the audio, each stopping the other and continuing from the same second and speed. Both seek bars show the
  one position. A play button anywhere else keeps the loaded podcast episode's format, so the docked player and a
  Finding's chapter pill act on a playing film, and a play of another podcast episode is audio.
  `visit_episode_format_switched` reports each switch of the loaded podcast episode, in either direction.
- **Picture-in-picture across pages, on the web.** The browser has one `<video>` element for the app's lifetime
  (`apps/web/src/stores/topicPodcastEpisodeVideoElement.ts`), registered once as the store's video adapter. A film
  player shows a poster, and moves the element into its frame while its film is loaded. A layout effect's cleanup
  moves the element to a hidden host on `document.body` before React removes the frame, so the element never leaves
  the document. If the element is in picture-in-picture it plays on from the host, and the docked player shows it.
  Otherwise the film pauses for the audio, as before. A window closed while a frame holds the element returns the
  picture there. A window closed while the element is in the host pauses the film for the audio. Unloading the element,
  which the audio or another film does, closes the window.
- **Mobile.** The play button over the film, Mute, and the two sections are built from the same core components.
  Picture-in-picture is as it was: `expo-video` gives the window to the film's view on iOS and to the
  whole activity on Android, so a film cannot float over other screens of the app without one film view that outlives
  every screen. That is not built.
- Alternatives: a second hidden `<video>` kept in sync for picture-in-picture doubles the download and can drift. A
  film element positioned over the page's frame from the layout breaks in a dialog and a collapsed section. Saving
  each page section's state needs a new row and route for a page that is opened for one podcast episode.

### Imagined images for long chapters

The user asked for this on 2026-11-10. A long chapter whose Finding has no link preview image shows an image drawn for
it, an imagined image, in place of the podcast card.

- **Which chapters.** A chapter with a safe Resource whose segment runs
  `TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS` or longer, default 90, and whose link preview
  image is missing or cannot be read. The longest of them get an image, up to
  `TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_LIMIT` a film, default 4, and a limit of 0 turns imagined images
  off. Every other chapter keeps what it showed: its link preview image, or the podcast card. A picked chapter whose
  image fails is not replaced by the next longest.
- **One image path.** `drawTopicPodcastEpisodeVideoImageOriginal` is the film image's own draw: the topic image's scene
  writer in the film's wide framing, then the film house style prompt on the topic image model, 16:9 at 1280 by 720,
  with two attempts. No new prompt. The scene writer's topic name and topic prompt hold the Finding's title, which is
  its Resource's title or else the chapter's, and `findings.relevance_explanation`, the public explanation the feed
  shows. Both are fenced as untrusted, and no private annotation, Personal sources text, Note, or Comment is read.
- **When.** `prepareChapterFrames` in `videoChapterStills.ts` runs before the chapters are encoded. It loads each long
  chapter's link preview still once, writes it to the work folder, picks the chapters, draws up to four images at a
  time, and returns the load of each chapter's frame. The render heartbeats after each still. The chapter encode gives
  an imagined still the same 1.0 to 1.35 zoom as any other.
- **Moderation.** Each drawn jpeg goes through `classifyImage`, the check an uploaded image passes. A violation, an
  image the check cannot read, and a failed check leave the podcast card, and a failed check is reported. A check
  skipped for a missing moderation key lets the image through, which is what an upload gets there, and no other
  generated image is checked at all.
- **Billing.** A draw runs on the owner's key, and each drawn image adds the image model's price to the film row's
  `cost`, one the moderation then rejects included, since the key paid for it. The backfill draws on the master key and
  adds nothing. A spent budget, a rejection, a failed draw after its attempts, and any thrown error are reported and
  leave the podcast card. Nothing here fails or holds the render.
- **Storage.** One jpeg at `episodes/<id>/video/chapter-<position>-image.jpg`, stored once it passes the check. A
  render's second attempt finds it and draws nothing. The key needs no column. `toTopicPodcastEpisodeVideoKeys` lists
  the key of every chapter position of a film's podcast episode, counted from its script, so removing the podcast
  episode or its Topic deletes the images with the film. A key with no object deletes as a no-op, the way the chapter
  audio keys do.
- Alternatives: a key by rank among the picked chapters would bound the keys by the limit, but a link preview fetch
  that fails on one attempt and succeeds on the next would shift the ranks and show a chapter another chapter's image.
  Storing a rejected image would save its second draw on a retry, but would keep an image the moderation flagged. A
  column that lists the drawn positions would make the deletion exact, at the cost of a migration.

### No Watch in the podcast card, and the theme song's credits beside the section titles

The user asked for this on 2026-11-10: "we dont need watch next to the podcast because the video already there above",
and to move the theme song's credits from the top of the podcast episode page and from beside the podcast's title to
"next to Coffee Break Cinema and next to Coffee Break Podcast", with the Lucide headphones icon.

- **No Watch.** The audio player card's Watch button is gone on both apps, with core's `WatchButton` element and
  `onWatch`, the store's `watchPodcastEpisode`, and the section store's `watchInTopicPodcastEpisodeVideoSection`. The
  film sits in its own section on both pages that show the card, right above the card on the topic page and right
  under the podcast's section on the podcast episode page, and its own play button and early controls continue from
  the audio's second. The podcast episode page no longer holds its film section's open state, which only Watch
  changed. `PodcastEpisodeFormat`, the store's one format, `playTopicPodcastEpisodeVideo`, `playPodcastEpisodeAudio`,
  and `visit_episode_format_switched` stay, since the film's play and the card's play still give the source to each
  other. A film card's button and Video on a news row are `PodcastEpisodeVideoButton`.
- **Credits beside the section titles.** `PodcastThemeSongNote` is each app's one component, passed as the `titleNote`
  of the app's `CollapsibleSection` in four places: the film section and the podcast section of the topic page and of
  the podcast episode page. It no longer shows in the podcast episode page's header or beside a Podcast Episode's
  title in the player card, and the nudges that centered it on those titles are gone. A Topic with no film shows it
  once.
- **The trigger.** The web's is the 28px icon button around the 24px raised tile of the topic title's note, with
  Lucide's `Headphones` in the tile: `NoteIcon` in `TITLE_ICON_BUTTON_CLASS`, which moves from the topic card's module
  to `styleClasses.ts` so the podcast episode page does not import the topic card. The mobile app's is the same tile
  with a hit slop to the touch target. The label stays "Theme song credits", and the popup and the sheet are unchanged.
- **Never the toggle.** The button is a sibling of the section's toggle, never inside it. The markup stays one button
  beside another, the button takes keyboard focus by itself, and a press cannot reach the toggle. With a title note
  the toggle ends at the title, and the aside and the count sit at the far right. The mobile `CollapsibleSection` now
  lays a title note out as the web's does, right after the title, where it used to put the note at the far right. With
  a note, its count sits outside the toggle and hides from screen readers, which read it in the toggle's label. The
  comment thread's mention badge is a title note too, so it also moves to right after its title on mobile, as on the
  web.
- **One title.** The topic page's film section was titled "Topic Cinema". It now reads "Coffee Break Cinema", the
  podcast episode page's title, from one constant, `TOPIC_PODCAST_EPISODE_VIDEO_SECTION_TITLE` in core's
  `podcastEpisodeCopy.ts`. Identifiers, the saved row, and the analytics events keep their names. Specs, comments, and
  the domain model still say Topic Cinema for the topic page's section, to tell it from the podcast episode page's.
- Alternatives: Watch kept as a shortcut that scrolls to the film would repeat the play button a few lines above it.
  The credits inside the toggle would nest a button in a button. A second credits component for the section titles
  would be a copy of the first.

### Edit film in the action menu

The user asked for this on 2026-11-10, with a picture of the Edit podcast dialog: "instead of showing the image
regenerate in the page lets have an action menu option Edit film. The only thing we can do there is regenerate the
image so no cancel or save button just that close button at the top. oh or upload an image. on hover like our
standard", and then "Edit film goes above Edit podcast in the action menu of topic and podcast page".

- **The option.** "Edit film", under the Lucide `Clapperboard`, shows to a user who passes `topic:edit`, for a podcast
  episode with a ready film: `isTopicPodcastEpisodeVideoEditShown` in core's `lib/podcastEpisodeEditor.ts`. On the
  podcast episode page it sits right above Edit podcast. Each app has one option builder,
  `toEditTopicPodcastEpisodeVideoOption`, which both of its pages call.
- **The topic page.** The topic page's menu has no Edit podcast on either app, so Edit film sits where it would go by
  the podcast episode page's order: right after Share topic, leading the editing options. It edits the Topic's latest
  film, the one Topic Cinema opens with, from `toTopicPageEditedPodcastEpisode`. The topic read has no editor's view of
  the film's image, so `useTopicPodcastEpisodeVideoEditableImage` reads the podcast episode's page once the option is
  picked, and the dialog opens once it loads. Adding the two fields to the topic read would cost that read a query for
  a dialog few visits open.
- **The dialog.** `EditImageDialog`, the dialog a header image opens, on the web's `Dialog` and the app's `Sheet`: the
  title, the close button, and the image block, with no Cancel or Save, since each change applies at once. A film's
  dialog is titled "Edit film" and shows the "Image" label over the block, as the Edit podcast dialog does, because
  its title names the film and not the image.
- **One layout.** The film kind of core's `TopicImageEditor` no longer has its own layout. The image is back as the
  upload control, so the Upload button, the button row, and the wide prompt row are gone from core and both adapters.
  The block's `Image` element takes an `aspectRatio`, 16:9 for a film and 3:2 for every other image, and each adapter
  maps it to its class. The film's image is its poster, one file, which `toTopicPodcastEpisodeVideoImageUrls` in
  `packages/contracts/topicImages.ts` returns at every size the block's image reads. A render's `posterUrl` and an
  upload's replace the image in the dialog the same way, and the page reload updates the player's poster.
- **The player.** The core player's `children`, which only held the image controls, is gone, so the card holds the
  film, its seek bar, and its controls.
- Alternatives: a second dialog component for the film would copy `EditImageDialog`. Editing the film Topic Cinema
  shows, in place of the latest, would leave a chosen older film's poster stale on the page after a change, since the
  section store holds that film's read.

## Risks / Trade-offs

- [A 30-minute render takes many CPU minutes on the worker] → It runs on its own queue at concurrency 1. The fixture
  test reports speed per film minute, and the concurrency setting can rise on a larger worker.
- [Temp disk for a render is about 400 MB] → The render streams each segment to disk and deletes the segment once the
  chapters part is joined. Northflank's ephemeral disk is sized for it in the deploy steps.
- [Caption timing drifts inside long turns] → The pause pass snaps turn boundaries. The ceiling is a turn with no clear
  pause, and a `ponytail:` comment names word timestamps as the upgrade.
- [AVIF or animated link preview images] → sharp normalizes to PNG from the first frame. An image sharp rejects uses
  the podcast card.
- [Row 61 reshapes the topic page and the Café] → The topic page placement and the row 61 surfaces are tasks after the
  rebase, and the migration is generated after rebase.
- [A stale film plays the old intro once] → The rebuild finishes in seconds, and the following play has the new one.
- [`expo-video` adds native code] → It needs a new development build and a store release. The contract fields are
  optional, so a released app without the player keeps working.

## Migration Plan

1. Build in this worktree with no api, worker, Temporal, or dev database use, and no deploy. Prove the renderer with
   the fixture test, and prove the UI in Storybook with fixture films.
2. After row 61 merges: rebase onto main, generate this change's migration after row 61's, place the sections around
   row 61's, add the Video button to row 61's Café and Brews News rows, and run the full stack end to end.
3. Deploy: the migration runs first. Then the worker deploys with the `episode-videos` queue. Films start with the next
   published podcast episode.
4. Rollback: unset the queue's worker. Recordings never start the render, since starting the child is gated by
   `TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY` being above 0. Podcast episodes without a film show no film surfaces.

## Open Questions

- The dollar rate per film minute comes from the fixture render's CPU time and the worker's Northflank price. It is
  one constant, settled in the first apply task.
