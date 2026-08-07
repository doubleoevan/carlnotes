## 1. The Source cap

- [x] 1.1 Add the flat Source cap constant to `shared/contracts.ts`, beside the other shared limits.
- [x] 1.2 Bound `updateTopicPayload`'s `sources` array by it, so create and update are both covered by the validation they already share.
- [x] 1.3 Cover it: a payload at the cap validates, one past it does not, and a payload whose count is only over because of prompt-derived urls is refused the same way.

## 2. Suggesting Sources

- [x] 2.1 Write `worker/prompts/suggest-sources.md` with frontmatter and a structured-output instruction: prefer rss, youtube, and reddit; propose `url` only for a collection page with no feed; the built-in web search only when the Topic lacks it. Register it in the prompt loader's fallback map.
- [x] 2.2 Add `worker/suggest.ts` with the candidate generator: interpolate the Topic's name and prompt as untrusted text, call the cheap model with a schema, and return the typed candidates.
- [x] 2.3 Filter candidates against the excluded Sources by canonical url and by kind-specific identity, so a subreddit or channel the Topic already holds is dropped however it was written.
- [x] 2.4 Verify each surviving candidate concurrently through the ingesters' own readers, dropping any that fails without failing the request, and return at most the requested count.
- [x] 2.5 Add `POST /api/topics/suggest-sources` taking `{ name, prompt, excludeSources }`, signed-in only, drawing on no quota and metering nothing.
- [x] 2.6 Cover the pure parts: filtering drops a differently written duplicate, the reply respects the requested count, and a candidate list that fully fails verification returns empty instead of throwing.

## 3. The editor

- [x] 3.1 Add the client call for the new route to `ui/src/lib/topicClient.ts`.
- [x] 3.2 Add the Suggest sources control to the source editor, appending what comes back to the staged-source list as ordinary removable rows.
- [x] 3.3 Disable it until the Title or the Prompt has text, and request only the headroom left — the lesser of three and the free slots.
- [x] 3.4 Replace the control with a moving line from the chat's thinking lines while the request is in flight.
- [x] 3.5 Disable both + add a source and Suggest sources at the cap, with a Carl-voiced tooltip in the frequency picker's treatment and no link to pricing.
- [x] 3.6 Tell the reader plainly when nothing new came back.

## 4. Verification

- [x] 4.1 `bunx biome check .`, `bunx tsc -b`, `bun test`.
- [x] 4.2 Live: open a new-topic modal, write a title and prompt, and confirm Suggest sources adds real Sources that each save and then ingest on the first Scan.
- [x] 4.3 Live: click Suggest sources twice and confirm the second click proposes nothing already staged.
- [x] 4.4 Live: fill a Topic to the cap and confirm both controls disable with their tooltip, and that a save past the cap is refused.
- [x] 4.5 Live: turn the built-in web search off at the cap and confirm a slot frees.
- [x] 4.6 Live: confirm a suggestion request draws no scan quota and meters no spend against the caller.
