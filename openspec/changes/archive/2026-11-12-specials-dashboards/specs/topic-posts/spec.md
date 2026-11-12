## MODIFIED Requirements

### Requirement: The info popup shows its Topic's viewers and followers

The Topic Post info popup SHALL show its Topic's viewer count and follower count on a details line under the Topic's
name, beside the Topic's image, with the viewer count labeled visitors. Each SHALL be the count the Topic's own page
reads, for a reader who may view the Topic, and a count of zero SHALL be left out. The Topic Post's response SHALL
include both counts in one optional field, so the popup makes no second request.

#### Scenario: The Topic row counts its viewers and followers

- **WHEN** a reader opens the popup of a post whose Topic has 128 viewers and 14 followers
- **THEN** the Topic row reads the Topic's name, and "128 visitors · 14 followers" on the line under it

#### Scenario: A Topic with no follower shows its viewers alone

- **WHEN** a reader opens the popup of a post whose Topic has three viewers and no follower
- **THEN** the line under the Topic's name reads "3 visitors"

#### Scenario: A Topic with neither shows no line

- **WHEN** a reader opens the popup of a post whose Topic has no viewer and no follower
- **THEN** the Topic row shows the image and the name alone
