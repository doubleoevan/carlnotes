## ADDED Requirements

### Requirement: The digest waits for the podcast episode's outline

A Scan's email, whether a scheduled Scan's digest or a manual or first Scan's report, SHALL be held until its Scan's
Podcast Episode has a title or is known not to exist. The Scan's email workflow SHALL wait for the episode workflow to
signal that its outline is settled: the outline saved a title, the Scan renders no Podcast Episode, or the plan or the
outline failed. The wait SHALL end after ten minutes at most, and the email SHALL then be sent without waiting further,
with the episode section only if the Podcast Episode has a title by then, so a slow or lost signal never holds an email
back. The wait SHALL NOT change which subscribers the digest reaches, how its batches retry, or how its sends are
recorded.

#### Scenario: The digest goes out once the outline has a title

- **GIVEN** a scheduled Scan whose Podcast Episode's outline finishes 20 seconds after the Scan
- **WHEN** the email workflow runs
- **THEN** the digest is planned and sent after the outline finishes, not before

#### Scenario: A Scan with no Podcast Episode sends at once

- **WHEN** the episode workflow signals that the Scan renders no Podcast Episode
- **THEN** the digest is sent without waiting further

#### Scenario: A lost signal does not hold the digest

- **WHEN** ten minutes pass with no signal from the podcast episode workflow
- **THEN** the digest is sent without the podcast episode section

#### Scenario: A manual Scan's report waits too

- **GIVEN** a manual Scan whose Podcast Episode's outline finishes 20 seconds after the Scan
- **WHEN** the email workflow runs
- **THEN** the report to whoever ran the Scan is sent after the outline finishes, not before

### Requirement: The digest names the Scan's Podcast Episode and links it by id

If the Scan has a Podcast Episode with a title that has not failed, the digest SHALL show a section at its top, above
the recap and the Findings, headed "Coffee Break podcast with Carl and Vienna", then a line reading "Today's episode: "
followed by the Podcast Episode's title, linked straight to that Podcast Episode by its id. Under it the section SHALL
show the Podcast Episode's cover, 600 pixels wide, linked to the same place. The title SHALL render as plain text, since
a model wrote it. If the Scan has no Podcast Episode, or its outline failed, the digest SHALL be sent without the
section and SHALL otherwise be unchanged. A manual or first Scan's report SHALL show the same section under the same
rule. If the email shows the section and the Scan has new Findings, the email's summary line SHALL name the Podcast
Episode too, as "and a new Coffee Break episode" before the Topic's name.

#### Scenario: A Scan with a Podcast Episode shows the section

- **GIVEN** a scheduled Scan whose Podcast Episode's outline saved the title "FW25 week: reviews, stockists, and the
  Sondag backstory"
- **WHEN** its digest is sent
- **THEN** the email has a section headed "Coffee Break podcast with Carl and Vienna" with "Today's episode: FW25 week:
  reviews, stockists, and the Sondag backstory", and the title links to that Podcast Episode by its id

#### Scenario: The section shows the Podcast Episode's cover

- **WHEN** a digest with the podcast episode section is opened in an email client
- **THEN** the section shows the Podcast Episode's cover at 600 pixels wide, and the cover links to that Podcast Episode
  by its id

#### Scenario: A manual Scan's report shows the section

- **GIVEN** a manual Scan whose Podcast Episode's outline saved a title
- **WHEN** its report is sent to whoever ran the Scan
- **THEN** the report has the same section, with the title and the cover linked to that Podcast Episode by its id

#### Scenario: The summary line names the Podcast Episode

- **GIVEN** a manual Scan with 11 new Findings and a Podcast Episode whose outline saved a title
- **WHEN** its report is sent
- **THEN** the summary line reads "Carl finished the brew you started, with 11 new findings worth your time and a new
  Coffee Break episode on" and then the Topic's name

#### Scenario: A Scan with no Podcast Episode has no section

- **WHEN** a digest is sent for a Scan that renders no Podcast Episode
- **THEN** the email has no podcast episode section and is otherwise unchanged

#### Scenario: A failed outline has no section

- **WHEN** the Podcast Episode's outline fails for good
- **THEN** the digest is sent without the podcast episode section

#### Scenario: The link works before the audio exists

- **GIVEN** a digest sent while its Podcast Episode is still rendering
- **WHEN** a recipient follows the podcast episode link
- **THEN** the topic page opens that Podcast Episode, which says it is still being recorded
