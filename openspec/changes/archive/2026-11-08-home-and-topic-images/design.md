# Design

## Context

See proposal.md for the motivation. What shapes the approach, as the code stands on `main` at 2355aee2:

- The home route `/` renders `HomePage`: the Tags and New Topic row, then the Yours, Subscribed, Featured, and Popular
  accordion sections over `GET /api/topic-feed`. A visitor's sections come from a 30-second Redis cache, and the
  Featured section is the Topics holding a `feature_order`, set from the topic page's Rank dialog by an admin. The
  page is server-rendered for a visitor and edge-cached under the `rendered` tag. `GET /topics` redirects to `/`.
- The Updates list from row 58 is MCP-only on `main`. Its web and mobile UI is parked in
  `logs/updates-web-mobile.patch` and returns in this change.
- Row 59's reactions, hot takes, flags, and PostHog social events have shipped. Its admin one-tap email with Delete,
  Keep, and Block has not: the report email has one button, Open the report, into the admin console's Reports view,
  where Remove, Clear, and Block resolve a report. The daily notifications email and the Café row have not shipped.
- The podcast cover is a 3000 by 3000 JPEG that satori and resvg draw over `apps/docs/design/podcast/cover-base.png`,
  with a title in the bottom band and "Coffee Break podcast" in the top band, encoded by ffmpeg, stored under a key
  that an HMAC of the kind, id, and title makes, and served at 3000 and 600 pixels. The podcast episode page shows the
  600 pixel cover in a 144 by 144 box. `apps/api/share/podcastEpisodeImage.ts` is the podcast episode's link preview
  card, not the cover.
- Speech is not a direct Google call. `packages/models/speech.ts` posts to LiteLLM's Gemini pass-through route,
  `${LITELLM_BASE_URL}/gemini/v1beta/models/<model>:generateContent`, with the user's virtual key as `x-goog-api-key`.
  The proxy holds `GEMINI_API_KEY`, checks the key's budget, and charges the key from its own price table. A
  transcription, which the pass-through does not meter, is charged by the api's own spend row instead, and the
  monthly spend sum reads it.
- The monthly spend sum is Scan cost, chat turn cost, Podcast Episode cost, and Personal sources summary cost since
  the start of the UTC month, which is also when the LiteLLM key budgets reset. No count-based monthly quota exists.
- Object storage is Bun's S3 client over R2 with no public bucket url. Every object is served by an api route: avatars
  and preview cards with immutable versioned headers, attachments after an owner check, audio by a presigned url.
- Image work is satori, resvg, and ffmpeg. `sharp` is only a docs-site dependency, and the local ffmpeg has no webp
  encoder.
- The CarlNotes social page in Notion has no Home page section yet, and the row 60 prompt-queue page is blank, so no
  home page or card design exists. The sizes and layouts below come from the current pages and the CarlNotes Design
  page's hero. The user can replace them before apply.

## Goals / Non-Goals

**Goals:**

- One image per Topic, one original, six derived files, one url scheme, one component that picks the right file.
- Every image call runs on the path speech already takes and is metered the way transcription already is.
- The home page serves a visitor from the edge and a user from the browser, from one route.
- Every new component is shared through `packages/core` and a Nightshift contract, with the smallest platform adapter.

**Non-Goals:**

- The one-tap flag email, the daily notifications email, and the Café row's feeds, trending, and hot takes.
- Screening uploads on the way in. The flag path and the admin's Regenerate are the moderation.
- A person's Café, posts, and the shared header, which row 61 builds on these cards.

## Decisions

The first seven decisions are the ones the request asked to settle before apply. Each names what the request assumed,
what the code and the providers showed, and the recommendation.

### 1. Domain words

