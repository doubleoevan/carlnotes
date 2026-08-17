## Context

Curation's fetch stage has one path. `fetchResourceContent` in `worker/review/score.ts` resolves a survivor's content by reuse, then revalidation, then `fetchViaFirecrawl`, which calls `fetchContent(url)` in `worker/scrape.ts`, charges `FIRECRAWL_COST_PER_FETCH`, writes the body to object storage, and records `content_key`, `content_bytes`, `etag`, `last_modified`, and `fetched_at` on the Resource. A failure anywhere in that path falls back to the Resource's native snippet.

A `watch` Resource goes through that same path today. Firecrawl's `onlyMainContent` extraction of a YouTube watch page yields player chrome and recommendation links rather than the video's words, so the Finding for a video is effectively scored on its description. YouTube publishes the words themselves as a caption track, reachable without a key and without a vendor.

`watch` covers more than YouTube: `toResourceKind` in `worker/ingest/search.ts` also maps Vimeo, Loom, TED, TikTok, Dailymotion, Rumble, Snapchat, and Giphy to `watch`. Only YouTube publishes a caption track the way this change reads one.

## Goals / Non-Goals

**Goals:**

- Score a video on what it says rather than on its description, for every host whose captions can be read without a key.
- Let a YouTube channel be suggested however it is actually named, rather than only by an id no one recalls.
- Keep the storage, reuse, screening, scoring, and accounting downstream of the fetch identical for both paths, so the transcript is just another way to fill `content`.
- Degrade to today's behavior — content unset, score the snippet — whenever a transcript cannot be had.

**Non-Goals:**

- Transcribing audio. A video without a published caption track is not sent to a speech model.
- Hosts whose captions need an API token, an OAuth grant, or a page scrape. They keep the Firecrawl path, as does every `listen` host.
- A new Source kind, a new schema column, a new dependency, or a new environment variable.
- Speaker labels, timestamps, or chapter structure. The transcript is joined into plain prose.

## Decisions

### The branch lives in `fetchContent`, keyed on kind and url

`fetchContent` takes the Resource's kind alongside its url and picks the path itself. Everything after the fetch — the charge, the object-storage write, the row update, the scanner, the scoring, the snippet fallback — stays one shared block in `score.ts`.

The condition is `kind === "watch"` **and** the url parses to a YouTube video id. Kind alone would send Vimeo and TikTok down a path that cannot serve them, and would produce a failed fetch where a Firecrawl scrape works fine today.

*Alternative considered:* branching in `score.ts` and calling a separate `fetchTranscript`. Rejected — `score.ts` would then have to know the YouTube rule twice, once to pick the fetcher and once to pick the rate to charge, and the two could drift.

### `FetchResult` carries its own cost

`FetchResult` gains a `cost` field: the dollars that fetch spent. Firecrawl returns `FIRECRAWL_COST_PER_FETCH`; the transcript path returns `0`. `score.ts` charges `charge(budget, "fetch", result.cost)` instead of a hard-coded constant.

This is what keeps transcript spend inside the existing `fetch` entry of `stage_costs` without giving the caller a second copy of the branch. The transcript goes straight to YouTube and spends no vendor credit, so a Scan made entirely of videos leaves `stage_costs.fetch` at zero — honestly, rather than by charging a made-up rate.

The outcome is still `fetched`. Scoring is paid whatever filled the content, so a transcribed video must count against `MAX_SCORED_RESOURCES_PER_SCAN` like every other scored Resource.

### The track list comes from the player endpoint, asked for as a mobile client

Two requests, both bounded by the existing `FETCH_TIMEOUT_MS`:

1. POST the video id to `https://www.youtube.com/youtubei/v1/player` with a client context. No key and no auth. The response carries `captions.playerCaptionsTracklistRenderer.captionTracks` — one entry per published track, each with a `baseUrl` and a `languageCode`.
2. GET the chosen `baseUrl` with `fmt=json3` and join the caption lines. `json3` returns JSON, which avoids parsing YouTube's caption XML.

**The client matters, and this was measured rather than assumed.** Scraping the watch page's embedded `ytInitialPlayerResponse` — the obvious first approach, and what this design originally called for — does yield a well-formed track list, but every `baseUrl` it hands out serves **HTTP 200 with a zero-byte body**. YouTube gates those urls behind a proof-of-origin token that only its own JavaScript can mint. Asking the player endpoint as `IOS` returns urls that serve the real transcript; asking as `WEB` returns `playabilityStatus: UNPLAYABLE` with no tracks at all. `ANDROID` also works but hands back a url that already carries `fmt=srv3`, so the format is *set* on the query rather than appended, and either client would serve JSON.

