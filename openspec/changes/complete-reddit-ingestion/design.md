## Context

`worker/ingest/reddit.ts` already exists from the early source work. It reads `config.subreddit` and an optional `config.sort`, fetches the OAuth listing when `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are both set, and otherwise fetches `https://www.reddit.com/r/<sub>/.rss` through the shared `fetchFeed`. `parsePosts` maps an OAuth listing to `read` Resources keyed by the comments permalink, deduped within the payload, carrying the selftext as the snippet and the score as `engagement`. So the subreddit half of the work is genuinely shipped, and this change is completion rather than a build.

What is missing against the RSS and YouTube bar:

- No search Sources. `config.query` is unread, and a Source without a subreddit throws.
- The keyless path returns a different payload than the OAuth path. Reddit's `.rss` carries neither the selftext nor the score, and `.rss` is the subreddit's default ordering, so `config.sort` silently does nothing there.
- Mode selection is an either/or on credentials, not a preference. When the OAuth call fails there is no fall-through, and when the keyless call fails from a blocked IP the Source just fails with a bare fetch error.
- A failed Source leaves nothing durable. `SourceOutcome`'s failed arm keeps only `sourceKind`, and `scans.fallback_sources` records successes that fell back. The reader sees a Scan that found less, with no line saying why.
- There is no default Source registry. `EditTopicModal.tsx` seeds a new Topic with the literal `[{ kind: "search", value: "" }]`, and the label, summary, and per-kind placeholder live as separate constants in `ui/src/lib/utils.ts` and `TopicSourceEditor.tsx`.

The constraint that shapes the access design is the decision log entry *Reddit access*: the keyless public RSS and JSON endpoints need no approval, but Reddit blocks datacenter IP ranges, so the mode that works from a laptop can return 403 from Northflank. Neither mode can be assumed, which is why both stay and why the outcome has to be visible. That entry is now partly out of date — Reddit refuses the keyless JSON endpoints from a laptop too, as the decision below records — but its conclusion holds all the more: what a deployment can reach is measured, not assumed.

## Goals / Non-Goals

**Goals:**

- Subreddit listing and in-subreddit search Reddit Sources emitting the same Resource shape the shipped ingesters emit, from either access mode.
- OAuth preferred where it is configured, the keyless endpoints as the fallback, and one request per Source per Scan on every path.
- A Source blocked in every mode that reads as blocked — in the Scan's durable trace and in the scan report — rather than as a quiet week.
- A default Source registry the ingestion side declares into, which Reddit is deliberately not in.
- A checked site-wide search seam for the subreddit-suggestion work happening on another branch.

**Non-Goals:**

- A per-user Reddit Integration. App-only client credentials cover reading public content, and no Source here needs a user's grant.
- Comment threads, user pages, multireddits, and any write path.
- Proving the deployed access mode inside `bun test`. That answer is environmental, so it belongs to a smoke run from the deployed environment.

## Decisions

### The keyless path is the public RSS feeds, because the `.json` endpoints are refused

This one was decided the other way first and reversed by measurement. The plan was to point the fallback at `https://www.reddit.com/r/<sub>/<sort>.json` and `search.json`, which return the same listing shape as `oauth.reddit.com`, so both modes could run through `parsePosts` and the fallback would carry the selftext snippet, the post score, and the configured sort.

Reddit does not serve them. Measured from a residential address, each request carrying the descriptive `User-Agent`:

| endpoint | answer |
|---|---|
| `www.reddit.com/r/programming/hot.json` | 403 |
| `www.reddit.com/search.json?q=…` | 403 |
| `www.reddit.com/r/programming/.rss` | 200, then 429 after a burst |
| `www.reddit.com/search.rss?q=…` | 429 under the same burst |

A 403 is a refusal, not a throttle, so the `.json` endpoints are closed to keyless callers — not merely to datacenter ranges, which was the decision log's expectation. The rss feeds are still served, and the 429s came from probing several times in a minute, far above the one request per Source per Scan a real Scan makes.

So the keyless mode reads `https://www.reddit.com/r/<sub>/.rss`, `search.rss?q=…`, and `/r/<sub>/search.rss?q=…&restrict_sr=1` through the shared `fetchFeed`, and OAuth keeps the json path through `parsePosts`. Two parsers, and the fallback loses the post score and the sort — the feed serves the subreddit's own default ordering. That loss is exactly what the trace records, so `fallbackMode` keeps its existing `reddit-rss` value rather than being renamed.

