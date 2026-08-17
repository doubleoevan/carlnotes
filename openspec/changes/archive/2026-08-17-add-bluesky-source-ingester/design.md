## Context

`source-ingestion` ships the seam this lands on: `SourceIngester = (source: Source) => Promise<IngestResult>`, a `Partial<Record<kind, SourceIngester>>` registry in `worker/ingest/index.ts`, per-Source failure isolation, and a global upsert deduped on the canonical `resources.url`. Five ingesters already sit on it (`url`, `rss`, `reddit`, `youtube`, `search`).

Bluesky slots in beside `reddit` and `youtube`: a Source names a place that keeps producing, and the ingester reads it. Where it differs is what it finds. A subreddit post and a YouTube video *are* the artifact; a Bluesky post is usually a sentence wrapped around a link, and the link is the artifact. So this ingester's Resource is not the post — it is the page the post points at, which arrives already titled and described because Bluesky resolves link cards server-side and returns them in the feed.

The default Source set is the second half. `search` is treated as "the default source" in `EditTopicModal` (staged for a new Topic), `TopicSourceEditor` (the default/custom split and the `CUSTOM_SOURCE_KINDS` filter), `TopicSettingsCard` (the leading card line), and `WEB_SOURCE` in `ui/src/lib/utils.ts` (its copy) — four hardcodings of one idea. Naming the set is what lets `bluesky` land in the custom picker without a fifth hardcoding, since the picker is defined as "the editable kinds that are not default".

Constraints: Bun runtime; `worker` and `api` may import `db`, `ui` may not; tests are offline and structural, matching `reddit.test.ts` and `search.test.ts`.

## Goals / Non-Goals

**Goals:**
- A Bluesky Source follows one named account and collects the articles it links to.
- Reading an account costs no credential, so the Source works on any deployment.
- The default Source set is one named registry a kind joins, rather than a condition repeated per surface.
- Nothing in Bluesky support needs a credential, so there is no operator secret to configure or rotate.

**Non-Goals:**
- Emitting posts as Resources. A post without a link is a remark, not something to read later; the ingester skips it rather than filling the Feed with sentences.
- Topic-keyword post discovery. `searchPosts` needs the operator credential and returns the whole network's posts rather than a followed account's links — a different product shape, and the account-suggestion work is the better answer to "who should this Topic follow".
- Feed generators as a Source. A real second unit, deliberately deferred — see the risks.
- Per-user Bluesky Integrations, the firehose, reposts, quote posts, and a Bluesky-specific Resource kind.

## Decisions

**The Source addresses an account; the Resource is the article it linked to.**
`config.handle` names the account and is required — a Bluesky Source with no account named has nothing to read, so it throws and fails in isolation rather than fetching something arbitrary. `getAuthorFeed` returns each post with its link card already resolved as `app.bsky.embed.external#view`: `{ uri, title, description }`. That maps onto a Resource almost verbatim, which is why the ingester needs no model, no query generation, and no prompt. Over finding posts and letting curation follow the links: the link card is free and already fetched, where re-deriving it would mean fetching every post's link separately.

**The link's host decides the Resource kind, through the shared helper.**
An account linking to a YouTube video should produce a `watch` Resource keyed by that video's URL — the same key the `youtube` Source finds, so the two dedupe. `toResourceKind` already does this for search results, so it moves from `search.ts` to `normalize.ts`, beside `toCanonicalUrl` and `toFallbackTitle`, which is where "facts derived from a URL" already lives. Over `bluesky.ts` importing from `search.ts`: a Bluesky ingester reaching into the web-search ingester reads like a dependency that isn't there, the same reasoning that put the shared feed fetch in `feed.ts` rather than having YouTube import from `rss`.

**A post that links to nothing, or links back into Bluesky, is skipped.**
Skipping is the whole point of "collect what this account points at" — a remark with no link has no page to store, and a `bsky.app` link is a quote post or a profile, which would store a Bluesky page as though it were an article. Neither is a failure; the account simply contributed fewer Resources that scan.

**Reading needs no credential, and neither does suggesting.**
`getAuthorFeed` on `public.api.bsky.app` is public, so this ingester touches no credential and a deployment configured with none runs Bluesky Sources fine. Suggestion confirms a handle through that same call, asking for a single post, so no authenticated path is needed anywhere in Bluesky support.

**Bounded by construction, backoff as the guard.**
One `getAuthorFeed` call per Source per Scan, for `AUTHOR_FEED_LIMIT` posts, with Bluesky's declared points-per-hour ceiling recorded beside the caps it explains. That is the real defense; no counter or shared limiter is built for one call. The `429` backoff waits the interval the response itself names — `ratelimit-reset` as a unix timestamp, else `retry-after` as seconds, else a fixed default — capped at `MAX_BACKOFF_MS` so a hostile header cannot park a Scan, then retries once. `ponytail:` one retry, no shared limiter; add a process-wide limiter only if the logs show Scans colliding.

