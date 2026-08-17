## Why

Plenty of what a Topic wants to read is surfaced first by a handful of accounts on Bluesky — a publication, a researcher, a beat reporter — and the AT Protocol serves any named account's posts over plain HTTP with no credential at all. What those accounts post is mostly a link plus a sentence about it, and the link is the thing worth reading. So a Bluesky Source is a way to follow a publisher and collect what they point at.

This change also settles a question every ingester has re-answered by hand: which Sources a brand new Topic starts with. Today `search` is hardcoded as "the default source" in three UI files. This change turns that into one registry a Source kind opts into, and Bluesky is deliberately *not* in it — a Bluesky Source names an account, so it is added by hand like an RSS feed or a subreddit.

## What Changes

- Add **`bluesky`** to `sourceKinds` and `editableSourceKinds` (a `source_kind` enum migration), so a Bluesky Source can exist and be added from the topic editor's custom picker.
- Add **`blueskyIngester`** (`worker/ingest/bluesky.ts`): reads the account named in `config.handle` through `app.bsky.feed.getAuthorFeed` on `public.api.bsky.app` with no credentials, and finds one Resource per **article a post links to** — the link card's URL, title, and description, with the kind read off the link's host and the sharing post's like count as `engagement`. Posts linking to nothing, and links back into Bluesky, are skipped. A Source naming no account fails in isolation.
- **Respect Bluesky's rate limit**: one call per Source, with the caps and Bluesky's declared points-per-hour ceiling as top-of-file constants, and a `429` retried once after the interval the response's own `ratelimit-reset` / `retry-after` header names, capped.
- Need **no credential at all**. Reading an account and suggesting one both go through the public AppView, so Bluesky support adds no operator secret and no Integration.
- Move **`toResourceKind`** from `worker/ingest/search.ts` to `worker/ingest/normalize.ts`, beside the other URL normalization every ingester's output passes through, so the Bluesky ingester types its links without importing from the web-search ingester.
- Establish the **default Source set** as `defaultSourceKinds` in `shared/enums.ts` (currently just `search`), read by the topic editor, its default/custom split, and the topic page's Sources card — replacing the hardcoded `search` checks and the single `WEB_SOURCE` copy constant with a per-kind copy map. Every editable kind outside the set falls through to the custom picker, which is how `bluesky` gets there.
- Summarize a Bluesky Source as the account's `@handle`, in the shared `toSourceSummary` the topic page, feed, and chat all read.
- **Suggest Bluesky accounts** in the source-suggestion flow: the prompt says what a handle is and what the Source reads, a suggested account is verified through the same credential-free appview read the ingester uses, and its identity keys on the handle so a publication's account is not read as its feed.
- Keep the **domain-model skill** in sync: `bluesky` joins the Source kinds, and the Source row names the default Source set and what sits outside it.

## Capabilities

### New Capabilities
<!-- none: this extends existing capabilities rather than adding one -->

### Modified Capabilities
- `source-ingestion`: adds the Bluesky ingester (a named account in, the articles it links to out), its credential-free read path, its rate-limit backoff, and moves the shared link-kind helper out of the search ingester. No existing ingester's behavior changes.
- `topic-editing`: the editor's default source group becomes a registry rather than a hardcoded `search` check, and the add picker and payload validation accept `bluesky`.
- `topic-detail-page`: the Sources card's default group is driven by that registry, and a Bluesky Source summarizes as its `@handle`.
- `source-suggestion`: Bluesky accounts become suggestible, verified before they are offered, and keyed apart from a feed on the same domain.

## Impact

- **Dependencies:** none. `getAuthorFeed` is XRPC, an HTTP GET returning JSON, so `fetch` covers it and `@atproto/api` earns nothing here.
- **Schema:** one additive enum value, `ALTER TYPE "public"."source_kind" ADD VALUE 'bluesky'` (migration `0044`). No table, column, or backfill.
- **Code:** new `worker/ingest/bluesky.ts` (+ test); edits to `worker/ingest/index.ts` (register), `worker/suggest.ts` (+ test), `worker/prompts/suggest-sources.md`, `worker/ingest/feed.ts` (the status error's message), `shared/enums.ts` (the kind, the default set, `isDefaultSourceKind`), `shared/sources.ts` (+ test), `db/schema.ts`, `ui/src/lib/utils.ts` (default source copy), `ui/src/components/topic/EditTopicFields.tsx` (+ new test), `EditTopicModal.tsx`, `TopicSourceEditor.tsx`, `TopicInfo.tsx`, `.env.example`, `.agents/skills/domain-model/SKILL.md`.
- **Env / config:** none. The public AppView needs no key, so `integration_id` stays null and no secret is added. Source `config` carries a required `handle`.
- **Cost:** the Bluesky API is free and no model runs, so the ingester charges `0` and adds one HTTP call per Source per Scan.
- **Deferred:** feed generators as a second Bluesky Source kind (`app.bsky.feed.getFeed`, keyless, and discoverable by topic keyword through `getPopularFeedGenerators` — the better fit for topic-shaped discovery); searching for accounts by keyword, which is the one Bluesky call that would need an authenticated session; resolving a handle to its immutable DID so a renamed account does not break its Source; unshortening links, so a `bit.ly` share does not dedupe against the same article shared directly; per-user Bluesky Integrations; reposts, quote posts, and thread context.