*Alternative — keep the `.json` fallback and let Reddit be OAuth-only.* Rejected: neither Doppler config carries `REDDIT_CLIENT_ID`, so every Reddit Source would fail until credentials exist, and a fallback that is always refused is not a fallback.

### Config decides the endpoint; the presence of credentials decides the order of attempts

The Source config selects what to fetch, resolved in one place:

| `config` | Fetches |
|---|---|
| `subreddit` | that subreddit's listing at `config.sort` (default `hot`) |
| `subreddit` + `query` | that query restricted to that subreddit |
| no `subreddit` | nothing — the Source fails |

Mode selection is then separate and mechanical: with both credentials set, try OAuth, and on failure try the rss feeds; with either credential missing, go straight to the feeds. Resources that came from the feeds report `fallbackMode: "reddit-rss"` whichever way they got there. When every attempted mode fails, the Source fails with a reason naming what it asked for and how each mode refused it, e.g. `reddit r/mcp/hot failed in every mode: oauth listing returned 403; rss feed … returned 403`.

Keeping "what to fetch" separate from "in what order to try" is what makes the whole thing testable offline: a pure `toRedditRequest(source)` returns the request as an intent, `toOauthUrl` and `toRssUrl` turn that intent into each mode's url, and `toRedditModes(hasCredentials)` returns the order. The tests assert all four without a network, and the only untested part is the `fetch` wrapper `tsc -b` covers.

### A Reddit Source requires its subreddit, so it is a custom source

A Source of every other kind names what it reads — a feed url, a channel id — and Reddit is no different: the subreddit is the Source. There is no sensible reading of a Reddit Source that names none, so a missing or malformed `subreddit` fails it rather than being defaulted to something arbitrary.

That is also what settles the registry question. A preselected Source is created with no config for the owner to have filled in, so a kind can only be preselected if its ingester runs against an empty config — which `search` does, deriving its queries from the Topic itself, and Reddit cannot. Reddit is therefore a custom source the owner adds by naming a subreddit, and the picker's "a kind is addable when it takes a config value" rule already places it there with no special case.

*Alternative — a configless Reddit Source that searches on the Topic's name, so it could be preselected.* Built first, then removed: it made every new Topic carry a Reddit search on a string that may name nothing searchable, and the keyless mode's 30-second gap made that speculative Source the slowest thing in a Scan. A Source the owner chose and pointed somewhere is worth those seconds; one they never asked for is not.

### The site-wide search form stays, though no Source produces it

`toOauthUrl` and `toRssUrl` still build the search url with no subreddit, and the tests still cover it. Nothing in the ingester reaches that branch now that a Source must name a subreddit — it is there because searching Reddit at large is how a subreddit relevant to a Topic gets found, which is the subreddit-suggestion work happening on another branch. Keeping the seam checked here means that branch calls something with tests behind it instead of rebuilding the url logic and the User-Agent and rate rules with it. Two `if` branches is a small carrying cost for that.

### The Scan's per-Source trace covers failures, so it is renamed `problem_sources`

`scans.fallback_sources` holds `{ sourceId, fallbackMode }[]` and, today, only successes. A Source that failed every mode has to land in a durable trace for a blocked Source to read as blocked after the fact — the scan report is model-written prose, which is a summary, not a record.

So the entry becomes a discriminated union and the column is renamed to something true of both arms:

```ts
{ sourceId: string; status: "fallback"; fallbackMode: string }
| { sourceId: string; status: "failed"; reason: string }
```

*Alternative — leave the column alone and let the report prose carry the failure.* Rejected: prose is not a trace, and a report call can itself fail while still leaving the Scan `succeeded`.

*Alternative — add failures under the `fallback_sources` name.* Rejected: a Source that failed every mode never fell back, so the name would describe only half of what the column holds.

*Alternative — take back the original `degraded_sources` name.* Rejected: migration 0028 renamed away from it, and renaming back would ping-pong the column between two names within one schema history. "Degraded" also fits neither arm plainly — a Source that failed outright did not degrade, it delivered nothing — while "problem" covers a failure and a downgrade alike.

Existing rows stay readable — an entry with a `fallbackMode` is the fallback arm — but they carry no `status` field, so `toScanSummary` writes the discriminant on every new entry and nothing reads the old rows structurally.

### The failure reason is generic, taken from the thrown error

`ingestFromSource` already catches per Source. It takes the caught error's message (capped, so a long body cannot bloat the row) onto both the `failed` outcome and the trace entry. Every ingester gets the behavior with no per-ingester wiring, and the Reddit ingester's job is only to throw a message worth reading — which is why it names each mode and status rather than rethrowing the last fetch error.