**`defaultSourceKinds` in `shared/enums.ts` is the registry, and Bluesky is not in it.**
`export const defaultSourceKinds = ["search"] as const` sits beside `editableSourceKinds`, where `db`, `api`, and `ui` all already read their enums. The custom picker is derived as "editable minus default", so a kind lands in the picker by not being in the set — which is exactly how `bluesky` gets there, with no per-kind condition anywhere. Per-kind display copy lives in `ui/src/lib/utils.ts`, since copy is a UI concern and the shared module has no business holding "let Carl crawl". A one-member registry still earns its place: it replaced four hardcodings, and it is the thing a future default kind joins.

**A handle, not a DID.**
`config.handle` stores what the owner typed, with a leading `@` stripped, and `getAuthorFeed?actor=` accepts it directly. A handle is a mutable domain name, so a renamed account breaks its Source — a single Source failing in isolation, fixed by re-typing the handle. Storing the immutable DID instead would need a resolve call and async validation in the editor for a failure this rare and this recoverable; recorded as deferred rather than built.

**Suggesting an account is verification, not invention.**
`worker/suggest.ts` already proposes Sources from a Topic's own words and then *fetches each one the way its ingester will* before the owner sees it. Bluesky has to join that loop rather than sit outside it, because adding `bluesky` to `editableSourceKinds` already puts it in the suggestion schema: left alone, a proposed handle would fall through to the page branch and be fetched as a url, and `toSourceKey` would key it as a feed host — so a Topic following `theverge.com`'s feed would read as already following its Bluesky account. Both are corrected explicitly. Verification asks `getAuthorFeed` for a single post, which is the ingester's own call at limit 1, and the appview refuses a handle that does not exist. That matters more here than for a feed url: a model can invent a plausible handle far more easily than a working feed, and the check costs one keyless request.

**Testing: the parser offline, plus the backoff arithmetic.** `parseLinks(posts): NewResource[]` is pure and driven by fixture posts shaped like real `getAuthorFeed` responses — an article, the same article again, a link nested under `media` (a post with its own image), a video link, a `bsky.app` link, and a post with no link — asserting the link-card title and description, the host-derived kind, the like count as engagement, the skips, and the dedupe. `toBackoffMs` is tested against each header form and the cap. The fetches are thin wrappers `tsc -b` covers; no test opens a socket.

## Risks / Trade-offs

- **A feed generator is arguably the better unit for a topic curator, and this ships accounts** → accepted deliberately. `getFeed` is keyless on the public appview (verified), and `getPopularFeedGenerators?query=…` finds topic-shaped feeds keylessly too, so "the Climate Science feed" maps onto a Topic more directly than any one person does. Accounts ship first because they parallel the existing `reddit` and `youtube` Sources and because the account-suggestion work already targets them. Feeds are the natural second Bluesky kind and need no credential at all.
- **A shortened link does not dedupe against the article it points at** → seen in the first live run, where one share went through `bit.ly`. Both would store as separate Resources. Unshortening would mean a HEAD request per link; deferred, and curation's own fetch follows the redirect when it admits one.
- **A renamed account silently breaks its Source** → one Source failing in isolation, visible in the Scan, fixed by re-typing the handle. The DID upgrade is recorded as deferred.
- **An earlier draft kept an operator App Password session for the suggestion work** → dropped. Suggestion confirms a handle through the same keyless AppView call the ingester uses, so the session had no caller and was removed rather than kept on speculation.
- **An account that mostly links to its own site turns a Topic into that site's feed** → true, and the same is already true of an RSS Source. Curation's relevance scoring is what keeps a Feed honest, and the owner chose the account.
- **An account's handle is usually its website's domain, so the two read as one thing** → deliberately keyed apart in the suggestion flow. Following The Verge's feed and following its Bluesky account collect different material: the feed carries what it publishes, the account carries what its staff think is worth pointing at, including other outlets' work.
- **A `source_kind` enum value cannot be dropped by a plain rollback** → adding an enum value is additive and inert until a Source uses it; rolling back the code leaves the value unused, which is harmless.

## Migration Plan

One additive enum value: `shared/enums.ts` gains `bluesky`, then `bun run db:generate` finds `ALTER TYPE "public"."source_kind" ADD VALUE 'bluesky'` and `bun run db:migrate` applies it — no backfill, no table change, every existing Source row untouched. Deploy is the migration plus the app code; no credential is required for the ingester to work, so there is no ordering constraint. Rollback is reverting the code; the enum value stays behind unused. Verification gate: `bunx biome check . && bunx tsc -b && bun test`, all offline.

## Open Questions

- `AUTHOR_FEED_LIMIT = 50` posts yielded 33 articles from a link-heavy account in the first live run. A quieter account will yield far fewer, and a daily Scan re-reads mostly the same window; whether that wants a `since`-style cutoff depends on how the Feed reads after a week of real scans.
- If a later change needs an authenticated Bluesky endpoint, such as `searchActors`, it adds the session then, against the endpoint it actually calls.
