## 1. Prices

- [x] 1.1 In `shared/plans.ts`, set `MONTHLY_PRICE_CENTS` to `plus: 2000` and `premium: 4000`, set `monthlyBudgetCents`
  to `1500` for plus and `3500` for premium, and update each plan's price comment to "$20/mo, $200/yr" and "$40/mo,
  $400/yr". Leave free, the daily Topic and scan limits, and the yearly rule as they are
- [x] 1.2 Confirm the plans page shows $20 and $40 monthly, $200 and $400 billed yearly, and about 150 and 350 scans a
  month, all derived from the config. Change no code in `ui/src/pages/PlansPage.tsx` unless a value is hardcoded
- [x] 1.3 Update the plans table and the monthly scan estimates in `docs/src/content/docs/account/plans-and-limits.md`,
  and retake `billing-plan-picker.png` and `account-coffee-fund.png` if they show the old prices or budgets
- [x] 1.4 Search the repo for any other copy that names $15, $29, $150, $290, or the $10 and $20 budgets beside a plan
  name, and update it. Update the tests that pin a price or a budget, and run `bun test shared api worker`
- [x] 1.5 Create the four new Prices in the Stripe sandbox on the existing Plus and Premium products, and point the dev
  `STRIPE_PRICE_*` values at them. Build no step that moves an existing subscriber

## 2. Speech model routing and the image

- [x] 2.1 Pass `GEMINI_API_KEY` to the `litellm` service in `docker-compose.yml` beside `FIREWORKS_API_KEY`, and list it
  in `.env.example` with a comment that only the LiteLLM service reads it. Add `PODCAST_SPEECH_MODEL`,
  `PODCAST_RENDER_CONCURRENCY`, `PODCAST_HOST_VOICE`, and `PODCAST_COHOST_VOICE` to `.env.example`
- [x] 2.2 Add a comment to `litellm-config.yaml`, and no model entry: speech goes through the Gemini pass-through, the
  proxy charges it from LiteLLM's own price table, and Google's rates double on January 1, 2027
- [x] 2.3 Add the speech rates to `worker/budget.ts`, the one repo file that states them: text input and audio output
  per million tokens for each tier, doubled from January 1, 2027 UTC. Test both dates and both tiers
- [x] 2.4 Add `worker/speech.ts`: one function that sends a two-speaker `generateContent` request through the LiteLLM
  Gemini pass-through on a given virtual key, with one part per turn, both voices, an optional Flex tier, and a timeout,
  and returns the WAV bytes and the token counts. It sorts a failure into retryable (429 and 5xx), a spent key budget,
  or rejected. Test the request body, the Flex field, and the failure sorting with a stubbed fetch
- [x] 2.5 Add `worker/speech.smoke.ts` and `smoke:speech` in `package.json`: create a test key, render a short
  two-speaker clip on each tier through the local proxy, assert each response is a WAV, assert the key's spend from
  `/key/info` rose by the call's tokens at that tier's rate in `worker/budget.ts`, print both amounts if they differ,
  and delete the key. Add it to `scripts/smoke-coverage.sh` and the README's smoke list
- [x] 2.6 Run the proxy with the Gemini key and `bun run smoke:speech`, and confirm that each tier's spend matches
  `worker/budget.ts`
- [x] 2.7 Add ffmpeg to the runtime stage's `apt-get install` line in the root `Dockerfile`, and check the built image
  runs `ffmpeg -version`

## 3. Schema

- [x] 3.1 In `db/schema.ts`, add `episodes`, `episode_chapters`, `episode_listens`, and `episode_feed_tokens` with the
  columns, delete rules, and unique indexes that the design lists, an `episode_status` enum of `rendering`, `published`,
  `failed`, and `removed`, and `topics.is_podcast_enabled`
- [x] 3.2 Run `bun run db:generate`, and add `db/schema.test.ts` cases for the new tables' delete rules and unique
  indexes
