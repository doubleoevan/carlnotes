# Design

## Context

See `proposal.md` for the motivation. This section holds what the code and the data say, measured on 2026-11-11.

**Confirmed in the code.**

- `renderTopicPodcastEpisodeVideoWorkflow` renders a film once its Podcast Episode publishes, as one activity that
  calls `renderTopicPodcastEpisodeVideo` in `packages/pipeline/topicPodcastEpisodeVideo/`. `videoEncode.ts` builds
  every ffmpeg run. The film is stored in R2 as an intro, the chapters, and a sign-off, plus the joined film and its
  captions.
- A chapter holds one still for its whole length: its link preview image, or its generated image, or the podcast card.
  The still zooms from 1 to 1.35 times across the chapter, over a blurred fill if it is not 16:9, under a lower third
  for the first 8 seconds.
- The intro and the sign-off show the film's own image and zoom to 1.8 times across their length.
- `backfillTopicPodcastEpisodeVideosWorkflow` runs on its own queue under a fixed id.
- Review fetches a Resource's page through Firecrawl (`scrape.ts`) for most Resources.

**Where the request and the code differ.** Each of these changes a decision below.

| The brief says | The code does |
|---|---|
| A chapter is one segment | A chapter whose hosts answer Comments is two: the chapter, then a `hot-takes` segment that holds the podcast card under a "Hot takes" lower third |
| A chapter fades from and to black | A chapter fades through espresso, the app's dark brown, over 1.2 seconds, and a link preview image slides in from an edge over 0.9 seconds in place of the fade in |
| The link preview image is stored in R2 for a Resource | It is stored only if a chat or a Finding's popup asked for the link preview. Otherwise the film fetches the page's tags as it renders and stores nothing |
| Exa is a fetch path | Exa only finds pages. Review fetches an Exa result through Firecrawl like any page |
| The Scan knows a Resource is safe as it fetches | The fetch comes first, then the score that judges safety, and most fetched pages never become Findings |
| The Scan must ask Firecrawl for the page's images | The Scan stores each page's Markdown in R2, and that Markdown already lists the page's images |
| The backfill is run by hand | The worker starts or joins it at every boot |
| The intro may run longer than its zoom | Every intro and sign-off runs 40 seconds, in dev and in prod, except a few films with none. A zoom to 2.5 times at 12 percent a second ends at 8 seconds |
| The podcast image can be rendered larger | The film image's model returns 1376 by 768 and rejects a larger size. The stored image is 1280 by 720 |

**The data.**

| | dev | prod |
|---|---|---|
| Ready films | 18 | 78 |
| Film length in total | 8.1 hours | 34.6 hours |
| Chapters | 220 | 997 |
| Chapter length: mean, 90th percentile, longest | 125, 187, 416 seconds | 119, 186, 321 seconds |
| Distinct images needed at one for every 30 seconds | 1,029 | 4,458 |
| Distinct Resources narrated: Firecrawl, YouTube, Reddit, other | 176, 16, 0, 0 | 781, 20, 6, 5 |
| Firecrawl Resources with stored Markdown | 155 of 176 | 717 of 781 |
| Published Podcast Episodes with no film row | 295 | 303 |

The prod worker is two replicas of 2 vCPU, 4,096 MB of memory, and 2,048 MB of disk.

## Goals / Non-Goals

**Goals:**

- A chapter that cuts every 5 to 8 seconds through images of the Finding's own page, with no model call beyond the
  generated images.
- An encode that fits the worker's memory with the same headroom as today.
- A re-render of every film that never takes a playing film away.
- The smallest change to the encoder, the film queue, and the backfill, since the next film change builds on them.

**Non-Goals:**

- Any change to the Scan, to Firecrawl's request, to a screen, to copy, or to the api.
- A film for a Podcast Episode that has none.
- Word-exact cut timing. Cuts land on caption breaks, which are timed by character share and pauses as today.
- A new image for an existing film. An existing film keeps its 1280 by 720 image.

## Decisions

### Approved before apply

All twelve were approved as written on 2026-11-11. Decisions 1 to 7 are the ones the request asked for. Decisions 8 to
12 come from the differences above.