Taking the list from the player endpoint is also the smaller implementation: it is JSON in and JSON out, which deletes the HTML scraping, the escaped-url handling, and the bracket-balanced slice the watch-page approach needed.

**Track order is not preference order.** The endpoint returns tracks sorted by language code — `ar, bn, zh, zh-CN, …` — so English sits in the middle of thirty-odd entries. Taking the first track would score an Arabic transcript against an English topic context. The `languageCode.startsWith("en")` preference is load-bearing, not a nicety.

No caption track, a malformed payload, or an empty join all throw — the same signal a failed Firecrawl scrape gives, caught by the same handler, falling back to the same snippet.

*Alternative considered:* `youtubei.js`. It is maintained and handles exactly this client emulation, but it is a large dependency for two `fetch` calls, and it does not remove the underlying gating risk — it just moves the pinned client version into someone else's release cycle. *Also considered:* a paid transcript vendor, which would be more robust against gating but adds a key, a rate, and a vendor to a change whose whole point is that the words are already free.

### A suggested channel is resolved before it is deduped, not during verification

Source suggestions already handled YouTube as a Source kind. What was missing is that only one spelling of a channel survived. Measured against the Atom feed the verifier uses:

| What the model returns | Before |
| --- | --- |
| `UCHnyfMqiRRG1u-2MsSQLbXA` | 200 Veritasium |
| `PLZHQObOWTQ…` | 200 Essence of linear algebra |
| `@veritasium` | 404, dropped |
| `youtube.com/@veritasium` | 404, dropped |
| `youtube.com/channel/UCHnyf…` | 404, dropped |
| `youtube.com/playlist?list=PL…` | 404, dropped |
| `Veritasium` | 404, dropped |

The two url rows are the waste worth fixing: each carries a valid id and was discarded for the wrapper around it. The handle rows are the quality fix — a handle is what a channel is known by, where a raw id is twenty-four characters no one recalls under pressure.

One expectation this corrected: recalled ids **do** work. All four famous channels tested resolved correctly, so the existing path was never broken — only brittle in exactly the place a niche topic needs it.

**Resolution runs before the duplicate filter, not inside verification.** A stored Source's identity is its id, so a channel proposed by handle would be compared as a handle against an id and offered as new when the Topic already follows it. Running it first also means the value returned to the editor is the one the ingester stores, which matters because the editor saves that value into the Source config verbatim.

### The canonical link is the only place a channel page names itself

Resolving a handle means asking the channel page which channel it is. The obvious read — the first `"channelId"` in the page — is **wrong**, and wrong silently:

| Handle | First `channelId` in page | Actual channel |
| --- | --- | --- |
| `@veritasium` | `UCin0m13qWv3-051xlWlHamA` | `UCHnyfMqiRRG1u-2MsSQLbXA` |
| `@3blue1brown` | `UC1_uAIS3r8Vu6JjXWvastJg` | `UCYO_jab_esuFRV4b17AJtAw` |
| `@kurzgesagt` | `UCq8ZAAsI89IoJ-fn1gYpO3g` | `UCsXVk37bltHxD1rDPwtNM8Q` |

Every one is a real, fetchable channel — just not the one asked for. It would have passed verification and subscribed topics to the wrong channel with nothing to show for it. The page mentions other channels throughout; only `<link rel="canonical">` names its own, and `<meta property="og:url">` agrees with it. The code reads the canonical link and says why.

### Caption lines join on a space, not directly

A caption event is one displayed line, and its `segs` are the words within that line. Segments inside a line carry their own trailing spaces, but a line does not end with one. Joining every segment in the video directly produces `"appreciate howcrazy it is"` — the last word of each line fused to the first word of the next. Across a two-hour talk that is thousands of corrupted tokens feeding the embedding and the score. Segments therefore join within a line, and lines join on a space.

### Three hosts, measured rather than assumed

The hosts were picked by probing, not by reading feature lists. What the probes found:

| Host | Track list | Track format | Verdict |
| --- | --- | --- | --- |
| YouTube | player endpoint, mobile client | json3 | Works. 18,430 chars on a real talk |
| Vimeo | player config, no key | WEBVTT | Works. Config listed `de, es, en, fr`; English was returned |
| Dailymotion | player metadata, no key | SRT | Works. 3 of 30 documentary videos publish `en-auto` |
| TED | none — transcript is page HTML | — | Different mechanism, would be a url rewrite plus Firecrawl |
| Loom, TikTok, Rumble | not established | — | Left alone rather than guessed at |
| Snapchat, Giphy | no spoken content to caption | — | Not applicable |