- [x] 3.3 Add Podcast Episode, its chapters, listen state, and the feed token to `.agents/skills/domain-model/SKILL.md`,
  with a line that separates a Topic's podcast, its feed of Podcast Episodes, from the `podcast` Source kind, and add
  Podcast Episode to the entity sentence at the top
- [x] 3.4 Add the episode payload types to `shared/contracts.ts`: a Podcast Episode with its chapters and the listen
  state payload. Add `isPodcastEnabled` to `updateTopicFieldsPayload`, which the chat's proposal payload extends

## 4. Spend, the gate, and the checks before a render

- [x] 4.1 Move the monthly spend sum from `api/authorization.ts` to `db/quotas.ts`, add `episodes.cost` for the month by
  `owner_id` as its third part, and keep `api/authorization.ts` reading it. Update `api/activity.ts` and the tests of
  both files for the third amount
- [x] 4.2 Add `isPodcastEpisodeBudgetShareExhausted(userId)` to `db/quotas.ts`: true once monthly spend is at or past 80
  percent of the user's budget. Test just under, at, and over the line, and that a new UTC month clears it
- [x] 4.3 Add the `podcastEpisode:render` capability to `isAllowed`, read for the Topic's owner: true for a paid plan, and for
  a free plan only while that Topic has no rendering, published, or removed Podcast Episode. Test an owner on a paid
  plan, the first Podcast Episode of a Topic on the free plan, its second, a removed first Podcast Episode, an owner on
  the free plan's other Topic, and an upgrade
- [x] 4.4 Show podcast episode spend as its own segment in `ui/src/components/account/AccountBudget.tsx`

## 5. The podcast episode workflow

- [x] 5.1 Add `isPodcastEpisodeRenderingConfigured()` in `shared/podcastEpisodes.ts`, which reads
  `PODCAST_SPEECH_MODEL` with a default of `gemini-3.8-flash-tts`, and use it wherever the api or the worker decides
  whether podcast episodes exist
- [x] 5.2 Add `planPodcastEpisode` in `worker/podcast/planPodcastEpisode.ts`: return nothing if episodes are off, the
  Scan did not succeed, the Topic is gone or its podcast is off, the gate rejects, or the budget check pauses, logging
  which. Otherwise pick the Scan's new Findings by score, then the Topic's Findings whose Resource no published Podcast
  Episode of the Topic narrated, up to fifteen, and create the `episodes` row as `rendering`, unique by Scan. Test the
  order, the fifteen limit, a Finding found again, and each reason to skip
- [x] 5.3 Add `worker/prompts/outline-podcast-episode.md` and `worker/prompts/write-podcast-episode-segment.md` with the
  five frontmatter keys. Describe Carl the host and Vienna the co-host, as the podcast-episode-rendering spec states
  them, in the `podcast-episode-hosts.md` prompt fragment that both prompts splice. Give each prompt Gemini's speech
  syntax for tags and style, the rule that each chapter is built on the summary and the relevance explanation with
  specifics from the stored content, and the rule that the writer paraphrases and quotes at most three short sentences
  per Finding with the source named. Have the sign-off close on what the episode added up to, with no goodbye,
  since the code adds the goodbye after it. Put the untrusted inputs below the instructions and restate the task last. Register both in
  `worker/prompts/fetch.ts`
- [x] 5.4 Add the script schema and its checks in `worker/podcast/podcastEpisodeScript.ts`: the Zod shapes for the
  outline and a segment, the 150 words a minute estimate, and the rejections for an unknown Finding id, an outline over
  30 minutes, a chapter with more than three quotations or a quotation over 30 words, a title over 60 characters, and a
  description over 155, for a first or second draft. Repair a third draft instead: cut the title and the description,
  leave out a chapter that cites an unknown or repeated Finding or still quotes too much, and accept a missing chapter,
  cold open, or sign-off. Keep a written chapter or script that runs past its planned length. Test each rejection, the
  dropped chapter, and a passing script
