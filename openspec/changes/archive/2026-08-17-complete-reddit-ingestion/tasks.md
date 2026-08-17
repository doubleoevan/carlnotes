## 1. The problem-Source trace

- [x] 1.1 In `db/schema.ts`, rename `scans.fallbackSources` to `problemSources` (column `problem_sources`) and widen its type to the union `{ sourceId: string; status: "fallback"; fallbackMode: string } | { sourceId: string; status: "failed"; reason: string }`, updating the column comment to say it holds Sources that fell back or failed
- [x] 1.2 Run `bun run db:generate` and confirm the found migration is a rename, not a drop and add, then apply it with `bun run db:migrate`
- [x] 1.3 In `worker/ingest/index.ts`, add `sourceId` and `reason` to the `failed` arm of `SourceOutcome`, and have `ingestFromSource`'s catch fill `reason` from the caught error's message, capped at a constant declared at the top of the file
- [x] 1.4 In `worker/ingest/index.ts`, rename `ScanSummary.fallbackSources` to `problemSources` and have `toScanSummary` push a `fallback` entry for every ok outcome carrying a `fallbackMode` and a `failed` entry for every failed outcome, leaving the Scan-status rule unchanged
- [x] 1.5 Rename the field through `worker/workflows/run-topic-scan-activities.ts` (`IngestStageResult`, `ingestForScan`, and the `finishScan` write)
- [x] 1.6 Extend `worker/ingest/index.test.ts`: a mixed set of outcomes yields a `problemSources` holding the fallback entry with its mode and the failed entry with its reason, a clean set yields an empty trace, and the Scan status is unchanged in both

## 2. The Reddit ingester

- [x] 2.1 In `worker/ingest/reddit.ts`, add a pure `toRedditRequest(source)` returning the request as an intent for the two Source shapes (a subreddit listing at its sort, and a query searched inside that subreddit), failing a Source that names no valid subreddit
- [x] 2.2 Add a pure `toRedditModes(hasCredentials)` returning the ordered modes to attempt: OAuth then keyless when credentials are set, keyless alone when they are not
- [x] 2.3 Rewrite the ingester body to walk the modes in order, returning the first mode's Resources — with `fallbackMode: "reddit-rss"` when the keyless feeds produced them — and throwing a reason naming each mode and its failure when every mode fails
- [x] 2.4 Point the keyless mode at the rss feeds reddit still serves (`/r/<sub>/.rss` and `search.rss`), which the smoke proved is the only keyless reading it allows, and parse them through the shared feed reader
- [x] 2.5 Keep `toOauthUrl` and `toRssUrl` building the site-wide search form no Source produces, with tests over it, as the seam subreddit discovery calls
- [x] 2.6 Keep the descriptive `User-Agent` on every request including the token call, and keep `MAX_POSTS`, the sorts, and the timeout as constants at the top of the file
- [x] 2.7 Extend `worker/ingest/reddit.test.ts`: `toRedditRequest` covers all four config cases plus the invalid-subreddit and unrecognized-sort paths, `toRedditModes` covers both credential states, and `parsePosts` covers a search payload alongside the listing payload it already covers, asserting title, snippet, permalink, `read` kind, engagement, and in-payload dedupe

## 3. The failure reason in the scan report

- [x] 3.1 In `worker/review/summarize.ts`, add `reason` to `ScannedSource` and print it on the Source's line in `toSourcesBlock`
- [x] 3.2 In `worker/review/index.ts`, carry the failed outcome's reason through to the `ScannedSource` it builds (no edit needed: `reviewScan` takes the `SourceOutcome[]` as `ScannedSource[]`, so the reason is included once the type includes it)
- [x] 3.3 Bump `worker/prompts/summarize-topic-scan.md` to the next version and adjust the sources beat so a failed Source is reported as failed with its reason rather than reading as a quiet week
- [x] 3.4 Extend `worker/review/summarize.test.ts`: the sources block names a failed Source with its reason and still renders a fallback Source with its mode

## 4. The default Source registry

