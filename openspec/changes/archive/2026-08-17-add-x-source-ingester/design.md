## Context

Five ingesters exist today (`url`, `rss`, `reddit`, `youtube`, `search`), dispatched by `kind` from the registry in `worker/ingest/index.ts`. Four are free. Only `searchIngester` returns a non-zero cost, and that cost already charges into the Scan Budget's `ingestion` bucket — `ingestFromTopicSources` calls `charge(budget, "ingestion", summary.cost)` inside the ingest span, and `Scan.cost` is that Budget's total. The dependency this change was written against has therefore already landed; nothing about spend plumbing needs to be built here, only used honestly.

The default Source set is not a registry today. It is the string `"search"` written into `EditTopicModal` and a `WEB_SOURCE` constant in `ui/src/lib/utils.ts`. This change establishes the registry, so the seeding site and the editor's default group read one list instead of naming a kind inline.

The relevant constraint is money. TwitterAPI.io bills $0.15 per 1,000 tweets ($0.00015 each) with a $0.00015 per-request minimum, authenticates with a single `x-api-key` header, and returns up to 20 tweets per `advanced_search` response. The free plan's monthly spend backstop is $3.00 across 3 Topics and 5 Scans/day; a free user running three daily Topics reaches roughly 90 Scans a month, so about $0.033 of cost per Scan. That number, not the $0.50 `SCAN_BUDGET_USD` ceiling, is what a paid Source has to answer to.

## Goals / Non-Goals

**Goals:**
- One `xIngester` that reads a named handle's recent tweets as `read` Resources, keyless for the app.
- The real cost, in dollars, charged into the Scan Budget's `ingestion` bucket — never a false zero.
- A read bound that cannot be exceeded by construction, so a prolific account cannot spend unbounded before the Budget is next read.
- A retained, exported X search over a Topic's context, so a later feature can suggest handles rather than making the user know them.
- A shared default Source set, seeded and rendered from one place.
- A tweet found by web search and the same tweet read from X dedupe to one Resource.

**Non-Goals:**
- Per-user OAuth, Integration rows, or posting to X. The key is operator-level and read-only.
- The handle-suggestion feature itself. This change leaves the search path and its prompt ready for it; the UI and the ranking of candidate accounts belong to that change.
- An X Source that takes a list, or a free-text query instead of a handle. Handle only; the rest is additive if someone asks.
- Pagination. No cursor loop is written, which is also how the read bound stays structurally enforced.
- Replies, quote-tweet threads, or engagement backfill on re-scan beyond the single `likeCount` an ingest already sees.

## Decisions

### TwitterAPI.io over the official X API

The official X API has had no flat tier since February 2026: reading at this volume means a metered enterprise contract plus per-user OAuth, and OAuth alone would make X an opt-in Source that most Topics never turn on. TwitterAPI.io reads the same content at roughly 30x cheaper per read behind one `x-api-key` header. The trade is a third party between us and X — accepted, and mitigated by keeping every provider-specific name (`TWITTERAPI_IO_API_KEY`, the endpoint constant) confined to `worker/ingest/x.ts`, the way `EXA_*` is confined to `search.ts`, so swapping providers is one file.

### An X Source names a handle, and is custom rather than default

An `x` Source carries `config.handle` and reads that account, the way a `reddit` Source names a subreddit. Three things follow, and all three are why this beat the configless-and-default shape this design originally carried:

**Cost.** X stops riding on every new Topic. A Topic pays for X only if someone asked for it, which matters given the free-plan arithmetic below.

**Precision, and less code.** A handle needs no query generation, so ingest makes no model call and issues one request instead of several. `from:<handle>` is also a far sharper signal than X keyword search, which the first live run showed returning digest bots and link-only posts.

**The rate limit.** TwitterAPI.io's free tier allows one request every five seconds, shared across the deployment. A default-on X Source means every scheduled Scan in a morning sweep contends for that one slot. Opt-in shrinks the contention to the Topics that want X.

Rejected: the configless Source generating its own queries. It reads well until you notice a default Source cannot ask for a handle, so it has to *guess* what to search for — buying an LLM call per Scan to rediscover something the user could have just told us.

### Requiring a handle moves the problem to suggestion, where it already belongs

Requiring a handle means the user has to know which accounts to follow. `suggestSources` on main already answers that shape of question for every other kind — it reads the Topic's own words and proposes Sources — so `x` joins it rather than getting a mechanism of its own.

Verification is what makes a suggested handle safe, and it uses the provider's **account lookup**, not a tweet search. Reading tweets would mark a real account that posts monthly as unreadable; the lookup answers for any account that exists. Two details the live runs settled:

- The lookup returns **HTTP 200 for a missing account**, with the answer in the body (`status: "error"`, `data: null`). Checking `response.ok` would confirm every invented handle, so the body decides.
- A model-invented handle frequently lands on a **real but dormant** account — `@notarealacct99` is a genuine 2022 registration with zero posts. It confirms, then returns nothing on every Scan forever. The lookup already carries `statusesCount`, so refusing a never-posted account costs no extra call.