**1. The filter's numbers.**

An image is kept if it passes every rule, in this order:

| Rule | Number |
|---|---|
| From the page's main content | The main-content Markdown shows it, outside any link |
| File type | jpeg, png, webp, or avif. Never gif or svg |
| Name | Its url names none of these as a whole word: logo, avatar, gravatar, favicon, icon, emoji, sprite, badge, placeholder, advert, advertisement, advertising, doubleclick. Nor is its file named as a tracking pixel: `pixel` or `1x1`, as a gif or a png. The link preview image's url passes the same rule |
| Read | The first 200,000 characters of the Markdown, and at most the first 24 images they show |
| Moderation | Each kept image passes the image moderation before it is stored. A failed check leaves the Resource unfetched |
| Minimum size | At its own size, or fitted inside the frame if larger, it covers a third of the 1280 by 720 frame. A 640 by 480 image just passes |
| Shape | Width over height from 2:3 to 21:9 |
| One copy | A 64-bit difference hash of its center at 16:9. Two images within 6 bits are one picture, and the larger is kept |

The same scrape the Scan makes, with the images format added, on ten Findings narrated by dev's films:

| Page | Listed | Own content | Type | Name | Size | Shape | One copy | Stored at six |
|---|---|---|---|---|---|---|---|---|
| aced.io | 2 | 3 | 2 | 1 | 1 | 1 | 1 | 1 |
| bleacherreport.com | 19 | 4 | 4 | 4 | 3 | 3 | 2 | 2 |
| cheezburger.com | 114 | 61 | 61 | 57 | 40 | 38 | 37 | 6 |
| example.org | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| heavy.com | 22 | 5 | 5 | 5 | 5 | 5 | 4 | 4 |
| jobs.lever.co | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| lostriverexotics.weebly.com | 103 | 60 | 60 | 60 | 48 | 47 | 47 | 6 |
| openai.com | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| sfmta.com | 1 | 2 | 2 | 2 | 1 | 1 | 1 | 1 |
| theaiwins.com | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

Own content counts the link preview image too. The own content rule was applied to the four pages that list more
than ten images, and the two busiest of them were probed for their first 60 images.

What the sample shows:

- **The own content rule does the most work.** On bleacherreport.com 19 images are listed and 17 of them are 2560 by
  1440 photos of other stories. Size and shape cannot tell them from the article's own two. The Markdown can: a related
  story's image sits inside a link to that story, and the article's own image does not. On heavy.com the rule keeps 4
  of 22.
- **The link preview image is often the best copy.** On heavy.com the page shows its lead photo at 780 by 439 and
  names the same photo as its link preview image at 5089 by 2867. So of two copies the larger is kept, at the earlier
  one's place, whichever of them is the link preview image.
- **The 6 bit limit has room.** Every copy matched within 6 bits, and the closest two different pictures in the
  sample differ by 14.
- **A page that runs other posts into its own content still gets through.** cheezburger.com lists its next posts as
  bare images. The limit of six bounds it, and a wrong picture there is a known gap.
- Eight of ten pages give at least one image, and six give one or two. The mean is 2.2.

**2. Six Resource Images for each Resource.**

A chapter needs one distinct image for every 30 seconds. With the podcast card, six covers a chapter of 3.5 minutes,
past the 90th percentile of 186 seconds. Each is stored as a jpeg within 2560 by 1440, about half a megabyte, so a
Resource holds at most 3 MB and prod's 812 narrated Resources about 0.9 GB at the sample's mean. More than six adds
storage for the two pages in ten that have them and nothing for the rest.

**3. Images for a Resource that Firecrawl does not fetch.**

- **Exa:** nothing differs. An Exa result is fetched through Firecrawl by review, so it has stored Markdown.
- **YouTube:** the video's own thumbnail at its largest size, `maxresdefault.jpg` at 1280 by 720, then the thumbnail
  the link preview names. One image.
- **Reddit, X, Vimeo, Dailymotion, a `listen` Resource, and a declared transcript:** the link preview image alone, if
  the page offers one that passes the filter.

