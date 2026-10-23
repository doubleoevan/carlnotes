# Design

## Context

See proposal.md for the motivation and specs/ for the behavior. This section covers only the current code that shapes
the approach.

- **Ingest** (`packages/pipeline/ingest/index.ts`). `ingestFromTopicSources` reads the topic's Sources with no
  `ORDER BY` and runs every ingester at once. `toScanSummary` then merges their Resources by canonical url and keeps the
  first copy it sees. Each `SourceOutcome` holds that Source's own Resources and cost. The summary keeps only the
  merged Resources, the summed cost, and `problemSources`, so nothing says which Source a merged Resource came from.
- **Status quirk.** `ingestFromSource` tags a Source that found nothing as `fallback`. `toProblemSource` records a
  fallback only when the ingester reported a `fallbackMode`, so "fallback with no mode" means "ran normally and found
  nothing". The new results follow `problemSources`: `fallback` only with a mode.
- **Stages.** The Scan runs as three activities, `ingestForScan`, `reviewForScan`, and `finishScan`
  (`apps/worker/workflows/runTopicScanActivities.ts`). `IngestStageResult` crosses the Temporal payload boundary into
  both later stages. `finishScan` writes `found_count`, `problem_sources`, and `kept_count` in one update. `kept_count`
  is `count(findings where scan_id = this scan)`, taken after the topic filter deletes the overflow.
- **Findings from earlier Scans.** `loadResourcesToReview` (`packages/pipeline/review/filter.ts`) scores the Resources
  this Scan discovered, plus every Resource the topic already holds a Finding for. It re-scores any whose review context
  (name + prompt + ready attachments) or content hash changed. `upsertFinding` moves a re-scored Finding's `scan_id` to
  this Scan, so it counts in `kept_count` and appears in the diary's finding list (`finding.scanId === scan.id`), even
  when no Source returned it. This is why kept needs the earlier count.
- **Stopped Scans.** `stopScan` writes status and times only. `recordScanProgress` writes `kept_count` and spend but
  never `found_count`, so a stopped Scan saves `found_count = 0`. The topic page drops stopped Scans from the history,
  and Activity still lists them.
- **The diary.** `TopicScanRecap` renders Dear Diary for two callers: `TopicScanHistory` on the topic page and
  `ScanNotesCell` in `OwnerTopicsTable` on Activity. Both lazily call `fetchScanNote(scanId)` →
  `GET /api/scans/:id` (`apps/api/topic/scans.ts`), which checks `topic:view` and returns `{ scanSummary }`.
- **Visibility.** The topic page gives cost and failure detail only to the owner and admins (`canSeeOwnerDetails =
  isAdmin || isTopicOwner`, with `isAdmin` from `loadUserAccess`). It hides Sources that have not passed screening from
  anyone who can't edit the topic. Every skipped Source is either unscreened or of a kind with no ingester.

## Goals / Non-Goals

**Goals:**

- One stored record per Source per Scan, whose found and kept counts plus the earlier count reconcile exactly with
  `found_count` and `kept_count` by construction, never by subtraction.
- One credit rule, computed in the loop that performs the merge, so "who gets credit" can never drift from "whose copy
  survived".
- A chart component with no data fetching, so the MCP scan view can render it from the same rows later.

**Non-Goals:**

- The waterfall, drop reasons, scoring cost attribution, chart strips on diary rows, and the MCP view (out of scope
  per the request).
- Results for stopped Scans and Scans whose workflow failed (decided with the user). That leaves a stopped Scan's
  `found_count = 0` as it is. Fixing it means writing the found count at ingest, which changes what the Activity row
  shows, so it waits for its own decision.
- Removing `problem_sources`. The new results hold everything it holds, and nothing in the app reads it today. Scans
  saved before this change have only that column, though, and dropping it deletes their record. That deletion is the
  user's call, so the column stays as it is and ingest keeps writing it.
- Re-labeling a stored result when its Source is renamed or removed. A result is history.

## Decisions

### 1. One nullable jsonb column, `scans.source_results`

The column holds `{ sources: StoredSourceResult[]; earlierKeptCount: number; earlierFoundCount: number }`, or `null`
for a Scan with no results.
`StoredSourceResult` shares one set of fields, `sourceId`, `sourceKind`, `label`, `foundCount`, `keptCount`,
`costDollars`, and `durationMs`, and is a union on `status`:
`{ status: "ok" } | { status: "fallback"; fallbackMode } | { status: "failed"; reason } | { status: "skipped" }`.
The shape is declared once, as the zod schema `storedScanSourceResults` in `packages/contracts/topics.ts`. The column's
`$type` is its inferred type, and the wire view in §5 derives from it. A second hand-written copy in the db schema
would drift from the copy the api and ui parse.