- [x] 5.5 Add `outlinePodcastEpisode` and `writePodcastEpisodeSegment` in `worker/podcast/writePodcastEpisodeScript.ts`,
  over the calls in `worker/podcast/generatePodcastEpisodeScript.ts`: build the prompts through `writePrompt` from the
  Findings' titles, summaries, relevance explanations, and stored content, and the Topic's name and prompt, never
  `buildTopicScanContext`'s attachment context, call `score-model` on the billed user's key, validate, and write a
  rejected draft again inside the activity, then fail for good. Read each Finding's stored content through the chat
  retrieval's `readResourceText`, limited to about 1,500 words at a word boundary, and fetch nothing from the web.
  `outlinePodcastEpisode` saves the title and the description on the Podcast Episode row before it returns. Test the
  word limit, a Finding with no stored content, that every untrusted value is fenced, that an attachment's context is in
  neither prompt, and that the title is saved while the status is still `rendering`
- [x] 5.6 Add `renderPodcastEpisodeChapter` in `worker/podcast/podcastEpisodeAudio.ts`: build the chapter's turns with
  the cold open, transition, or sign-off that belongs to it, call `worker/speech.ts` on the Scan's tier, write the WAV
  to `episodes/<podcastEpisodeId>/chapters/<position>.wav`, add the call's cost to the Podcast Episode's row, and return
  the chapter's position, the object's key, its byte size, and the attempt count, and no audio. Throw retryable and
  final failures the way the email activities do. Test the turn assembly for the first, a middle, and the last chapter
- [x] 5.7 Add `encodePodcastEpisode` in the same file: download the chapter WAVs to a temp directory, run ffmpeg's
  concat with `loudnorm` and `libmp3lame` at 64 kbps mono 44.1 kHz, upload `episodes/<podcastEpisodeId>/audio.mp3`,
  compute each chapter's times from the WAV sizes, and delete the temp files. The publish deletes the chapter objects.
  Test the chapter time math, and encode two short WAV fixtures in a test that is skipped if ffmpeg is not installed
- [x] 5.8 Add `publishPodcastEpisode` in `worker/podcast/publishPodcastEpisode.ts`: in one transaction assign the season
  as the publish time's UTC year, assign the next number in that season, write the chapters, the cost, the audio fields,
  the script, and `published`, retrying on a number conflict. Then delete the Topic's cached feeds and tell IndexNow
  about a public Topic's podcast episode page. Test numbering across a failed render, across a new year, a publish at
  23:30 UTC on December 31, and two publishes at once
- [x] 5.9 Add `failPodcastEpisode` in the same file, which saves the failure reason and the cost spent so far and
  deletes the chapter objects that the render left, and report it under a new `episode` stage in `shared/monitoring.ts`
- [x] 5.10 Add `worker/workflows/renderPodcastEpisode.ts` and `renderPodcastEpisodeActivities.ts`: the workflow runs
  plan, outline, each segment, the chapters in parallel, encode, and publish, with the design's retry policies for
  script calls, standard chapters, and Flex chapters, and calls `failPodcastEpisode` if an activity fails for good. It
  signals `scan-email-<scanId>` that the outline is settled, once: after the outline saved the title, after the plan
  returned nothing, or after the plan or the outline failed for good, ignoring a signal that finds no workflow. The file
  names the `episode-renders` queue
- [x] 5.11 In `worker/workflows/runTopicScan.ts`, start `renderPodcastEpisodeWorkflow` after the email start for a
  succeeded Scan, as a child with the id `episode-${scanId}` and `ParentClosePolicy.ABANDON`, behind
  `patched("episode-render-workflow")`, and under the same marker pass the Scan's email workflow the flag that a podcast
  episode workflow follows. Leave an existing child alone and report any other start failure through an activity
- [x] 5.12 In `worker/workflows/sendScanEmail.ts`, for an email whose input has the flag, wait for the outline-settled
  signal for at most ten minutes before planning the digest or sending the report. The flag is new input, so a workflow
  from before the change never waits and needs no `patched` marker. Check in the local Temporal UI that the digest waits
  for the signal and sends at once on it
