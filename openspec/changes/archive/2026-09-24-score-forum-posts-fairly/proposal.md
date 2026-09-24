## Why

No Finding in production comes from a forum post. Across 601 live Findings, zero were scored from the 3,566 Reddit Resources stored, and two separate causes hold that number at zero.

Those Resources are not dropped early. 1,792 have the `content_hash` only a gate-and-dedupe survivor is given, and Sentry has 126 `firecrawl scrape https://www.reddit.com/... returned 403` events across more than 100 distinct Reddit urls, an error reachable only after a Resource is authorized for the paid stage. The 403 is caught and the snippet is scored in place of the body, so the Resource is still scored and its Finding is still written.

**The score is biased by format.** Measured on the real path against the Topic "AI gone rogue", an 11,831-character Reddit post titled "OpenAI researcher statement on AI risk" scored 0.20, while a 178-character news snippet scored 0.95. Length is not the variable: the forum bodies were an order of magnitude longer.

**And the content really is incomplete.** A Reddit thread's value is in its replies, and the ingester stores none of them — `worker/ingest/reddit.ts` sets `snippet: child.data.selftext || null`, so a Finding is scored on the question alone, and a link or image post has no text at all. Asked to explain its scores, the premium model says so unprompted, on post after post: "this is just the question itself, no replies included", "the post is only her question, no answers or advice came along with it", "there's no actual advice in the thread". It is marking the content down for something the ingester withheld. Firecrawl, which would otherwise fill the body, is rejected by Reddit with a 403.

Fixing only the wording is not enough to change the outcome. With the reworded prompt the same Topic's nearest forum posts score 0.30 to 0.70, while that Topic is full at `max_results` with a lowest kept score of 0.95. Both causes have to go.

## What Changes

**The scoring prompt.** `worker/prompts/summarize-resource.md` moves to version 4. It currently says only "Score how relevant the content below is to the reader's topic context", which leaves the model free to reward a published article's polish over a first-person post that answers the Topic directly. The added guidance states that relevance is judged by what the content says about the Topic, not the form it arrives in, and that content saying nothing about the Topic still scores low.

**The forum fetch.** A Resource on a forum host gains its own path in `fetchContent`, ahead of the Firecrawl fallback. Where Firecrawl is rejected with a 403, Reddit's own api serves the post with its replies, so the fetch that fails today is replaced by one that succeeds and returns more than the page would have. The path runs at the fetch stage, so it touches only the survivors that already cleared the relevance gate instead of every post in a listing, and it goes through the ingester's existing request queue so it keeps to the request rate Reddit asks for.

Nothing else moves. `RELEVANCE_THRESHOLDS.read` stays 0.35, `MAX_SCORED_RESOURCES_PER_SCAN` stays 30, the promotion threshold stays 0.6, and the prune that closes a Scan is unchanged. Forum posts already clear every one of those.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `curation`: tiered scoring gains a rule that a Resource's relevance is judged by what it says about the Topic and not by its format, and the fetch paths gain a forum branch that reads a post with its replies from the forum's own api instead of scraping it.

## Impact

- `worker/prompts/summarize-resource.md` — the scoring instruction, version 4, new `updated` date.
- `worker/ingest/reddit.ts` — a new exported fetch for one post's thread, reusing the existing token exchange and request queue.
- `worker/scrape.ts` — `fetchContent` gains the forum branch ahead of the Firecrawl fallback.
- `openspec/specs/curation/spec.md` — the tiered scoring and fetch-path requirements, through this change's delta.
- The prompt is served registry-first, so its new wording reaches production through `bun run prompts:sync:prd` after deploy, with the bundled markdown as the fallback. The fetch change ships with the deploy.
- Scans will begin keeping forum Findings, which displaces lower-scoring Findings from Topics already at `max_results`. That is the intended effect.
- Reddit fetches move from Firecrawl (billed, rejected) to Reddit's api (free, throttled), so the `fetch` stage cost falls slightly for Topics with forum Sources.
