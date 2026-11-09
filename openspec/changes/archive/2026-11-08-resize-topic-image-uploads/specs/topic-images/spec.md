## MODIFIED Requirements

### Requirement: The owner uploads their own image

An owner SHALL be able to upload a jpeg, png, or webp of up to 10 MB. Before it uploads, the picker in both apps SHALL
shrink a picked photo to at most 2048 pixels on its longest edge and re-encode it as a jpeg, or a png for a source that
can be transparent, so a large photo, a heic, or a gif uploads instead of being rejected. The upload SHALL be
center-cropped to 3:2, resized to the original's size, stripped of metadata, stored as the original, and derived into
the six files. An upload SHALL replace the generated image until the owner regenerates or removes it.

#### Scenario: An off-ratio upload is cropped

- **WHEN** an owner uploads a tall png with EXIF data
- **THEN** the stored original is 3:2, holds no metadata, and the six files derive from it

#### Scenario: A too-large or wrong-type file is refused

- **WHEN** a request reaches the api with a 12 MB jpeg or a gif
- **THEN** the upload is rejected with the reason and the image is unchanged

#### Scenario: A large phone photo is shrunk before it uploads

- **WHEN** an owner picks a 15 MB heic photo in Edit topic
- **THEN** the picker uploads it as a jpeg at most 2048 pixels on its longest edge, and it replaces the image

#### Scenario: Removing an upload renders a fresh image

- **WHEN** an owner removes their upload
- **THEN** the upload's objects are scheduled for deletion and a fresh render starts on the owner's budget, counted as
  one of the month's regenerations
