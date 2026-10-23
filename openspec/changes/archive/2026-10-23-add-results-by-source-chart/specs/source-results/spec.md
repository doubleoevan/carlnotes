# Spec Delta

## Purpose

Records what each Source contributed to a Scan: how many Resources it found, how many the Scan kept, and what its
ingester cost and how long it ran. Charts those results in Dear Diary so a user can see which Sources earn their keep
and add or remove Sources.

## ADDED Requirements

### Requirement: A Scan records one result per Source

A Scan that reaches its closing write SHALL record one result for every Source the topic had when ingest read them,
skipped Sources included. Each result SHALL hold the Source's id, kind, and label as of that Scan; its status (`ok`,
`fallback`, `failed`, or `skipped`); its fallback mode or failure reason; its found count; its kept count; its cost;
and its duration. The results SHALL be written in the same update as the Scan's found and kept counts.

#### Scenario: Every Source gets a result

- **GIVEN** a topic with a web search Source, a reddit Source, and a url Source whose page has not passed its screen
- **WHEN** a Scan of the topic finishes
- **THEN** the Scan holds three results: two with status `ok` or `fallback`, and one with status `skipped`

#### Scenario: A name the ingester saved labels the first Scan

- **GIVEN** a new YouTube Source stored by channel id, whose channel name its ingester saves during the Scan
- **WHEN** that first Scan finishes
- **THEN** its result's label is the channel name, not the id

#### Scenario: A label survives the Source's removal

- **GIVEN** a finished Scan whose results include a reddit Source labeled `r/typescript`
- **WHEN** the owner removes that Source from the topic
- **THEN** the Scan's result still reads `r/typescript`

### Requirement: Each Resource is credited to the one Source whose copy survived the merge

Ingest merges Resources from different Sources by canonical url and keeps the first copy it sees. The Source that
supplied that kept copy SHALL be credited with the Resource, and no other Source SHALL be. Ingest SHALL read a topic's
Sources in creation order, oldest first, so the same Source is credited on every Scan and on a retried ingest.

#### Scenario: Two Sources return the same page

- **GIVEN** a reddit Source created before a web search Source, and both return `https://example.com/post`
- **WHEN** the Scan finishes
- **THEN** the reddit Source's found count includes that page, and the web search Source's found count does not

#### Scenario: One Source returns the same page twice

- **WHEN** an rss Source's feed lists one canonical url twice
- **THEN** that Source's found count counts the url once

### Requirement: Per-Source found counts and the earlier found count sum to the Scan's found count

A Source's found count SHALL be the number of the Scan's deduped Resources credited to it. The Scan SHALL also record an
earlier found count: the Resources of the topic's earlier Findings that review read again and no Source returned in this
Scan. The found counts across all of a Scan's results plus the earlier found count SHALL sum to the Scan's found count,
which the diary row shows as "read". A failed or skipped Source's found count SHALL be zero.

#### Scenario: Found reconciles with the Scan

- **GIVEN** three Sources returning 6, 4, and 3 Resources, two of them duplicates across Sources
- **WHEN** the Scan finishes with a found count of 11 and reads no earlier Finding again
- **THEN** the three results' found counts sum to 11

#### Scenario: Earlier Findings read again count as read

- **GIVEN** Sources that return 10 Resources, and a topic holding 30 Findings whose prompt the owner just edited
- **WHEN** review reads the 30 Findings again, none of whose pages a Source returned
- **THEN** the Scan's found count is 40, the results' found counts sum to 10, and the earlier found count is 30

### Requirement: Per-Source kept and the earlier count sum to the Scan's kept count

A Source's kept count SHALL be the number of the Scan's kept Findings whose Resource it was credited with. The Scan
SHALL also record an earlier count: its kept Findings from earlier Scans whose Resource no Source returned in this
Scan, which review re-scored. Per-Source kept plus the earlier count SHALL equal the Scan's kept count.

#### Scenario: Kept reconciles without Findings from earlier Scans

- **GIVEN** a Scan that keeps 5 Findings, all from Resources its Sources returned
- **WHEN** the Scan finishes
- **THEN** the results' kept counts sum to 5 and the earlier count is 0

#### Scenario: Re-scored Findings count as earlier