| Thing | Word | Where |
|---|---|---|
| The one image on a Topic | **Topic Image**, `topicImage` in code, `topic_images` table, one row per Topic | the domain-model skill gains a row |
| The full-size stored render or upload | **original** (`original.jpg` in storage) | never "source": a Source is a Topic input, and `avatar_source` already means where an image came from |
| Where the image came from | **origin**, `topicImageOrigins = ["generated", "uploaded"]`, typed `TopicImageOrigin`, column `origin` | the precedent is `promptVersionOrigins`; the request's "source" collides twice |
| The three derived sizes | `topicImageSizes = ["page", "list", "thumbnail"]`, typed `TopicImageSize`, in `packages/contracts/enums.ts` | as the user wrote it |
| One render, create or regenerate or admin or backfill, with its cost | **Topic Image Render**, `topic_image_renders` table | one row per model call, so the monthly spend and the regeneration count both read it |
| A regeneration | **regenerate**, `Regenerate` in copy, `topicImage:regenerate` as the gate capability, `kind = "regenerate"` on the render row | |
| A pinned topic or podcast episode | **feature order**, the existing `topics.feature_order`, now also `podcast_episodes.feature_order` | no new noun: the section is already called Featured and the column exists |
| What the home shows first | **featured topics** and **featured podcast episodes**, `featuredTopics` and `featuredPodcastEpisodes` in code: the pinned ones first, then trending to fill | the `featured` section key keeps its meaning on the Topics page |
| The text the writer returns | **scene** | never prompt, which is the Topic's own prompt |
| The fixed paragraph | **house style** | lives as a prompt file, so a style change is a version bump |

Never "digest", in copy or code. The Notion Names table says `home` names the signed-out directory; the
request supersedes it: `home` is the route `/`, `topics` is the directory.

### 2. Sizes

No design exists yet, so the sizes come from where each file shows. One file per size serves every placement of that
size at 1x and 2x. Every derived file is a 3:2 webp. Nothing is resized on request.

| Size | CSS pixels | 1x file | 2x file | Shows |
|---|---|---|---|---|
| `page` | 360 by 240 | 360 by 240 | 720 by 480 | the home's featured cards and your-topic cards (about 320 wide on a desktop grid, the column's width on a phone), the topic page header box, the Topics page rows, the editor |
| `list` | 120 by 80 | 120 by 80 | 240 by 160 | the MCP findings view header |
| `thumbnail` | 48 by 32 | 48 by 32 | 96 by 64 | search results on web, mobile, and the MCP search view |

The topic page header box is 216 by 144: the podcast episode cover's 144 height, at 3:2, in the podcast episode cover's
position at the left of the title, byline and reactions, and tags, and 144 by 96 below the `sm` breakpoint. A Topics
row's box is a step smaller, 144 by 96, and 120 by 80 below `sm`. Both show the `page` file in a card's border and
shadow, and both headers have the same space above and below as the podcast episode page's cover row. The title, the
tags, and the byline sit beside the image. Below `sm` the image floats, so they run under it only once they pass its
bottom; the mobile app has no float and keeps them beside it. A row's new count and share icon end the header's last row
at the right, over the findings card's top right corner, and from `sm` up they sit level with the image's bottom.
The share card draws the original, not the `page` file, since the card is 630 tall and 480 would be upscaled. The
original is whatever the model returns at 3:2, 1264 by 848 at Gemini's 1K, or an upload cropped and resized to the same
1264 by 848. The request's 1536 by 1024 was FLUX's size.

### 3. The house style

One paragraph, appended after the writer's scene, held in `packages/models/prompts/topic-image-style.md` with a
version, so that a change to it is a version bump that the backfill's redo mode acts on:

> Editorial illustration in a warm hand-drawn style: loose ink outlines over flat gouache fills with a light paper
> grain, a limited palette of cream paper, espresso brown, caramel, burnt orange, and one cool slate-blue accent, soft
> directional morning light, simple shapes with generous empty space around one clear focal subject. No text, letters,
> numbers, logos, watermarks, or human faces.

Three samples rendered with it on `gemini-3.1-flash-lite-image` at 3:2, from hand-written scenes standing in for the
writer's, are in `samples/`:

- `electric-cars-lite.jpg`: "A single electric car parked at a roadside charging post on an empty coastal highway at
  dawn, cable looped to its side, low sun warming the asphalt."
- `home-espresso-lite.jpg`: "A compact espresso machine on a wooden kitchen counter, steam rising from a small cup, a
  bag of beans and a tamper beside it, window light across the tiles."
- `ai-agents-lite.jpg`: "A tidy desk at night with an open laptop, several paper notes pinned on a corkboard connected
  by string, a desk lamp casting a warm pool of light."

`electric-cars-flash-hint.jpg` is the Regenerate model, `gemini-3.1-flash-image`, on the first scene rewritten as a
hint would have it: "seen from behind on a mountain switchback road in rain". The four read as one family: the paper
grain, the palette, and the ink line carry across both models.

### 4. The featured formula

Pinned first, trending to fill, public shown Topics and published Podcast Episodes of public shown Topics only:

- Topics: the Topics holding a `feature_order`, in that order, then the trending order the Topics page already uses
  (`toTrendingTopics`: viewer count, then subscriber count, then feed recency), skipping the pinned ones, until six.
