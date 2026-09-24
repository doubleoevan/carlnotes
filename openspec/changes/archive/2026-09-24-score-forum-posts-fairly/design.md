## Context

Two things hold forum Findings at zero, and each one alone is enough.

`summarize-resource.md` opens with a single sentence of scoring instruction and then describes the relevance explanation. Asked to rate relevance with nothing more, the model reads register and authority alongside subject matter, and a first-person post loses to a published article even when the post is the one that addresses the Topic.

Separately, the content it reads is a fragment. `worker/ingest/reddit.ts` stores `child.data.selftext` as the snippet and nothing else, so the replies never arrive, and a link or image post arrives with no text at all. The fetch stage would normally fill the body, but Reddit rejects Firecrawl with a 403 — 126 of them in Sentry over ninety days — and the failure falls back to that same fragment.

The measurements say fixing one leaves the other in charge. Under the reworded prompt the nearest forum posts for "How to raise a gifted 4 year old" score 0.30 to 0.70, and that Topic is full at `max_results` with a lowest kept score of 0.95.

## Goals / Non-Goals

**Goals:**

- Score a Resource on what it says about the Topic, independent of the form it arrives in.
- Give the scorer a forum thread's replies, which is where a thread's substance lives.
- Keep low scores for content that genuinely says nothing about the Topic, forum or otherwise.
- Add no request load at ingest, where the rate limit already bites.

**Non-Goals:**

- Changing `RELEVANCE_THRESHOLDS`, `MAX_SCORED_RESOURCES_PER_SCAN`, the promotion threshold, or the prune. Forum posts already clear all of them.
- A `forum` Resource kind. Every forum post is `read` today and reads like one; a new kind would ripple through the gate, the schema, and the feed for no gain here.
- Naming Reddit in the prompt. The rule is about forum and discussion writing, and naming one Source would leave every other forum out.
- Generalizing the fetch to other forums now. The branch is keyed on the host it serves, and a second forum is a second branch when there is a second forum.

## Decisions

**Prompt guidance goes in the shared instruction, not behind the premium-tier marker.** Both tiers score, and the cheap tier is the one that decides promotion. Wording placed between `<!-- premium-tier -->` markers is stripped for the cheap tier by `filterPremiumPrompt`, which would leave the first-pass score exactly as biased and stop most forum posts before the premium tier ever saw them.

**The rule is stated as what relevance is, not as an exception for forums.** One standard applied to everything. An exception list invites the model to apply a discount it was not given, and it would need editing for every new Source.

**The replies are fetched at review, not at ingest.** Reddit serves a post's replies from a per-post address, so ingest-time fetching would cost one throttled request per post in every listing — 25 per Source against a one-second gap, across 56 Sources. The fetch stage runs only on survivors that already cleared the relevance gate, which is a fraction of that, and it is the stage whose job is filling content. It also puts the change where the 403 happens, so one branch both fixes the failure and adds the replies.

**The branch lives in `fetchContent`, beside the other paths.** That function already selects a path by kind and url — declared transcript, show notes, caption track, Firecrawl — and the spec already describes it as an ordered list. A forum post is one more entry, ahead of the Firecrawl fallback.

**The thread fetch lives in `worker/ingest/reddit.ts`.** The token exchange and the request queue are already there, and `queueRedditRequest` is already exported. Putting the fetch beside them keeps every piece of Reddit knowledge — hosts, user agent, auth, throttle — in one file, and `scrape.ts` imports one function.

**A failed thread fetch falls back like any other.** The existing fetch failure path catches, reports, and scores the snippet. A forum fetch that fails for want of credentials or against a private subreddit takes that same path, so the Finding is still written and the Scan is unaffected.

**Version 4, not a formatting bump.** The skill reserves a version bump for a wording change that can alter model output. This one is intended to.

## Risks / Trade-offs

**Forum posts displace existing Findings.** A Topic at `max_results` keeps its top N by score. Forum posts that now include their replies will push out lower-scoring Findings. That is the point of the change, and bookmarked and rated Findings are already spared by the prune, but feeds will visibly shift on the first Scan after the prompt syncs.

**Scores could over-correct.** Telling the model not to read polish as relevance could pull genuine chatter up with the substantive posts. The measured samples include both, so the check is that the gap between them widens instead of the whole set rising.

**Replies are not always the good part.** A thread's replies can be jokes, arguments, or noise, and feeding them to the scorer can lower a score as easily as raise it. That is the honest outcome instead of a regression: a thread whose replies say nothing should score like a thread that says nothing.

**The fetch spends a throttled request per survivor.** The queue serializes Reddit requests at a one-second gap, so a Scan with many forum survivors spends that many seconds in the fetch stage. Bounded by `MAX_SCORED_RESOURCES_PER_SCAN`, it is seconds instead of minutes, and it replaces a Firecrawl call that was being billed and rejected.

**Only Reddit is covered.** The branch keys on Reddit's hosts, so another forum keeps taking the Firecrawl path until someone adds it. That is the same shape as the caption hosts, which are added one at a time on evidence.

**The registry serves the old wording until synced.** Production keeps version 3 until `bun run prompts:sync:prd` runs after deploy. A Scan in between scores as it does now, which is the existing behavior instead of a new failure.