- [x] 5.13 In `worker/temporal.ts`, add a Worker for the `episode-renders` queue with the podcast episode activities and
  `maxConcurrentActivityTaskExecutions` from `PODCAST_RENDER_CONCURRENCY`, read with `toPositiveInteger` the way
  `SCAN_CONCURRENCY` is, default 16. Run `bun scripts/check-workflow-bundles.ts`
- [x] 5.14 Trace each render through `worker/telemetry.ts`: one trace per render with the Topic and the Scan, and its
  duration, each chapter's attempts, the tier, the cost, and the cost per audio minute as metadata
- [x] 5.15 In `deleteTopic`, delete every Podcast Episode's audio object and any leftover chapter objects before the
  Topic row goes. Test that the Podcast Episode rows stay with no Topic
- [x] 5.16 Add `toPodcastEpisodeAudioUrl` to `worker/store.ts` over `Bun.S3Client`'s `presign`, with a one hour expiry,
  and export it from `worker/index.ts`

## 6. The api for the player

- [x] 6.1 Add `api/podcast/helpers.ts` with its routes in `api/podcast/podcastEpisodes.ts`, and mount them:
  the Topic's latest Podcast Episode and its chapters in the topic page payload, a season's whole list, and one Podcast
  Episode by id. The read by id returns a `rendering` or `failed` Podcast Episode too, with its title and status and no
  audio, so the player can show its state. Apply `topic:view`, and for a subscriber of an invite Topic return only
  Podcast Episodes published after their activation, plus a rendering one whose Scan started after it. Return nothing if
  episodes are not configured
- [x] 6.2 Add `GET` and `HEAD /api/episodes/:id/audio.mp3`: check access by session or a public Topic, respond to HEAD
  with the stored length and type and `Accept-Ranges`, and respond to GET with a 302 to a presigned URL and
  `private, no-store`. Test both methods and the access rule
- [x] 6.3 Add `POST /api/episodes/:id/listen`: one upsert of the listener's progress, a play count that rises when
  playback starts, and completion. Require a session. Test the upsert and the access rule
- [x] 6.4 Add `GET /api/episodes/next-unplayed`: the latest published Podcast Episode of each other Topic that the user
  owns or subscribes to, left out if it has a listen row of theirs, newest first, one result
- [x] 6.5 In `updateTopicFields` in `api/tool/topicTools.ts`, save `isPodcastEnabled` with the other named fields:
  turning it off is always allowed, and turning it on asks `podcastEpisode:render` and returns `{ status: "podcastPlan" }`
  beside `DailyFrequencyRejection` if the gate says no. Test off, on, the Topic on the free plan that used its Podcast
  Episode, and a user who may not edit
- [x] 6.6 Offer the setting through both adapters: the chat's proposal card, confirmation, and toast, and the MCP
  server's settings tool and its description, each with its own words for the plan rejection. Leave the setting out of
  both if no speech model is configured. Test each adapter
- [x] 6.7 Add the Podcast Episode's number to each scan history row in the topic page payload, for a published Podcast
  Episode that the user may listen to
- [x] 6.8 Update `api/AGENTS.md` and the root routing table for the new `api/podcast/` folder
- [x] 6.9 Add the `podcastEpisode:remove` capability to the gate, for the Topic's owner and an admin, and
  `DELETE /api/episodes/:id`: delete the audio object, the chapter rows, and the listen rows, clear the script and the
  audio fields, set the status to `removed`, and delete the Topic's cached feeds. Count removed rows when
  `publishPodcastEpisode` picks the next number. Test the owner, an admin, a subscriber, that the next Podcast Episode
  takes the next number, and that the audio url then responds as missing

## 7. The player and its placement

- [x] 7.1 Read the four wireframes in `docs/design/podcast/` in full before building, and match their layout, copy, and
  sizes
- [x] 7.2 Add `ui/src/stores/podcastEpisodePlayerStore.ts` and mount one `<audio>` element in
  `ui/src/components/layout/Layout.tsx`: the current Podcast Episode, the chapter, the position, the playback rate, play
  and pause, seek, chapter skip, and recovery from an expired URL by loading the stable url again
