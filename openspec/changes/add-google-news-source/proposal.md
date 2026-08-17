## Why

A Topic can already be pointed at a publisher's own RSS feed, but only when that publisher happens to publish one and the owner can find its url. Google News publishes a keyword-queried feed for any subject or publisher, keylessly and for free, and the app already has an RSS ingester that reads it — so a Topic can follow a publisher by naming its domain, and a later change can search Google News to suggest which publishers a Topic should follow at all.

## What Changes

- A Google News feed URL helper: any query becomes `https://news.google.com/rss/search?q=<query>&hl=en-US&gl=US&ceid=US:en`. It is the one place the feed URL is built, and the source suggestions call it too.
- Google News becomes a **custom** Source the owner adds from the source picker, naming the publisher it should follow by domain (`techcrunch.com`). The picker builds the publisher-scoped feed for it (`q=site:techcrunch.com`), so the Source returns links to that publisher's articles.
- Google News is a Source of the existing kind `rss`. No new source kind, no new ingester, no schema change — `rssIngester` reads it exactly as it reads any feed, keylessly, at cost `0`, emitting `read` Resources.
- The source picker lists **options** rather than raw source kinds, since Google News is not a kind of its own: it saves as `rss` with a URL the option builds. The options move into one shared table alongside their labels, placeholders, and config builders.
- The default Source set becomes a registry — one shared table naming each Source a new Topic starts with — replacing the `kind === "search"` special case the edit modal and the topic info card each carry today. Carl's web scout is its only entry, and it stays the only Source a new Topic starts with.
- A Google News Source is summarized by the publisher it covers rather than by `news.google.com`, so two of them are told apart wherever Sources are listed.
- Carl can recommend a publisher: source suggestions name the **option** they are added through rather than the kind they save as, the prompt asks for a news publisher as `googleNews` with its bare domain instead of a guessed feed url, and a candidate is verified by reading its publisher feed. A publisher Google News carries nothing from is dropped, and a publisher is one Source however it is followed, so its Google News feed and its own feed never both get offered. The built-in web search stops being suggestible, since it is a default Source the editor already shows.
- The domain-model skill records that a default Source is a normal Source the app configures on the owner's behalf, and that Google News is an `rss` Source rather than a kind of its own.

## Capabilities

### New Capabilities

None. Google News is a Source built from existing kinds, not a new capability.

### Modified Capabilities

- `source-ingestion`: adds the Google News feed URL helper, the publisher-scoped feed a Google News Source holds, and states that the ingester handles it unchanged, emitting `read` Resources at cost `0`.
- `topic-editing`: the modal's default Source group is driven by the default-Source registry rather than the `search` kind, and its custom picker offers options — including Google News, which takes a publisher domain — rather than raw source kinds.
- `topic-detail-page`: the info card's Sources section lists every default Source from the registry, and a Google News Source reads as the publisher it covers.
- `source-suggestion`: a suggestion names the source option it is added through rather than the kind it saves as, a news publisher is suggested as `googleNews` with its domain, verification reads the publisher feed, and a publisher is one Source however it is followed.

## Impact

- `shared/sources.ts`: grows from the summary helper it holds today into the source registry — the default Sources, the custom picker options with their config builders, the Google News feed URL helper, and the publisher a feed names. Read by `ui` and `api`.
- `ui/src/components/topic/`: `TopicSourceEditor` renders the default group and the picker from the registry and stages `{ optionKey, value }`; `EditTopicModal` builds the save payload through the registry; `EditTopicFields` loses its `toSourceConfig`; `TopicInfo` lists default Sources from the registry. `WEB_SOURCE` in `ui/src/lib/utils.ts` moves into the registry.
- `shared/sources.ts`'s `toSourceSummary` names the publisher behind a Google News feed, so every surface that reads a Source's summary shows it.
- `worker/suggest.ts` and `worker/prompts/suggest-sources.md`: suggestions name options, propose a publisher as `googleNews`, verify one by reading its publisher feed, and key it by publisher. `worker/ingest/` is unchanged — `rssIngester` already handles the feed.
- `shared/contracts.ts`: the suggestion payload and reply carry `sourceOption` rather than `sourceKind`.
- `db/`: unchanged — no migration, no new enum value.
- `.agents/skills/domain-model/SKILL.md` and its `.claude/skills/` copy.
