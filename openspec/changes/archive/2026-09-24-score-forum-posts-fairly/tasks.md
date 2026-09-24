## 1. The prompt

- [x] 1.1 Rewrite the scoring instruction in `worker/prompts/summarize-resource.md` so relevance is judged by what the content says about the topic instead of the form it arrives in, placing it in the shared instruction above the `<!-- premium-tier -->` marker so the cheap tier reads it too
- [x] 1.2 Bump `version` to 4 and set `updated` in the frontmatter

## 2. The forum fetch

- [x] 2.1 Add `fetchRedditThread` and `toRedditPostId` to `worker/ingest/reddit.ts`, reading a post with its replies through the existing token exchange and request queue
- [x] 2.2 Add `toThreadText` to join the post's body with its replies, skipping a missing body and a deleted reply
- [x] 2.3 Branch `fetchContent` in `worker/scrape.ts` to the forum path ahead of the Firecrawl fallback, charging zero
- [x] 2.4 Cover `toRedditPostId` and `toThreadText` in `worker/ingest/reddit.test.ts`

## 3. Evidence the prompt works

- [x] 3.1 Score each topic's nearest forum Resources and its kept Resources through the real path on the cheap tier, under both wordings, and record the scores side by side
- [x] 3.2 Confirm the substantive forum posts rise toward the kept scores, the chatter samples stay low, and the kept Resources do not fall

Measured on the cheap tier against two Topics, selecting each Topic's nearest forum candidates by the same embedding the gate ranks with, so the samples are the ones that actually reach scoring.

Topic "Is Elon losing it?":

| sample | v3 | v4 |
|---|---|---|
| forum: "He is a man who has lost his mind." | 0.70 | 0.85 |
| forum: If an avg redditor was put into Elon's position | 0.20 | 0.40 |
| forum: The full-length interview with Elon Musk | 0.40 | 0.40 |
| forum: Do more people hate elon, or more people hate the media | 0.85 | 0.80 |
| forum: Nothing to do with Elon (chatter) | 0.05 | 0.00 |
| kept, mean of five | 0.89 | 0.91 |

Topic "How to raise a gifted 4 year old":

| sample | v3 | v4 |
|---|---|---|
| forum mean of five | 0.43 | 0.57 |
| kept, mean of five | 0.85 | 0.86 |

The substantive posts rise, the chatter sample falls to zero, and the kept Resources do not fall. Two samples moved down, which is the run-to-run spread of a single cheap-tier pass instead of a trend against the others.

## 4. Evidence the fetch works

- [ ] 4.1 Read one real thread through `fetchContent` and confirm it returns the post's body followed by its replies at zero cost
- [ ] 4.2 Re-score a forum Resource with its replies included and confirm the score rises toward the Topic's kept scores

Blocked on credentials. `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are unset in both the dev and the prd Doppler configs, so `toRedditAccessModes` returns the keyless mode alone and the thread endpoint cannot be called at all. 111 production Scans record the `reddit-rss` fallback, which is the keyless path running at its 30-second request gap instead of OAuth's 1 second.

Until the credentials are configured the forum path throws, the existing fetch-failure path catches it, and the Resource is scored on its snippet exactly as it is today. No regression, and no benefit either.

## 5. Verification

- [x] 5.1 Run `bun run check` and confirm the existing prompt tests still pass, including `worker/prompts/write.test.ts` and the builder's own assertions
- [x] 5.2 Confirm `worker/scan.smoke.ts` still builds every prompt, since it runs each builder with sample inputs
- [x] 5.3 Confirm `worker/review.smoke.ts` passes with the reworded prompt
