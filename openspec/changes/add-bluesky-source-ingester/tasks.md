## 1. Enum, env, and skill

- [x] 1.1 In `shared/enums.ts`, add `bluesky` to `sourceKinds` and to `editableSourceKinds`, and add `defaultSourceKinds = ["search"] as const` beside them with a comment naming it as the set a new Topic starts with
- [x] 1.2 Generate and apply the migration: `bun run db:generate` then `bun run db:migrate`; confirm the SQL only adds `ALTER TYPE "public"."source_kind" ADD VALUE 'bluesky'`
- [x] 1.3 Add no Bluesky entry to `.env.example`: the public AppView needs no credential
- [x] 1.4 In `.agents/skills/domain-model/SKILL.md`, add `bluesky` to the Source row's kind list and name the default Source set (`defaultSourceKinds` in `shared/enums.ts`) plus what sits outside it

## 2. Shared link kind

- [x] 2.1 Move `toResourceKind` with its `WATCH_HOSTS` / `LISTEN_HOSTS` / `isHostIn` from `worker/ingest/search.ts` to `worker/ingest/normalize.ts`, beside the other url-derived facts, and import it back into `search.ts`. Superseded on merge: main had made the same move independently, so both files took main's version and `search.ts` is unchanged by this branch
- [x] 2.2 Move its test from `worker/ingest/search.test.ts` to `worker/ingest/normalize.test.ts` unchanged. Superseded the same way

## 3. Bluesky ingester

- [x] 3.1 Create `worker/ingest/bluesky.ts` with top-of-file constants: the public appview and PDS hosts, `AUTHOR_FEED_LIMIT`, `FETCH_TIMEOUT_MS`, `DEFAULT_BACKOFF_MS`, and `MAX_BACKOFF_MS`, with Bluesky's declared points-per-hour ceiling named as what the caps answer to
- [x] 3.2 Add `parseLinks(posts): NewResource[]` (pure): read each post's external embed (including the `media`-nested form), emit the link's url with the card's title and description, `kind` from `toResourceKind`, `engagement` from the post's `likeCount`, `contentHash` null; skip posts with no link and links back into Bluesky; dedupe within the payload
- [x] 3.3 Add `blueskyIngester`: require `config.handle` (stripping a leading `@`) and throw without it, fetch `app.bsky.feed.getAuthorFeed` on the public appview with no session, unwrap `feed[].post`, and return `cost: 0` with `fallbackMode` unset
- [x] 3.4 Add the rate-limit-aware fetch: on `429`, wait the interval the response's `ratelimit-reset` (unix seconds) or `retry-after` header names, else a fixed default, capped at `MAX_BACKOFF_MS`, then retry once; a second `429` throws so the Source fails in isolation
- [x] 3.5 Add no session helper: every Bluesky call this change makes, and the suggestion check built on it, reads the public AppView keylessly
- [x] 3.6 Create `worker/ingest/bluesky.test.ts`: drive `parseLinks` with fixture posts covering an article, a repeat of it, a `media`-nested link, a video link, a `bsky.app` link, and a linkless post; assert the card title and description, the host-derived kind, the like count as engagement, both skips, and the dedupe. Cover `toBackoffMs` against each header form and the cap
- [x] 3.7 In `worker/ingest/index.ts`, register `bluesky: blueskyIngester`

## 4. Api and default Source set

- [x] 4.1 In `api/topic/topics.ts`, extend `toSourceSummary` with a `bluesky` branch returning the account's `@handle`
- [x] 4.2 Extend `api/topic/topics.test.ts`'s summary test with the bluesky case
- [x] 4.3 In `ui/src/lib/utils.ts`, replace `WEB_SOURCE` with a per-kind copy map over `defaultSourceKinds`, and update every reference

## 5. Topic editor and topic page

- [x] 5.1 In `ui/src/components/topic/EditTopicModal.tsx`, stage one configless Source per default kind for a new Topic instead of the single `search` entry
- [x] 5.2 In `ui/src/components/topic/TopicSourceEditor.tsx`, split default from custom by `defaultSourceKinds`, render one default row per default kind driven by the copy map, keep the "at least one source" guard counting the same rows, derive the custom picker's kinds by excluding the default set, and add an `account handle…` placeholder for bluesky
- [x] 5.2b Give `toSourceConfig` a bluesky branch storing `{ handle }` with any leading `@` stripped. Without it a picked handle fell through to the YouTube branch and stored as `channelId`, which the browser check caught. Moved to `ui/src/lib/utils.ts` beside `toPossibleSourceUrls` so it is covered by `utils.test.ts`, since importing the modal in a test pulls in the api client and its `window`
- [x] 5.3 In `ui/src/components/topic/TopicSettingsCard.tsx`, render one line per default kind (on, or muted off) ahead of the custom sources, and add a bluesky entry to `SOURCE_ICON`
- [x] 5.4 Check the topic editor in the browser: a new Topic stages the default source on, the picker offers bluesky with an `account handle…` field, and a saved Topic's info card reads the Bluesky Source as `@alice.bsky.social`. The dev database needed migration 0028's `degraded_sources` → `fallback_sources` rename applied by hand first, since every topic create and topic page 500s without it, on `main` as much as on this branch

