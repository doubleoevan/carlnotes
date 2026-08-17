## 1. Make the fetch seam kind-aware

- [x] 1.1 In `worker/scrape.ts`, rename `FetchResult.markdown` to `text` and add a `cost: number` field holding the dollars that fetch spent, so a caller charges what the fetch reports instead of a hard-coded rate.
- [x] 1.2 Move the Firecrawl body of `fetchContent` into a private `fetchFirecrawlMarkdown(url)` returning a `FetchResult` whose `cost` is `FIRECRAWL_COST_PER_FETCH`, imported from `../budget`.
- [x] 1.3 Give `fetchContent(url, kind)` its second parameter, typed from `resourceKinds` in `@shared/enums`, and have it pick the transcript path when `kind === "watch"` and `toYoutubeVideoId(url)` is non-null, else the Firecrawl path.

## 2. Read the caption track

- [x] 2.1 Add and export `toYoutubeVideoId(url)`: the `v` param of a `/watch` url, the first path segment of a `youtu.be` short link, and the segment after `/shorts`, `/embed`, or `/live` on the YouTube hosts. Null for anything else, and null on a url that will not parse. The search ingester tags every youtube.com url `watch`, so handling only the watch-page form would leave shorts and embeds on the Firecrawl path.
- [x] 2.2 Add and export `toCaptionTrackUrl(player)`: read `captions.playerCaptionsTracklistRenderer.captionTracks` off the player payload, pick the first track whose `languageCode` starts with `en` and otherwise the first track, and return its `baseUrl` — null when the payload carries no track list. The endpoint lists tracks in language-code order, so the English preference is what stops an Arabic transcript being scored against an English topic.
- [x] 2.3 Add and export `toTranscriptText(json3Payload)`: join the segments within each caption line directly and the lines themselves on a space, then collapse whitespace. Joining every segment directly fuses each line's last word to the next line's first.
- [x] 2.4 Add the private `fetchYoutubeTranscript(videoId)`: POST the video id to `https://www.youtube.com/youtubei/v1/player` as the `IOS` client, take the track url out of the payload, refuse it unless it starts with `https://www.youtube.com/api/timedtext`, GET it with `fmt=json3` set on the query, and return a `FetchResult` with the joined text, null validators, and `cost: 0`. Bound both requests with the existing `FETCH_TIMEOUT_MS`. Throw on a missing track list, a refused track url, a failed response, or an empty join, so the caller's existing snippet fallback catches it.

## 3. Charge and store what the fetch returned

- [x] 3.1 In `worker/review/score.ts`, rename `fetchViaFirecrawl` to `fetchAndStoreContent` and update its comment — it is no longer Firecrawl-only.
- [x] 3.2 Call `fetchContent(resource.url, resource.kind)`, destructure `text` instead of `markdown`, and charge `charge(budget, "fetch", cost)` in place of the hard-coded `FIRECRAWL_COST_PER_FETCH`. Drop the now-unused `FIRECRAWL_COST_PER_FETCH` import.
- [x] 3.3 Rename `toFetchedContentFields`'s `markdown` parameter to `text` and update the comments in that path that name Firecrawl, including the failure log, so both paths read accurately.
- [x] 3.4 Confirm no other change is needed for reuse, revalidation, screening, scoring, or the fetch-outcome counts — a transcript stores, reuses, and counts as `fetched` through the code already there.

## 4. Screen the text that actually gets read

- [x] 4.1 In `worker/review/score.ts`, screen `content.slice(0, MAX_SCORE_CHARS)` rather than the whole body. A long transcript measured 64,352 characters against a 2,500 ms scanner timeout, and a timeout fails open, so screening the whole body risked dropping the screening entirely. Scoring reads 8,000 characters and chat reads 2,000, so the prefix covers every character any model sees.
- [x] 4.2 Name the invariant where the caps are defined — `MAX_SCORE_CHARS` in `score.ts` and `MAX_RESOURCE_CHARS` in `chat/retrieve.ts` — so raising either one does not silently open an unscreened path.

## 5. Extend to the other hosts that publish captions keylessly

- [x] 5.1 Probe each `watch` host before writing code for it. YouTube, Vimeo, and Dailymotion serve caption tracks without a key. TED publishes its transcript as page HTML, which is a url rewrite rather than a caption fetch. Loom, TikTok, and Rumble were not established. Snapchat and Giphy have no spoken content.
- [x] 5.2 Turn the single branch into a `CAPTION_HOSTS` table of `{toVideoId, fetchTranscript}` pairs that `fetchContent` walks, falling through to Firecrawl. Three hosts is where a table beats an arm per host.
- [x] 5.3 Add `toVimeoVideoId` and `toDailymotionVideoId`, covering the plain, channel, group, and player forms for Vimeo, and the `/video` and `dai.ly` forms for Dailymotion. A Dailymotion url hangs a title slug off its id after an underscore, which the metadata endpoint rejects.
- [x] 5.4 Map each host's payload into one shared `CaptionTrack` of a language code and a url, so one English-preference rule and one guard serve all three rather than three near-copies.
- [x] 5.5 Add `toCueText`, reading both WEBVTT and SRT by dropping the header, `NOTE` blocks, timing lines, cue numbers, and inline markup. The two formats differ only in their header and timestamp punctuation.
- [x] 5.6 Widen the caption-url guard from YouTube's exact endpoint prefix to an https-plus-domain check. Vimeo serves from `captions.vimeo.com` and Dailymotion from numbered cdn shards, so a prefix match would have to enumerate shards to express the property that matters.
- [x] 5.7 Add `dai.ly` to `WATCH_HOSTS` in `worker/ingest/search.ts`, since a short link that classifies as `read` would never reach the transcript path.

