## Context

The app has no audio today: no speech call, no ffmpeg, no player, and no presigned URL. Every stored object is streamed
through the api. The wireframes for this change are in `docs/design/podcast/` (`Main`, `Playing`, `Mobile`,
`MobilePlaying`). One prompt fragment, `podcast-episode-hosts.md`, describes both hosts in full, and both script prompts
splice it.

What the change builds on:

- **Plans.** `shared/plans.ts` holds `MONTHLY_PRICE_CENTS` (`plus: 1500`, `premium: 2900`), a ten-times rule for yearly,
  and `monthlyBudgetCents` (`300`, `1000`, `2000`). The plans page, the homepage's structured data, and the signup key
  budget read it. Checkout does not. It charges the Stripe Price that `STRIPE_PRICE_<PLAN>_<INTERVAL>` names, and those
  Prices are created by hand in Stripe.
- **Spend.** The app records its own estimate of each Scan's and each chat turn's cost (`scans.cost`,
  `chat_turns.cost`). `monthlySpendDollars` in `api/authorization.ts` sums the two for the UTC month, and
  `isMonthlySpendExhausted` compares the sum with the user's budget. LiteLLM meters the authoritative spend on the
  user's virtual key and rejects calls past `max_budget`. The scheduled sweep checks the daily scan quota, the daily
  Topic limit, and whether the owner's key budget is spent.
- **Gate.** `isAllowed(userId, capability, topic)` in `api/authorization.ts` decides every capability. No capability
  depends on the plan as a feature today, and the repo has no feature flags.
- **Scans.** `runTopicScanWorkflow` starts the Scan's email as an abandoned child workflow on its own task queue, behind
  a `patched` marker. A Scan bills its recorded owner: the Topic's owner for a scheduled Scan, and the acting user for a
  manual one.
- **Findings.** A Scan closes by filtering the Topic to its `max_results` best Findings, and the row of a Finding that
  is filtered out is deleted. `findings.rating` is one value per Finding. On an invite Topic a subscriber sees only
  Findings from Scans started after their activation.
- **Pages and feeds.** Public pages render on the server through TanStack Start. A public Topic has an RSS feed at
  `/topics/:id/feed.xml`. `api/edgeCache.ts` sets the edge headers for rendered pages. The default content security
  policy limits images and frames only, so audio from the object storage host is allowed.
- **Time zones.** Nothing stores one. A Topic's scheduled time is display only.
- **Evals.** `evals/` holds the relevance and scanner harness. promptfoo is not installed.

Gemini facts, read on 2026-10-01:

- `gemini-3.8-flash-tts` is generally available. One `generateContent` request renders up to two speakers with prebuilt
  voices. Each turn is its own part with `speech_metadata.speaker` and an optional short `speech_metadata.style`, and
  the text is a verbatim transcript with inline tags in angle brackets such as `<laugh>` and `<short pause>`. Alnilam
  ("Firm") and Laomedeia ("Upbeat") are valid voices.
- A request takes up to 8,192 input tokens and returns up to 16,384 output tokens. Audio is 25 tokens a second, so one
  request holds about 10.9 minutes. The response is a 24 kHz, 16-bit, mono WAV.
- Standard pricing is $0.50 per million text input tokens and $9 per million audio output tokens through December 31,
  2026, and Flex is half of that. Both double on January 1, 2027. A 30-minute podcast episode is 45,000 audio tokens:
  about $0.20 on Flex and $0.41 on standard today.
- A request selects Flex with `"service_tier": "flex"` at the top level of the body. Flex is synchronous, returns 429 or
  503 if capacity runs out, and Google recommends timeouts of ten minutes or more.
- This account's limits for the model are 1,000 requests a minute, 100,000 input tokens a minute, and 10,000 requests a
  day.

LiteLLM facts for the pinned `v1.94.0`, read from its source in the local container:

- `/v1/audio/speech` supports the model with one voice only. It cannot send `multiSpeakerVoiceConfig` or per-part
  `speech_metadata`.
- The Gemini pass-through route, `/gemini/v1beta/models/<model>:generateContent`, forwards the body unchanged, takes the
  virtual key in `x-goog-api-key`, swaps in the real key, and records the call's cost against the virtual key.
- The pass-through prices a call with `completion_cost` for `gemini/<model>` from LiteLLM's own price table. That table
  already has this model: $0.50 and $9 per million tokens on the standard tier, and `input_cost_per_token_flex` and
  `output_cost_per_token_flex` at half of each.
- It reads the tier from Google's `x-gemini-service-tier` response header and applies the Flex price to the text input.
  It charges audio output tokens from `output_cost_per_audio_token`, which has no Flex price, so a Flex call's audio is
  charged at the standard rate. In the speech smoke, a Flex clip that Google served on Flex was charged $0.0033 where
  the Flex rate is $0.0017. LiteLLM's main branch and its 1.103.2 release, the newest on 2026-10-01, price it the
  same way.
- A model entry in `litellm-config.yaml` cannot change the pass-through's price. The router registers an entry's custom
  prices under that entry's own id and strips them from the shared `gemini/<model>` key, which is the key the
  pass-through reads.
- The proxy loads the price table from LiteLLM's hosted file when it starts, and falls back to the copy in the image.

## Goals / Non-Goals

**Goals:**

- Plan prices and budgets that pay for podcast episodes at the 2027 speech rates.
- One podcast episode per succeeded Scan if there is something to say, rendered without ever delaying or changing the
  Scan.
- Every dollar of speech spend posts to the user's virtual key, and the app's own monthly spend sum includes it.
- A player, feeds, and public pages that work for a listener in the app, in a podcast app, and for a crawler.
- A self-hosted instance with no Google key turns podcast episodes off with one setting and runs as it does today.

**Non-Goals:**

- Listing shows in the Apple Podcasts or Spotify directories.
- Other formats, such as a brief or a debate.
- Custom-designed voices.
- Moving existing Stripe subscribers to the new Prices. The app is before launch and has no paying subscribers, so the
  new Prices apply to new checkouts and no migration step is built.
