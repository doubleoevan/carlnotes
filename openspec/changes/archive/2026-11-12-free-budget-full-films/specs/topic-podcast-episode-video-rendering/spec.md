## ADDED Requirements

### Requirement: A recorded Podcast Episode's film renders in full and bills its owner

A film's first render SHALL start for every Podcast Episode that publishes, whatever its owner's monthly spend. The
Podcast Episodes cutoff is checked when the Podcast Episode is planned. The render and each rebuild SHALL add their
cost to the monthly spend of the user that the Podcast Episode bills. A rebuild for a new image SHALL NOT start once
that user has passed the spend cutoff that stops new Podcast Episodes, and the film that plays now SHALL stay.

#### Scenario: A film renders past the spend cutoff

- **GIVEN** an owner whose Podcast Episode's own cost took them past the podcast episode spend cutoff
- **WHEN** the Podcast Episode publishes
- **THEN** its film renders in full, and the render's cost counts in that owner's monthly spend

#### Scenario: A rebuild past the spend cutoff keeps the film

- **GIVEN** a ready film and an owner past the podcast episode spend cutoff
- **WHEN** an editor regenerates the film's image
- **THEN** no rebuild starts, and the film that plays now stays

## MODIFIED Requirements

### Requirement: A failed image draw never fails the film

Until the film's own image is drawn, and if the draw fails, the film's intro, sign-off, and poster SHALL show the image
that the Podcast Episode shows, its own or its Topic's. A failed draw SHALL be reported and SHALL NOT fail the film's
render. A film left without its own image SHALL get one from an editor's regeneration or upload.

#### Scenario: A rejected draw leaves the podcast episode image

- **WHEN** the image model rejects the film's image
- **THEN** the film renders with the podcast episode image in its intro and sign-off, and the failure is reported

#### Scenario: A spent budget still renders the film

- **GIVEN** an owner whose model budget is spent
- **WHEN** their Podcast Episode's film renders
- **THEN** the film renders with the podcast episode image, and no image cost is added

### Requirement: An imagined image bills like the film and never blocks it

A draw SHALL bill the Topic owner's key and add its cost to the film's cost, and the backfill's draws SHALL bill the
platform. A draw SHALL NOT check the owner's spend cutoff. If the owner's budget is spent, a draw fails, or a drawn
image does not pass the image moderation, the chapter SHALL go on with the images it has, and the render SHALL go on. A
render that is stopped SHALL start no further draw. A generated image SHALL be stored in the film's folder. A render's
second attempt and a re-render SHALL reuse a stored image, and it SHALL be deleted with the film.

#### Scenario: A draw is billed to the owner

- **WHEN** a film renders for a Topic owner's Podcast Episode and draws two generated images
- **THEN** both draws run on the owner's key, and the film's cost includes both

#### Scenario: A spent budget leaves the podcast card

- **GIVEN** an owner whose model budget is spent
- **WHEN** their Podcast Episode's film renders
- **THEN** each chapter with no Resource Image shows the podcast card and the image the intro shows in turn, and the
  film renders

#### Scenario: A failed draw never fails the film

- **WHEN** the image model rejects one of a chapter's generated images
- **THEN** that chapter shows its other images, the failure is reported, and the film renders

#### Scenario: A second attempt reuses the stored image

- **GIVEN** a render whose first attempt drew and stored a chapter's generated image and then failed
- **WHEN** the render's second attempt runs
- **THEN** it shows the stored image and makes no image call for that chapter

#### Scenario: The backfill bills the platform

- **WHEN** the backfill renders a film with a long chapter that lacks images
- **THEN** the generated images are drawn on the platform's key, and the film's cost does not rise

#### Scenario: An owner past the spend cutoff gets every generated image

- **GIVEN** an owner who passed the podcast episode spend cutoff while their Podcast Episode recorded
- **WHEN** its film renders with chapters that lack images
- **THEN** every generated image the chapters need is drawn on the owner's key, and the film's cost includes them

## REMOVED Requirements

### Requirement: A render counts against the Topic owner's plan

**Reason**: A first render no longer checks the owner's spend cutoff, so a recorded Podcast Episode always gets its
whole film. Billing and the rebuild's check move to "A recorded Podcast Episode's film renders in full and bills its
owner".

**Migration**: None. A film row already marked failed for the spend cutoff stays failed, and the backfill still leaves
it out.