- **GIVEN** a topic holding 30 Findings whose prompt the owner just edited
- **WHEN** the next Scan finds 10 Resources, keeps 5 of them, and re-scores and keeps the 30 Findings no Source returned
- **THEN** the Scan's kept count is 35, the results' kept counts sum to 5, the earlier count is 30, and the Scan's found
  count is 40

#### Scenario: A Source never keeps more than it found

- **WHEN** any Scan finishes
- **THEN** every result's kept count is at most its found count

### Requirement: A result's status names only a real problem

A result's status SHALL be `fallback` only when the Source's ingester reported a fallback mode, `failed` when its
ingester threw, with the bounded reason, and `skipped` when the Source was not run. A Source whose ingester ran its
primary path SHALL be `ok`, including one that found nothing.

#### Scenario: A Source that found nothing ran normally

- **WHEN** an rss Source's feed has no entries and its ingester returns no Resources and no fallback mode
- **THEN** its result has status `ok` and a found count of 0

#### Scenario: A Source that fell back records its mode

- **WHEN** a reddit Source is served by the keyless feeds
- **THEN** its result has status `fallback` and fallback mode `reddit-rss`

### Requirement: A result's cost and duration are its ingester's own

A result's cost SHALL be the dollars that Source's own ingester reported, with no share of review or scoring. A failed
or skipped Source's cost SHALL be zero. Its duration SHALL be the wall-clock time its ingester ran, to the
millisecond, whether it succeeded or failed. A skipped Source's duration SHALL be zero.

#### Scenario: Cost excludes scoring

- **GIVEN** a Scan whose web search Source reported $0.03 and whose review spent $0.40
- **WHEN** the Scan finishes
- **THEN** the web search result's cost is $0.03

#### Scenario: A failed Source keeps its duration

- **WHEN** a Source's ingester throws after running 2.4 seconds
- **THEN** its result has status `failed`, a cost of zero, and a duration of 2,400 ms

### Requirement: A Scan with no closing write has no results

A Scan SHALL have no results unless it reached its closing write: a Scan saved before results were recorded, a running
Scan, a stopped Scan, and a Scan whose workflow failed have none. A Scan whose ingest stage came from a worker that
recorded no results SHALL also have none. No Scan SHALL be backfilled.

#### Scenario: A stopped Scan has no results

- **WHEN** a user stops a Scan during review
- **THEN** the Scan saves with no results

#### Scenario: An older Scan has no results

- **WHEN** a Scan saved before this change is read
- **THEN** it has no results

### Requirement: The scan note returns the results to anyone who may read it

The scan note read SHALL return the Scan's results and earlier count with its summary, or none for a Scan that has
none. It SHALL leave out skipped results, since a skipped Source may be a url not yet screened, which non-owners never
see. Cost and failure reason SHALL go only to the topic's owner and platform admins. The api SHALL withhold both from
everyone else instead of relying on the ui to hide them.

#### Scenario: Skipped results never leave the api

- **GIVEN** a finished Scan whose results include a url Source skipped while its page awaited screening
- **WHEN** anyone reads the Scan's note
- **THEN** the response holds no result for that Source

#### Scenario: A visitor sees a url Source by its host

- **GIVEN** a finished Scan whose results include a url Source labeled `https://example.com/report?token=abc`
- **WHEN** a signed-out visitor reads the note of that Scan on a public topic
- **THEN** that result's label is `example.com`, and the owner reading the same note gets the full url

#### Scenario: A malformed stored value shows no chart

- **WHEN** a Scan's stored results do not match the stored shape
- **THEN** the note returns no results and still returns the Scan's summary

#### Scenario: The owner receives costs and reasons

- **WHEN** the topic's owner reads a finished Scan's note
- **THEN** each result includes its cost, and a failed result includes its reason

#### Scenario: A visitor never receives costs or reasons

- **WHEN** a signed-out visitor reads the note of a Scan on a public topic
- **THEN** each result's cost is absent, a failed result has no reason, and the found counts, kept counts, labels,
  statuses, fallback modes, and durations are present

### Requirement: Dear Diary shows a Source notes chart

Dear Diary SHALL show a Source notes chart for a Scan with results: the heading "Source notes" with the Scan's date
on its right, such as "Oct 22", then the line "{kept} kept from {found} read across {n} sources." and the hint "Tap a
source for details." {kept} and
{found} SHALL be the sums of the chart's rows, which equal the Scan's kept and found counts. {n} SHALL count the Source
rows shown. A Scan with no results SHALL show no chart.