- A time zone per user. Seasons use UTC.
- A VTT or SRT transcript. The transcript is HTML, and Apple Podcasts makes its own.
- Changing how Findings are filtered. A narrated Finding can still be filtered out later.

## Decisions

### Names: Podcast Episode in code, podcast for the Topic's setting and its feed

Code and schema already use `podcast` for a Source kind, an input that the app reads. The new entity is **Podcast
Episode**: one rendered audio episode of a Topic. Tables and routes say episode (`episodes`, `episode_chapters`,
`episode_listens`, `/api/episodes/`), and types, functions, and the workflow say podcast episode (`podcastEpisodes`,
`PodcastEpisodeScript`, `renderPodcastEpisodeWorkflow`). Apart from those identifiers, the word podcast names the
Topic's setting (`topics.is_podcast_enabled`, matching `is_email_enabled`), the RSS podcast feed (`podcast.xml`), and
UI copy. UI copy calls the feature "Coffee Break podcast". The hosts' names live only in the prompt markdown and UI
copy. The script schema names its speakers `host` and `cohost`.

### Prices change in config and in Stripe

`MONTHLY_PRICE_CENTS` becomes `plus: 2000` and `premium: 4000`, so yearly is $200 and $400 through `YEARLY_MONTHS`.
`monthlyBudgetCents` becomes `1500` and `3500`. The plans page derives its prices and its monthly scan estimate from the
config, so the estimate becomes about 150 and 350 scans a month. The docs table, its screenshots, and the price comments
are updated by hand.

Checkout reads Stripe, so four new Prices are created (plus and premium, monthly and yearly) and the `STRIPE_PRICE_*`
values in Doppler point at them. A user's key takes the new budget when `replaceUserLiteLLMKey` next runs for them: at
the monthly reset, a plan change, or a budget override.

Alternative considered: resizing every key at deploy. The monthly reset already replaces every key, and a mid-month
resize would reset each key's metered spend to zero.

### Speech goes through LiteLLM's Gemini pass-through

Each chapter is one `generateContent` request to
`<LITELLM_BASE_URL>/gemini/v1beta/models/<speech model>:generateContent`, sent with `fetch` and the user's virtual key
in `x-goog-api-key`. The body names both speakers' voices, one part per turn, `responseModalities: ["AUDIO"]`, and
`"service_tier": "flex"` for a scheduled Scan. The app never calls Google directly and never holds `GEMINI_API_KEY`.

`litellm-config.yaml` gains no model entry for speech. The pass-through names Google's model id in its URL and routes
through no alias, so an alias and its price would be lines that nothing reads. The file gains one comment that says
speech goes through the pass-through, that the proxy prices it from LiteLLM's own table, and that Google's rates double
on January 1, 2027.

The speech prices live in LiteLLM's price table and in `worker/budget.ts`:

- **LiteLLM's price table** is what the proxy charges the virtual key. The proxy loads LiteLLM's hosted table when it
  starts, so after LiteLLM publishes the 2027 rates a restart of the LiteLLM service picks them up.
- **`worker/budget.ts`** holds the app's own rates, which feed the Podcast Episode's recorded cost and the monthly spend
  sum. A price change is an edit to that one file.

The smoke script ties the two together. It renders a short two-speaker clip on each tier through the local proxy, reads
the test key's spend from `/key/info` before and after, and asserts that each difference matches the response's token
counts at the rates in `worker/budget.ts`.

The app reads the model id from `PODCAST_SPEECH_MODEL`, which defaults to `gemini-3.8-flash-tts`. If it is set empty,
podcast episodes are off.

Alternatives considered:

- `/v1/audio/speech` through a priced alias. It sends one voice, and two single-voice requests per chapter lose the
  natural turn-taking that a two-speaker request gives.
- Replacing LiteLLM's price table from the config, through `litellm_settings.model_cost` or a cost map url. Either
  replaces the whole table for every model, to set two numbers that already match.
- Calling Google directly with the key in the app. The spend would miss the user's virtual key, and a second service
  would hold the key.

### A Flex call is recorded at what the proxy charges, not at what Google bills

Scheduled Podcast Episodes render on Flex, because Google bills a Flex call at half price. The proxy charges the key the
Flex rate for the text input and the standard rate for the audio output, which is nearly all of a call's cost. The app's
estimate follows the proxy. `worker/budget.ts` counts a Flex call's input at half and its audio in full, so the Podcast
Episode's recorded cost, the monthly spend sum, the 80 percent pause, and the account meter all agree with the key's
metered spend, and the key's budget never runs out before the meter says it will.

The cost of this choice is that a user's budget is charged about twice what a scheduled Podcast Episode costs us. The
fix is one constant, `FLEX_AUDIO_RATE_MULTIPLIER`, set to 0.5 once LiteLLM prices Flex audio output.

Alternatives considered:

- Recording the real Flex rate while the proxy charges the standard rate. The key's budget, which is the hard stop for
  Scans and chat, would fill faster than the account meter shows.
- A startup hook that edits LiteLLM's price table. It would fix the metering, and it is a patch to a dependency's
  internals that the owner chose not to build.
- The standard tier for every render. The metering would be right, and the real speech cost would double.

### The app records its own estimate of podcast episode cost

LiteLLM meters the authoritative spend. The app also records an estimate on the Podcast Episode, the way a Scan does:
the speech response's `usageMetadata` token counts at rates in `worker/budget.ts`, plus the script calls' tokens at the
`score-model` rate. `speechCost` in that file prices a call at the doubled rates from January 1, 2027 UTC, so the
estimate does not go stale on the day the price changes.