- [x] 7.3 Add `ui/src/components/podcast/PodcastEpisodePlayer.tsx` and its `PodcastEpisodePlayerCard.tsx` under the
  topic title in `ui/src/pages/TopicPage.tsx`, with the heading "Coffee Break podcast": the season, number, title, date,
  length, and chapter count, the seek bar split by chapter, the playback rate button, the first three chapters as a list
  with a control for the rest, the playing state from `Playing.dc.html`, and the AI voices note
- [x] 7.4 Open a Podcast Episode by its id from `?episode=<podcastEpisodeId>` on the topic page: for a `rendering`
  Podcast Episode show its title and that Carl and Vienna are recording, check it every few seconds, and show it ready
  to play once it publishes, never starting it. For a `failed` Podcast Episode say the podcast failed to record, with
  the scan button for a user who may start a Scan. For an id that the user may not listen to, open the page as usual
- [x] 7.5 Save listen state from the store: at most every 30 seconds while playing, on pause, and on page hide, for a
  signed-in listener only. Start a signed-in listener at their saved progress
- [x] 7.6 Wire the Media Session API: the Podcast Episode title, the chapter as the track title, the Podcast Episode's
  cover as the artwork, and next and previous handlers that skip chapters
- [x] 7.7 Add chapter thumbs that call `sendTopicFindingRating` for the chapter's Finding, hidden for a user who may not
  rate and for a chapter with no Finding
- [x] 7.8 Show the episode and chapter pill on findings rows narrated in the latest Podcast Episode, highlight the row
  and the pill of the chapter that is playing, and play from that chapter or pause it when a pill is selected
- [x] 7.9 Add `ui/src/components/podcast/PodcastEpisodesCard.tsx` in the right column above the scan history card, with
  the heading "Coffee Break podcast episodes": season tabs with the newest season that has Podcast Episodes selected
  unless the url names another, five rows to a page with the page numbers that the homepage sections use under the card,
  the latest marked, a row button that plays or pauses its Podcast Episode, and a remove control with a confirmation on
  each row for the Topic's owner and an admin
- [x] 7.10 Show each scan history row's Podcast Episode number in `ui/src/components/topic/TopicScanHistory.tsx` as a
  pill that plays or pauses the Podcast Episode
- [x] 7.11 Add "Podcast" right-aligned beside Cost this month on the last row of
  `ui/src/components/topic/TopicSettingsCard.tsx`, reading "On" or "Off", and the podcast switch at the bottom of
  `ui/src/components/topic/EditTopicModal.tsx`, saved through the settings tool's route, with the upgrade link on a
  Topic on the free plan that has used its Podcast Episode
- [x] 7.12 Build the phone layout from `Mobile.dc.html` and `MobilePlaying.dc.html`: the compact card, the podcast player
  that docks while a Podcast Episode is loaded with the Podcast Episode's cover in its square icon slot, and the chat
  pill raised above it in `ui/src/components/chat/ChatPanelWidget.tsx`
- [x] 7.13 Autoplay the next unplayed Podcast Episode when one ends, and keep playback running across page changes
- [x] 7.14 Hide every podcast episode component if the topic payload has no episode data, and update `ui/AGENTS.md` for
  the new `components/podcast/` folder and the store

## 8. Feeds and the podcast feed dialog

- [x] 8.1 Add `api/share/podcastFeed.ts`: build the RSS 2.0 feed with the iTunes and Podcasting 2.0 namespaces from a
  Topic's published Podcast Episodes, with the channel and item tags that the spec lists, the stable enclosure urls, the
  show cover as the channel's `itunes:image` and each Podcast Episode's cover as its item's, and the AI voices note in
  the channel and each item. Test the output against the tags that Apple requires and the Podcasting 2.0 tags, and that
  a rename keeps every guid