Two things this table hides that matter. **Dailymotion coverage is thin** — most videos publish nothing, so the common case there is still the snippet fallback; the value is that the ones which do publish are now readable. **Vimeo coverage is unmeasured** — one video is confirmed, and Vimeo's whole product is creator-controlled privacy, so embed-restricted videos will answer `403`. That is a normal failed fetch, not a defect, but it means the hit rate is unknown rather than high.

The rule this sets for later: a host earns a caption path on evidence its captions can be read without a key, not on the fact that it has a caption feature.

### The dispatch is a table because there are three of them

`fetchContent` walks a list of `{toVideoId, fetchTranscript}` pairs and takes the first whose id parser matches, falling through to Firecrawl. With one host an inline branch was right; at three, the list stops the function growing an arm per host.

Each host maps its own payload — YouTube nests tracks two renderers deep, Vimeo names the language `lang`, Dailymotion keys a map by language — into one `CaptionTrack` of a language code and a url. That is what lets one English-preference rule and one guard serve all three instead of three near-copies.

WEBVTT and SRT differ only in their header and their timestamp punctuation, so one filter reads both: drop blank lines, the `WEBVTT` header, `NOTE` blocks, lines holding `-->`, and lines that are digits alone. YouTube's json3 keeps its own parser, since it is structured rather than cue-based.

### The caption url is checked before it is fetched

A track url comes out of a remote payload, so it is untrusted input naming a fetch target. It is fetched only when it is `https` and within the host's own caption domain.

The check is a **domain** check rather than the exact-endpoint prefix the YouTube-only version used, because these hosts do not serve captions from one fixed path: Vimeo uses `captions.vimeo.com`, and Dailymotion uses numbered cdn shards like `static2.dmcdn.net`. A prefix match would have to enumerate shards. The property that actually matters — the fetch cannot be pointed at a host of the payload's choosing — is what the domain check gives. `toFetchableUrl`'s private-host refusal does not cover this: a public host that is not the vendor's would pass it.

### `FetchResult.markdown` becomes `FetchResult.text`

A transcript is not markdown. The field, the single destructure in `score.ts`, and `toFetchedContentFields`'s parameter are renamed so the name stays true of both paths. `fetchViaFirecrawl` becomes `fetchAndStoreContent` for the same reason — it is no longer Firecrawl-only — and its failure log stops naming Firecrawl.

## Risks / Trade-offs

- **The pinned client version ages out, or YouTube extends its proof-of-origin gating to the mobile clients too** → This is the real risk, and it is the same class of failure that already killed the watch-page approach. The fetch throws and the Resource scores on its snippet, exactly as it does today. The failure reports to Sentry under the existing `fetch` tag with the Resource id and url, so a rising rate is visible rather than silent. The fix, when it comes, is a one-line client-version bump — and if that stops working, the vendor option is still on the table with the accounting seam already built for it.
- **The player payload's shape is undocumented and can change** → Same degradation: today's behavior, not a broken Scan. The track pick and the line join are covered by fixture tests, so a shape change shows up as a failing test rather than as quietly worse Findings.
- **A gated caption url returns 200 with an empty body rather than an error status** → An `ok` response is not proof of a transcript, so emptiness is checked after the join rather than trusted from the status. This is exactly how the watch-page approach failed, and it failed silently until the body length was looked at.
- **Two requests per video instead of one** → Both are free and bounded by the existing timeout, against one billed Firecrawl scrape today. Videos already run under `REVIEW_CONCURRENCY` with everything else.
- **A long video's transcript is far larger than a page's markdown** — a two-hour talk runs to a hundred kilobytes or more, all of it written to object storage and counted in `content_bytes` → Scoring is unaffected, because `MAX_SCORE_CHARS` already caps what reaches a model at 8000 characters. Storage grows; no cap is added for it. If transcript volume becomes the driver of storage cost, that is a follow-up with a real number behind it.
- **Auto-generated captions are unpunctuated and misspell proper nouns** → Accepted. A rough transcript still says vastly more than a description, and the embed-filter already gated the video on relevance before any of this runs.
- **A transcript is untrusted text and could carry a prompt injection** → Already handled, and handled unchanged: the branch sits inside the fetch, so the transcript reaches `screenText(content, "page")` on the same line the markdown does, before any model reads it.
- **Handle resolution depends on the channel page's canonical link, which is undocumented markup** → A page that stops carrying it resolves to nothing, so the suggestion is dropped rather than being wrong — the same outcome the model already gets for a channel it invented. Silently resolving to a *different* channel is the failure that would matter, and reading only the canonical link is what rules it out.
- **A stale video always refetches rather than revalidating** → The caption fetch exposes no usable `etag` or `last_modified`, so both stay null and the conditional-GET path never engages for a video. Costs nothing, because the refetch is free.