The monthly spend sum moves from `api/authorization.ts` to `db/quotas.ts`, since the worker may not import the api, and
it gains a third part: `episodes.cost` for the month, by the billed user. Every reader of monthly spend gets it: the
chat gate, the topic page's `isSpendExhausted`, the account meter, and the podcast episode budget check. The account
meter shows episode spend as its own segment.

### A podcast episode bills the user that its Scan billed

The Podcast Episode's `owner_id` is its Scan's `owner_id`: the Topic's owner for a scheduled or first Scan, and the
acting user for a manual one. The speech and script calls use that user's virtual key, and every budget and plan check
reads that user.

### The podcast episode is its own workflow, started after the Scan completes

`runTopicScanWorkflow` starts `renderPodcastEpisodeWorkflow` after `finishScan`, right after the email start, if the
Scan's saved status is `succeeded`. The child has the id `episode-<scanId>`, runs on the `episode-renders` task queue,
and uses `ParentClosePolicy.ABANDON`, behind `patched("episode-render-workflow")`. A stopped or failed Scan starts none.
A child that already exists is left alone, and any other start failure is reported, never passed to `failScan`.

The child is started whether or not a speech model is configured, because workflow code cannot read configuration. On an
instance with none, its first activity returns nothing to render and the workflow ends.

The queue has its own Worker in `worker/temporal.ts` with `maxConcurrentActivityTaskExecutions` from
`PODCAST_RENDER_CONCURRENCY`, read the way `SCAN_CONCURRENCY` is, with a default of 16 per worker replica. A burst of
renders after the scheduled sweep waits in the Temporal queue and never takes a scan slot. Sixteen chapters at once on
each of a few replicas is far inside the account's 1,000 requests a minute, and a chapter's input is a few hundred
tokens against 100,000 a minute. The limit that is reached first is 10,000 requests a day, about 650 full-length
podcast episodes.

The activities, in order:

1. `planPodcastEpisode` decides whether to render and picks the Findings. It returns nothing to render if episodes are
   off, the Scan did not succeed, the Topic is gone or its podcast is off, the gate says no, the budget check says
   pause, or nothing is left to narrate. Otherwise it creates the `episodes` row with status `rendering`. The row is
   unique by `scan_id`, so a retry finds it.
2. `outlinePodcastEpisode` makes the first script call and saves the title and the description on the row, before any
   audio renders. The workflow then tells the Scan's email workflow that the outline is settled. See "The digest waits
   for the outline and names the podcast episode".
3. `writePodcastEpisodeSegment` runs once per segment.
4. `savePodcastEpisodeScript` builds the whole script from the segments, checks that a chapter is left, and saves it on
   the row.
   Workflow code cannot import the script module, so this is an activity, and every later activity reads the script from
   the row instead of from a workflow payload.
5. `renderPodcastEpisodeChapter` runs once per chapter, in parallel.
6. `encodePodcastEpisode` joins and encodes the audio.
7. `publishPodcastEpisode` assigns the season and number and makes the Podcast Episode visible.
8. `failPodcastEpisode` records a failure reason and what was spent, for a workflow whose activity failed for good.

Alternatives considered:

- Rendering inside the Scan's workflow. The Topic's workflow id would stay taken for the whole render, so the next Scan
  would be rejected as running, and a Flex wait of hours would hold a scan slot.
- Starting the render from the sweep. A manual Scan never passes through the sweep.

### Findings: the Scan's new ones first, then the best not yet narrated, then repeats

`planPodcastEpisode` reads the Scan's own Findings by score, then the Topic's other Findings by score, and moves any
whose Resource a published Podcast Episode of this Topic already narrated to the end, so a repeat only fills out an
episode. It stops at 15 Findings. If every Finding is a repeat, no episode is made and no row is written.

A chapter stores `resource_id` beside `finding_id`. A Finding that is filtered out and found again later gets a new row,
and the Resource id is what marks it as narrated. `finding_id` is set null if the Finding is filtered out,
and the chapter keeps its own title and its source url.

### The script: one outline, then one call per segment

Both calls use `score-model` on the billed user's key, with prompts in `worker/prompts/` (`outline-podcast-episode.md`,
`write-podcast-episode-segment.md`). Both prompts splice one prompt fragment, `podcast-episode-hosts.md`, which
describes the two hosts once, tells them that they host Coffee Break, the carlnotes.com podcast, and gives them Carl's
backstory from the homepage hero for an occasional line, with each episode kept on the topic. The hosts call the
person each episode is for the topic follower, never the reader. The segment
prompt has the hosts call each other by name now and then, once or twice in a
segment at most. The untrusted inputs are each Finding's title, summary, relevance explanation, source host, and stored
content, and the Topic's name and prompt. The writer never gets `buildTopicScanContext`'s text, which merges the prompt
with every attachment's distilled context. An attachment is its owner's alone, and a Podcast Episode reaches every
subscriber and, on a public Topic, the open web. A Topic has no description column, so its name and its prompt are what
describe it. `writePrompt` fences every untrusted input in its per-call nonce delimiters, as it does for every prompt.

Each chapter is built on the summary and the relevance explanation. They decide what the chapter says and why it
matters. The stored content supplies the specifics, such as names, numbers, and quotes. The prompts say so, and they
tell the writer to take a specific only from that Finding's content.

The writer paraphrases. It may quote a source three times per Finding, each in one short sentence, and names the source
if it does. The prompt states the rule, the segment check rejects a chapter with more than three quotations or with
a quotation over 30 words, and a promptfoo case tests it. A segment's last draft is kept without a chapter that
still quotes too much, so one chapter does not fail the Podcast Episode. A quotation is text of six words or more inside
double quotation marks, so a quoted title or a single word in quotes is not counted.

The content is the Resource's stored text, read with `readResourceText` in `worker/chat/retrieve.ts`, the function that
the chat's retrieval uses. It is the object under the Resource's `contentKey`, or its snippet if none was stored.
Nothing is fetched from the web at render time. Each Finding's content is limited to about 1,500 words, cut at a word
boundary. The outline call gets the content too, since how much a Finding has to say decides its chapter's length.
Fifteen Findings at the limit are about 30,000 tokens of input, which is a few cents on `score-model`.

