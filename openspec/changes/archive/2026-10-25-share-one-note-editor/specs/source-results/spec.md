## MODIFIED Requirements

### Requirement: Dear Diary shows a Source notes chart

Dear Diary SHALL show a Source footnotes chart for a Scan with results: the heading "Source footnotes" with the Scan's
date on its right, such as "Oct 22", then the line "{kept} kept from {found} read across {n} sources." and the hint
"Tap a source for details." {kept} and {found} SHALL be the sums of the chart's rows, which equal the Scan's kept and
found counts. {n} SHALL count the Source rows shown. A Scan with no results SHALL show no chart.

#### Scenario: The summary line matches the diary row

- **GIVEN** a Scan whose diary row reads "read 12 · kept 4" with four Sources that ran
- **WHEN** a user opens its Dear Diary
- **THEN** the chart's line begins "4 kept from 12 read across 4 sources."

#### Scenario: The heading shows the Scan's date

- **GIVEN** a Scan that finished on October 22
- **WHEN** a user opens its Dear Diary
- **THEN** the chart's heading reads "Source footnotes" with "Oct 22" on its right

#### Scenario: An older Scan shows no chart

- **WHEN** a user opens Dear Diary for a Scan with no results
- **THEN** no Source footnotes heading or rows render