- Podcast Episodes: the Podcast Episodes holding a `feature_order`, in that order, then by listener count, newest
  first among ties, skipping the pinned ones and any second Podcast Episode of one Topic, until five.
- New podcasts this week: the Podcast Episodes of public shown Topics published in the last seven days, newest first,
  so a new Podcast Episode reaches the home without a pin or a listener. A limit of 100 backs a burst week, since every
  card renders for a crawler.

One Redis read-through entry, the home card ids, with the 60-second time to live the section ids already use, so the ids
are never computed per request. An admin pins from the topic page's Rank dialog, as today, and from a Featured card in
the admin console that lists both pin lists with the same move and clear controls, and the Podcast Episode page gains
the same Rank dialog for an admin, under "Featured podcast episodes" in its actions menu. A Save that drops a pinned row
asks first, naming each row it drops. A pin change clears the Redis entry and purges the home's edge cache tag.

### 5. The image models and who calls them

**The request's path does not exist.** Fireworks returns `NOT_FOUND: Model not found, inaccessible, and/or not deployed`
for `accounts/fireworks/models/flux-1-schnell-fp8` on this account's key, for `flux-1-schnell`, `flux-1-dev-fp8`, and
`flux-kontext-pro` too, at the workflow route and the older image generation route alike. The account's serverless
model list holds thirty-one text, embedding, and reranker models and no image model. Its control plane still returns
the model's record, created in 2024, so the model is retired from serverless, not misspelled. `gemini-2.5-flash-image`
still answers but Google's docs mark it legacy and point new work at the 3.1 models.

Recommendation: both renders on Gemini image models, one key, one client, one response shape.

| Render | Model | Measured | Cost at 1K |
|---|---|---|---|
| create, admin Regenerate, backfill | `gemini-3.1-flash-lite-image` | 1264 by 848 at 3:2, 1120 image tokens, about 4 seconds | about $0.034 an image |
| owner Regenerate | `gemini-3.1-flash-image` | 1264 by 848 at 3:2, 1120 image tokens, about 7 seconds | about $0.067 an image |

Neither supports Gemini's 2K size at this ratio. A create costs a third of a Scan, so the free plan's $3 budget feels
it less than one Scan. Every generated image carries Google's SynthID watermark, which the privacy policy says.

**Through LiteLLM, not direct.** The request recommended direct calls because speech is direct. It is not: speech runs
through the LiteLLM Gemini pass-through on the user's virtual key. The image call takes the same route, with the same
`postSpeechRequest` shape: the owner's key for a create and a Regenerate, the master key for the backfill and the
admin's Regenerate, `GEMINI_API_KEY` staying on the proxy, and the proxy's budget check turning a spent budget into the
same `budget-spent` failure. The price table's knowledge of the two new models is not relied on: the app records each
render's cost itself, as a fixed per-image rate per model in `budget.ts`, on the `topic_image_renders` row, and the
monthly spend sum adds that table, the way the transcription spend row is the one meter for transcriptions. Every
request is one `generateContent` with `responseModalities: ["IMAGE"]` and `imageConfig: { aspectRatio: "3:2" }`, and
the image is `candidates[0].content.parts[].inlineData`. Direct calls would need `GEMINI_API_KEY` on the api and the
worker and a second budget check.

### 6. The writer, the render, and the fallback

- The **scene writer** is a prompt on `cheap-model`, `packages/models/prompts/topic-image-scene.md`, with a thin
  builder in `packages/pipeline/topicImages/writeTopicImageScene.ts`. It reads the Topic's name, prompt, tags, up to
  five of its newest shown Findings' Resource titles, every one fenced as untrusted
  data through `writePrompt`, and returns one or two sentences naming a scene, objects, place, light, and mood, under
  the three rules: no words or letters, no real people, logos, or brand marks, nothing the house style would not draw.
  The scene is stored on the render row. An owner's image prompt is fenced into the writer beside the Topic's words:
  the writer works in what it asks to see and the style it names, and the image model draws that scene with no house
  style.
- The **render** is one Temporal workflow, `topicImage`, id `topic-image-<topicId>-<renderId>`, with two activities:
  write the scene, then render and store. The render activity has the recording's retry policy, five attempts with
  backoff, and a `budget-spent` or rejected outcome is non-retryable and marks the render row `failed`. A Topic with a
  failed render keeps its drawn covers and text card; nothing waits on it.