- The outline call returns the podcast episode title, the description, the segments in order, each segment's Findings,
  and a length for each chapter between one and eight minutes, aiming for close to 30 minutes in all.
- Each segment call gets the outline and its own Findings, and returns the turns: a transition into the segment, one
  chapter per Finding with the Finding's id, and, for the first and last segments, the cold open and the sign-off.
- A prompt lists its Findings under numbers from 1, and a result cites a Finding by that number. The code maps each
  number back to the Finding's id before the checks run. A model miscopies a 36-character id often enough to fail a
  Podcast Episode, and it copies a short number without a mistake.
- A turn is `{ speaker: "host" | "cohost", text, style? }`. The text is speech as Gemini's guide defines it: plain
  words, fillers like "well" and "I mean", short replies like "Right.", and inline tags in angle brackets. The style is
  a few words at most.

`score-model` always reasons before it writes, and at its default effort a short outline takes over a minute, past the
model timeout. Both calls ask for low reasoning effort, which keeps an outline to seconds.

The writer's sign-off closes on what the episode added up to, and the code adds the same goodbye after it: Carl has
more reading to do, Vienna says he always does, Carl calls it another great coffee break, Vienna asks whether it was as
good for him as it was for her, Carl says not in front of the Raccoon, and Vienna says see you next coffee break. The
code owns the goodbye because the joke depends on who says each line, and a writer left to word it once shifted every
line to the other host.

Zod checks every result's shape. A first or second draft is rejected, and the call retried, if a chapter cites a Finding
id outside the input set or writes one twice, a segment misses one of its Findings, the outline plans more than thirty
minutes, a chapter quotes more than the rule allows, the title is over 60 characters, the description is over 155, or
the cold open or the sign-off is missing. A third draft is repaired instead. Its long texts are cut, a chapter that
cannot be kept is left out, a plan over thirty minutes is kept, and a missing cold open or sign-off is accepted, so a
missed limit never fails a Podcast Episode. The retry happens inside the activity, and its prompt says why the last
draft was rejected, with the word counts that the check measured. A model that is retried with the same prompt tends to
write the same draft again. A Podcast Episode fails only if no draft matches the schema, no chapter is left after the
repair, a script call finds the budget spent, no chapter's speech renders, or the encoder fails, and the workflow does
not retry a rejection. A chapter whose speech fails for good is left out with the turns that render with it, and the
saved script is trimmed to match before publish. Each segment prompt also gives every chapter a planned length in
words, at 125 words a planned minute. The planned length is a goal, and a written chapter or script that runs past it is
kept, since a chapter a little long is better than a failed Podcast Episode.

The promptfoo cases measure first drafts, with no retry, and run through promptfoo's `evaluate` function from a Bun
script, since its CLI does not start under Bun.

Alternative considered: one call for the whole script. A 30-minute script is about 4,500 words, which strains the output
limit and drifts in tone by the end.

### One request per chapter, and the chapters cover the whole podcast episode

Each chapter renders as one two-speaker request, with the host on `PODCAST_HOST_VOICE` (default `Alnilam`) and the
co-host on `PODCAST_COHOST_VOICE` (default `Laomedeia`). The cold open is rendered with the first chapter, each
transition with the chapter it leads into, and the sign-off with the last chapter. So the chapters' times cover the
podcast episode with no gaps, and chapter one starts at 0:00, as the wireframe shows. A chapter planned at up to eight
minutes, with the cold open, a transition, or the sign-off, stays inside one request's roughly eleven minutes.

A scheduled Scan's chapters use Flex. A manual or first Scan's chapters use the standard tier, since a person is
waiting. Each chapter is its own activity with its own retries:

- A 429 or a 5xx is retried with backoff: 30 seconds, doubling up to 15 minutes. A Flex chapter may retry for up to six
  hours and never moves to the standard tier. A standard chapter gets five attempts.
- A 4xx other than 429, and a budget rejection from LiteLLM, are not retried.
- A chapter whose speech fails for good, a spent budget included, is left out, and the Podcast Episode fails only if no
  chapter renders.
- One attempt may take up to twelve minutes on Flex and three on standard.

Each chapter's WAV is written to object storage under `episodes/<podcastEpisodeId>/chapters/<position>.wav`, because
`temporal-worker` runs as several replicas and the encode activity may run on another one. No audio travels in a
Temporal payload, and no activity reads a local file that another activity wrote. The activity returns the chapter's
position, the object's key, the WAV's byte size, and the attempt count, and it adds the call's cost to the Podcast
Episode's row. `publishPodcastEpisode` deletes the chapter objects, which a retried `encodePodcastEpisode` reads again,
and `failPodcastEpisode` deletes the chapter objects that a failed render left.

### ffmpeg joins, normalizes, and encodes on temp files

`encodePodcastEpisode` downloads the chapter WAVs to a temp directory, runs ffmpeg's concat demuxer over them with
`loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true`, and encodes `libmp3lame` at 64 kbps, mono, 44.1 kHz. A 30-minute podcast
episode is about 14 MB. Nothing holds the audio in memory. The MP3 goes to `episodes/<podcastEpisodeId>/audio.mp3`, and
the temp directory is deleted. The chapter WAVs stay for a retried join until the publish deletes them.

Chapter times come from the WAV sizes. At 24 kHz, 16-bit, mono, a second is 48,000 bytes after the 44-byte header. No
probe is needed. The Podcast Episode stores the MP3's byte size, which a feed's enclosure needs.

ffmpeg is installed in the Dockerfile's runtime stage, in the same `apt-get` line as `ca-certificates`, since `app` and
`temporal-worker` share the image.

### Schema

