# Tasks

## 1. Contracts and labels

- [x] 1.1 In `packages/contracts/sources.ts`, add the fallback mode constants (`reddit-rss`, `youtube-atom`),
      `toFallbackModeLabel(mode)` (an unknown mode prints as is), and `toSourceResultLabel(kind, config)`, which returns
      the summary, then the kind's `promptLabel`, then the bare kind, cut to 200 characters. Point `reddit.ts` and
      `youtube.ts` at the constants. Verify with new cases in `packages/contracts/sources.test.ts`: web search labels
      "web search", reddit labels its subreddit, a 2,000-character url label is cut to 200, and an unknown mode passes
      through.
- [x] 1.2 In `packages/contracts/topics.ts`, add `storedScanSourceResults`: the stored shape, a discriminated union on
      `status` with `skipped`, inside `{ sources, earlierKeptCount }`. Derive the wire schema `scanSourceResults`
      from it with no `skipped` member, nullable `costDollars`, and a nullable `reason` on `failed`. Bound
      the wire schema with a 200-character label, a 300-character reason, and at most 50 results. Extend `scanNote`
      with nullable `sourceResults` ending in `.catch(null)`. Verify with `contracts.test.ts` cases:
  - An owner view and a visitor view both parse.
  - A `skipped` result is rejected on the wire.
  - A malformed `sourceResults` parses to `null` while `scanSummary` survives.
- [x] 1.3 Add `toExactDurationLabel(ms)` and `toExactDollarLabel(dollars)` to `packages/core/lib/labels.ts`.
      `toExactDurationLabel` reads to one decimal under ten seconds and through `toDurationLabel` above that.
      `toExactDollarLabel` reads "$0" for zero, three decimals under a dollar, and two from a dollar up. Verify with
      tests: 400 ms reads "0.4s", 3,240 ms reads "3.2s", 75,000 ms reads "1.3 min", $0.0314 reads "$0.031", and $1.5
      reads "$1.50".

## 2. Schema

- [x] 2.1 Add the nullable jsonb column `sourceResults` (`source_results`) to `packages/db/schema/scans.ts`, typed as
  the inferred `storedScanSourceResults` or `null` (design §1), with a comment in the `problemSources` style. Run `bun
  run db:generate`, then add the `SET LOCAL lock_timeout = '3s';--> statement-breakpoint` line and its comment above the
  `ALTER`, as in `0109_common_jackal.sql`. Verify the migration is that line plus one `ADD COLUMN "source_results"
  jsonb` with no default and no backfill.
- [x] 2.2 Add `scans.source_results` beside the `problem_sources` line in `.agents/skills/domain-model/SKILL.md`: one
      result per Source with the credit rule and the earlier count. Add the column to `packages/db/AGENTS.md` if it
      lists the scan columns. Verify `bunx biome check .` passes on the edited files.

## 3. Ingest credit

- [x] 3.1 In `packages/pipeline/ingest/index.ts`, read Sources ordered by `created_at`, then `id`. Time each ingester
      call with `performance.now()` in both the `try` and the `catch`, and put `durationMs` on every `SourceOutcome`
      (0 when skipped). After the ingesters return, re-read the topic's Source rows and label each outcome through
      `toSourceResultLabel`, falling back to the row read at the start.
- [x] 3.2 In `toScanSummary`, save `sourceId` on each kept copy and return `sourceResults` in outcome order. Each
  result's status is `fallback` only with a fallback mode, `foundCount` counts the Resources credited to it, `keptCount`
  is 0, and `costDollars` is the outcome's cost (0 when failed or skipped). Add `sourceId` to `DiscoveredResource` and
  strip it before the Resource insert, beside `isFromCustomSource`. Leave `problemSources` unchanged.
- [x] 3.3 Add tests in `packages/pipeline/scan.test.ts` and `packages/pipeline/ingest/index.test.ts`. Verify them with
      `bun test packages/pipeline`:
  - Duplicate credit: the older of two Sources returning one url is credited and the other is not, and a Source
    listing one url twice reads it once.
  - Σ found equals the summary's `foundCount`, and Σ cost equals its `costDollars`.
  - A Source that found nothing is `ok` with read 0. A Source with a fallback mode is `fallback`. A failed Source
    keeps its reason and `durationMs` at cost 0. A skipped Source has read 0 and `durationMs` 0.
  - The Source select orders by `created_at`.
  - A label comes from the re-read row.
- [x] 3.4 Update `packages/pipeline/AGENTS.md` where it describes ingest: creation order, the credited `sourceId`, and
      per-Source results. Verify the paragraph names the functions as they now exist.

## 4. Worker

