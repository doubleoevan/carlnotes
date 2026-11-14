## MODIFIED Requirements

### Requirement: An admin removes a reported Comment

Remove in the Reports view SHALL delete a reported Comment for everyone, through the delete its Topic's owner uses,
and SHALL close the report as removed. A report of a Finding SHALL offer Clear and Block and no Remove. A report of a
Podcast Episode SHALL offer Clear and Block, and Regenerate for the Podcast Episode's image in Remove's place.

#### Scenario: An admin removes a reported Comment

- **WHEN** an admin chooses Remove on a reported Comment
- **THEN** the Comment is deleted for everyone and the report closes as removed

#### Scenario: A Finding's report offers no Remove

- **WHEN** an admin opens a report of a Finding
- **THEN** it offers Clear and Block alone

## ADDED Requirements

### Requirement: An admin resets a reported avatar

The Reports view SHALL show the avatar on a `profile` report whose user has an uploaded avatar or a published
provider photo, and SHALL offer Reset avatar in Remove's place beside Clear and Block. Reset avatar SHALL return the
user to the generated avatar, delete a stored upload and an unchecked one, purge the avatar's edge tag, and resolve the
report as removed. A `team` report SHALL offer the same for a team's uploaded avatar. Block SHALL leave the avatar as
it is.

#### Scenario: An admin resets a reported upload

- **WHEN** an admin presses Reset avatar on a `profile` report of a user with an uploaded avatar
- **THEN** the user's avatar resolves to the initials, the stored upload is scheduled for deletion, one purge names
  `user-avatar:<userId>`, and the report resolves as removed

#### Scenario: A provider photo is reset

- **WHEN** an admin presses Reset avatar on a `profile` report of a user on an opted-in provider photo
- **THEN** the user's avatar source is the generated avatar, and the profile shows the initials

#### Scenario: A profile on the initials offers no reset

- **WHEN** an admin opens a `profile` report of a user on the generated avatar
- **THEN** the report offers Clear and Block alone

#### Scenario: A reset clears an unchecked avatar

- **GIVEN** a reported user whose newest avatar upload is unchecked
- **WHEN** an admin presses Reset avatar
- **THEN** the unchecked upload is deleted too, and the user's own pages show the initials

#### Scenario: A team's reported avatar is reset

- **WHEN** an admin presses Reset avatar on a `team` report of a team with an uploaded avatar
- **THEN** the team has no avatar, one purge names `team-avatar:<teamId>`, and the report resolves as removed

#### Scenario: A report from a released build gets the action

- **WHEN** a `profile` report sent by a released mobile build or by the MCP `report_content` tool is opened
- **THEN** it offers Reset avatar as any other `profile` report does

#### Scenario: Block leaves the avatar

- **WHEN** an admin chooses Block on a `profile` report
- **THEN** the user is under an admin block, the report closes as blocked, and the avatar is unchanged

### Requirement: An admin regenerates a reported Podcast Episode's image

The Reports view SHALL show the Podcast Episode's image on a `podcastEpisode` report and SHALL offer Regenerate
beside Clear and Block. Regenerate SHALL drop an uploaded image, draw a fresh one on the platform key as it does for
a Topic's image, and resolve the report as removed. A film's uploaded image SHALL get the same action on that report,
and an image the house style drew for a film stays. Block SHALL leave both images as they are.

#### Scenario: An admin regenerates a reported upload

- **WHEN** an admin presses Regenerate on a `podcastEpisode` report whose Podcast Episode has an uploaded image
- **THEN** the upload is dropped and scheduled for deletion, a render starts on the platform key that bills no user,
  and the report resolves as removed

#### Scenario: A card shows the Topic's image until the new one is drawn

- **WHEN** a visitor opens a card of that Podcast Episode before the render finishes
- **THEN** the card shows the Topic's image

#### Scenario: A film's image is regenerated from the same report

- **WHEN** an admin regenerates the film's image on a `podcastEpisode` report whose film has an uploaded image
- **THEN** the film's upload is dropped, a fresh film image is drawn on the platform key, and the report resolves as
  removed

#### Scenario: A removed Podcast Episode leaves nothing to regenerate

- **WHEN** an admin presses Regenerate on a report whose Podcast Episode was already removed
- **THEN** no render starts, and the report resolves as removed

#### Scenario: A report from the MCP server gets the action

- **WHEN** a `podcastEpisode` report sent through the MCP `report_content` tool is opened
- **THEN** it offers Regenerate as any other `podcastEpisode` report does