- `episodes`: `id`, `topic_id` (set null on delete), `owner_id` (cascade), `scan_id` (unique, set null on delete),
  `status` (`rendering`, `published`, `failed`, `removed`), `error`, `title`, `description`, `season`, `number`
  (`episodeNumber` in code), `audio_key`, `audio_byte_size`, `duration_seconds`, `model`, `cost`, `script` (jsonb),
  `published_at`, and timestamps. Unique on `(topic_id, season, number)`.
- `episode_chapters`: `episode_id` (cascade), `position`, `finding_id` (set null), `resource_id`, `title`, `source_url`,
  `start_seconds`, `end_seconds`. Unique on `(episode_id, position)`. Written at publish only, so a failed render
  narrates nothing.
- `episode_listens`: `episode_id` (cascade), `user_id` (cascade), `play_count`, `progress_seconds`, `completed_at`, and
  timestamps. Unique on `(episode_id, user_id)`.
- `episode_feed_tokens`: `topic_id` (cascade), `user_id` (cascade), `token` (unique), `created_at`. Unique on
  `(topic_id, user_id)`.
- `topics.is_podcast_enabled` (default true).

Deleting a Topic deletes its podcast episodes' audio objects in `deleteTopic`, before the row goes, and leaves the
`episodes` rows with a null `topic_id`, the way `scans` rows keep their spend history. Closing an account runs
`deleteTopic` for each owned Topic and then cascades the user's remaining `episodes` rows, as it does their Scans.

### Removing a Podcast Episode keeps its row

The gate gets an `podcastEpisode:remove` capability, granted to the Topic's owner and an admin. `DELETE /api/episodes/:id`
deletes the audio object, the chapter rows, and the listen rows, clears the script and the audio fields, and sets the
status to `removed`. Then it deletes the Topic's cached feeds, so the item leaves every feed, and the podcast episode
page responds as missing because every read filters on `published`.

The row stays so that its number is never reused and its cost still counts. The next number in a season is one more than
the Topic's highest, counted over published and removed rows, so a removed Podcast Episode's number is never reused. And
the row's cost still counts in the monthly spend sum. With its chapters gone, the Findings that a removed Podcast
Episode narrated count as not narrated.

The one Podcast Episode of a Topic on the free plan counts a removed Podcast Episode too. Otherwise removing and
scanning again would render a Podcast Episode at no charge every time.

Alternative considered: deleting the row and keeping a per-season counter on the Topic. It adds a column and a second
place that numbering lives, and it loses the spend.

### Seasons and numbers are assigned at publish

`publishPodcastEpisode` runs one transaction. The season is the UTC calendar year of the publish time, the number is one
more than the Topic's highest number in that season, and the status becomes `published`. A failed or skipped render
never took a number, so only a removed Podcast Episode leaves a gap. The unique index on `(topic_id, season, number)`
makes two publishes at once safe, since the second retries with the next number.

Seasons use UTC because nothing stores a time zone, and the budget month is already the UTC month. A time zone would
decide only which year a podcast episode published near midnight on December 31 belongs to.

### The gate and the budget stop a render before it spends

`planPodcastEpisode` runs them in this order, and each one ends the workflow with no row:

- **The gate.** `canRenderPodcastEpisode` in `db/quotas.ts` is the rule that the gate's `podcastEpisode:render` capability
  returns. The worker calls it directly, since the worker may not import the api. It reads the Topic owner's plan, the
  way a daily frequency reads the owner who funds its Scans. It is true for a paid plan and for an owner who is an
  admin. For a free plan it is true only while that Topic has no rendering, published, or removed Podcast Episode, so
  each Topic on the free plan renders its first Podcast Episode and no more, and a Scan that succeeds while the first
  Podcast Episode renders gets none. A failed Podcast Episode does not count. Once a Topic on the free plan has used its
  Podcast Episode, its podcast switch shows the upgrade link.
- **The budget.** If the billed user's monthly spend is at or past 80 percent of their budget, podcast episodes pause
  until the next month and Scans keep running. `isPodcastEpisodeBudgetShareExhausted` in `db/quotas.ts` reads the same sum
  that every other check reads. The 80 percent check lives in `planPodcastEpisode`, so a manual Scan gets it too.

### Podcast Episodes are off only if the speech model is set empty

If `PODCAST_SPEECH_MODEL` is set empty, the podcast episode workflow ends at its first activity with nothing rendered,
the api returns no episode data, and the ui shows no player, card, switch, or Subscribe button. This is how a
self-hosted instance runs without a Google key. `podcastEpisodeSpeechModel` in `shared/podcastEpisodes.ts` reads the
value, and the api and the worker both call it. If the value is unset, `podcastEpisodeSpeechModel` returns
`gemini-3.8-flash-tts`, so a deploy needs no setting to turn episodes on.

No feature flag holds podcast episodes back for admins first. The app is before launch, so podcast episodes are on for
every user as soon as the change deploys.

### Audio is served by redirect to a presigned URL

`worker/store.ts` gains a presign function over `Bun.S3Client`'s `presign`. Two routes return the audio:

- `GET /api/episodes/:id/audio.mp3` for the player and for a public Topic's feed. It checks `topic:view` for the
  session, or that the Topic is public.
- `GET /api/podcast-feeds/:token/episodes/:id/audio.mp3` for a per-listener feed. It records the download as that
  listener's play, so autoplay skips a Podcast Episode that the listener already has in a podcast app.

A GET responds with a 302 to a presigned URL that lasts one hour, with `Cache-Control: private, no-store`. Object
storage serves the range requests. A HEAD responds with 200 and the stored `Content-Length`, `Content-Type: audio/mpeg`,
and `Accept-Ranges: bytes`, with no redirect, because a presigned GET URL rejects HEAD and podcast apps probe with it.
If a presigned URL expires during a long pause, the player loads the stable URL again and seeks to the saved position.

Alternative considered: streaming the bytes through the api with range support, as chat video attachments do. Every
listener's download would pass through the app's process.

### The player lives in the app shell