- **On create**, `startFirstScan`'s after-transaction path also starts a create render on the owner's key, with no
  Finding titles yet. A render never starts a Scan and a Scan never starts a render.
- **Regenerate** is `POST /api/topics/:id/image/regenerate` with an optional `imagePrompt` of at most 500 characters. It
  checks `topic:edit` on the Topic and `topicImage:regenerate` on the owner, rejects an image prompt the text
  moderation flags with a 422, writes a `regenerate` render row, starts
  the workflow, and returns 202 with the row's id. The editor polls the topic payload until the image hash changes or
  the row reads failed. The count against `imageRegenerationLimit` is the owner's `regenerate` rows since the start of
  the UTC month, the month the budget already resets on. An admin bypasses the count through the gate's admin branch.
- **Upload** is `POST /api/topics/:id/image` multipart, jpeg, png, or webp up to 10 MB, checked by magic bytes as
  avatars are. `sharp` center-crops to 3:2, resizes to 1264 by 848, strips metadata, encodes the original as jpeg,
  screens it through the image moderation as avatars are, and derives the six files. An upload is synchronous. `sharp`
  is a new dependency of `packages/pipeline`: the ffmpeg in the image lacks a webp encoder locally and the crop, resize,
  strip, and webp encode are four lines with sharp.
- **Remove** is `DELETE /api/topics/:id/image` on an uploaded image: the upload's objects go to pending deletion and
  a fresh create render starts on the owner's key. The editor's Remove shows only for an upload.
- **Sizes** derive in `packages/pipeline/topicImages/topicImageFiles.ts` from the original on every write, generated
  or uploaded, and a resize-only backfill re-derives them from stored originals. A new size later is one more entry in
  the sizes table and a resize pass.

### 7. Storage, urls, and who may see an image

- Keys: `topic-images/<topicId>/<hash>/original.jpg` and `topic-images/<topicId>/<hash>/<size>[@2x].webp`, where
  `<hash>` is the sha256 of the original's bytes, as 32 hex characters. A new image is a new hash and a new url, so
  every url is immutable. The replaced image's seven objects go to pending deletion with the avatar's grace.
- The row: `topic_images (topic_id pk, hash, origin, scene, model, width, height, created_at)`. The render log:
  `topic_image_renders (id, topic_id, user_id null for the platform, kind create | regenerate | admin | backfill |
  resize, model, status pending | succeeded | failed, cost, scene, created_at, finished_at)`.
- Serving: `GET /api/topic-images/:topicId/:hash/:file`, where `:file` is `<size>[@2x].webp`. A public Topic's image
  is served with the preview cards' immutable headers and `Cache-Tag: topic-image:<topicId>`. A non-public Topic's
  image is served only to a session the `topic:view` gate grants, with `private, max-age=31536000, immutable`, so the
  browser keeps it and the edge never does. A Topic turning non-public purges its tag, as an avatar deletion does. A
  hash that is not the Topic's current hash is 404, so an old url stops serving once replaced.
- The contract: `TopicImageUrls = Record<TopicImageSize, { url: string; url2x: string }>`, built by
  `toTopicImageUrls` in `packages/contracts/topicImages.ts` from the Topic id and hash, carried as
  `image: TopicImageUrls | null` on every Topic payload a card, row, or view reads: the topic page, the feed, search
  rows, the home payload,
  `list_topics`, and the MCP search rows.

### 8. Covers and the share card

- `podcastCover.ts` draws over the Topic's original, center-cropped square and scaled to 3000, when the Topic has an
  image, and over `cover-base.png` otherwise. Over a photo-like image the two text bands need their own ground, so the
  cover adds a translucent gradient behind the top band and behind the title, each dark or light from the mean
  brightness of the picture under it: dark, with Dark roast's text, unless the strip is past 0.7 bright, which takes
  a light band with Latte's text. The illustration keeps its empty bands and gets no gradient. The cover keeps its
  layers as they are: the top band and the title. The request's number and date layer is on the podcast episode's link
  preview card, which already draws the cover and changes with it.
- A Podcast Episode's cover is laid out as its card instead: `toPodcastEpisodeCoverElement` puts the podcast episode's
  own image, or its Topic's until its own is drawn, across the top 3000 by 2000 at its own 3:2, and under it an espresso
  panel with the title in two lines at most and the detail line `Topic · 2026 · E20`, which
  `toPodcastEpisodeDetailsLine` in `packages/contracts/podcastEpisodes.ts` writes for the card and the cover alike. It
  has no play control and no top band. `toPodcastEpisodeCover` builds the cover's fields, and the template is `v7`.