#### Scenario: The summary line matches the diary row

- **GIVEN** a Scan whose diary row reads "read 12 · kept 4" with four Sources that ran
- **WHEN** a user opens its Dear Diary
- **THEN** the chart's line begins "4 kept from 12 read across 4 sources."

#### Scenario: The heading shows the Scan's date

- **GIVEN** a Scan that finished on October 22
- **WHEN** a user opens its Dear Diary
- **THEN** the chart's heading reads "Source notes" with "Oct 22" on its right

#### Scenario: An older Scan shows no chart

- **WHEN** a user opens Dear Diary for a Scan with no results
- **THEN** no Source notes heading or rows render

### Requirement: Each Source row shows its label, a bar, and kept over found

Each Source row SHALL show the label, a bar, then "{kept} / {found}". The bar's length SHALL be the row's found count
relative to the row that found the most. Kept SHALL fill from the bar's left in the highlight color, at a small
minimum width when kept is above zero. The label SHALL show in the link color, so the row reads as something to tap. A
long label SHALL truncate with an ellipsis. Hovering or focusing a row SHALL open the app's tooltip with the full label
in bold over a bulleted list of every detail the row opens to.

#### Scenario: The Source that found the most spans the track

- **GIVEN** Sources that found 20 and 5
- **WHEN** the chart renders
- **THEN** the first bar spans the full track and the second spans a quarter of it

#### Scenario: One kept Finding stays visible

- **GIVEN** a Source that found 200 and kept 1 beside a Source that found 200
- **WHEN** the chart renders
- **THEN** that Source's kept fill shows at the minimum width instead of a sliver

### Requirement: Rows sort by kept, then found, and skipped Sources are left out

Source rows SHALL sort by kept, then found, both descending, and a failed Source SHALL follow every Source that ran
with the same counts. Every Source whose status is not `skipped` SHALL get a row, including one that found nothing and
one that failed. A skipped Source SHALL get no row and SHALL not count in {n}.

#### Scenario: Sorting breaks a tie on found

- **GIVEN** Sources with kept and found of 2/10, 3/4, and 2/12
- **WHEN** the chart renders
- **THEN** the rows read 3/4, then 2/12, then 2/10

#### Scenario: A failed Source sorts after one that found nothing

- **GIVEN** a failed Source and a Source that ran and found nothing
- **WHEN** the chart renders
- **THEN** the Source that found nothing comes first and the failed Source is the last Source row

#### Scenario: A skipped Source is left out

- **GIVEN** a Scan with three Sources that ran and one that was skipped
- **WHEN** the chart renders
- **THEN** three Source rows show and the line says "across 3 sources"

### Requirement: A failed Source shows failed instead of a count

A failed Source's row SHALL show "failed" in place of the count, in the error color, with no bar on its empty track.

#### Scenario: A failed row has no bar

- **WHEN** a Source's result has status `failed`
- **THEN** its row shows its label, an empty track, and "failed", and no found or kept bar

### Requirement: Findings from earlier Scans show as an "Earlier brew findings" row

When the earlier count or the earlier found count is above zero, the chart SHALL show an "Earlier brew findings" row
after every Source row. It SHALL show "{earlier}" alone with no bar, its tooltip SHALL list the earlier found count as
"read" and the earlier count as "kept", and its detail line SHALL explain that these Findings were already on the topic
and Carl kept them on a re-read. The earlier count SHALL add to the summary line's {kept}, the earlier found count to
its {found}, and neither SHALL count in {n}.

#### Scenario: The earlier row closes the gap

- **GIVEN** a Scan with kept count 35 whose Sources kept 5 of 10 read, whose earlier count is 30, and whose earlier
  found count is 40
- **WHEN** the chart renders
- **THEN** the last row reads "Earlier brew findings" with "30", and the line begins "35 kept from 50 read across 4
  sources."

### Requirement: Tapping a row expands its detail line

Each row SHALL be a button. Tapping it SHALL open a detail line with the full name, found count shown as "read", kept,
the duration as "time", and for the owner or an admin the cost as "cost". A fallback row SHALL add "Fell back
to {mode}" and a failed row "Failed", with its reason for the owner or an admin. An `ok` row shows no status. One row
opens at a time.