One `<audio>` element is mounted in `Layout`, beside the chat panel, with its state in a `ui/src/stores/` module. The
topic page's player card, the podcast player, and a podcast episode page's player are views of that one store, so playback
continues across navigation and autoplay can move to another Topic's episode.

- The player card sits under the topic title and above the findings section. It shows the latest Podcast Episode's
  season, number, title, date, and length, a seek bar split at the chapter times, the first three chapters as a list
  with a control for the rest, a playback rate button, and the Subscribe button.
- The Media Session API gets the podcast episode title, the current chapter as the track title, the artwork, and next
  and previous handlers that skip chapters.
- A chapter's thumbs call the existing rating route for its Finding, so they write the same value that the finding
  row's thumbs write. A chapter whose Finding was filtered out shows no thumbs.
- Findings narrated in the latest Podcast Episode show an episode and chapter pill, and the one being played is
  highlighted.
- Progress is saved at most every 30 seconds, and on pause and page hide, as one upsert on `episode_listens`. The route
  counts a play when playback starts.
- When a Podcast Episode ends, the player asks the api for the listener's next unplayed Podcast Episode: the latest
  published Podcast Episode of each other Topic they own or subscribe to that has no listen row of theirs, newest first.
- On a phone the card is compact. Once a Podcast Episode is loaded, a podcast player docks at the bottom with the Podcast
  Episode's cover in its square slot, and the chat pill moves up above it. The podcast player stays docked while the
  Podcast Episode is loaded, on a phone and on a wide screen, whether or not the player card is in view. Playback
  continues on pages that have no player card, and a listener there needs a way to pause.
- The player's details line and every description say the two voices are AI voices.

The episodes card sits in the right column directly above the scan history card. It lists Podcast Episodes newest first,
with a tab per season that has Podcast Episodes, the newest season selected unless the url names another, and a season's
Podcast Episodes five to a page with page numbers under the card. The page numbers are `Pagination` in
`ui/src/components/common/Pagination.tsx`, the row that the homepage's sections use, which renders a link on the
homepage and a button on this card. The scan history card shows its Scans five to a page with the same row. The whole
newest season arrives with the topic page, so the page that the server renders links every Podcast Episode of the
season. With JavaScript the rows of the other pages are hidden, and a browser without JavaScript shows them all. The
cost is about two kilobytes of page for each Podcast Episode, so a season in the hundreds is the point to page the list
on the server. A season's tab is a link that puts the season in the topic page's query, so a crawler and a browser with
no script reach an older season. `loadTopicRoute` reads that season on the server, and the page's canonical url stays
the topic page's own. In the browser a tab changes the query in place and the card requests the season, with the loading
animation until it arrives. A row's button plays or pauses its Podcast Episode, the same playback that the player
controls. Each scan history row shows a pill with the number of the Podcast Episode that its Scan rendered, and the pill
plays or pauses that Podcast Episode.

### The podcast switch is a Topic setting, saved by the shared settings tool

The switch is one more field of `updateTopicFieldsPayload`, `isPodcastEnabled`, beside the frequency and the visibility.
`updateTopicFields` in `api/tool/topicTools.ts` is the one place it is saved, so the chat and the MCP server get it with
no flow of their own. The chat proposes it on the same card, the user confirms, and the same toast reports the save. The
podcast switch at the bottom of the edit topic modal saves through the same function, and the settings card's
last row shows whether it is on, beside the month's cost.

- Turning it off is always allowed for anyone who may edit the Topic.
- Turning it on asks the gate. On a Topic on the free plan that already has its one Podcast Episode, the tool writes
  nothing and returns a plan rejection, the same kind of result that the daily limit returns, and each adapter says so
  in its own words.
- The docs page on editing a Topic in chat lists it among the settings Carl can change.

### Feeds are documents, cached in Redis

Both feeds are RSS 2.0 with the iTunes and Podcasting 2.0 namespaces, built in `api/share/` beside the existing feed
builder and served from `api/documents.ts`:

- **Public:** `/topics/:id/podcast.xml`, for a public Topic with at least one published Podcast Episode.
- **Per listener:** `/podcast-feeds/<token>.xml`, for a private or invite Topic. It includes
  `<itunes:block>Yes</itunes:block>` and an `X-Robots-Tag: noindex` header.

The channel has the Topic's name with "Coffee Break podcast with Carl and Vienna", the Topic's prompt as its
description, both hosts as `podcast:person`, artwork, `itunes:category` "News", language `en`, `itunes:explicit` false,
and a `podcast:guid`. Each item has the title, description, `itunes:season`, `itunes:episode`, `itunes:duration`,
`pubDate`, a `guid` that is the Podcast Episode id, an `enclosure` with the stable audio URL and the byte size,
`podcast:chapters` pointing at a JSON chapters file whose chapters link their Finding's source, and `podcast:transcript`
pointing at an HTML transcript built from the stored script. The channel description, every item description, and the
transcript say the two voices are AI voices, as Apple's guideline 1.11 requires.

Covers are drawn by the preview cards' satori and resvg pipeline over `docs/design/podcast/cover-base.png`, a 3000 by
3000 illustration with an empty band across its top 18 percent and empty table across its bottom 25 percent. The top
band reads "Coffee Break podcast", centered across and down the band, in Architects Daughter, with "Coffee Break" in
`#f09050` and "podcast" in `#f3e9db`. The show cover's bottom band has the Topic's name in Architects Daughter,
`#332a22`, left-aligned, and an episode cover's bottom band has the Podcast Episode's title the same way. A title steps
down in size by its length, wraps, and stops at three lines with an ellipsis, inside a 10 percent safe margin at the
sides and a 5 percent margin at the bottom, which puts the title below the newspaper on the table.

