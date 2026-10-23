## Why

A user who wants better Scans has one lever, the topic's Sources, but no evidence for pulling it. Dear Diary shows
"read 10 · kept 3" for the whole Scan and never says which Source supplied the three, so a Source that returns noise
every day looks the same as the one that supplies every finding. The per-Source outcomes exist in memory during
ingest and are dropped when the Scan closes.

## What Changes

- Each Scan that runs to its closing write records one result per Source: the Source's id, kind, and label, its status
  (ran, fell back, failed, or skipped), its fallback mode or failure reason, how many Resources it was credited with
  (found, shown as "read"), how many of those the Scan kept, its own ingestion cost, and how long its ingester ran
  (shown as "cost" and "time"). The results are stored in a new nullable `scans.source_results` column. Scans saved
  before this change keep `null`, with no backfill.
- Each Resource is credited to exactly one Source: the Source whose copy survived ingest's merge by canonical url.
  Sources run in creation order, so the same Source wins every time. Per-Source found counts sum to `found_count`.
- Some kept Findings come from no Source in this Scan. When the topic's name, prompt, or attachments change, review
  re-scores every Finding the topic already holds and moves it to the new Scan, so it counts in `kept_count`. The
  result records that number as `earlierKeptCount`. Per-Source kept plus `earlierKeptCount` equals `kept_count`.
- `GET /api/scans/:id`, the read Dear Diary already makes when it opens, also returns the Scan's results. Costs and
  failure reasons go only to the topic's owner and platform admins, the same rule as the Scan cost.
- Dear Diary gains a **Source notes** chart at the bottom, below Carl's notes and above the time and cost footer.
  Its summary line reads "N kept from N read across N sources". Each Source gets one horizontal bar row that expands to
  a detail line, plus an "Earlier brew findings" row when the Scan kept Findings from earlier Scans. Skipped Sources are
  left out. Scans with no results show no chart: Scans saved before this change, running Scans, stopped Scans, and Scans
  whose workflow failed.
- The chart is `SourceResultsChart`, a presentational component in `apps/web/src/components/common/` built from plain
  HTML and CSS on Nightshift tokens. It ships with a story and an entry in the Nightshift inventory, so the MCP scan
  view can reuse it later.
- The note still loads when someone opens a Scan's ⓘ, behind the loading animation, and the read now starts as soon as
  the pointer reaches the ⓘ or the ⓘ takes focus, so the chart is usually there when the popover opens.
- On the topic page, a user who may edit the topic sees a trash icon in an open row's detail line, for a Source the
  topic still has. It opens the shared confirmation dialog, and a confirmed removal deletes the Source through
  `DELETE /api/topics/:id/sources/:sourceId`, which runs the same Topic Tool the chat and the MCP server use.
- The "Adding sources" docs page points readers at the chart when a topic goes quiet.

## Capabilities

### New Capabilities

- `source-results`: what each Source contributed to a Scan. Covers the per-Source record, the one-Source credit rule,
  reconciliation with the Scan's found and kept counts, the earlier count, the api fields and their visibility, and the
  Source notes chart.

### Modified Capabilities

- `scan-history`: the scan recap popover shows the Source notes chart between Carl's notes and the time and cost
  footer.

## Impact

- **Schema**: `packages/db/schema/scans.ts` gains `source_results` (jsonb, nullable), with one generated migration.
- **Pipeline**: `packages/pipeline/ingest/index.ts` reads Sources in creation order, times each ingester, and credits
  each merged Resource to its surviving Source in `toScanSummary`. `DiscoveredResource` includes the credited
  `sourceId`.
- **Worker**: `apps/worker/workflows/runTopicScanActivities.ts` passes the results through `IngestStageResult`, and
  `finishScan` counts kept per Source in the same update that writes `found_count` and `kept_count`. The ingest
  payload stops passing each Source's Resources and page bodies to the later stages, keeping only the four fields
  the scan report reads. A payload from a
  worker that predates this change writes `null`.
- **Contracts and client**: `packages/contracts/topics.ts` adds the result schema to `scanNote`, and
  `packages/contracts/sources.ts` adds the result label and the fallback mode label. `fetchScanNote` in
  `packages/client/topicClient.ts` returns the summary and the results together, and its two callers change with it.
- **Api**: `DELETE /api/topics/:id/sources/:sourceId` over `removeTopicSource` in `apps/api/tool/topicSourceTools.ts`.
  A new owner-only `topic:viewOwnerDetails` capability in `apps/api/authorization.ts` takes over the inline
  owner-or-admin check in `apps/api/topic/topics.ts`. `apps/api/topic/scans.ts` asks the same capability, returns the
  results, and withholds costs and failure reasons from every user
  and visitor who is not the owner or an admin.
- **Web**: a new `SourceResultsChart` with its story and tests, mounted in `TopicScanRecap`. `TopicScanHistory`,
  `OwnerTopicsTable`, their stories, and the Storybook fixtures read the new note shape. `inventoryTable.md` gains a
  row.
- **Docs**: `apps/docs/src/content/docs/topics/adding-sources.md`, re-embedded with `bun run docs:embed`. The
  domain-model skill and the AGENTS.md files for db, pipeline, worker, and web are updated.
- **No new dependencies.** `problem_sources` stays as it is.