Generated images and the podcast card fill the rest of the chapter. These paths narrate 31 of prod's 812 Resources, so
a second source for them, such as Reddit's own preview images, is not worth its code yet.

**4. The backfill scrapes nothing.**

Scraping each narrated Firecrawl Resource once would cost 176 scrapes on dev and 781 on prod, one credit each, $0.18
and $0.78 at the app's $0.001 a fetch. It is not needed. 155 of dev's 176 and 717 of prod's 781 have their page's
Markdown in R2 from the Scan that found them, and the fetch reads that. The 21 on dev and 64 on prod with no stored
Markdown are pages whose fetch stored nothing. They get their link preview image and are not scraped again. A stored
Markdown's image url may have died since the Scan. That image is dropped, and a generated image fills its place.

What the backfill does cost on prod:

- **Generated images:** the 997 chapters need 4,458 distinct images. The podcast card gives 997 and the Resource
  Images about 2 a chapter, which leaves an estimated 1,500 to 2,500 to draw at $0.034, $50 to $85, on the platform's
  key. A film's stored generated images are reused.
- **Compute:** 2,077 film minutes. The montage measured two thirds of today's cpu for a film minute, so about 60 vCPU
  hours, a day and a half at the default concurrency of 1 and under a day at 2.

**5. Stills stay at four times the frame, 5120 by 2880.**

A zoom moves the still a whole pixel at a time, so a still four times the frame moves a quarter of a film pixel. That
holds a 2 times zoom of a 2560 pixel image and the intro's 2.5 times. One 120 second chapter, encoded on a laptop
with the film's own settings:

| Encode | Still | cpu | cpu for a film minute | Peak memory | Video bitrate |
|---|---|---|---|---|---|
| Today: one still, one run | 5120 by 2880 | 79.3 s | 40 s | 426 MB | 308 kbps |
| Montage: 20 shots, one run each | 5120 by 2880 | 52.0 s | 26 s | 499 MB | 414 kbps |
| Montage | 3840 by 2160 | 43.4 s | 22 s | 407 MB | 458 kbps |
| Montage | 2560 by 1440 | 38.9 s | 19 s | 354 MB | 435 kbps |

The montage takes less cpu than today at every size, because today's run draws the lower third over all 2,880 frames
and the montage draws it over the first two shots. Its peak is 499 MB, 73 MB over today's, since a run holds two
stills for the crossfade. Two renders at once, one on each film queue, peak near 1 GB of the worker's 4,096 MB. A
smaller still saves 90 to 145 MB and gives up the quarter pixel step, so the size stays.

The film grows by about a quarter: prod's films average 366 kbps with their audio and would average about 460. The
$0.001 a film minute rate stays, since the cpu fell.

Measured at apply on the same laptop: one dev film of 14.1 minutes, rendered again end to end, took 499 seconds and
460 cpu seconds, 33 for a film minute, and peaked at 572 MB. That count includes drawing the stills, the intro, the
sign-off, and the uploads, so the chapters' own encode sits below it. Its video ran at 448 kbps, and the film grew
from 43.4 MB to 58.5 MB, about a third.

**6. After its push the intro creeps in, and reaches 2.5 times as the first chapter starts.**

The intro always runs longer than its zoom: 40 seconds against 8. So:

- The intro pushes in at 12 percent a second for 6.6 seconds, to 2.1 times.
- It then creeps in at half a percent a second for the other 33.4 seconds and reaches 2.5 times as the first chapter
  starts. It never sits still, never turns back, and never passes 2.5 times.
- The sign-off is the same curve backward: it opens at 2.5 times, creeps back to 2.1 times, and pulls back at 12
  percent a second over its last 6.6 seconds to the full image as it fades out.
- For any other length the creep stays at half a percent a second and the push takes what is left, so the zoom still
  ends at 2.5 times. An intro of 8 seconds or less is the push alone.

Alternatives: hold at 2.5 times, which leaves the picture still for 32 seconds. Pull back slowly to the full image,
which shows the whole image before the first chapter but turns the move around, and the sign-off could then not open
at 2.5 times. Slow the push to fill the 40 seconds, which is 2.3 percent a second and no longer a hard zoom.

**7. Names.**