A cover is 3000 by 3000, RGB, and under 512 KB, which Apple's cover limit requires. resvg writes a PNG, which is larger
than that, so ffmpeg encodes the PNG as a JPEG at the best quality that fits, and scales it down for the 600 pixel
size. ffmpeg is already in the image for the audio. A cover is cached in object storage under its key, like the preview
cards. The show cover is the channel's `itunes:image`, and each item's `itunes:image` is its Podcast Episode's cover. A
public Topic's covers get the preview cards' edge headers.

A cover's url is `/api/podcast-covers/<kind>/<id>/<key>-<size>.jpg`, with a size of 3000 for feeds and 600 for email.
The key is an HMAC of the cover's kind, id, and title under the app's auth secret, so nobody can compute it without the
secret, and a new title is a new url. The route recomputes the key and serves the cover with no session, since a podcast
app and an email client load images without one. This is what lets a private Topic's digest show its cover.

The podcast episode cover is also the digest section's image at 600 pixels, the player's Media Session artwork, the
podcast player's square icon on a phone, and the image beside an episode page's title. The topic page's player shows no
cover, as in its wireframe.

An episode page's Open Graph image is its own card, since a link preview is 1200 by 630 and crops a square cover.
`api/share/podcastEpisodeImage.ts` draws it with the preview cards' frame: the Podcast Episode's 600 pixel cover on the
left, and its title, its Topic's name, and its season, number, and length on the right. It is stored and versioned like
the other cards, and `/api/episodes/:id/preview.png` serves it for a public Topic's published Podcast Episode only.

A token is a random value in `episode_feed_tokens`, one per listener and Topic, created the first time the listener
opens the podcast feed dialog. A request with a token passes only if the row exists and the user can still see the
Topic. Unsubscribing, a deleted invite, and a deleted subscription delete the row. A listener can reset their token,
which replaces the row. Podcast apps fetch feeds from their own servers, so the token alone has to authorize the
request.

Caching:

- The rendered feed is cached in Redis for each Topic and listener, with its ETag and its `Last-Modified`, which is the
  time that its ETag last changed.
  `publishPodcastEpisode` and a removal delete the Topic's public feed and each listener's feed. The access paths above
  delete the listener's feed and the token's cached check. A 15-minute expiry is the backstop, and a token's check is
  cached for one minute. A feed that lists more than 100 Podcast Episodes is built for each request and never stored.
- A request with a matching `If-None-Match` or `If-Modified-Since` gets a 304.
- The public feed sets its edge headers through `api/edgeCache.ts`. A per-listener feed and both audio routes send
  `private, no-store`.
- `shared/reportedPath.ts` replaces a feed token in a path with `:token`, and the request tracing names the feed route
  `/podcast-feeds/:tokenFile`.

### The podcast feed dialog opens the listener's podcast app

The Subscribe button opens the podcast feed dialog. On an Apple device it shows a `podcast://` link built from the feed
URL with its `https://` removed. On Android it shows a `pcast://` link. Every device gets "Copy feed link", with a line
naming apps that take a pasted feed: Apple Podcasts, Overcast, Pocket Casts, Castro, and AntennaPod. Spotify is not
offered, since it takes no private feed.

Apple does not document `podcast://`. The one report says the app opens the feed as `http://`, so the feed route has to
respond to an `http` request with a redirect to `https`, which the edge already does. The link is tested on a device
before it ships, and "Copy feed link" is the fallback.

### Public podcast episode pages

Each published Podcast Episode of a public Topic gets a page at `/topics/<id>/<slug>/episodes/<season>/<number>`, a file
route beside the topic route with its own loader and head data from the api. The page has the title as its heading, the
description as its meta description, and the player. A collapsible table lists the chapters with each one's play button,
start, length, and Finding, and a row opens the Finding's note. The transcript is text, whole in the server's html and
collapsed behind "read more" once JavaScript runs. The head has `PodcastEpisode` structured data, `og:audio` tags, and a
canonical url. A private or invite Topic's episode url opens the page in the browser for a signed-in user who may listen
to the Podcast Episode, and responds as missing to everyone else.

The public topic page gains `PodcastSeries` structured data with `webFeed`, and links the podcast feed as an alternate.
Podcast Episode pages join the sitemap with the publish time as `lastmod`, for Topics that are public and shown.
`publishPodcastEpisode` tells IndexNow about a public Topic's new page.

### A subscriber of an invite Topic gets podcast episodes published after they joined

The invite rule opens Findings from Scans started after a subscriber's activation. On an invite Topic, the player, the
episodes card, the per-listener feed, and autoplay follow that rule and include only Podcast Episodes published after
the listener's activation. The owner and team roles get every Podcast Episode.

What a Podcast Episode narrates has no special case for an invite Topic. A Podcast Episode may narrate anything that the
Topic's feed shows its members, so a later Podcast Episode may fill in with an older Finding.

### The digest waits for the outline and names the podcast episode

The digest names the Scan's own Podcast Episode, so it has to wait until that Podcast Episode has a title. The title
comes from the outline call, which runs before any audio renders and takes seconds, not the minutes or hours a Flex
render can take.

- The Scan's workflow starts the email workflow first and the podcast episode workflow second. It passes the email
  workflow `isPodcastEpisodeReadyToRender`, which says that an episode workflow follows.
- With that flag, `sendScanEmailWorkflow` waits for `podcastEpisodeOutlineSettledSignal` before it plans the digest. The
  flag is new input, so an email workflow started before the change never waits, and the wait needs no `patched` marker
  of its own. If the podcast episode workflow cannot be started, the Scan's workflow sends the signal itself.
- `renderPodcastEpisodeWorkflow` sends that signal to `scan-email-<scanId>` as soon as the outcome is known: after
  `outlinePodcastEpisode` saved the title, after `planPodcastEpisode` returned nothing to render, or after the plan or
  the outline failed for good. A signal that finds no email workflow is ignored.
- The email workflow waits at most ten minutes. If no signal arrives, the digest is sent without the section, so a lost
  signal never holds a digest back.