- *Alternative: a `scan_source_results` table, one row per Source per Scan.* The only read is one Scan's note, by
  primary key. A table adds a join, a second insert inside `finishScan`'s write, cascade rules, and an index, all for
  a cross-Scan query this change doesn't make. A jsonb array is the same records, and it follows the
  `problem_sources` precedent. If a later change charts Sources across Scans, it can add the table then.
- *Alternative: a separate `earlier_kept_count` column, or deriving the earlier count as `kept_count − Σ kept`.* A
  separate column needs a second null check to mean "no results". Deriving the count would hide a credit bug as a
  large earlier count. Storing the earlier count inside the same object keeps one `null` meaning "no results". It also
  lets a test check that the parts sum to the whole.

`toSourceResultLabel` cuts a label to 200 characters, since a url Source's summary is its whole url (up to 2,000). With
that and the ten-Source limit (`MAX_TOPIC_SOURCES`), the column stays under about 8 KB. The history query selects named
columns, so a history read never loads it.

### 2. Credit in `toScanSummary`, in creation order

`ingestFromTopicSources` reads Sources ordered by `created_at`, then `id`. The ingesters still run concurrently, but
`Promise.all` keeps outcomes in that order, so the merge's "first copy wins" means "the oldest Source wins". When
`toScanSummary` keeps a copy, it saves that Source's id on it as `sourceId`. That id goes with `DiscoveredResource`
into the activity payload and is stripped before the Resource insert, the same as `isFromCustomSource`.
`toScanSummary` also returns `sourceResults`, one per outcome in order. Each one's `foundCount` is the number of merged
Resources credited to it, and its `keptCount` is 0. Read therefore sums to `foundCount =
ingestedResources.length` by construction, and a test asserts it.

- *Alternative: re-derive the credit in `finishScan` from `sourceOutcomes`.* That re-implements the merge, and two
  copies of the rule drift apart.
- *Trade-off:* ordering changes which Source's title and snippet survive for a cross-Source duplicate. Today the
  winner depends on Postgres heap order. After this change it is stable, and the scan pipeline reads one copy either
  way.

### 3. Duration and label in `ingestFromSource`

`ingestFromSource` takes `performance.now()` before and after the ingester call, in the `try` and the `catch`. It puts
the rounded milliseconds on the outcome as `durationMs`. A skipped Source never reaches the ingester and gets `0`.
Labels come from a new `toSourceResultLabel(kind, config)` in `packages/contracts/sources.ts`. That function returns the
registry's `toSourceSummary`, or the kind's sentence name (`promptLabel`, "web search") when the summary is empty, or
the bare kind. After the ingesters return, `ingestFromTopicSources` re-reads the topic's Source rows with one indexed
select and labels each outcome from its fresh row. A Source deleted mid-ingest falls back to the row read at the start.
The re-read matters because a YouTube Source's channel name is first saved by its ingester. The row read at the start of
a new Source's first Scan would label it by its channel id.

A result's `costDollars` is `outcome.costDollars` for `ok` and `fallback`, and `0` for `failed` and `skipped`. That is
exactly what `toScanSummary` sums into the one `charge(budget, "ingestion", …)` call, so the per-Source costs sum to
`stage_costs.ingestion`. A test asserts it.

### 4. Kept and earlier counts in `finishScan`, from one query

`finishScan` replaces its `count()` with one select of `resources.url` for the Scan's Findings, joined to `resources`. A
pure `toScanSourceResults(ingestSourceResults, discoveredResources, keptFindingUrls)` beside it (or in its own
`scanSourceResults.ts` beside the activities, if `runTopicScanActivities.ts`, 326 lines today, would pass about 400)
builds a url → `sourceId` map from the discovered Resources. Each kept url adds one to its Source's `keptCount`, or one
to `earlierKeptCount` when no Source returned it. `kept_count` becomes `keptFindingUrls.length`, and `source_results`
goes into the same update. Every number in that update comes from one read, so the parts equal the whole. Kept ≤ read
holds because a credited url is one of the Source's merged Resources.