| Thing | Name in code | Why |
|---|---|---|
| A page image | **Resource Image**: `resourceImage`, the `resource_images` table, `packages/pipeline/resourceImages/`, `resources/<id>/images/<position>.jpg` | The domain model keeps **page** for the Topic or the Team a thing lives on, for a page number, and for a rendered route. `pageImage` would read as a Topic page's image. The image belongs to the global Resource, not to a Finding |
| Its link preview image | `isLinkPreviewImage` on a Resource Image | The name the film and the specs already use |
| One image on screen with one move | **shot**: `VideoShot`, `videoShots.ts`, `toVideoShots` | Follows `VideoSegment` and `videoTimeline.ts`. The domain model rejects clip for a film, so a shot is never a clip |
| The move | `VideoShotMove`: `zoom-in`, `zoom-out`, `pan-left`, `pan-right` | Replaces `VideoSlideDirection`, which goes with the slide |
| The montage | No type. **Montage** is the word in comments, docs, and specs for a chapter's shots in order | The code names what a montage is made of. A `Montage` type would wrap one array |
| The render version | `renderVersion` (`render_version`), `failedRenderVersion` (`failed_render_version`), `TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION` | Says the noun in full, as `renderedImageHash` does |
| The distinct image rule | `CHAPTER_SECONDS_PER_DISTINCT_IMAGE` for the 30 seconds | The domain model rejects floor for a minimum, so no name says floor |

Rejected: `scrapedImage`, since no scrape is made. `sourceImage`, since a Source is a Topic's Source. `articleImage`,
since not every Resource is an article. The domain model gets a Resource Image row and a longer film row in this
change, before the names appear in code.

**8. Fetch at the film's first need, from the stored Markdown, and leave the Scan alone.**

The brief fetches the images as the Scan fetches the page, through Firecrawl's images format. The design fetches
them the first time a film narrates the Resource, from the Markdown the Scan already stored. Why:

- **The images format adds nothing.** On the four busy pages its list and the Markdown's images are the same set (19
  and 23 with repeats, 114 and 117, 22 and 21, 103 and 103). The Markdown also says which images sit inside a link,
  which is what the own content rule needs, and their order and alt text.
- **The Scan cannot know enough.** At the fetch, safety is not judged and most pages never become Findings. A fetch
  in the Scan has to wait for the score, and then stores images for every Finding where a film narrates about 13 of
  them.
- **The film needs the fetch anyway.** A Resource scanned before this change has no images until a film asks, so
  the render must be able to fetch. One place that fetches is simpler than two.
- **Nothing the request wants is lost.** No credits, no second scrape, the same public url guard on every fetch, the
  images stored in R2 for every later render, and an unsafe Resource with none.

The cost is a few seconds of image fetches at the start of a render that takes minutes. If the fetch should run in
the Scan as well, it is one call after a Finding is saved, to the same function, and one delta to the review spec.

**9. A new film's own image is drawn at 2752 by 1536.**

A zoom to 2.5 times shows 512 pixels of a 1280 pixel image across the frame. Probed through the dev proxy:

| Model and size | Returns | Sharp to | Price |
|---|---|---|---|
| `gemini-3.1-flash-lite-image`, today's | 1376 by 768 | 1.08 times | $0.034 |
| `gemini-3.1-flash-image` at 2K | 2752 by 1536 | 2.15 times | $0.101 |
| `gemini-3.1-flash-image` at 4K | 5504 by 3072 | 4.3 times | $0.151 |

The film's own image moves to `gemini-3.1-flash-image` at 2K, $0.067 more a film. At 2.5 times it is enlarged 1.16
times, for the last seconds of the creep. The 1280 by 720 jpeg stays as the poster under its present key and hash,
so no client changes, and the large original is stored beside it for the render. An editor's regenerate draws at 2K
too, and an upload keeps a larger copy of what was uploaded, up to 2752 by 1536 and never enlarged, through the same
format with no api change. An existing film keeps its 1280 by 720 file and is softer at the end of the push. Generated
images stay on the lite model at $0.034, since a film draws about 20.

