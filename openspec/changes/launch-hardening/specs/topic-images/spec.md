## ADDED Requirements

### Requirement: A drawn image is stored before its sizes are derived

The image model's bytes SHALL be stored under a key of their own before the sizes are derived and uploaded. A retry
SHALL read the stored bytes, SHALL make no second image call, and SHALL add no second cost. This SHALL hold for a
Topic's image, a Podcast Episode's image, and a film's own image. The stored bytes SHALL be deleted once the image is
current, and once the render fails for good.

#### Scenario: A retry after a failed upload draws nothing

- **GIVEN** a render whose image was drawn and stored before the upload of a derived file failed
- **WHEN** the render is attempted again
- **THEN** it derives the sizes from the stored bytes, makes no image call, and its cost is one image

#### Scenario: The stored bytes go once the image is current

- **WHEN** a render succeeds and the Topic shows its new image
- **THEN** the model's stored bytes are deleted, and the original and its six derived files are the objects left

## MODIFIED Requirements

### Requirement: Every render is recorded with its cost

Every image render, on create, Regenerate, an admin's Regenerate, or the backfill, SHALL write one render row holding
its kind, its model, its status, its cost at the model's fixed per-image rate, and the scene. A render whose workflow
cannot start SHALL delete its row, so it leaves no pending row and counts as no regeneration. The monthly spend sum
SHALL include the user's render costs.

#### Scenario: A render charges the owner

- **WHEN** a create render succeeds
- **THEN** the owner's monthly spend rises by the model's per-image rate

#### Scenario: The backfill charges nobody

- **WHEN** the backfill renders a Topic
- **THEN** its render row names no user and no user's monthly spend changes

#### Scenario: A render that cannot start leaves no row

- **WHEN** an editor's Regenerate writes its render row and the workflow's start fails
- **THEN** the row is deleted, the request fails, and the editor's count of regenerations this month is unchanged