- [x] 4.1 Add `shared/sources.ts` holding one entry per source kind with its label and its config-value placeholder, plus the ordered preselected set — `search` alone, since a preselected Source is created with no config and reddit needs the subreddit it names
- [x] 4.2 Replace `WEB_SOURCE` in `ui/src/lib/utils.ts` and `SOURCE_VALUE_PLACEHOLDER` / `CUSTOM_SOURCE_KINDS` in `ui/src/components/topic/TopicSourceEditor.tsx` with reads of the registry, so the default group renders one row per preselected kind
- [x] 4.3 In `ui/src/components/topic/EditTopicModal.tsx`, seed a new Topic from the registry's preselected kinds instead of the `[{ kind: "search", value: "" }]` literal, and keep the reddit config mapper (it stays for a custom subreddit row)
- [x] 4.4 In `ui/src/components/topic/TopicSettingsCard.tsx`, render one default-source line per preselected kind, each on or muted off
- [x] 4.5 Cover the split the three components share in `shared/sources.test.ts`: the preselected set and its order, every default kind carrying its summary, the picker offering the kinds that take a config, and a reddit Source counting as custom however it is configured
- [x] 4.6 In `api/topic/topics.ts`, have a reddit Source summarize its subreddit, its query, or both, so only a genuinely configless Source reads as a default one

## 5. Source suggestion reads Reddit through the ingester

- [x] 5.1 In `worker/ingest/reddit.ts`, export `toSubredditName` (drops a leading `r/`, accepts only names reddit would) and have `toRedditRequest` resolve the Source config through it
- [x] 5.2 Export `fetchSubredditFeed`, which reads the keyless feed through `toRssUrl` and the ingester's User-Agent, with a comment recording why it skips the request queue
- [x] 5.3 In `worker/suggest.ts`, drop the duplicate User-Agent and hand-built feed url, verify a subreddit through `fetchSubredditFeed`, and refuse a name `toSubredditName` rejects before any request
- [x] 5.4 Have `toSourceKey` resolve a reddit candidate through `toSubredditName` too, so dedupe and verification agree on the name
- [x] 5.5 Cover `toSubredditName` in `worker/ingest/reddit.test.ts` and the invalid-name dedupe in `worker/suggest.test.ts`
- [x] 5.6 Read a `403` as "not now" for a reddit candidate, since reddit answers it to every request from a blocked address range while a missing subreddit answers `404` (both measured), so a blocked deployment offers subreddits instead of silently offering none

## 6. The live access check

- [x] 6.1 Add `worker/reddit.smoke.ts` seeding a Topic with a Reddit Source, running each mode explicitly, and printing which mode answered and which was refused, with the same seed-and-cleanup shape as `worker/search.smoke.ts`
- [x] 6.2 Add `smoke:reddit` to `package.json` and to the `smoke` chain, and add its line to the README Development section's smoke list
- [x] 6.3 Confirm `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are set in the deployed Doppler config: neither the `dev` nor the `prd` config holds them, so every environment runs keyless today. Registering a Reddit app and adding the pair is left to the owner, and the deployed-environment smoke run waits on that
- [x] 6.4 Space the ingester's requests behind one queue, since the smoke showed reddit refusing a Scan's second keyless request, and set the gap from what the recovery window measures rather than a guess

## 7. Documentation and verification

- [x] 7.1 Update `.agents/skills/domain-model/SKILL.md`: the Source row notes the preselected default set and where the registry lives, and the Scan notes the `problem_sources` trace covering fallbacks and failures
- [x] 7.2 Mirror the updated skill to `.claude/skills/domain-model/SKILL.md` (the `.claude/skills` entry is a symlink to `.agents/skills`, so it follows on its own)
- [x] 7.3 Update the change artifacts where the smoke contradicted them: the keyless path is the rss feeds, not the `.json` endpoints, and `fallbackMode` stays `reddit-rss`
- [x] 7.4 Run `bunx biome check . && bunx tsc -b && bun test` and fix what they report
