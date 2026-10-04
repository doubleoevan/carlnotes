## Why

CarlNotes has no audio. A reader keeps up with a Topic only by reading its findings, and the Terms page already promises
"audio briefings" that do not exist. A two-host podcast episode per Scan lets a subscriber keep up while they walk or
drive, and every chapter says why its finding matters to them, which is the product's whole point. Speech costs real
money per minute, and Google's rates for it double on January 1, 2027, so the plan prices and their monthly budgets have
to rise first for episodes to fit.

## What Changes

Built in this order:

- **Plan prices.** Plus rises from $15 to $20 a month and premium from $29 to $40, so yearly becomes $200 and $400
  through the existing ten-times rule. Their monthly budgets rise from $10 to $15 and from $20 to $35. Free, the daily
  Topic and scan limits, and metered overage do not change. The plans page and the structured data read the new values
  from `shared/plans.ts`, and the Plans and limits docs page is updated by hand. Checkout charges what Stripe's Price
  objects say, so new Prices are created in Stripe and the `STRIPE_PRICE_*` values point at them. A user's key takes the
  new budget when it is next replaced, at the monthly reset or a plan change.
- **Speech model routing.** `GEMINI_API_KEY` belongs to the LiteLLM service only. Each chapter is one two-speaker
  request for `gemini-3.8-flash-tts` through LiteLLM's Gemini pass-through, because `/v1/audio/speech` cannot send
  Gemini's two-speaker voice config, and the spend posts to the user's virtual key. The pass-through charges from
  LiteLLM's own price table, which has the model's standard rates and no Flex rate for audio output, and a model entry
  in `litellm-config.yaml` cannot change that. So the config gains no alias, and the app's own speech rates live in one
  file. A smoke script renders a short two-speaker clip on each tier through the local proxy and checks that the spend
  reached the test key at the app's rate for that tier. Google bills a Flex call at half price, and LiteLLM charges the
  key the standard rate for its audio, so the app records a Flex call at what the proxy charges until LiteLLM prices
  Flex audio output. The Flex metering has to be fixed before January 1, 2027, when the standard rates double. The
  runtime image gains ffmpeg.
- **Podcast Episodes.** Every succeeded Scan, whether scheduled, manual, or a Topic's first, starts an episode workflow
  on its own task queue. It picks the Scan's new findings by score, then the Topic's best findings that no episode has
  narrated, then ones that an episode has narrated, aiming for about 30 minutes, with longer chapters when there are
  fewer findings. A script writer on `score-model` writes an outline and then one segment at a time. Each chapter is
  built on its finding's summary and relevance explanation, and the
  finding's stored content, up to about 1,500 words, supplies the specifics: names, numbers, and quotes. The content is
  read from storage the way the chat's retrieval reads it, never by fetching a page at render time, and it reaches the
  model as fenced untrusted text. The script is schema-checked. Each chapter renders as one two-speaker request, on the
  Flex tier for a scheduled Scan and the standard tier otherwise. ffmpeg joins the chapters, sets the loudness, and
  encodes a 64 kbps mono MP3, which is stored in object storage. A Podcast Episode gets its season and number only when
  it publishes.
- **Limits on episodes.** Podcast Episode cost counts toward the user's monthly spend. Once that spend passes 80 percent
  of the monthly budget, episodes pause until the next month and Scans keep running. On the free plan each Topic gets
  one episode, its first. Podcast Episodes are off, with their UI hidden, if the speech model is set empty, so a
  self-hosted instance runs without a Google key. Otherwise they are on for everyone as soon as the change deploys.
- **Player.** The topic page shows the latest podcast episode in a player under the title, with a seek bar split into
  chapters, a chapter list, thumbs per chapter that write the finding's own rating, and a Subscribe button. It streams
  from a short-lived presigned URL, resumes where the listener stopped, supports lock-screen controls, and labels both
  voices as AI. An episodes card lists every episode by season, and each scan history row has a pill that plays its
  episode. A podcast player docks at the bottom of every page while an episode is loaded.