### The registry lives in `shared/`, because `ui` may not import `worker`

Module boundaries put ingesters in `worker/` and the source picker in `ui/`, so the shared facts — which kinds exist, how each is labeled, which take a config value, and which a new Topic starts with — go in `shared/sources.ts` keyed by source kind. The worker's `sourceIngesters` map stays in `worker/ingest/index.ts` beside the ingesters and is keyed by the same kinds, so an ingester "registers" by having its kind in the shared registry and its function in that map. The UI's `WEB_SOURCE`, `SOURCE_VALUE_PLACEHOLDER`, and `CUSTOM_SOURCE_KINDS` collapse into reads of the registry, which is what makes the preselected set one edit instead of four.

### The low request rate needs a queue, because a Scan fetches its Sources at once

One Source produces one listing request per Scan, plus one token request when the OAuth mode runs, and a failed OAuth attempt adds the one keyless retry. That is a low rate per Source — but `ingestFromTopicSources` runs a Topic's Sources through `Promise.all`, so two Reddit Sources fetch in the same instant, and Reddit refuses the second. The smoke showed exactly that: the subreddit Source was served and the search Source that followed it got a 429.

So every request the ingester makes is queued behind the one before it with a gap, and the gap is measured rather than guessed. Spacing the keyless feeds 30 seconds apart is served and 15 seconds apart is refused, so that mode waits 30 seconds. An authorized app has far more headroom, so the OAuth gap is one second — enough that a Scan's Sources do not arrive together, and no more. The queue advances whether a request succeeded or not, so a refusal still spaces out whatever follows.

At 30 seconds a Topic with several keyless Reddit Sources spends a few minutes in ingest, well inside the stage's 30-minute timeout. Buying that back is another reason to run OAuth. There is still no token cache: one Source makes one token request per Scan.

*Alternative — retry on a 429 with backoff.* Rejected: it doubles the requests to an endpoint that is refusing them, where spacing avoids the refusal in the first place.

The queue is per process, so two workers can still burst — marked with a `ponytail:` comment naming a shared limiter as the upgrade path.

### The live check is a smoke, not a test

`worker/reddit.smoke.ts` seeds a Topic with a Reddit Source, runs each mode explicitly, and prints which answered and which returned 403. Run from a laptop it reports the local answer; run against the deployed environment it settles the datacenter-IP question. It joins the existing `bun run smoke` chain as `smoke:reddit`.

## Risks / Trade-offs

- **Both modes blocked from Northflank** (no approved OAuth app, keyless refused) → the Source fails honestly, the trace and the report say so, and the other Sources still deliver. The smoke is what tells the owner this is the state, before a reader notices.
- **Reddit closes the rss feeds too, as it has already closed the `.json` endpoints** → the keyless mode fails and only OAuth carries the Source. No Doppler config holds `REDDIT_CLIENT_ID` today, so that day is the day every Reddit Source stops reporting anything, loudly. Registering a Reddit app is the standing mitigation, and it is also the only mode with real rate headroom: the keyless feeds answered 429 after a handful of requests in one minute.
- **A Topic gets no Reddit coverage until its owner names a subreddit** → accepted, and the reason the subreddit-suggestion work on another branch exists. The site-wide search seam kept here is what that work calls to propose subreddits from a Topic's context.
- **A Source naming a subreddit that has gone private or been banned fails every Scan** → it fails in isolation with Reddit's own status in the reason, and the scan report names it, so the owner can see which Source to fix rather than watching the Topic quietly thin out.
- **The column rename lands mid-flight** → migrations run as a one-shot deploy job before the new service rolls out, so no running instance reads the old name after the rename. A Scan in flight during the deploy is a Temporal workflow that resumes on the new code.

## Migration Plan

1. Rename the column in `db/schema.ts` and widen the entry type, then `bun run db:generate` and apply with `bun run db:migrate` (the same script the deploy job runs).
2. Land the worker, shared, and UI changes together — the renamed field is read in `worker/ingest/index.ts`, `worker/workflows/run-topic-scan-activities.ts`, and `worker/review/summarize.ts`.
3. Set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` in the deployed Doppler config so the deployed environment prefers OAuth.
4. Verify with `bunx biome check . && bunx tsc -b && bun test`, then run `bun run smoke:reddit` against the deployed environment and record which mode answered.

Rollback: revert the code and apply a reverse rename migration. Nothing outside the worker reads the column, so a revert loses only the newest Scans' traces.

## Open Questions

- Whether the deployed environment ends up on OAuth or on the keyless endpoints is exactly what the smoke answers; the code supports either, so nothing blocks on it.
