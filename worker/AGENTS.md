# worker/

Temporal worker and the scan pipeline. Entries: `temporal.ts` (the worker), `schedule.ts`
(the sweep that starts due scans), `worker/index.ts` (what api may import).

- `workflows/` — Temporal workflows and activities; `ingest/` — one ingester per Source kind,
  `ingester.ts` is the interface; `review/` — filtering and scoring; `chat/` — Carl's streamed
  chat replies and their retrieval; `prompts/` — model-facing Markdown templates; `models.ts` —
  every model call, through LiteLLM; `litellm.ts` — the user keys those calls bill to: created, replaced, read, and
  reset on the first of the month by the sweep.
- Every scan stage charges the Scan's one Budget (`budget.ts`); nothing spends outside it.
- A Resource's content hash is taken in the dedupe stage, over the title and snippet as they stand then.
  The fetch that follows may replace a title read off the url and leaves the hash alone, so a retitled
  Resource still matches its Finding's `reviewed_content_hash` and no later Scan pays to score it again.
- Untrusted text is screened by LLM Guard (`guard.ts`) before any model reads it.
- Every fetch of a user-supplied url goes through `fetchPublicUrl` (`publicFetch.ts`), which re-checks
  each redirect hop against the internal-address rule, with `readLimitedBody` bounding reads. `scrape.ts` reads a
  declared transcript over that path and scrapes any other page through Firecrawl, and `linkPreview.ts` reads a
  chat link's preview on it.
- Tests: `bun test worker`; `*.smoke.ts` hit real services and run under `doppler run`.