- **The podcast switch.** Turning a Topic's podcast on or off is a Topic setting like its frequency or its visibility.
  It is saved by the shared settings tool in `api/tool/topicTools.ts`, so the chat changes it with the same propose,
  confirm, and toast flow, the MCP server changes it through the same tool, and the settings card shows it on its last
  row. Turning it on for a Topic on the free plan that has used its episode returns the tool's plan rejection.
- **The digest names the podcast episode.** The episode's title is written by the outline call, before any audio
  renders, and the Scan's email waits for it. If the Scan has an episode, the digest shows a section headed "Coffee
  Break podcast with Carl and Vienna" with "Today's episode: <title>", linked to that episode by its id. A reader who
  opens the link before the render finishes sees that Carl and Vienna are recording, and the episode shows ready to play
  once it publishes. If the Scan has no episode, or the outline fails, the digest is sent without the section.
- **Podcast feeds.** A public Topic with episodes gets a public RSS podcast feed at its topic URL plus `/podcast.xml`. A
  private or invite Topic gets a feed URL per listener that includes a token, is blocked from directories, and stops
  working if the listener loses access. Feeds return 304 for an unchanged feed and are cached in Redis until an episode
  publishes or access changes. Enclosures are stable api URLs that redirect to a presigned URL.
- **Podcast Episode pages.** Each episode of a public Topic gets a server-rendered page with a player, its chapters, the
  transcript, structured data, and a place in the sitemap. A private or invite Topic's episodes get no public page.
- **Copy, docs, and tests.** The Terms and Privacy pages name podcast episodes and Google Gemini, the docs site gets an
  episodes page, the domain-model skill gains Podcast Episode, and promptfoo cases cover the script writer.
- **Source suggestions read a web search.** Before the suggestion call, one web search runs for the Topic, and the
  prompt leans on the publications, feeds, channels, and accounts behind the pages it found.
- **Custom Sources score a little higher.** A Finding that a custom Source found gets a small bonus on its relevance
  score, which every later re-score keeps.
- **Ratings and bookmarks guide the score.** Carl reads the Topic's liked and bookmarked pages and the pages rated
  down when he scores what a Scan found, so content like the first ranks higher and content like the second ranks lower.
- **A thumbs down hides a Finding.** It leaves the feed, counts, emails, and chat but stays stored, so it never scores
  again, and a Rated down view brings it back.
- **Vienna has a backstory.** She is interested in everything, and the cold open has her own line beside Carl's.
- **A chapter keeps its rating.** A chapter whose Finding was filtered out can still be rated, and a later Finding of
  its page takes that rating, so a thumbs down keeps the page out of future episodes.

## Capabilities

### New Capabilities

- `speech-model-routing`: the two-speaker request through LiteLLM's pass-through route on the user's virtual key, where
  its price comes from, the app's own speech rates, and the smoke script that proves the spend is recorded at the right
  rate on each tier.
- `podcast-episode-rendering`: which Scans render a podcast episode, how findings are picked, the script writer and its
  checks, chapter rendering and retries, joining and encoding, seasons and numbers, storage and deletion, episode cost
  and the budget pause, the free plan's one episode per Topic, the render queue, and the speech model setting, which
  defaults to `gemini-3.8-flash-tts` and turns episodes off if set empty.
- `podcast-episode-player`: the player on the topic page, listen state per user, the chapter list and thumbs, the
  podcast episode chapter pills on findings, the episodes card, the owner's switch, the podcast player, and autoplay of the
  next unplayed episode.
- `podcast-feeds`: the public feed, the per-listener feed and its token, the enclosure redirect, the chapters and
  transcript files, feed caching, the podcast feed dialog, and the AI voices note.
- `podcast-episode-pages`: the public page for each podcast episode of a public Topic, with its transcript and
  structured data.

### Modified Capabilities

- `subscription-billing`: plus and premium cost $20 and $40 a month with $15 and $35 budgets, a pricing card's monthly
  scan estimate follows, monthly spend includes podcast episode cost, and the account meter shows it.
