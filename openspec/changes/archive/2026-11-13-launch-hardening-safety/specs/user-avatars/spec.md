## MODIFIED Requirements

### Requirement: A public avatar resolves upload, the provider photo, then initials

A user's avatar SHALL resolve in this order:

1. an uploaded avatar
2. a provider photo, opt-in only
3. the initials on their tint

The route resolves the source server-side and SHALL answer 404 when a user is on the generated avatar, which is the
signal for the client to draw the initials. Carl and the app's system actors never render through the user avatar
path; they carry the app's own mug branding where they appear.

An unchecked upload, one whose image moderation could not run, SHALL NOT enter this order until its check passes: for
everyone else the user's avatar SHALL resolve as it did before the upload. The user's own session SHALL name the
unchecked upload, so the user alone sees it.

#### Scenario: An upload wins

- **WHEN** a user has uploaded an avatar whose check passed
- **THEN** it renders, whatever else is available

#### Scenario: A user with no published avatar falls through to initials

- **GIVEN** a user who has neither uploaded an avatar nor opted in to their provider photo
- **WHEN** their avatar resolves
- **THEN** the route answers 404 and the initials render

#### Scenario: An unchecked upload resolves for its owner alone

- **GIVEN** a user on an opted-in provider photo whose new upload is unchecked
- **WHEN** the user and another user each load a page that draws the user's avatar
- **THEN** the user sees the unchecked upload, and the other user sees the provider photo

## ADDED Requirements

### Requirement: The server checks an uploaded avatar's pixel size and stores it resized

The api SHALL read an uploaded user or team avatar's pixel size and format before it decodes the image, SHALL
reject one past its pixel limit, a few thousand pixels a side, SHALL reject one that decodes as anything but a jpeg,
a png, a webp, or a gif, whatever type its request claims, and SHALL store a resized re-encode, never the bytes as
sent. The byte limit SHALL stay as it is. An upload from either app's picker, already 512 pixels or smaller on its
longest edge, SHALL show as it did before.

#### Scenario: A small file that declares a huge image is rejected

- **WHEN** a request uploads a 137 KB PNG of 12,000 by 12,000 pixels as an avatar
- **THEN** the upload is rejected before the image is decoded, nothing is stored, and the previous avatar stays

#### Scenario: A picker's upload is stored as the server's re-encode

- **WHEN** a user picks a photo and the picker uploads its 512 pixel re-encode
- **THEN** the stored avatar is the server's re-encode, no larger in pixels than the upload, and it shows as before

#### Scenario: A transparent logo stays transparent

- **WHEN** a user uploads a PNG logo with a transparent background
- **THEN** the stored avatar's transparent pixels stay transparent

#### Scenario: A team avatar gets the same check

- **WHEN** a request uploads a team avatar past the pixel limit
- **THEN** the upload is rejected, and the team's avatar is unchanged

#### Scenario: An image in another format is rejected

- **WHEN** a request uploads a TIFF or an SVG as an avatar and claims the type `image/png`
- **THEN** the upload is rejected as an unsupported type before the image is decoded, and nothing is stored

### Requirement: A card draws an avatar resized under a pixel limit

Before a share card inlines an avatar, an upload or a provider photo, the api SHALL decode it under a pixel limit and
resize it to the size the card draws it at, so no avatar is decoded at its full size inside a card. An avatar stored
before the upload check existed SHALL get the same treatment. An avatar that decodes as anything but a jpeg, a png, a
webp, or a gif SHALL NOT be decoded, and the card SHALL draw the initials.

#### Scenario: A large stored avatar draws small

- **GIVEN** a 12,000 by 12,000 pixel PNG avatar stored before the upload check existed
- **WHEN** its owner's profile card is drawn
- **THEN** the card is drawn with the avatar at the drawn size, and the process's memory rises by less than 50 MB

#### Scenario: A provider photo is resized too

- **WHEN** a card is drawn for a user on an opted-in provider photo
- **THEN** the photo is resized to the drawn size before the card inlines it

#### Scenario: A stored avatar in another format draws the initials

- **GIVEN** an SVG stored as an avatar before the upload check existed
- **WHEN** its owner's profile card is drawn
- **THEN** the SVG is not decoded, and the card draws the owner's initials