- [x] 4.1 In `apps/worker/workflows/runTopicScanActivities.ts`, add optional `sourceResults` to `IngestStageResult`
      and pass it through from `ingestForScan`, keeping `sourceId` on the discovered Resources it returns. Narrow
      `IngestStageResult.sourceOutcomes` to `ScannedSource[]` and map each outcome to `sourceKind`, `status`,
      `fallbackMode`, and `reason` before returning, so no Source's Resources or page bodies cross the activity
      boundary. Verify with a test that the returned outcomes hold only those four fields and that the scan report
      tests still pass unchanged.
- [x] 4.2 Add a pure `toScanSourceResults(ingestSourceResults, discoveredResources, keptFindingUrls)` beside
      `finishScan` that fills `keptCount` per Source and `earlierKeptCount`. In `finishScan`, replace the kept
      `count()` with one select of the Scan's Findings' `resources.url`. Set `keptCount` to its length and write
      `sourceResults` in the same update, or `null` when the payload has none. `recordScanProgress`, `stopScan`, and
      `failScan` stay without results.
- [x] 4.3 Add tests in `runTopicScanActivities.test.ts`. Verify them with `bun test apps/worker`:
  - Per-Source kept plus the earlier count equals the kept count, with 30 earlier and 5 credited.
  - Every result has kept ≤ read.
  - A payload without `sourceResults` writes `null`.
  - The finish update writes `source_results` beside `kept_count`, and a stop writes neither.
- [x] 4.4 Update `apps/worker/AGENTS.md` where it describes `finishScan`. Verify that
      `bun scripts/check-workflow-bundles.ts` passes.
- [x] 4.5 Have `reviewScan` return `earlierFoundCount`, the Resources it loaded from the topic's earlier Findings
      whose url no Source returned. `finishScan` adds it to `found_count` and records it in `source_results`, and a
      review payload without it reads zero. Verify with `runTopicScanActivities.test.ts` cases for the sum and the
      older payload.

## 5. Api and client

- [x] 5.1 Add the owner-only `topic:viewOwnerDetails` capability to `apps/api/authorization.ts` beside `topic:delete`,
      and replace the inline `isAdmin || isTopicOwner` in `apps/api/topic/topics.ts` with it. Verify with an
      `authorization.test.ts` case (owner yes, admin yes, team member and visitor no), and that the topic page's
      existing cost tests still pass.
- [x] 5.2 In `apps/api/topic/scans.ts`, select `sourceResults` with the topic, ask `topic:viewOwnerDetails`, and
      return `sourceResults` through a pure `toSourceResultsView`, as design §5 lays out:
  - It `safeParse`s the stored value.
  - It keeps only `ok`, `fallback`, and `failed`.
  - It copies the wire fields by name.
  - For everyone but the owner and admins, it nulls costs and reasons and labels url Sources by host.

  Verify with `apps/api/topic/scans.test.ts` cases:
  - The owner and an admin get costs, reasons, and full url labels.
  - A signed-out visitor on a public topic gets none of those, but gets host labels, counts, statuses, modes, and
    times.
  - Skipped results and an unknown stored status are never returned.
  - An unknown stored field never reaches the response.
  - A malformed stored value and an older Scan both return `null`.
- [x] 5.3 Make `fetchScanNote` in `packages/client/topicClient.ts` return the parsed `ScanNote`, or
      `{ scanSummary: null, sourceResults: null }` on a non-ok response. Store the whole note in `TopicScanHistory` and
      `OwnerTopicsTable`'s `ScanNotesCell`, mark it loaded only when its Scan isn't running. Make a rejected fetch
      show the placeholder note instead of the loading mug forever, and add `sourceResults` to `ScanRecapFields`.
      Verify with `bunx tsc -b`, and with a story or test where `fetchScanNote` rejects and the popover shows the
      placeholder.
      Update `apps/api/AGENTS.md` if it describes the `/scans/:id` read.

## 6. The chart component

- [x] 6.1 Build `apps/web/src/components/common/SourceResultsChart.tsx` per design §6, with `mockup.png` as the loose
      visual guide:
  - The pure helpers `toSourceResultRows` (failed after ran on ties, then by label) and `toSourceResultsLine`.
  - The left-aligned heading, then the summary line with its tap hint and the legend at its end.
  - The row grid with a truncating titled label, the `muted` track, the `separator-strong` read bar, the `primary`
    kept fill with a 6px minimum, and the count.
  - The `bg-accent` highlight on hover and while a row is open.
  - The failed and earlier rows on empty tracks.
  - One open row, held as `aria-expanded` and `aria-controls` on each row button.
  - The detail line: the semibold full name, then read, kept, cost, and time, plus status only for
    fallback or failed.
  - Follow jsx-conventions and code-style.
