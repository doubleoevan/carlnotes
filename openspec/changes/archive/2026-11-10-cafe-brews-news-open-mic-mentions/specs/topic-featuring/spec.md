# Spec Delta

## ADDED Requirements

### Requirement: The Rank dialog's Save is always available

The Rank dialog's Save SHALL be enabled whenever no save is under way, whether or not a row moved. Save SHALL send
the order as the dialog shows it, so a page's Topic or Podcast Episode that is not pinned yet is pinned at the position
its row holds, the first pin of all included. Saving an unchanged order SHALL change nothing.

#### Scenario: The first pin saves

- **WHEN** an admin opens the Rank dialog on a Podcast Episode while no Podcast Episode is pinned, and presses Save
- **THEN** that Podcast Episode holds position one

#### Scenario: A new row saves at the end without a move

- **WHEN** an admin opens the Rank dialog on a Topic that is not pinned, beside three pinned Topics, and presses Save
- **THEN** the Topic holds position four and the other three keep their positions

#### Scenario: An unchanged order saves as it is

- **WHEN** an admin opens the Rank dialog on a pinned Topic and presses Save without moving a row
- **THEN** every position is unchanged and the dialog closes