#### Scenario: A normal row shows no status

- **WHEN** a user taps a row whose status is `ok`
- **THEN** the detail line shows the name, read, kept, cost, and time, and no status text

#### Scenario: A fallback row names its mode

- **WHEN** a user taps the row of a reddit Source with fallback mode `reddit-rss`
- **THEN** the detail line includes "Fell back to" and names the keyless reddit feed

#### Scenario: Opening one row closes another

- **GIVEN** a chart with one row open
- **WHEN** the user taps a second row
- **THEN** the second row's detail shows, the first row's closes, only the second button reports `aria-expanded="true"`,
  and tapping the second row again closes it

#### Scenario: A visitor sees no cost

- **WHEN** a user or visitor who is neither the owner nor an admin opens a row's detail
- **THEN** the detail line shows the time and no cost

### Requirement: An editor removes a current Source from its row

On the topic page, a user who may edit the topic SHALL see a "Remove source" trash icon button in an open row's detail
line, for a result whose Source the topic still has, matched by the Source's id, other than its web search. The button
SHALL open a confirmation dialog naming the Source in bold, and a confirmed removal SHALL delete the Source through the
same edit rule the chat and the MCP server use. A user who may not edit the topic, a visitor, the earlier row, and a row
whose Source the topic no longer has SHALL show no trash icon. A removal SHALL leave every Scan's stored result as it
was.

#### Scenario: The owner removes a Source after confirming

- **GIVEN** the owner opens a Scan's chart on the topic page and opens the row of a Source the topic still has
- **WHEN** the owner taps the trash icon and confirms
- **THEN** the Source is removed from the topic, and the Scan's row still shows its result

#### Scenario: A member of the owning team removes a Source

- **WHEN** an active member of the team that owns the topic opens a current Source's row
- **THEN** the detail line shows the trash icon, and a confirmed removal deletes the Source

#### Scenario: Canceling keeps the Source

- **WHEN** an editor taps the trash icon and cancels the dialog
- **THEN** the Source stays on the topic and nothing is sent

#### Scenario: Web search has no trash icon

- **WHEN** an editor opens the row of the topic's web search
- **THEN** the detail line shows no trash icon

#### Scenario: The last source shows the topic editor's toast

- **GIVEN** a topic with one Source
- **WHEN** an editor taps that Source's trash icon
- **THEN** the editor's toast says to keep at least one source, and no dialog opens

#### Scenario: A removed Source's row has no trash icon

- **GIVEN** a past Scan whose results name a Source the owner has since removed
- **WHEN** the owner opens that row
- **THEN** the detail line shows no trash icon

#### Scenario: A non-editor sees no trash icon

- **WHEN** a signed-in user who may not edit the topic, or a visitor, opens any row
- **THEN** the detail line shows no trash icon, and the remove route returns 403 or 404 to that user

### Requirement: The note's read starts before the popover opens

The scan note SHALL load when a user opens the Scan's ⓘ, not with the topic page. Its read SHALL start when the pointer
enters the ⓘ, when the ⓘ takes focus, or on a touch start, and an open SHALL reuse a read already started.

#### Scenario: A hover then a click sends one read

- **WHEN** a user moves the pointer onto a Scan's ⓘ and then clicks it
- **THEN** one note request is sent, and the popover shows the chart when that request finishes

### Requirement: The chart is plain HTML on Nightshift tokens

The chart SHALL be built from HTML and CSS on Nightshift color tokens, with no chart library, and its row tooltip SHALL
be the app's tooltip. A legend SHALL name kept and read with swatches matching the bar fills. It SHALL read in light and
dark mode and at phone width with no horizontal scroll. It SHALL be a shared component with a story whose accessibility
checks pass, listed in the Nightshift inventory.

#### Scenario: The chart reads at phone width

- **WHEN** Dear Diary opens on a 360px-wide viewport
- **THEN** every row fits its width, long labels truncate, and the panel has no horizontal scroll

#### Scenario: The story passes its accessibility checks

- **WHEN** the component browser builds and its accessibility addon checks the chart's stories in light and dark
- **THEN** no check fails at error level
