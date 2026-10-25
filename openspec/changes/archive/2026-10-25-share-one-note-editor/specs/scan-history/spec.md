## MODIFIED Requirements

### Requirement: The topic page lists Scan history five to a page

A `▾ Brew diary` accordion (default expanded) SHALL list the Topic's Scans newest first, five to a page, with a centered
row of page numbers under the card if the Topic has more than five Scans. The row SHALL be the same row of page numbers
that a homepage section and the podcast episodes card show, and a browser without JavaScript SHALL not show it. Each row
SHALL show the finish timestamp ("Jul 15 · 6:02 am"), a muted one-line stat ("read {foundCount} · kept {keptCount}" for
succeeded Scans, the status for running or failed ones), and a right-aligned ⓘ. The ⓘ popover SHALL show Carl's full
scan summary, then the Source footnotes chart when the Scan has per-Source results, then how long the Scan took
("{duration} taken"), appending the cost in cents from the Scan's stored spend only if the user owns the Topic or holds
the platform admin role. The api SHALL withhold the cost value from everyone else instead of relying on the ui to hide
it. The Activity page's scan recap popover SHALL show the same chart in the same place.

#### Scenario: History shows five Scans to a page

- **WHEN** a Topic has twelve Scans
- **THEN** the newest five rows show, and the row under the card shows pages 1, 2, and 3 with 1 highlighted

#### Scenario: A page number opens its page

- **GIVEN** a Topic with twelve Scans showing its first page
- **WHEN** a user presses 3
- **THEN** the card shows the two oldest Scans, and 3 is highlighted

#### Scenario: A history of five or fewer has no page numbers

- **WHEN** a Topic has four Scans
- **THEN** all four rows show and no row of page numbers

#### Scenario: An admin sees the scan cost

- **WHEN** a platform admin opens a succeeded Scan's ⓘ
- **THEN** the popover shows the full summary, how long the Scan took, and the cost in cents

#### Scenario: The owner sees the scan cost

- **WHEN** the Topic's owner opens a succeeded Scan's ⓘ
- **THEN** the payload includes the cost and the popover shows it, since spend on their own Topic is theirs to see

#### Scenario: A non-owner non-admin never receives the cost

- **WHEN** a signed-in non-owner who is not an admin loads the topic page and opens a Scan's ⓘ
- **THEN** the payload has no cost value and the popover shows the summary and how long the Scan took, but no cost

#### Scenario: The chart sits between the notes and the footer

- **WHEN** a user opens the ⓘ of a Scan that has per-Source results
- **THEN** the popover shows Carl's notes and the Scan's findings, then the Source footnotes chart, then the time and
  cost footer, and the history row itself is unchanged

#### Scenario: A Scan with no results keeps the popover as it was

- **WHEN** a user opens the ⓘ of a Scan saved before per-Source results were recorded
- **THEN** the popover shows the notes and the footer with no chart between them