Read counts the same way. The review returns `earlierFoundCount`: the Resources it loaded from the topic's earlier
Findings whose url no Source returned this Scan. `found_count` becomes the ingest's found count plus that number, and
`source_results` records it beside `earlierKeptCount`, so the diary row's "read" and the chart's summary line agree. An
earlier kept Finding is one the review read again, so the earlier kept count never passes the earlier found count. A
review payload from a worker before this count reads it as zero, and stored results saved before it parse it as zero.

A payload whose `IngestStageResult` has no `sourceResults` writes `null`. That covers an ingest that ran on a worker
from before this change, since a Scan can wait up to a day between stages. `recordScanProgress`, `stopScan`, and
`failScan` never write results.

**The ingest payload sheds what no stage reads.** Today `ingestForScan` returns `sourceOutcomes` as is: every Source's
own Resources before the merge, with the url ingester's page markdown attached. Temporal stores that payload three
times in a Scan's history, as the ingest result and as the review and finish inputs. Its limit is 2 MB per payload.
Review reads only `ScannedSource` (`sourceKind`, `status`, `fallbackMode`, `reason`) from it, for the scan report.
`ingestForScan` now maps each outcome to exactly those fields before returning. The report's input is unchanged, so
no prompt changes. An older payload with the full outcomes still satisfies the narrower type. The new `sourceId` per
Resource and `sourceResults` add about 20 KB at most, so with the outcomes trimmed the payload shrinks overall.

- *Alternative: write results at the end of ingest and fill in kept later.* Read would then disagree with a stopped
  Scan's `found_count = 0`, which is the case the user chose to leave without a chart.

### 5. The note route returns the view, and the api applies visibility