- `authorization`: the gate decides whether a user's Scan may render a podcast episode.
- `durable-scans`: a succeeded Scan starts its podcast episode workflow, which outlives the Scan's workflow and never
  changes the Scan.
- `domain-schema`: Podcast Episode, its chapters, listen state, and feed tokens are persisted, and a Topic records its
  podcast setting.
- `topic-tools`: the settings tool turns a Topic's podcast on and off.
- `topic-scan-email`: the digest waits for the podcast episode's outline, names the Scan's episode, and links it by id.
- `scan-history`: a scan history row has a pill that plays the podcast episode that its Scan rendered, and the history
  shows five Scans to a page with page numbers under the card.
- `seo`: the sitemap lists episode pages, and a public Topic's page declares its podcast series and links its podcast
  feed.
- `edge-caching`: public podcast feeds are shared at the edge, and per-listener feeds and the enclosure redirect are
  never stored.
- `account-closing`: closing an account deletes its podcast episodes' audio.
- `deploy-mechanics`: the runtime image includes ffmpeg, and the LiteLLM service holds the Gemini key.
- `eval-harness`: promptfoo cases test the script writer.
- `observability`: a podcast episode render is traced with its cost, duration, and retries.
- `source-suggestion`: one web search for the Topic gives the suggestion model its leads before it proposes Sources.
- `curation`: a Finding that a custom Source found gets a 0.05 relevance score bonus, kept on every re-score, the score
  prompt reads the Topic's liked, bookmarked, and rated down pages, and a Finding rated down never scores again.
- `feed-api`: a Finding rated thumbs down leaves every feed read and count but stays stored, with a Rated down view.

## Impact

- `shared/plans.ts`, `ui/src/pages/PlansPage.tsx`, `docs/src/content/docs/account/plans-and-limits.md` and its
  screenshots, and the plan tests. New Stripe Prices and `STRIPE_PRICE_*` values in Doppler.
- `docker-compose.yml`, `.env.example`, a comment in `litellm-config.yaml`, the root `Dockerfile`, and a new smoke
  script with its `package.json` entry and README line.
- `db/schema.ts` and a generated migration: `episodes`, `episode_chapters`, `episode_listens`, `episode_feed_tokens`,
  and one `topics` column.
- `api/tool/topicTools.ts` and `shared/contracts.ts`: the podcast field in the shared settings tool, which the chat and
  the MCP server both use, and the docs page on editing a Topic in chat.
- `worker/`: a new podcast episode workflow with its activities, its steps in `worker/podcast/`, and its Worker in
  `worker/temporal.ts`, the script prompts under `worker/prompts/`, the speech call in `worker/speech.ts`, the ffmpeg
  step, presigned URLs in `worker/store.ts`, speech rates in `worker/budget.ts`, and a new `episode` report stage in
  `shared/monitoring.ts`.
- `db/quotas.ts` and `api/authorization.ts`: the monthly spend sum moves to `db/quotas.ts` so the worker can read it,
  and gains podcast episode cost, and the gate gains the `podcastEpisode:render` and `podcastEpisode:remove` capabilities.
- `api/`: the routes in `api/podcast/` for the player, listen state, the audio redirect, the chapters, and the
  transcript, the podcast feed routes in `api/documents.ts`, page head data and sitemap entries in
  `api/share/pageHead.ts` and `api/seo.ts`, the feed builder and the covers in `api/share/`, and audio deletion in
  `deleteTopic`.
- `ui/`: the player and its store, the episodes card, the podcast feed dialog, the podcast switch, the podcast player, the
  episode page route, the account meter, and the Terms and Privacy copy.
- `emails/topic-scan-email.tsx`, a new docs page under `docs/src/content/docs/feed/`,
  `.agents/skills/domain-model/SKILL.md`, module AGENTS.md files, and the README.
- New dev dependency: `promptfoo`. New runtime tool: ffmpeg. New provider: Google Gemini, reached only through LiteLLM.