- Each published Podcast Episode gets its own image: `packages/pipeline/podcast/podcastEpisodeImage.ts` writes the
  scene from the title, the description, the Topic's tags, and five chapter titles, renders it with the Topic image's
  model and house style, and stores it under `podcast-episode-images/{id}/{hash}/` at the six sizes, with
  `podcast_episodes.image_hash` naming the current one. `recordPodcastEpisode` draws it after the publish, three
  attempts at most, and a rejection leaves the podcast episode as it is. `GET
  /api/podcast-episode-images/:id/:hash/:file` serves it behind the Topic's visibility. The page, the cards, and the
  search row show it, and a card falls back to the Topic's image. `bun run podcast-episode-images:backfill` draws the
  missing ones on the master key.
- `toPodcastCoverKey` hashes the Topic's image hash beside the kind, id, and title, and a podcast episode's own image
  hash and detail line, so a new image is a new cover url, and a show or podcast episode cover is drawn again on the
  next feed or page read. The backfill does not re-render covers itself: clearing the feed caches after each Topic is
  enough, and the old cover objects go to pending deletion.
- `topicImage.ts` draws the image across the card's top, 1200 by 360 from the original's center, with the title,
  byline, and counts on the card under it, the home page card's arrangement, and `podcastEpisodeImage.ts` draws an
  podcast episode's own image, or its Topic's, the same way. The text-only card stays for a Topic with no image. The key
  hashes the image hash too.

### 9. The home page

- `/` is `HomePage` with two faces chosen by the session: a visitor's face renders on the server and a user's face in
  the browser, through the route guard every signed-in page already uses, so the edge caches only the visitor's.
- The visitor's face, top to bottom: the existing `HomeHero` with Carl and the pitch; the headline "He already read
  it. All of it." under the search bar, with the New Topic button on its right; how it works in three steps, each a
  short line in Carl's voice under its number and heading on one line; then the card sections, "Featured topics",
  "Featured podcasts", "New podcasts this week", and for a user "Your topics", each Podcast Episode card with a play
  button that plays inline through the existing play pill and player. The sections are drawn as the Topics page's are,
  by one shared `AccordionSection` on each platform: open at first, the title with its count at the right ("N topics",
  and "N podcast episodes" under the podcast titles, which already say podcast), and a divider under a section only
  while it is closed, on both pages. Each section shows five cards a page with the standard pagination. Without
  JavaScript every card shows and the page buttons stay hidden, so a crawler reads them all. The head adds `ItemList`
  JSON-LD of the featured Topics beside the existing `WebSite` block.
- The user's face: the visitor's headline beside the New Topic button, then the Updates card in how it works'
  place, restored from `logs/updates-web-mobile.patch` without its page or screen. The card starts at 30 minutes and its
  Update button highlights the shown length. Then the featured cards, then "Your topics" as cards from the user's owned
  and subscribed Topics. A user with no Topic sees the New
  Topic button where the cards would be, in the existing empty-state voice.
- One payload, `GET /api/home`: the featured topics and podcast episodes and, for a user, their Topics as card rows.
  Each card row carries the Topic's id, name, path, byline, tags, reactions summary, latest Podcast Episode, and
  `image`. The visitor's payload is the Redis entry; the user's adds one query.
- The home response gets a second edge cache tag, `home`, beside `rendered`, and a pin change purges `home`.

### 10. The Topics page

`/topics` renders today's `HomePage` body as `TopicsPage`: the Tags and New Topic row, the four sections, the Reheat
action, the page links, and the section opening rules, unchanged. Each Topic row gains its image at its left edge,
level with the findings card, beside the title, byline, and tags, the way the topic page header is arranged. The user
menu gains Topics above Profile, where the Café row will add CarlNotes Café and My Café above it. The `seo` spec's
`/topics` redirect reverses, the sitemap lists `/topics` as it already does, and the home's crawler path to every public
Topic runs through the Topics page's server-rendered sections and the featured cards' links.

### 11. The shared components

| Component | Contract | Core | Web adapter | Mobile adapter | MCP view |
|---|---|---|---|---|---|
| `TopicImage` | `packages/nightshift/components/topic-image.ts`: the aspect box, the radius, the placeholder ground per size | takes `{ image, size, name }` and picks the 1x and 2x files | `<img srcset="1x, 2x">`, the placeholder cover behind it as `PodcastEpisodeCover` does | `expo-image` with the 2x file on every device | the web adapter |
| `TopicCard` | `packages/nightshift/components/card.ts`: the card surface the primitives share | the `page` image over the name, byline, tags, and reactions count, one link | the web card and link primitives | the native card and `Link` | the web adapter |
| `PodcastEpisodeCard` | `card.ts` | the `page` image of its Topic, the title, the Topic's name, the season and number, and the play slot | the existing play pill | the existing native play pill | the web adapter |