- [x] 8.2 Add the covers in `api/share/podcastCover.ts`, drawn the way `topicImage.ts` draws preview cards over
  `docs/design/podcast/cover-base.png`: "Coffee Break podcast" centered in the top band in Architects Daughter with
  "Coffee Break" in `#f09050` and "podcast" in `#f3e9db`, and the show cover's Topic name or the podcast episode cover's
  title in the bottom band in `#332a22`, left-aligned. Step the title's size down by its length, wrap it, and stop it at
  three lines with an ellipsis inside a 10 percent safe margin at the sides and a 5 percent margin at the bottom. Output
  3000 by 3000 RGB under 512 KB, cache each cover in object storage under its key, and serve it at 3000 and at 600
  pixels from `/api/podcast-covers/<kind>/<id>/<key>-<size>.jpg`, where the key is an HMAC of the kind, the id, and the
  title, with no session and with the preview cards' edge headers on a public Topic's covers. The routes respond to
  HEAD. Test the size steps, the three-line limit, the byte size, that a new title is a new key, and that a made-up key
  is not found
- [x] 8.3 Serve `GET /topics/:id/podcast.xml` from `api/documents.ts` for a public Topic with a published Podcast
  Episode, with its edge headers from `api/edgeCache.ts`
- [x] 8.4 Add feed tokens in `api/podcast/podcastFeedTokens.ts`: create a listener's token on first use, check a token
  by the row and the listener's current access, reset it, and delete it where a subscription is turned off or deleted,
  an invite is deleted, and an email unsubscribe runs. Test in the podcast episode smoke that a reset ends the old url
  and that an in-app unsubscribe deletes the token
- [x] 8.5 Serve `GET /podcast-feeds/:token.xml` with `itunes:block`, `X-Robots-Tag: noindex`, and `private, no-store`,
  listing only Podcast Episodes that the listener may listen to, and `GET` and
  `HEAD /api/podcast-feeds/:token/episodes/:id/audio.mp3`, which records the download as that listener's play. Test a
  token used for another Topic
- [x] 8.6 Serve the chapters file and the HTML transcript for a Podcast Episode, public for a public Topic and under the
  token path otherwise. Build the transcript from the stored script as escaped text with the AI voices note
- [x] 8.7 Cache each rendered feed and each token check in Redis with `readRedisJson` and `saveRedisJson`, delete the
  keys on publish and on every access change, and respond to `If-None-Match` and `If-Modified-Since` with 304. Test the
  304 for a matching ETag and for a current modified time, and test in the podcast episode smoke that a deleted token is
  not served from the cache
- [x] 8.8 Replace a feed token with `:token` in `shared/reportedPath.ts`, name the feed route
  `/podcast-feeds/:tokenFile` in the request tracing, and test both
- [x] 8.9 Add `ui/src/components/podcast/PodcastFeedDialog.tsx`: the `podcast://` link on Apple devices built from the
  feed url without its scheme, the `pcast://` link on Android, "Copy feed link" with the list of apps that take a pasted
  feed, the listener's own url and its reset for a private or invite Topic, and no Spotify option
- [ ] 8.10 Test the `podcast://` link on an iPhone and the `pcast://` link on an Android phone against a deployed feed,
  and record what each opens in the design's open questions

## 9. Podcast Episode pages and search

- [x] 9.1 Add the episode page route, at a path after the topic route's, in `ui/src/routes/_layout/`, at
  `/topics/<id>/<slug>/episodes/<season>/<number>`, with a server loader, a redirect for a stale slug, and not found for
  an unknown Podcast Episode or a Topic that is not public
- [x] 9.2 Add `ui/src/pages/PodcastEpisodePage.tsx`: the title as the heading with the Podcast Episode's cover beside
  it, the player, the collapsible "Episode chapters" table with each chapter's play button, start, length, and Finding,
  a row that opens the Finding's note, a totals row, and the standard pagination, the transcript as text with a titled
  dashed rule over each chapter, collapsed behind "read more" once JavaScript runs, and the AI voices note
- [x] 9.3 Add the episode page's head data in `api/share/pageHead.ts` and `api/seo.ts`: the description, the canonical
  url, `PodcastEpisode` JSON-LD, the `og:audio` tags, the Podcast Episode's card as `og:image` (see 9.7), and noindex if
  the Topic is not yet shown. Test that the JSON-LD parses and has its required fields
