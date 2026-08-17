## 1. The source registry

- [x] 1.1 Add `shared/sources.ts` with `toGoogleNewsFeedUrl(query)`: trim the query, collapse its whitespace, return `https://news.google.com/rss/search?q=<encoded>&hl=en-US&gl=US&ceid=US:en`, and return `null` for a blank query. Carry a `ponytail:` comment naming the ceiling — entry links stay Google redirect urls, decode them if duplicate Resources get noisy.
- [x] 1.2 In the same file, export `DEFAULT_SOURCES`, the registry of Sources a new Topic starts with, holding the web scout alone (kind `search`, label `web`, summary `let Carl crawl`, empty config), plus `toDefaultSource(kind)` to match a stored source to its entry.
- [x] 1.3 In the same file, export `CUSTOM_SOURCE_OPTIONS`, one entry per picker option with its key, the kind it saves as, its label, its input placeholder, and a `toConfig(value)` builder — url, rss, google news, reddit, youtube — plus `toCustomSourceOption(key)`. Google News saves as kind `rss`, reads the publisher domain out of whatever form it was given in, and builds the `site:` feed through the url helper.
- [x] 1.4 Export `toGoogleNewsPublisher(feedUrl)` so a stored Google News feed can name the publisher it covers.
- [x] 1.5 Add `shared/sources.test.ts` covering the url helper, the google news option's config from a domain and from a pasted article url, a value naming no domain, the publisher read back out of a feed url, and default matching by kind.

## 2. The edit modal

- [x] 2.1 In `TopicSourceEditor`, render the default group from `DEFAULT_SOURCES` — on with a ✕, off with a turn-on control — replacing the `kind === "search"` split, and keep the "last remaining source" guard counting default and custom rows together.
- [x] 2.2 In the same component, drive the add picker from `CUSTOM_SOURCE_OPTIONS`: the select lists option labels, the value input takes the picked option's placeholder, and a staged source is `{ optionKey, value }`.
- [x] 2.3 In `EditTopicModal`, seed a new Topic with every registry entry switched on, hold stored default sources by key, and build the save payload through the registry — one row per switched-on default entry, and each staged custom source built by its own option. Delete the modal's per-kind `toSourceConfig`.
- [x] 2.4 Point `toPossibleSourceUrls` at the staged source's `optionKey`, so a url already staged as a url or rss source is still not offered twice.
- [x] 2.5 Delete `WEB_SOURCE` from `ui/src/lib/utils.ts`, pointing every reader at the registry entry.

## 3. The topic info card

- [x] 3.1 In `TopicInfo`'s sources section, list one line per registry entry (on, or muted off) and treat every non-matching source as custom, replacing the `hasSearchSource` / `kind !== "search"` split.

## 4. The publisher summary

- [x] 4.1 In `shared/sources.ts`, have `toSourceSummary` name the publisher behind a Google News feed, falling back to the feed host for any other rss source.
- [x] 4.2 Cover it in `shared/sources.test.ts`.

## 5. Skill sync

- [x] 5.1 Update `.agents/skills/domain-model/SKILL.md`: the Source row states that a default Source is an ordinary Source the app configures on the owner's behalf from the registry, and that Google News is an `rss` Source rather than a kind of its own.
- [x] 5.2 Mirror the edit into the `.claude/skills/domain-model/` copy so the canonical and loaded copies match. `.claude/skills/domain-model` is a symlink to the canonical folder, so the edit already shows through it.

## 6. Verification

- [x] 6.1 Run `bunx biome check .`, `bunx tsc -b`, and `bun test`. All clean, 397 tests pass after merging main.
- [x] 6.2 Verified in the running app against a blocked-write save, so nothing persisted and no Scan spent: a new Topic shows the web scout alone under default sources, the picker lists url, rss, google news, reddit, and youtube, picking `google news` swaps the input placeholder to `publisher domain…`, and pasting an article url stages a custom source that saves as `{kind: "rss", config: {url: "https://news.google.com/rss/search?q=site%3Atechcrunch.com&hl=en-US&gl=US&ceid=US:en"}}`. Running that stored config through `toSourceSummary` gives `techcrunch.com`, and through `parseFeed` gives 100 `read` Resources.

## 7. Merge with main

- [x] 7.1 Rebase the change onto main's source work: `toSourceSummary` now lives in `shared/sources.ts`, the info card's sources section moved to `TopicInfo`, `toSourceConfig` moved to `EditTopicFields`, sources carry a `sourceKind` field and a screening status, and a topic caps at `MAX_TOPIC_SOURCES` with prompt urls counted against it.
- [x] 7.2 Keep the Recommend button working: a suggested `{ sourceKind, value }` stages through the option carrying that key, and the excluded-source list maps each staged option back to the kind the api compares.
- [x] 7.3 Re-verified in the running app after the merge: the modal shows main's "up to 10" cap note, the default group holds the web scout alone, the picker offers google news, and a Recommend click stages suggestions as labeled rows.

## 8. Google News in the source suggestions

- [x] 8.1 Export `customSourceKeys` from `shared/sources.ts` as the vocabulary a suggestion speaks, and turn the suggestion payload and reply in `shared/contracts.ts` from `sourceKind` into `sourceOption`.
- [x] 8.2 In `worker/suggest.ts`, name a suggestion by its option, key a `googleNews` candidate by the publisher it covers so it matches that publisher's own feed, and drop the built-in web search from the vocabulary along with the branches that carried it.
- [x] 8.3 Verify a `googleNews` candidate by building its publisher feed through the shared helper and fetching it, dropping one whose feed carries no articles.
- [x] 8.4 Update `worker/prompts/suggest-sources.md` to version 2: name the `googleNews` option for a news publisher, take a bare domain, and drop the web-search option.
- [x] 8.5 Stage a suggestion through its own option in `TopicSourceEditor`, and send the excluded Sources as options too.
- [x] 8.6 Cover the publisher key in `worker/suggest.test.ts`.
- [x] 8.7 Verified end to end in the running app, with the registry bypassed so the new bundled prompt is what the model reads. On "Austin city politics" a Recommend click returned `rss austinmonitor.org/feed/` next to `google news statesman.com` and `google news kvue.com`, each row labeled by its option, and the save payload carried the two publishers as `rss` sources whose urls are `…q=site%3Astatesman.com…` and `…q=site%3Akvue.com…`. On "AI industry news" the model kept to rss feeds it knows, which is what the prompt asks for. A guessed Verge feed 404'd and was dropped, a throttled subreddit was kept, and a publisher Google News has never heard of answers 200 with zero items, which is the case the verification drops.
- [x] 8.8 At ship time, push the prompt to the registry with `bun run prompts:sync`. The registry still serves v1, and syncing before this lands would change what production suggests.