Alternative: 4K at $0.151, sharp through the whole zoom. Google's price list confirmed both prices on 2026-11-11:
1,680 image tokens at 2K and 2,520 at 4K, at $60 a million.

**10. Generated images follow the distinct image rule, with a limit of 40 a film.**

- A chapter needs one distinct image for every 30 seconds, and at least two if it runs over 8 seconds, since no
  image may stay or repeat.
- Its Resource Images and the podcast card count first. Generated images make up the difference.
- The first generated image keeps today's key, so the api's chapter image route and every stored one still work.
  Further ones are numbered, at most 12 a chapter.
- Each further image takes the next of six framings, such as a close detail or a view from above, so a chapter's
  generated images differ. The scene writer still reads the Finding's title and public relevance explanation alone.
- `TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT` stays the film's limit and zero still turns them off.
  Its default rises from 4 to 40. Past the limit, every chapter gets its first missing image before any gets its
  second, and a chapter left short loops the images it has.
- `TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS` is removed.
- The cost is recorded as today: each draw adds its price to the film row's `cost` unless the platform pays. The
  backfill's summary gains the count of images it drew.

A film has about 13 chapters and needs about 57 distinct images, so it draws about 20, $0.68, where it draws at most
4 today. That is the price of the 30 second rule on pages that offer one or two images.

**11. A segment with one image borrows the film's own image.**

The `hot-takes` segment has the podcast card alone, and so does a chapter whose Resource is unsafe or whose generated
draws all fail. Each of them cuts between the podcast card and the film's own image, which the render has already
loaded for the intro. A film whose own image is the podcast card has one image in all, and there the shots cut and
change moves on that image.

Alternative: cut the podcast card against itself with a new move each shot. It needs no second image, and it breaks
the rule that no image shows twice in a row wherever the hosts answer Comments.

**12. The fades stay espresso, and the slide goes.**

The brief says black. The film fades through espresso everywhere, and the lower third's plate is espresso, so the
faster fades keep it. A chapter now opens with a 0.3 second fade into its first shot, so the 0.9 second slide of a
link preview image is removed with its edge pick. If the fades should be true black, it is one constant.

### Mechanics

**13. The shot plan is a pure function.**

`toVideoShots` takes a segment's frame count, its caption breaks, its images in order, and a seed, and returns the
shots: each one's image, first frame, frame count, and move.

- A shot is on screen from its first frame to the end of its crossfade into the next, 10 frames later. That time is
  at most 8 seconds, so a shot's own frames run at most 7.58 seconds.
- Each planned length is drawn between 5 and 7 seconds from a hash of the seed and the shot's index, so the mean is
  about 6 and a retried render plans the same shots.
- A cut moves to the nearest caption break within one second, if the shot stays between 5 and 8 seconds. Otherwise
  it stays where it was planned.
- The last shot takes what is left. If the remainder is too short for a shot of its own, the shot before it moves its
  cut to the nearest length that leaves both within their limits. A segment of 8 to 9.6 seconds splits evenly.
- Shot `i` shows image `i` modulo the image count, which never repeats with two images or more.
- Each move is picked by the same hash from the three that the shot before it did not use.

The captions are written before the chapters part, since the plan reads their breaks.

**14. A move is limited by the image.**

- An image's zoom limit is the larger of its stored width over 1280 and its stored height over 720, never under 1.25
  and never over 2. A 2560 by 1440 image has 2, and a link preview image of 1200 by 630 or a generated image has
  1.25, which is less than today's 1.35 on every still.
- A zoom runs at 8 percent a second, or slower if that would pass the limit before the shot ends, so the shot moves
  for its whole time. Zoom out is zoom in backward.
- A pan holds the zoom that gives it room, 1 plus 8 percent for each second, up to the limit, and crosses that room
  evenly.

**15. One ffmpeg run for each shot.**

- A run reads the shot's still, and the still before it for the 10 frames of the crossfade, on which the earlier
  still keeps its move. A run never holds more than two stills, whatever the chapter's length.
- A segment's first run fades in from espresso and its last fades out to it, over 0.3 seconds.
- The lower third is drawn only by the runs that reach into the segment's first 8 seconds. Its fades are timed in the
  segment's time, by shifting the lower third's timestamps by the run's start.