- The signal has no data. Each digest batch reads the Scan's Podcast Episode when it renders, the way it reads the Scan
  and the Topic. If the Scan has a Podcast Episode with a title that has not failed, the email shows a section headed
  "Coffee Break podcast with Carl and Vienna", then "Today's episode: <title>" as a link. Otherwise the email is sent
  without the section.
- The link opens that Podcast Episode by its id: the topic page with `?episode=<podcastEpisodeId>`. A season and number
  do not exist until the Podcast Episode publishes, so the id is the only stable address at send time.
- A manual or first Scan's report waits the same way and shows the same section, so whoever ran the Scan sees its
  podcast episode in the email.

The player handles a Podcast Episode opened by id in any state. For a `rendering` Podcast Episode it shows the title and
says Carl and Vienna are recording, checks the Podcast Episode every few seconds, and shows it ready to play once it
publishes. The player never starts a Podcast Episode that no press started. For a `failed` Podcast Episode it says the
podcast failed to record, and on the topic page it offers the scan button to a user who may start a Scan.

Alternatives considered:

- Running the outline inside the Scan's workflow before it starts the email. The Topic's workflow id would stay taken
  for the outline's retries, and a manual Scan would wait on a step it does not need.
- Linking the topic page's player with no title. It needs no wait, but the digest could not name the podcast episode.
- Polling the database from the email activity. A Scan that renders nothing writes no row, so the activity could not
  tell "none" from "not yet".

## Risks / Trade-offs

- [At the 2027 rates a full-length daily podcast episode puts about $24 a month on the user's budget, since the proxy
  charges a Flex call's audio at the standard rate, so one daily Topic could exceed plus's $15 budget] → This is
  accepted. A daily Scan usually finds a few new Findings, so most daily episodes run short. If a heavy user passes 80
  percent, episodes pause and Scans keep running, which is the intent.
- [The proxy charges from LiteLLM's price table, which has no 2027 rates yet] → The app's own rates double by date, so
  the monthly spend sum and the 80 percent pause stay right. The proxy's metering follows once LiteLLM publishes the new
  rates and the LiteLLM service restarts. Running the speech smoke in January shows whether the two agree.
- [The proxy charges a Flex call's audio at the standard rate, so a user's budget is charged about twice a scheduled
  Podcast Episode's real cost] → The app's estimate follows the proxy, so the meter and the key agree. See Open
  Questions for the deadline.
- [The digest waits on a model call] → The outline runs on `score-model`, not on Flex, and usually takes seconds.
  The wait ends after ten minutes at most, and the digest then goes out without the section.
- [A reader opens the digest's link before the audio exists] → The player shows the title and the recording state and
  shows the Podcast Episode ready to play once it publishes. If the render fails, the player says so.
- [Flex capacity runs out and a scheduled podcast episode waits hours] → That is accepted. The chapter retries for up to
  six hours and is then left out. The Podcast Episode fails and is reported only if no chapter renders. The Scan and
  its email are unaffected.
- [A burst passes the account's 10,000 speech requests a day] → A 429 retries with backoff, and a Flex chapter may wait
  for hours. Render concurrency is one setting.
- [An owner on the free plan deletes a Topic and makes it again for another first podcast episode] → The Topic limit,
  the monthly budget, and the 80 percent pause bound what that can cost.
- [A model writes the script from attacker-reachable page content] → The content was screened when it was ingested,
  every input is fenced, the output is schema-checked, a chapter may cite only an input Finding, the model takes no
  action, and the transcript renders as text.
- [A feed token in a URL can be shared] → The listener can reset it, it stops working when access is lost, and the feed
  and its audio are never indexed or stored at the edge.
- [A Topic's Podcast Episodes keep rendering if nobody plays them] → The budget pause bounds the cost, and the owner's
  switch turns the Topic's podcast off.
- [Podcast Episodes are on by default for every Topic from the first deploy, which raises an owner's spend] → The
  owner's switch is one tap, the budget pause stops episodes at 80 percent, and the docs page explains that rule.
- [The rollout leaves open podcast episode workflows with no worker if the change is reverted] → They render nothing and
  can be terminated in the Temporal UI. Their Scans are already complete.

## Migration Plan

1. Create the four new Prices in Stripe and set the `STRIPE_PRICE_*` values in Doppler for prd. No subscriber is moved,
   since none exists.
2. Add `GEMINI_API_KEY` to the LiteLLM service in Northflank. Run the speech smoke against the production proxy's config
   locally first, so the spend check has passed before any user's Scan renders.
3. Merge and push. The release runs the migration, deploys the app, and deploys the worker with the `episode-renders`
   Worker. The LiteLLM service redeploys with the new config through its path rule.
4. Podcast Episodes are now on for everyone, since `PODCAST_SPEECH_MODEL` defaults to `gemini-3.8-flash-tts`.
5. Run a manual Scan and check the Podcast Episode, the player, the feed in a podcast app, and the spend on the key.
6. Once no Scan started before the deploy is still open, a later change replaces the `patched` marker with
   `deprecatePatch`.

Rollback: set `PODCAST_SPEECH_MODEL` empty. No episode renders and the UI disappears. The tables and the audio stay.
The price change rolls back by pointing `STRIPE_PRICE_*` at the old Prices and reverting `shared/plans.ts`.

## Open Questions

- **Flex audio metering, to fix before January 1, 2027.** Google serves speech on Flex and bills it at half price, and
  LiteLLM charges the key the standard rate for the audio. The app records what the proxy charges for now. On January 1,
  2027 the standard rates double, so a scheduled Podcast Episode would then put four times its 2026 Flex cost on a
  user's budget. Before that date, either a LiteLLM release that prices Flex audio output is pinned, the smoke is
  rerun, and `FLEX_AUDIO_RATE_MULTIPLIER` becomes 0.5, or the owner picks another fix. Releases 1.82.7 and 1.82.8
  are never pinned.
- **The `podcast://` link.** Its behavior with an `https` feed is tested on a device before the dialog ships.