- [x] 6.2 Add tests in `SourceResultsChart.test.tsx` (server-rendered markup and the pure helpers). Verify them with
      `bun test apps/web/src/components/common`:
  - The sort, with ties broken on read.
  - A failed Source sorts after a Source that read nothing.
  - The hint reads "Tap a source for details." with a cost or without one.
  - A failed row shows "failed" with no bar.
  - A fallback row's detail names its mode label.
  - An `ok` row's detail shows no status.
  - `initialOpenRowId` renders that row with `aria-expanded="true"` and its detail, and every other row false.
  - The earlier row is last with its kept count alone.
  - "1 source" is singular.
  - A null `costDollars` prints no cost.
  - A long label truncates, and its row opens the app's tooltip.
- [x] 6.3 Add `SourceResultsChart.stories.tsx` (Mixed, EarlierFindings, OwnerOpen, VisitorOpen, LongLabels,
      SingleSource, and ToggleRow with a play function) and `SOURCE_RESULTS_FIXTURE` in
      `apps/web/.storybook/fixtures/topics.ts`. The fixture is the mockup's Scan (ten Sources, 13 kept from 349 read)
      plus one fallback, reconciled with a matching scan in `TOPIC_SCAN_FIXTURES`. Verify that the story-coverage test
      for `components/common` passes.
- [x] 6.4 Add the Bar chart row to `apps/web/src/nightshift/inventoryTable.md`, and add the component to
      `apps/web/AGENTS.md` if it lists the common components. Verify that the Inventory page renders the row in
      `bun run dev:storybook`.

## 7. Dear Diary integration

- [x] 7.1 Render `SourceResultsChart` in `TopicScanRecap` after the notes block and before the time and cost footer,
      only when `sourceResults` has rows. Verify with tests in `TopicScanRecap.test.tsx`:
  - A Scan with `sourceResults: null` renders no "Source notes".
  - A Scan with results renders the chart after the note and before the "taken" footer in markup order.
- [x] 7.2 Have the `fetchScanNote` mocks in `OwnerTopicsTable.stories.tsx` and `nightshift/patterns/Card.stories.tsx`
      return the note with `SOURCE_RESULTS_FIXTURE`. Verify that both popover stories show the chart in
      `bun run dev:storybook`.
- [x] 7.3 Update step 2 of "If a topic goes quiet" in `apps/docs/src/content/docs/topics/adding-sources.md` to
      point at Source notes: which Sources read and kept, and which fell back or failed. Run
      `bun run docs:embed` and verify that it completes.

## 7a. Load on open, and removing a Source

- [x] 7a.1 In `TopicScanHistory` and `OwnerTopicsTable`'s `ScanNotesCell`, start `fetchScanNote` on the ⓘ's pointer
      enter, focus, and touch start, and have the open reuse a read already started or finished. Verify with a test
      that a hover then an open sends one request.
- [x] 7a.2 Add `DELETE /api/topics/:id/sources/:sourceId` over `removeTopicSource` with the `editor` origin: 204 when
      the Source is gone, 404 when the topic is missing or hidden or the Source is another topic's, and 403 when the
      user may not edit. Add `removeTopicSource(topicId, sourceId)` to `packages/client/topicClient.ts`. Verify with
      route tests for the owner, a team member, a non-editor, and another topic's Source.
- [x] 7a.3 Give `SourceResultsChart` an optional `sourceRemoval` with `removableSourceIds` and `onRemoveSource`, and
      render a "Remove source" trash icon button in an open row's detail line only for a removable Source. In
      `TopicScanHistory`, pass the topic's current Source ids when `canEdit`, open `ConfirmDialog` on a tap, remove on
      confirm, and reload the topic page. Verify with chart tests (no icon without `sourceRemoval`, none for a removed
      Source, none on the earlier row) and a story with the icon.
- [x] 7a.4 Fix the `canEdit` comment in `packages/contracts/topics.ts`: the owner, the owning team's active members,
      and admins may edit, and only the owner may delete.

## 8. Integration checks

- [x] 8.1 Run `bun run check` (Biome, the package boundaries, `tsc -b`, the workflow bundles, and `bun test`) and
      verify that it is green.
- [x] 8.2 Run `bun run build:storybook`. Then run a scratch Playwright script (`/opt/pw-browsers/chromium`) over the
      SourceResultsChart stories and both popover stories, in light and dark at 360px and desktop widths. Verify:
  - The accessibility addon's checks pass at error level.
  - The ToggleRow play function passes.
  - The panel never scrolls horizontally.
  - Screenshots show the track, the read bar, and the kept fill reading apart in both modes.
  - The dark 360px Mixed screenshot matches `mockup.png`'s layout and hierarchy. Note any deliberate differences in
    the hand-off.
- [x] 8.3 If the local stack runs (`bun run dev` with Postgres and Temporal), run a manual Scan on a seeded topic with
      two or more Sources, open its Dear Diary, and verify that the chart's line matches the row's
      "read N · kept N". If the stack can't run here, record that in the hand-off.

## Workflow follow-up

- Ship via `/ship`.
- Archive with `openspec archive add-results-by-source-chart --yes`.