- Every run uses today's H.264 settings and opens on a keyframe, so the chapters part is still joined by stream copy.
  A chapter's stills are composed once and deleted after its last shot.
- The intro and the sign-off stay one run each, with the zoom of decision 6.

Alternative: one run for a chapter, with every still as an input and a chain of crossfades. Its memory grows with
the chapter's shots, 60 for a 6 minute chapter.

**16. The render version and the swap.**

- `TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION` is 2. `render_version` defaults to 1, so every film that exists is
  below it.
- A first render writes its row at the current version.
- A render of a ready film below the current version is a re-render. It leaves the row `ready`, renders and uploads
  under keys that include the version, then swaps the five keys, the size, the length, and the version in one update
  that only applies while the row is still below the version. The replaced files go after the grace that a rebuild's
  replaced files get. A failure deletes what it uploaded and the row is untouched.
- A render of a ready film at the current version returns skipped, as today.
- After the last attempt of a re-render fails, the failure mark leaves the row `ready`, writes
  `failed_render_version`, and reports the error. A re-render whose inputs are missing does the same. The backfill
  does not list a film whose failed version is the current one, and the next version tries it again.
- A rebuild for a new image keeps the row's version in its keys. Its swap also checks that the chapters key is the
  one it read, so a rebuild that overlaps a re-render loses, and the next play starts it again.

**17. The backfill lists two kinds of film through the same activity.**

- `listBackfillPodcastEpisodeIds` first pages the Topics whose latest Podcast Episode has no film row, as today. Once
  those end, it pages the ready films below the current version, public Topics first, by a film cursor. A cursor
  without a kind is a Topic cursor. The workflow's input names the cursor `afterCursor`. A run that continued before
  the deploy under the earlier name lists from the start, where every Topic it rendered has a film row and is left
  out.
- The workflow still calls one listing and one render for each Podcast Episode, then continues as new. Its shape does
  not change, so its history replays under the old and the new code.
- After each batch the workflow logs the counts so far and the films left. The summary gains the generated image count.

## Risks / Trade-offs

- [A page mixes other posts into its own content, so a chapter shows a picture of another story] → The limit of six
  bounds it. The fixture watch and the first prod films are checked for it, and the name rule and the limit are
  constants.
- [A stored Markdown's image urls have died] → Each dead image is dropped and a generated image fills its place, at
  $0.034.
- [A film costs its owner about $0.68 in generated images, up from $0.14 at most] → The limit is a setting, zero turns
  them off, and a spent budget leaves a chapter on the images it has.
- [An old replica takes a backfill activity during a rolling deploy] → Its render skips a ready film, and the next
  boot's backfill lists the film again. Its failure mark could only reach a ready film whose re-render failed three
  attempts inside the deploy.
- [A hard zoom on an existing film's 1280 by 720 image is soft] → It is enlarged 2.5 times for a few seconds. An
  editor's regenerate draws the larger image.
- [The film is a quarter larger] → A 40 minute film grows from about 110 MB to about 140 MB. A render's temp files
  stay under the worker's 2 GB disk.
- [Hundreds of ffmpeg runs for one film] → Each starts in well under a second, and the bench's 20 runs took less cpu
  than today's one.
- [Zoom limits make a low resolution image move slowly] → It still moves for its whole shot, and no shot holds still.

## Migration Plan

1. Deploy. The migration adds the table and the three columns, and every film row reads version 1.
2. Each worker boot starts or joins the backfill, which re-renders the 78 prod films at the default concurrency of 1,
   about a day of renders. Leave `TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY` at 1: the setting is also each
   replica's backfill slots, so at 2 one replica can take both renders beside its own film.
3. Follow the worker's log for the progress lines, and run `bun run films:backfill` for the summary.
4. Rollback: deploy the earlier image. Films already re-rendered keep playing, since their rows name files that
   exist. The earlier code ignores the new columns and the new table.

## Open Questions

- Whether Reddit's own preview images are worth a second source once more Reddit threads are narrated. Six of prod's
  812 narrated Resources are Reddit threads today.