- [x] 9.4 Add `PodcastSeries` JSON-LD and the podcast feed's `rel="alternate"` link to a public Topic's page head if it
  has a published Podcast Episode
- [x] 9.5 Add episode pages to `toSitemapXml` for public shown Topics with the publish time as `lastmod`, and test that
  a private Topic's Podcast Episodes are never listed
- [x] 9.6 Add the episode section to `emails/topic-scan-email.tsx`: the heading "Coffee Break podcast with Carl and
  Vienna" and "Today's episode: <title>" linked to the topic page with `?episode=<podcastEpisodeId>`, and under it the
  Podcast Episode's cover at 600 pixels wide with the same link. In `worker/notify.ts`, read the Scan's Podcast Episode
  when a batch renders and include the section only if it has a title and has not failed. Update the email's test and
  preview props for both cases
- [x] 9.7 Draw a Podcast Episode's own 1200 by 630 card in `api/share/podcastEpisodeImage.ts`, serve it at
  `/api/episodes/:id/preview.png` for a public Topic's published Podcast Episode, and name it as the episode page's
  `og:image`
- [x] 9.8 List the newest public Podcast Episodes in `toLlmsTxt` under the show name, "Coffee Break podcast with Carl
  and Vienna" (`PODCAST_SHOW_NAME`), and leave the section out if there are none
- [x] 9.9 Make the podcast episodes card's season tabs links that put the season in the topic page's query, load that
  season on the server in `loadTopicRoute`, and keep the topic page's own url as canonical

## 10. Copy and docs

- [x] 10.1 In `ui/src/pages/TermsPage.tsx`, replace "audio briefings" with podcast episodes. In
  `ui/src/pages/PrivacyPage.tsx`, name Google Gemini as the provider for podcast audio and say what it receives. Update
  both pages' dates
- [x] 10.2 Add `docs/src/content/docs/feed/coffee-break.md`: what an episode is, the two hosts and that they are AI
  voices, where the player is, how to subscribe in a podcast app, the owner's switch, the budget pause, and what each
  plan gets, with one episode per Topic on the free plan
- [x] 10.3 List the podcast switch among the settings Carl can change on
  `docs/src/content/docs/feed/editing-a-topic-in-chat.md`, with what happens on a Topic on the free plan that has used
  its episode
- [x] 10.4 Update `worker/AGENTS.md` for the podcast episode workflow, its queue and Worker, `speech.ts`, and the
  `podcast/` folder, `db/AGENTS.md` for the spend sum and the budget check, the root AGENTS.md routing table, and the
  README: the process table's count of Workers, the scan section, the providers line, and the new settings in the
  Development section
- [x] 10.5 Add the removed and renamed names from this change to the stale-drift list in
  `.agents/commands/audit-structure.md`

## 11. Evals

- [x] 11.1 Add `promptfoo` as a dev dependency, a suite under `evals/podcast-episode-script/` that runs the outline and
  segment prompts through the local LiteLLM proxy with promptfoo's `evaluate` function, since its CLI does not start
  under Bun, and `eval:podcast-episode-script` in `package.json`. Document it in `evals/README.md` and the README
- [x] 11.2 Add the cases: every chapter cites a Finding id from the input, nothing is said that the input Findings and
  their stored content do not support, with a case whose content has a name, a number, and a quote that the script may
  use and a claim that it does not have, a chapter paraphrases its source and quotes at most three short sentences of it
  with the source named, the title and description are specific and within length, the whole script runs 30 minutes or
  less, and a two-Finding input yields a two-chapter script under seven minutes. A chapter's length is a goal and is not
  graded
- [x] 11.3 Run `bun run eval:podcast-episode-script` and fix the prompts until every case passes

## 12. Verification

