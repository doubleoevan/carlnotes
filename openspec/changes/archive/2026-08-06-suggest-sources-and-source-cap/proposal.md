## Why

Adding a Source means knowing one exists. A reader who wants a topic covered has to already know which subreddit, which feed, which channel — so the source list stays at whatever the default web search found, and the Topic is thinner than the reader wanted.

The Topic also has no ceiling on Sources at all. Every Source is fetched on every Scan, so an unbounded list is unbounded ingest cost, and pasting urls into the prompt adds Sources without ever touching the source editor.

## What Changes

- A **Suggest sources** button in the edit topic modal reads the Title and Carl's Prompt and drops up to three proposed Sources straight into the added-source list, each removable with the ✕ already there. Nothing is persisted until Save.
- New route `POST /api/topics/suggest-sources` taking `{ name, prompt, excludeSources }`, so it works for a Topic that has never been saved. Signed-in only, with no quota and no metering.
- A cheap-model call behind a versioned `worker/prompts` markdown prompt with structured output. It prefers recurring feeds — rss, youtube channels, subreddits — and proposes a `url` Source only for an aggregation page with no discoverable feed. It may propose the built-in web search when the Topic currently has it off.
- **Every candidate is verified before it is returned**, by the same readers the ingesters use: an rss feed is parsed, a youtube channel or playlist is resolved to its Atom feed and parsed, a subreddit is fetched through its keyless `.rss`, a url is fetched. Anything that fails is dropped silently, so nothing the model invented reaches the modal.
- Every Source the modal currently holds — kept, added, and the ones derived from urls in the prompt — is sent as `excludeSources` and filtered server-side too, so clicking again proposes something new.
- **A Topic holds at most 10 Sources**, on every plan. Every kind counts, the built-in web search included, so turning web search off frees a slot for something else. Urls written into the prompt count too, since they become Sources on save.
- The cap is a flat constant in shared config, not a plan limit, and is enforced in the save validation beside the payload's existing source-kind checks.
- At the cap, **+ add a source** and **Suggest sources** both disable with a short Carl-voiced tooltip, in the same treatment the frequency picker uses, minus its link to pricing. Suggest sources asks only for the headroom left — the lesser of three and the free slots.
- **BREAKING:** a Topic that already holds more than 10 Sources can no longer be saved without removing some. No Topic is near that today, so this refuses nobody in practice, and existing Topics keep scanning every Source they have until someone edits them.

## Capabilities

### New Capabilities

- `source-suggestion`: proposing Sources from a Topic's own words, verifying each one is real before it is offered, and never proposing something the Topic already has.

### Modified Capabilities

- `topic-editing`: adds the Source cap and its enforcement, the Suggest sources control, and the disabled states at the cap.

## Impact

- `shared/contracts.ts` — the cap constant, and the `sources` array bound on `updateTopicPayload`, which both create and update already validate through.
- `api/index.ts` — the new route.
- `worker/suggest.ts` (new) — generating, verifying, and filtering candidates. It sits in `worker` beside `screen.ts` because it needs the model, the prompt loader, and the ingesters' feed readers, none of which the api may import directly. The api reaches it through the worker barrel, as it does every other worker concern.
- `worker/prompts/suggest-sources.md` (new) — the prompt, registered in the prompt loader's fallback map.
- `ui/src/components/topic/EditTopicModal.tsx`, `TopicSourceEditor.tsx` — the button, the loading line, and the disabled states.
- No schema change and no new dependency. Verification reuses `fetchFeed` and `toFetchableUrl`; the model call reuses the `cheapModel` and structured-output path the search ingester already runs.
- The topic prompt and its title reach a model, so the prompt fences them as untrusted data through the loader, as `injection-defense` already requires of every model-facing prompt.
- The **web scout → web search** copy rename this brief also asked for has already landed in the working tree, in the two UI comments and the `topic-editing` and `topic-detail-page` specs. Archived changes keep the old wording, since they record what was decided at the time.