A refused lookup (429 or 5xx) keeps the suggestion rather than dropping it, matching how a throttled subreddit is treated — the provider declined to answer, which is not the same as denying the account. This matters on the free tier, whose limit is one request every five seconds.

### The context-driven X search was built, then deleted

An earlier revision generated X queries from a Topic's context and returned the accounts behind the matching tweets, on the expectation that handle suggestion would need it. It did not: `suggestSources` proposes accounts from the Topic's own words and the model's own knowledge, at no read cost, and the account lookup confirms them. Carrying a second, paid mechanism for the same job — with no caller — was dead weight, so it and its `search-x` prompt are gone.

It would only earn its keep as a *better* suggester for niche or fast-moving topics, where the model will not know who is currently talking. That is a real difference, paid for in reads, and it is a separate change if anyone wants it. Git history holds the implementation.

Ingest never called it either. An `x` Source already names its account, and making it generate queries would spend a model call and extra reads to rediscover what the config states.

### Two query filters live in code, not in a prompt

`-filter:retweets` and `since_time:<seven days ago>` are appended by the ingester. Both are cost decisions: a retweet duplicates a tweet the account's own timeline already returns, and an unbounded window spends reads on 2019. Neither should be able to drift with a prompt edit. Ingest runs as a Temporal **activity**, so reading the clock is fine here; it would not be inside workflow code.

### The read bound is structural, not a running counter

One request per Source, no cursor followed. At the provider's 20-per-response ceiling that is **at most 20 reads, about $0.003** per Source per Scan — measured at $0.00195 for a real 13-tweet read of `@OpenAI`. There is no loop that could exceed it, so nothing has to be trimmed or counted.

A running counter checked against the Budget was rejected: `SourceIngester` takes only a Source, and threading a Budget through would touch all five ingesters to solve a problem the request count already solves. The Budget is charged once after all Sources return, which is exactly why the bound has to be structural.

Requests run **sequentially**, not in parallel like `searchIngester`'s. The live run settled this: TwitterAPI.io's free tier allows one request every five seconds and answers a second concurrent request with `429 Too Many Requests`, so parallelism bought nothing but a discarded query. A rate-limited request pauses 5.5 seconds and is retried once, which clears that window with margin and costs a paid key nothing. Ingest is an activity with a 30-minute timeout, so waiting is free. This matters most for the search path, which issues several queries; a handle read issues one.

### The cost, and what the measurement said about the free plan

Measured on a real Topic ingesting once: **`search` charged $0.035** — the default web scout, on every Topic — against an `ingestion` bucket ceiling of $0.50. An `x` Source adds **$0.003** and only to Topics that asked for one.

Making X custom mostly removes the question this section originally had to answer, but the measurement surfaced something worth keeping: the free plan's $3.00 monthly backstop over ~90 Scans (3 Topics, daily) allows **$0.033 per Scan**, and the web search alone already charges $0.035 — before embedding, fetch, or scoring. A heavy free user reaches their monthly wall well before month end today, with no X involved at all. That is the free plan's own arithmetic, not this change's to answer, but it is now measured rather than assumed.

### The default Source set lives in `shared/enums.ts`

`defaultSourceKinds = ["search"]`. The UI cannot import the worker, so the worker's `sourceIngesters` map cannot be the registry the topic editor reads; `shared/` is the one module both sides already import for exactly this kind of canonical set. The editor seeds a new Topic from it and renders its default group from it, and `WEB_SOURCE` is replaced by per-kind display copy keyed on the same list. Adding the next default Source is then one array entry plus its copy. Rejected: runtime self-registration by each ingester, which buys nothing the array does not and cannot cross the module boundary.

The set holds one member again now that X is custom, which makes the registry look like flexibility nobody is using. It is kept anyway: the rendering it replaced was hardcoded to the web row specifically, and the criterion for membership is now written down — configless, and worth charging every Topic for — which is the part that was implicit before. Reverting it to re-add on the next default Source is churn.

### One canonical URL for a tweet

The ingester builds `https://x.com/<userName>/status/<id>` from the response fields rather than trusting the returned `url`, so the key is one shape regardless of what the provider echoes back. Two rules are added to `toCanonicalUrl`: `twitter.com` (and `www.`/`mobile.` forms) folds to `x.com`, and x.com paths fold case — a handle is case-insensitive and a status id is digits, so folding is safe on the whole path. Without both, a tweet Exa returns as `twitter.com/Sama/status/123` would store as a second Resource beside the one X returned.

### The rate limit is the operational constraint, not the price

The key in use is on the free tier: one request every five seconds, shared across the whole deployment. A handle read is one request, so a single Scan never feels it — but many Topics scanning at once share that one slot, and the handle-suggestion path issues several queries in a row. This, more than the per-read price, is what governs how much X the product can do, and it is a provider-plan decision rather than a code one. The retry keeps a rate-limited request from being silently discarded either way.