- [x] 12.1 Run `bash scripts/preflight.sh`
- [x] 12.2 Apply the migration to the dev database and run `bun run smoke:speech` and `bun run smoke:scan`
- [x] 12.3 With the local worker, run a manual Scan on a Topic with Findings and check in the Temporal UI that the
  Scan's workflow completed as soon as `episode-<scanId>` started, that each chapter was its own activity, and that the
  Podcast Episode published with a season and number 1. Play it in the browser, seek, reload, and confirm it resumes
- [x] 12.4 Check the limits by hand: the second Scan of a Topic on the free plan renders nothing and shows the upgrade
  link while the owner's other Topic still renders its first, turning the podcast on for that Topic in chat returns the
  plan rejection, and a user at 80 percent of their budget gets a Scan and no Podcast Episode
- [ ] 12.5 Subscribe to a public feed and a per-listener feed in a podcast app, download a Podcast Episode, then
  unsubscribe from the invite Topic and confirm the feed and its audio stop working
- [x] 12.6 Set `PODCAST_SPEECH_MODEL` empty locally and confirm the topic page shows no podcast episode UI, a Scan's
  episode workflow ends at its first step with nothing rendered, and the digest goes out without the episode section
- [x] 12.7 Fetch a public podcast episode page with JavaScript off and confirm the title, chapters, and transcript are
  in the html, then validate its JSON-LD and the feed with a feed validator

## 13. Source suggestions

- [x] 13.1 In `worker/suggest.ts`, run one Exa search for the Topic's name and the start of its prompt before the
  suggestion call, and give `suggest-sources.md` the pages it found as `webSearchPages`, or None. with no search key or
  a failed search. Bump the prompt to version 4 and have it lean on the sources behind those pages. Test both cases

## 14. Ratings and custom Sources

- [x] 14.1 In `planPodcastEpisode`, leave out each Finding rated thumbs down, and put the Findings rated thumbs up or
  bookmarked right after the Scan's own Findings, ahead of the Topic's others. Test both
- [x] 14.2 Add `findings.is_from_custom_source`, mark each Resource that a custom Source found in `toScanSummary`, and
  add a 0.05 bonus to its Finding's relevance score in `upsertFinding`, kept on every re-score. Test the mark
- [x] 14.3 Add `episode_chapters.rating` and `POST /api/episodes/:id/chapters/:position/rating`, and show the chapter's
  own thumbs in the chapter list once its Finding is filtered out. In `upsertFinding`, a new Finding takes the newest
  chapter rating of its Resource on the Topic, and links those chapters to it. Check both against the dev database
- [x] 14.4 Add up to ten liked or bookmarked pages and up to ten pages rated thumbs down to the text that the score
  prompt reads, outside the context hash, and bump `summarize-resource.md` to version 6 with the instruction to score
  content close to the first higher and close to the second lower. A Finding rated down is never scored again. Test the
  text
- [x] 14.5 Add `isFindingShown` to `db/index.ts` and leave Findings rated thumbs down out of the homepage feed, the new
  and kept counts, the RSS feed, structured data, the scan email, chat retrieval, and the MCP feed read. Add the Rated
  down view to the feed's filters, and hide those Findings from every other view. Test the view filter
- [x] 14.6 Give Vienna a backstory in `podcast-episode-hosts.md` (version 2) and her own intro line in the cold open of
  `write-podcast-episode-segment.md` (version 2), and let the eval rubric allow her backstory
- [x] 14.7 Let a url Source's own page pass the relevance gate and skip both dedupe stages, so the scoring model reads
  every page a user added as a Source, and compare each saved url in its canonical form. Test the dedupe pass-through
- [x] 14.8 Add `isPodcastEnabled` to the topic draft. Carl's draft tool starts it on and takes it if the speech model is
  set, the MCP create tool takes it, the create saves it, and both topic cards read it from the draft. Test the draft
  tool and the edit card's draft
- [x] 14.9 Give each chapter row its `E14 · ch 2` pill in place of the row's Playing or Paused pill, and drop the
  teammates' avatars from a Finding's row
- [x] 14.10 Link the docked podcast player's cover and title to the episode's page through the episode's `pagePath`,
  and show the episode page's byline on a phone only
