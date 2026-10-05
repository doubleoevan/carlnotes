## MODIFIED Requirements

### Requirement: A chapter's thumbs rate its Finding, or the chapter once its Finding is filtered out

Each chapter in the player SHALL offer thumbs to a user who may rate the Topic's Findings, on a screen at least as wide
as the `sm` breakpoint. On a narrower screen the chapter rows SHALL show no thumbs, so the titles have the row's width,
and a chapter's Finding is rated from the note that its row opens. If the Topic still has the
chapter's Finding, the thumbs SHALL write the same rating as that Finding's thumbs in the feed, through the same route
and the same permission. If a Scan filtered the Finding out, the thumbs SHALL write a rating on the chapter itself under
the same permission. A later Finding of the chapter's Resource on the same Topic SHALL take the newest chapter rating,
and the chapter SHALL then narrate that Finding. A user who may not rate the Topic's Findings SHALL see no chapter
thumbs.

#### Scenario: A chapter thumb rates the Finding

- **WHEN** an owner gives chapter 2 a thumbs up
- **THEN** the Finding that chapter narrates shows a thumbs up in the findings list

#### Scenario: A chapter whose Finding was filtered out keeps its rating

- **GIVEN** a chapter whose Finding a Scan filtered out
- **WHEN** an owner gives the chapter a thumbs down, and a later Scan finds the chapter's Resource again
- **THEN** the chapter shows the thumbs down after a reload, and the new Finding is rated thumbs down, so no Podcast
  Episode narrates it

#### Scenario: A visitor sees no thumbs

- **WHEN** a signed-out visitor opens a public Topic's player
- **THEN** its chapters show no thumbs

#### Scenario: A phone shows no chapter thumbs

- **WHEN** an owner opens the player on a phone
- **THEN** its chapters show no thumbs, and a chapter's row opens its Finding's note, which has the Finding's thumbs
