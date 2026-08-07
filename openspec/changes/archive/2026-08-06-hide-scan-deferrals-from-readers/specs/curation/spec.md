## MODIFIED Requirements

### Requirement: The Scan records per-stage cost and curation counts

On close, curation SHALL record each stage's dollar cost in `scans.stage_costs` (keyed at least by ingestion, embedding, fetch, cheap scoring, and premium scoring) and set `scans.cost` to the Scan Budget's total, which already includes ingestion because ingestion charges into the same Budget. `scans.cost` SHALL NOT be composed by summing a separately tracked ingestion number with a review total. It SHALL set `kept_count` to the number of Findings written and `filtered_count` to the number of Resources dropped by hash dedupe, embedding dedupe, the embed-filter, or the content scanner, and SHALL write the scan report to `scans.scan_summary`. It SHALL also record the fetch-outcome counts to `scans.reused`, `scans.revalidated`, and `scans.fetched` — the number of Resources whose content was reused within the TTL, revalidated via a `304`, or freshly fetched — whose sum equals the number of Resources sent through the paid fetch-and-scoring section.

The scan report SHALL be a dated note grounded only in the Scan's actual data — the kept Findings' titles, urls, scores, and relevance explanations; drop and failure counts with their causes; per-Source outcomes including fallback modes; and costs. It SHALL cover, when the data supports each: a dated headline; insights and trends drawn across the kept items' relevance explanations; adds and drops with reasoning; sources consulted and skipped with reasoning; data-hygiene actions taken; list and threshold status against a target the topic context itself states; a closing notification decision (send or suppress) with rationale; and a cited-sources list of markdown links to the kept items using their exact stored urls. Because the report renders through a sanitized markdown subset whose links are allowlisted to the kept Findings' urls, the prompt MAY ask for light formatting and for links to the kept items, but SHALL instruct that any other link, image, or HTML renders as inert text. A Scan with nothing to review MAY leave `scan_summary` empty, and a Scan whose report call failed SHALL leave it empty rather than failing.

The Scan's own ceilings SHALL NOT reach the report. The deferral count — Resources held back by the per-Scan dollar cap or the scored-resource cap — SHALL NOT be given to the report, because those ceilings are configuration the reader has no setting for, so naming them explains a mechanism rather than telling the reader what was found. The count SHALL still be tracked for the worker, since a candidate can be deferred before embedding as well as before scoring and only the latter is visible in stage telemetry.

#### Scenario: Per-stage costs are recorded and the total is the Budget's

- **WHEN** a Scan completes curation
- **THEN** `stage_costs` holds each stage's dollar cost including the ingestion bucket, and `cost` is the Scan Budget's own total rather than a separately summed figure

#### Scenario: Kept and filtered counts are recorded

- **WHEN** curation finishes
- **THEN** `kept_count` equals the number of Findings written and `filtered_count` equals the number of Resources dropped by dedupe, the embed-filter, or the scanner

#### Scenario: Fetch-outcome counts are recorded

- **WHEN** curation finishes
- **THEN** `scans.reused`, `scans.revalidated`, and `scans.fetched` hold the per-outcome tallies and their sum equals the number of Resources sent through the paid fetch-and-scoring section

#### Scenario: The scan report is written, grounded, and cites only kept items

- **WHEN** curation finishes reviewing at least one Resource and the report call succeeds
- **THEN** `scan_summary` holds a non-empty dated report that cites only items, sources, and numbers from the Scan's data, linking kept items by their exact stored urls and linking nowhere else

#### Scenario: A failed report leaves the summary empty without failing the Scan

- **WHEN** the scan-report call throws
- **THEN** `scan_summary` is empty, the failure is logged, and the Scan still records its costs, counts, and Findings as `succeeded`

#### Scenario: The report records a notification decision

- **WHEN** the scan report is written
- **THEN** its body ends with an explicit send-or-suppress notification recommendation and the rationale, and no notification is actually dispatched by curation

#### Scenario: A Scan that deferred candidates says nothing about it

- **GIVEN** a Scan that held candidates back against its dollar cap or its scored-resource cap
- **WHEN** its report is written
- **THEN** neither the deferral count nor the ceiling that caused it appears in the report, and the report still says plainly that nothing was worth keeping when nothing was

#### Scenario: The deferral count is still tracked

- **WHEN** a candidate is deferred before embedding, or before scoring
- **THEN** the Scan's review outcome counts it, even though no reader is told