## 6. Let a channel be suggested however it is named

- [x] 6.1 Measure what a `youtube` suggestion value can be before writing code for it. Only a raw channel or playlist id survives the verifier today. A handle, a handle url, a channel url, a playlist url, and a bare name all 404 and are dropped, and the two url forms carry a valid id that is discarded for being wrapped.
- [x] 6.2 Add `toYoutubeSourceId` to `worker/ingest/youtube.ts`: an id passes through, a channel url and a playlist url give up the id they carry, and a handle written bare or as a url is looked up against the channel page. Anything else resolves to null.
- [x] 6.3 Read the handle's id from the channel page's `<link rel="canonical">` only. The first `"channelId"` in the page belongs to a different channel — `@veritasium` yields `UCin0m13qWv3-051xlWlHamA` rather than `UCHnyfMqiRRG1u-2MsSQLbXA` — and every wrong id is a real channel that would pass verification and subscribe the topic to the wrong thing.
- [x] 6.4 Resolve in `worker/suggest.ts` before the duplicate filter, not inside verification, and return the resolved value. A stored Source is identified by its id, so a handle compared against an id reads as new, and the editor saves whatever is returned as the config verbatim.
- [x] 6.5 Ask for a handle in `worker/prompts/suggest-sources.md`, bumping it to version 2. A channel id is twenty-four characters of nothing, and a half-remembered one names a channel that does not exist.

## 7. Cover the parsing

- [x] 7.1 In `worker/scrape.test.ts`, cover `toYoutubeVideoId` across `youtube.com/watch?v=`, `m.youtube.com`, `youtu.be`, a `/watch` url carrying a `list` param, `/shorts`, `/embed`, `/live`, a playlist page, a channel page, a non-YouTube host, an id-less short link and shorts path, and an unparseable string.
- [x] 7.2 Cover `toVimeoVideoId` across the plain, player, channel, and group forms, plus a user page and another host. Cover `toDailymotionVideoId` across `/video`, `dai.ly`, and an id carrying a title slug, plus a channel page and another host.
- [x] 7.3 Cover the three track mappers against fixtures in each host's own payload shape, including a track listed without a url and an absent list, which both read as no captions.
- [x] 7.4 Cover `toTranscriptText`: lines join on a space so their words do not fuse, segments within a line join directly, whitespace collapses, a segment-less event contributes nothing, and an empty payload joins to nothing so the caller throws.
- [x] 7.5 Cover `toCueText` against both formats: a WEBVTT file with its header and numbered cues, an SRT file with comma-punctuated timestamps, inline speaker and emphasis markup, a `NOTE` block, and a file with no cues at all.
- [x] 7.6 In `worker/ingest/youtube.test.ts`, cover `toYoutubeSourceId` across the forms that need no lookup: a raw channel id, every playlist prefix, a padded value, a channel url, a playlist url, a bare name, another host, a video url, and an unparseable string. The handle path needs the network, so it is covered by the live probe instead.

## 8. Verify

- [x] 8.1 Run `bunx biome check .`, `bunx tsc -b`, and `bun test`. All clean, 404 tests passing.
- [x] 8.2 Drive the real `fetchContent` against a live video on each supported host. YouTube returns 18,430 chars, Vimeo 737, Dailymotion 399, all at `cost: 0`. Vimeo's config listed `de, es, en, fr` and English came back, so the preference is load-bearing rather than incidental.
- [x] 8.3 Confirm an unsupported host still falls through to Firecrawl rather than failing in the caption path.
- [x] 8.4 Confirm the failure path: a caption url the host refuses answers `200` with an empty body, which the empty-join check turns into a throw, which review catches to score the snippet.
- [x] 8.5 Drive the real `toYoutubeSourceId` over every form and fetch each resolved id's Atom feed, so a resolved id is proven readable rather than merely well-formed. `@veritasium`, `@3blue1brown`, and a `@kurzgesagt` url all resolve to feeds naming the right channel, the url forms give up their ids, and a fake handle and a bare name drop.
- [ ] 8.6 Run `bun run smoke:review` against a Topic with a video Source and read the fetch stage's output, confirming a video's Finding cites what the video says and `stage_costs.fetch` did not grow for it. Needs Doppler and a seeded Topic, so it is left for a real environment.
