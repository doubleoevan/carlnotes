## RENAMED Requirements

- FROM: `### Requirement: Dropping a pin asks first`
- TO: `### Requirement: Removing a featured item asks first`

- FROM: `### Requirement: A pin change purges the home page`
- TO: `### Requirement: A featured order change purges the home page`

## REMOVED Requirements

### Requirement: A Podcast Episode holds a feature order too

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "A Podcast Episode can be featured on the home too"

### Requirement: The Rank dialog's Save is always available

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "The Rank dialog can always save"

## MODIFIED Requirements

### Requirement: Removing a featured item asks first

The X on a featured Topic's or Podcast Episode's row in a Rank dialog SHALL first ask the admin to confirm, naming the
row. Confirming SHALL clear that row's home order at once and keep the dialog open without the row. Cancelling SHALL
send nothing. The X on the page's own row that is not featured yet SHALL drop it without asking.

#### Scenario: An admin cancels a drop

- **WHEN** an admin presses the X on a featured row and cancels the confirmation
- **THEN** no home order changes and the row stays in the Rank dialog

#### Scenario: An admin confirms a drop

- **WHEN** an admin presses the X on a featured row and confirms
- **THEN** that row's home order clears, the rows below it move up, and the dialog stays open without the row

### Requirement: A featured order change purges the home page

Setting, moving, or clearing a feature order SHALL clear the home card ids' cache entry and purge the home page's
edge cache tag.

#### Scenario: The edge serves the new featured topics

- **WHEN** an admin features a Topic and a visitor loads `/`
- **THEN** the served page shows the featured Topic first

## ADDED Requirements

### Requirement: A Podcast Episode can be featured on the home too

A published Podcast Episode of a public Topic SHALL be able to hold a feature order, set by an admin from the episode
page's Rank dialog with the Topic dialog's rules: contiguous from one, one holder per position, moved rather than
copied, released when the Podcast Episode is removed or its Topic leaves the public set.

#### Scenario: An admin features an episode

- **WHEN** an admin gives a Podcast Episode position one
- **THEN** it leads the home's featured Podcast Episode cards on the next refresh

### Requirement: The Rank dialog can always save

The Rank dialog's Save SHALL be enabled whenever no save is under way, whether or not a row moved. Save SHALL send the
order as the dialog shows it, so a page's Topic or Podcast Episode that is not featured yet is featured at the position
its row holds, the first featured item of all included. Saving an unchanged order SHALL change nothing.

#### Scenario: The first featured item saves

- **WHEN** an admin opens the Rank dialog on a Podcast Episode while no Podcast Episode is featured, and presses Save
- **THEN** that Podcast Episode holds position one

#### Scenario: A new row saves at the end without a move

- **WHEN** an admin opens the Rank dialog on a Topic that is not featured, beside three featured Topics, and presses
  Save
- **THEN** the Topic holds position four and the other three keep their positions

#### Scenario: An unchanged order saves as it is

- **WHEN** an admin opens the Rank dialog on a featured Topic and presses Save without moving a row
- **THEN** every position is unchanged and the dialog closes