`scanNote` in `packages/contracts/topics.ts` becomes `{ scanSummary, sourceResults: { sources, earlierKeptCount,
earlierFoundCount } | null }`. The wire shape `scanSourceResults` derives from `storedScanSourceResults`: the same union
with no `skipped` member, `costDollars: number | null`, and a failed result's `reason: string | null`. `GET
/api/scans/:id` selects `sourceResults` and the topic, and asks `isAllowed(userId, "topic:viewOwnerDetails", topic)`. A
pure `toSourceResultsView(stored, canViewOwnerDetails)` builds the wire value as an allowlist, not by stripping fields:

- It `safeParse`s the stored value against `storedScanSourceResults`. A value that fails returns `null`, so the Scan
  shows no chart instead of breaking its popover.
- It keeps only `ok`, `fallback`, and `failed` results, so a status added later stays out until the view names it.
- It copies each wire field by name, so a field added to the stored shape later never reaches the browser
  unreviewed.
- Without owner details, it sets the cost and reason to `null`, and a url Source's label becomes the page's host
  (`toUrlHost`). A stored label is history and is never relabeled. Without the host rule, a url Source the owner later
  removed, maybe with a token in its query, would stay readable in every past Scan's note to every user and visitor.
  The owner and admins still see the full label.

The wire schema bounds what the client accepts: a label of at most 200 characters, a reason of at most 300, and at
most 50 results. The `max` is 50 instead of 10 because two concurrent Source adds can pass the ten-Source count. The
client's `sourceResults` schema ends in `.catch(null)`, so a malformed results value costs only the chart and never
Carl's notes.

`topic:viewOwnerDetails` is a new owner-only capability in `apps/api/authorization.ts`, beside `topic:delete` and
`topic:invite`. An admin passes it as they pass every capability. The topic page computes the same rule inline today
(`isAdmin || isTopicOwner` in `topics.ts`, for the scan cost, the month's cost, and attachment details). It moves to
the capability too, so the rule has one home and routes through the gate as the domain-model skill requires.
`loadUserAccess` is memoized per request, so the gate adds no query to either route.

- *Why drop skipped results in the api:* a skipped url Source's label is its unscreened url, which the topic page hides
  from non-editors. The chart doesn't show skipped rows anyway, so nothing that reaches the browser needs them.
- *Why withhold failure reasons:* a reason is a raw error message of up to 300 characters. This follows the attachment
  precedent: only the owner and admins see why an attachment failed. Two existing paths bound what this protects:
  - Carl's notes reach every user and visitor who can see the topic, and describe each failed Source. The scan report
    prompt tells him to paraphrase a failure and never quote its reason text, so the notes say "that feed is gone", not
    the raw message. The rule here covers the raw reason only.
  - The topic page already sends every user and visitor each current Source's full `value`, an rss feed's url included
    (`toTopicSourceSummary` in `topics.ts`).

  Neither path is this change's. Both are listed in the ship report for the user to decide.

`fetchScanNote` returns the parsed `ScanNote` object, or `{ scanSummary: null, sourceResults: null }` on a non-ok
response, which is how it treats a missing note today. Today a rejected fetch is only logged, and the popover's loading
mug spins forever. Both callers now treat it like an empty note and show the placeholder line, so the user can open
the popover again. Both callers keep the whole note in state, and
`ScanRecapFields` gains `sourceResults`. Neither caller marks a note loaded while its Scan is running. Today a note
fetched mid-Scan is kept for the page's life, so a reopened popover would never show the chart once the Scan
finished. The next open after the Scan finishes fetches again.

### 5a. The note loads on open, and the read starts before the click

The note stays a separate read when the popover opens, behind the loading animation, instead of going with the topic
page. A measured local topic page payload (`/api/topics/top_mcp_watch`) is 66.7 KB with 148 Scans in its history. At up
to about 8 KB of results per Scan, including every Scan's results would add 150 KB to over 1 MB to every topic page
read, for a popover few people open.

Both callers start `fetchScanNote(scanId)` when the pointer enters the ⓘ, when the ⓘ takes focus, and on a touch start,
and the open waits on that same read. A read already started or finished is reused, so a hover then a click sends one
request. A finished Scan's note is kept for the page's life.

- *Alternative: preload every Scan's results with the topic page.* Rejected for the size above.

### 5b. An editor removes a current Source from its row

On the topic page, a user who may edit the topic (`canEdit`, which is `topic:edit`: the owner, the owning team's active
members, and admins) sees a trash icon button, "Remove source", at the end of an open row's detail line. It shows only
for a result whose `sourceId` is among the topic's current Sources, matched by id and never by label, since a past
Scan's result can name a Source the topic has since removed. The earlier row, a removed Source's row, and web search
show none. Web search turns off only in the topic editor. The Activity page passes no remove handler, so its chart shows
none. `TopicScanHistory` takes the topic's Sources with their kinds for both rules.

A topic keeps at least one Source. If the topic has one, the trash button shows the topic editor's toast,
`KEEP_ONE_SOURCE_MESSAGE` in `packages/contracts/sources.ts`, instead of the dialog. The rule's home is the Topic Tool:
`removeTopicSource` returns `webSearch` for web search and `lastSource` for a topic's last Source, counting the Sources
under a `for no key update` lock on the topic row so two removals at once never leave none. The chat and the MCP
`remove_source` tool word both through one `toRemoveTopicSourceText`, and the chat's toast for web search reads "Carl
couldn't remove web search." The route returns 409 naming the rule, and the api client reads only `lastSource` from it,
so any other conflict shows the generic failure.

The button opens the shared `ConfirmDialog` from `apps/web/src/components/common/`, naming the Source by its full label
in bold on one line, cut short with an ellipsis if it is too long for the dialog. A confirmed removal calls
`removeTopicSource(topicId, sourceId)` in `packages/client/topicClient.ts`, which sends `DELETE
/api/topics/:id/sources/:sourceId`. The route runs `removeTopicSource` in `apps/api/tool/topicSourceTools.ts` with the
`editor` origin, the same Topic Tool the chat and the MCP `remove_source` tool use, so the edit rule has one home. It
returns 204 when the Source is gone, 404 when the topic is missing or hidden or the Source is another topic's, 403 when
the user may see the topic but not edit it, and 409 with `webSearch` or `lastSource` when a rule keeps the Source. After
a removal the topic page reloads its payload, so the Source leaves the topic's Sources and its trash icon disappears.
The Scan's result keeps its row, since a result is history.

The chart takes the rule as data: an optional `sourceRemoval`, which holds a `removableSourceIds` set and an
`onRemoveSource(sourceId, label)` callback. Without `sourceRemoval`, the chart renders no trash icon and still fetches
nothing.

### 6. `SourceResultsChart`: presentational, with expansion as its only state

`apps/web/src/components/common/SourceResultsChart.tsx` takes `{ sourceResults, scannedAt, earlierKeptCount,
earlierFoundCount, initialOpenRowId?, sourceRemoval? }` in the wire shape and fetches nothing. `TopicScanRecap` renders
it after the notes block and before the footer when `sourceResults` is present and has at least one row. A tap opens a
row, a tap on another row switches to it, and a tap on the open row closes it. The module exports pure helpers that the
tests cover directly:

- `toSourceResultRows(sourceResults)` sorts a copy by kept, then read, both descending, with a failed Source after a
  Source that ran with the same counts, then by label so the order is stable. It needs no skipped filter: the api
  drops skipped results, the wire type has no skipped status, and the client's parse rejects one.
- `toSourceResultsLine({ rows, earlierKeptCount, earlierFoundCount })` returns "{kept} kept from {read} read across {n}
  source(s).", with the earlier counts in kept and read.

**Copy versus code.** Only strings a user reads say "brew": the earlier row's label and detail, and the docs page.
Identifiers, comments, story and test names, and fixtures say scan, such as `earlierKeptCount`,
`SOURCE_RESULTS_FIXTURE`, and a test named "a scan's findings from earlier scans…". This follows the domain-model skill.
The copy says "read", "cost", and "time", while code says `foundCount`, `costDollars`, and `durationMs`.

**Visual reference.** `mockup.png` in this change folder is the user's loose guide, a phone-width dark-mode render.
Follow its layout, hierarchy, and color roles. Its exact spacing and copy are not binding where this design or the
spec says otherwise. The mockup's "Carl's notes · 13 findings" box is the existing notes block, and this change leaves
it as it is.

**Header.** "Source notes" is an `<h3>` left-aligned in the body font, `text-sm font-semibold text-foreground`, not the
centered display heading and not the uppercase section label. The Scan's date sits at the right of the same line, muted
`text-xs`, as "Oct 22" from `toMonthDayLabel`, the day the scan history row shows. Under it, one muted `text-xs` line
holds the summary sentence, then the hint: "Tap a source for details." The legend sits at the end of that line: a small
rounded square swatch before "kept" and another before "read". The line wraps under the legend at phone width, and the
legend never scrolls sideways.

**Rows.** The layout is a `<ul>` with one `<li>` per row. The list reaches past the rows' own padding (`-mx-2`), so each
row's label lines up with the heading and its count with the legend's right edge, and the highlight still has its inset.
Each row's `<button aria-expanded aria-controls>` is a three-column grid, full width: `minmax(0, 9rem)` for the label
(`truncate`, in the link color `text-link` so the row reads as something to tap), `minmax(3rem, 1fr)` for the bar, and
`auto` for the count, right-aligned with `tabular-nums`. The button is rounded and takes the `bg-accent` row highlight
on hover and while open. Under the open row, its detail line is a `<div id>` on the plain popover, not inside the
highlight. The button's text reads "{label}, {kept} kept of {read} read" to a screen reader through visually hidden
text. The bars are `aria-hidden`, since the count says the same thing. A failed row's count cell reads "failed" in
`text-destructive` over an empty track. The earlier row's id is the fixed `earlier`. It is always last, reads "Earlier
brew findings" and its kept count alone, such as "4", and has an empty track. Its tooltip lists its read and kept
counts. It shows if either earlier count is above zero.

**Bar geometry and color.** Every row has a faint track spanning the whole bar column, `bg-muted`, rounded. The read
bar starts at the track's left, is `read / maxRead` of the track wide, and is `bg-separator-strong`. A row at read 0,
or a chart whose max read is 0, draws only the track. The kept fill starts at the same left edge and is
`max(6px, kept / maxRead × 100%)` of the track when kept > 0, in `bg-primary`. It measures against the same scale as
the read bar, so it sits inside it and shows how much of the read was kept. The bars are about 8px tall, all three
layers rounded. The legend's swatches use `bg-primary` and `bg-separator-strong`.

- *"Accent color" maps to Nightshift's `primary`, the highlight.* The token named `accent` is the hovered row fill, a
  beige that would read as hover, not as data. The open row uses it for exactly that.
- *Read in `separator-strong`, not a tint of the highlight.* The mockup's read bar is a muted brown that keeps the
  orange for kept alone. A tint of `primary` would make the two hard to tell apart at a glance.
- *The bars hold no information the count lacks*, so WCAG 1.4.11's 3:1 rule for required graphics doesn't apply.
  Every row prints its numbers as text that clears the 4.5:1 text rule (`muted-foreground`, `destructive`).
- *The app's tooltip, no chart library.* Hovering or focusing a row opens the orange `Tooltip` primitive, laid out by
  the shared `TooltipSection`: the full label in bold over a bulleted list of everything the detail line shows. A
  tooltip never opens on touch, so tapping the row still opens the same details below it. The bars are plain spans with
  widths, which render on the server and in any host.

`initialOpenRowId` exists so a server-rendered test and a story can show a row open. In the app the chart always
starts closed. A story's play function covers the click path.

**Detail line copy.** Each part shows only when it applies. The full label comes first in `font-semibold
text-foreground`, then the rest in muted `text-xs`:

`{full label}  read {read} · kept {kept} · cost {$} · time {t}`, then on its own line `Fell back to {mode label}` or
`Failed: {reason}`, or just `Failed` without the reason. The line wraps at phone width. The row's tooltip lists the
same parts as bullets, one per line, from `toSourceResultTooltipLines`.

Three label helpers are new in `packages/core/lib/labels.ts`:

- `toExactDurationLabel(ms)` reads to one decimal under ten seconds ("0.4s", "3.2s") and through `toDurationLabel`
  above that ("41s", "1.3 min"). The existing label floors anything under a second to "0s".
- `toExactDollarLabel(dollars)` reads "$0" for zero, three decimals under a dollar ("$0.031"), and two decimals from a
  dollar up. The footer's `toDollarLabel` would round a typical $0.004 fetch to "$0.00".
- `toMonthDayLabel(dateString)` reads a date as "Oct 22". The scan history row and the podcast episode date read
  through it too.

`toFallbackModeLabel(mode)` lives in `packages/contracts/sources.ts` beside the mode
constants the reddit and YouTube ingesters move there to import: `reddit-rss` → "Reddit's public RSS feed" and
`youtube-atom` → "YouTube's public feed". An unknown mode prints as is. The earlier row's detail reads: "Findings
already on this topic that Carl re-read this brew and kept. No source returned them this time."

### 7. Story, fixtures, and inventory

`SourceResultsChart.stories.tsx` holds these stories:

- **Mixed:** the mockup's Scan. Ten Sources, 13 kept from 349 read, the LinkedIn row open, and "Indie hacker
  milestones" failed. Add one Source that fell back so the status line shows.
- **EarlierFindings:** the Mixed Scan plus an "Earlier brew findings" row.
- **OwnerOpen:** a row open with its cost.
- **RowTooltip:** a play function that hovers a row and checks its tooltip's full label and bullets.
- **VisitorOpen:** no cost and a failed row with no reason.
- **LongLabels:** labels long enough to truncate.
- **SingleSource:** one Source that read and kept.
- **ToggleRow:** a play function that taps one row, checks `aria-expanded` and the detail, taps another, and checks
  that the first one closed.

The fixture `SOURCE_RESULTS_FIXTURE` lives in `.storybook/fixtures/topics.ts`. The `fetchScanNote` mocks in
`OwnerTopicsTable.stories.tsx` and `Card.stories.tsx` return it, so the popover stories show the chart. Its counts
match `TOPIC_SCAN_FIXTURES`. `inventoryTable.md` gains a **Bar chart** row: `SourceResultsChart` in `common/`, the one
bar chart, plain HTML on the highlight token, with no chart library, used in Dear Diary, Nightshift name `BarChart`.

## Risks / Trade-offs

- [Re-scored Findings dominate the chart after a prompt edit] → The earlier row names them and explains them in its
  detail line. The Source rows still show what each Source supplied this Scan.
- [An ingest payload from a worker before this change reaches the new `finishScan`] → `sourceResults` is optional on
  `IngestStageResult`, and a missing one writes `null`, so that Scan shows no chart instead of a wrong one.
- [Creation order changes which copy of a cross-Source duplicate survives] → The surviving copy changes at most once
  and is stable after that. Review re-reads content by url either way.
- [A Source's cost has three decimals and the footer cost has two] → They are different numbers in different places.
  The extra decimal keeps a sub-cent fetch from reading "$0.00".
- [A label snapshot goes stale when a Source is renamed] → This is intended: the result records what ran.
- [`problem_sources` and `source_results` both hold fallback and failure detail] → Both are written from the same
  outcomes in the same update, and only `source_results` is read. Whether to drop `problem_sources` is left to the
  user, per Non-Goals.

## Migration Plan

1. `bun run db:generate` writes one additive migration: `ALTER TABLE scans ADD COLUMN source_results jsonb`, nullable
   with no default, so it rewrites no rows and needs no backfill. Above the `ALTER`, add the comment and
   `SET LOCAL lock_timeout = '3s';--> statement-breakpoint` that `0109_common_jackal.sql` uses. `drizzle-kit` doesn't
   write that line. Without it, a long read on `scans` holds the `ALTER` back, and every scan read and write queues
   behind it until the 30-second statement timeout fails the deploy anyway.
2. Deploy as usual. The api and web tolerate `null` everywhere, and the worker writes results from its next closing
   write onward.
3. Rollback: the old code never reads the column. Leave it in place, or drop it with a follow-up migration.