## 6. Verify

- [x] 6.1 Run the gate: `bunx biome check . && bunx tsc -b && bun test`
- [x] 6.2 Run the ingester live against a real account. `@theverge.com` returned 33 article Resources from 50 posts at cost `0` with `fallbackMode` unset: every url off Bluesky, all unique, kinds `read` and `watch`, titles and snippets from the link cards, engagement from the sharing posts' likes. A handleless Source threw rather than fetching. Probed directly rather than through a Scan, so no Topic was created and no digest was sent
- [x] 6.3 Note what the live run exposed: one share went through `bit.ly`, which canonicalizes to a different url than the article it points at and so will not dedupe against a direct share of the same piece. Recorded as deferred rather than fixed, since unshortening costs a request per link and curation's own fetch follows the redirect

## 7. Merge main and join the suggestion flow

- [x] 7.1 Merge `origin/main` (7 commits: durable scans, source suggestions, plan-aware authorization, social profiles) and resolve 14 conflicted files. Main renamed the ingester contract (`NewResource` → `IngestedResource`, `cost` → `costDollars`), moved `toSourceSummary` to `shared/sources.ts`, moved `toSourceConfig` and the editor's field components to `EditTopicFields.tsx`, and moved the Sources card into `TopicInfo.tsx`, so each of this change's edits moved to the file that now owns it
- [x] 7.2 Regenerate the migration against main's schema each time main lands new ones. `0033` became `0044`, and main's own `0044`/`0045` pushed it to `0046_many_famine.sql` — still the single `ADD VALUE`, written `IF NOT EXISTS` so it is safe on a fresh database and on the shared dev one that already carries the label
- [x] 7.3 Add `isDefaultSourceKind` to `shared/enums.ts` beside `isDailyFrequency`, and drive both the editor's default/custom split and the topic page's Sources card off it, so the registry is read rather than restated
- [x] 7.4 In `worker/suggest.ts`, key a `bluesky` suggestion on its lowercased handle so an account is not read as a feed on the same domain, and verify a suggested account through `fetchAuthorFeed(handle, 1)` — the ingester's own credential-free call. Without both, a proposed handle was fetched as a url and keyed as a feed host
- [x] 7.5 Export `fetchAuthorFeed` with a limit, and have the ingester's failures carry their status (`FeedStatusError`) so the suggestion flow can tell a rate limit from an account that is not there. Generalize that error's message, which said "feed" for what main already used on plain pages too
- [x] 7.6 Describe the bluesky kind in `worker/prompts/suggest-sources.md` — a handle is a domain name, and what gets read is the links the account shares — and bump the prompt to version 2
- [x] 7.7 Move `FULL_SOURCES_NOTE` from `TopicSourceEditor.tsx` to `EditTopicFields.tsx`, which already owns `MAX_TOPIC_SOURCES`. It was the reason importing the pure `toSourceConfig` in a test pulled in the api client and failed on `window`
- [x] 7.8 Cover the new behavior: the bluesky cases in `shared/sources.test.ts`, the suggestion identity in `worker/suggest.test.ts`, and `toSourceConfig` in a new `ui/src/components/topic/EditTopicFields.test.ts` (main had left it untested when it moved)
- [x] 7.9 Verify live that suggestion verification does what it claims: `theverge.com` reads back a post, and an invented `the-verge-official.bsky.social` is refused with a 400 and dropped

## 8. Second and third merges of main

- [x] 8.1 Merge `3db8331` (account closing, email identity, owner photos). No conflicts, no new migrations, gate green at 406 tests
- [x] 8.2 Merge `4c6e444` (email identity, topic gating, SEO surfaces, TanStack Query feed — 135 files). Two conflicts: `TopicInfo.tsx`'s import line, where main added recap imports and this branch replaced `WEB_SOURCE` with the copy map, and the migration journal. Reissued the migration as `0046` behind main's `0044`/`0045`
- [x] 8.3 Confirm the integration points survived the large merge rather than only type-checking: the ingester is registered, `toSourceSummary` keeps its bluesky branch, `worker/suggest.ts` keeps the key and the verification, the editor still splits on `isDefaultSourceKind`, the prompt still describes the kind, and `toSourceConfig` still stores the handle