Each core component takes an `…Elements` adapter, like `UserMenuItems`, and both apps import it, so the parity check
reads them as shared. Deviations, each as small as its reason allows:

- `TopicImage` on mobile loads the 2x file alone, and `expo-image` has no `srcset`.
- `PodcastEpisodeCard`'s inline play on the MCP views goes through the host's audio url with the play token, as the
  search view's play pill already does.

### 12. Moderation

`reportSubjectKinds` gains `topicImage`. The topic page's report menu gains Report image, which files a report whose
subject text is the Topic's name and whose subject path is the Topic's page. The Reports view shows the `list` image
in the text cell for that kind and offers Regenerate beside Clear and Block: Regenerate writes an `admin` render row
on the master key, starts the workflow, drops an upload, and resolves the report as removed. The report email keeps
its one button into the console: the one-tap Delete, Keep, and Block links the request names are not on `main`, and
building them is row 59's remaining piece, not this change.

### 13. The backfill

`backfillTopicImages` is one Temporal workflow with a fixed id, so a second start joins the first, taking
`{ mode: "missing" | "redo" | "resize" }`. It lists Topics public first, then by creation, and runs three renders at a
time through the `topicImage` workflow as children on the master key, with `backfill` render rows. `missing` skips a
Topic with an image, `redo` renders every Topic whose image is generated, leaving uploads alone, and `resize` re-derives
the six files from every stored original without a model call. Each Topic's feed caches clear as it finishes, so its
covers redraw on their next read. A root script, `bun run topic-images:backfill -- --mode missing`, starts it, and an
install with no `GEMINI_API_KEY` on its proxy keeps the drawn covers: the render fails and leaves the drawn covers, and
nothing else changes.

### 14. Analytics

Server events on the social scheme's shape, IDs only: `topic_image_generate`, `topic_image_regenerate`,
`topic_image_upload`, and `topic_image_remove`, each with the Topic id, the render kind where there is one, and whether
the actor owns the Topic. Browser events: `home_view` with `face: "visitor" | "user"`, and `featured_card_open` with
the card's kind and id. Nothing sends without a PostHog key.

## Risks / Trade-offs

- [Gemini's price table entry for the two models may be missing in this LiteLLM version, so the key is charged
  nothing] → the app's own cost row is the meter the monthly budget reads, as with transcription. The key's budget
  check still runs.
- [A render takes four to seven seconds and the topic page shows the drawn cover meanwhile] → the editor polls and
  swaps the image in place; the topic page reads the new url on its next load. No page waits.
- [An upload is not screened and a flag is the only moderation] → the admin's Regenerate drops it in one click, and
  the report resolves as removed. Named in the request.
- [A 848 pixel square crop upscaled to a 3000 pixel cover is soft in a podcast app's artwork view] → the 600 pixel
  cover on the site and in email stays sharp. Gemini's 2K size is not offered at 3:2 on these models.
- [The featured cards link private nothing, but a pinned Topic turning private must leave the featured cards at once] →
  the existing release of a feature order on a visibility change clears the Redis entry and purges `home`.
- [Six derived files and an original per image, seven objects per write] → each replaced set goes to pending
  deletion, and the sizes table makes a new size a resize pass instead of a render.
- [No design exists for the home page and the cards] → the sizes and layouts above are proposed from the current
  pages; the user replaces them before apply if the designs land first.

## Migration Plan

1. Migrations: `topic_images`, `topic_image_renders`, `podcast_episodes.feature_order`. Routine on deploy.
2. Deploy. Every Topic shows the drawn cover and the text card until the backfill runs; new Topics render on create.
3. Run `bun run topic-images:backfill -- --mode missing` on prd on the master key. Watch the render rows' cost.
4. After a house style change: bump the style prompt's version and run the backfill with `--mode redo`.
5. Rollback: the routes and workflows are additive. Reverting the app leaves the tables and objects in place and
   returns every page to the drawn covers.

## Open Questions

- The home page and card designs, once they land on the CarlNotes social page, may change the card sizes in decision
  2. A size change before apply is a number change; after apply it is a resize pass.