### Title and snippet

The snippet is the tweet's text, with X's `t.co` shorteners stripped out — a tweet that was only a link carries no snippet rather than a bare shortener. This matters more here than for other Sources because review never fetches a tweet, so the snippet is the only text scoring will ever see. The live run bore this out: 5 of the first 20 tweets were link-only.

A tweet has no title, and the existing derive-a-title rule would fall through to the URL's last path segment — a bare numeric status id — whenever a tweet opens lowercase or runs long. So the ingester sets the title itself to `@<userName> on X`: deterministic, never a number, and useful signal in the embedding, with the tweet's own words carried by the snippet.

`likeCount` maps to `engagement`, the same field the Reddit ingester fills with a post score, so trending sort works on X Resources with no extra call.

### Review skips the Firecrawl fetch for X Resources

`fetchResourceContent` returns the snippet directly for an `x.com` Resource. A tweet's text is its entire content, so a fetch adds nothing even when it works — and x.com blocks scraping, so today every surviving X Resource would buy a failing paid fetch before falling back to the snippet it already had. Four lines, and it removes a guaranteed waste rather than a speculative one.

### Cost is computed, not reported

TwitterAPI.io does not return a per-call cost the way Exa does, so the ingester computes `max(returnedTweets, 1) × $0.00015` per request and sums it. Like every other rate in `budget.ts`, this is a best-effort estimate for the ceiling and the breakdown; the provider's own dashboard is authoritative. The rate lives as a named constant beside the other rates.

## Risks / Trade-offs

- **The search path and its prompt have no in-repo caller** → Kept at the user's direction. Suggestion, which was expected to consume them, works from the Topic's own words instead. `smoke:x` exercises both halves so the unused export cannot rot unnoticed. If a search-based suggester is never built, this is the first thing to delete.
- **A suggested handle can be a near-miss that reads someone else's posts** → The lookup confirms an account exists and has posted, but cannot confirm it is the *right* one. The prompt warns against near-miss handles, and the user sees every suggestion before it is saved. A wrong-but-real account is the residual risk, and the reader will notice it in their Feed.
- **The suggestion prompt bumped to version 2 while the registry still serves version 1** → Observed live: the registry's v1 knows nothing about `x`, so suggestions returned no handles until the bundled template served. Production needs the promotion, or X will simply never be suggested.
- **A retried ingest re-spends on X** → Already true of Exa: each Temporal attempt builds its own Budget, so a retry pays again and the Scan records only the last attempt's cost. The activity's attempt cap bounds it. X inherits the existing behavior rather than adding a new hole.
- **Twenty tweets is thin for a prolific account** → Deliberate. One request keeps the bound structural, and a Topic that wants more adds more handles. Pagination is the upgrade path if a single account ever needs deeper history.
- **A third party sits between us and X, and can change its pricing, shape, or availability** → Every provider-specific name stays in `worker/ingest/x.ts`; a failing X Source degrades in isolation like any other, so the Scan still succeeds on what the other Sources found.
- **Tweets are prime prompt-injection bait** → The tweet text goes the same path as Reddit selftext and Exa highlights: fenced as untrusted data by `writePrompt` and screened by the content scanner. No new surface, but X is the surface most likely to be probed, which is a reason to verify the fencing holds for this snippet rather than assume it.

## Migration Plan

1. Additive `source_kind` enum value (`x`) via a generated Drizzle migration. No backfill, no existing row changes, and an older worker reading a newer enum is unaffected because no `x` Source exists until the UI ships.
2. **`suggest-sources` v2 has to reach production, or X is never suggested.** `--candidate` writes under the `candidate` label and changes nothing live; the runtime asks for `production`. The registry's v1 knows nothing about `x` and wins over the bundled template, so until v2 is promoted in Langfuse (or a label-less `prompts:sync` runs), suggestion silently returns no X accounts. Observed live, not assumed. The orphaned `search-x` candidate from an earlier sync can be deleted in Langfuse.
3. `TWITTERAPI_IO_API_KEY` set in Doppler before the UI change reaches users. Without it, X Sources fail in isolation and Scans still succeed on their other Sources — so the ordering is a quality concern, not an outage.
4. Rollback: remove `x` from `editableSourceKinds` — the custom picker stops offering it and no new X Source can be created. Stored Sources stay and simply cost nothing once the key is unset. Nothing has to be migrated back, because no Topic ever received an X Source it did not ask for.

## Open Questions

- Where should the handle-suggestion feature live, and should it use a **user-search** endpoint rather than searching tweets and collecting authors? The provider likely offers one, which would be cheaper and more accurate than reading twenty tweets to learn twenty handles. Worth confirming before that feature is built; nothing here forecloses either path.
- Should an X Source accept a list or a free-text query as well as a handle? Additive if asked for — another branch in the same ingester — and deliberately not built now.
