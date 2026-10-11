## ADDED Requirements

### Requirement: Every upload is the browser's resized re-encode

The browser SHALL decode a chosen avatar, resize it to at most 512 pixels on its longest edge, and re-encode it, as a
PNG for a PNG, WebP, or GIF source so a transparent logo keeps its clear background, and as a JPEG for any other
source, and SHALL upload that resized re-encode alone. An unprocessed original SHALL never be uploaded, so no upload
keeps the photo's EXIF metadata and no upload exceeds the server's limit for a photo the browser could decode. For a file of a
megabyte or more, decoding SHALL ask the browser for a bitmap 512 pixels wide, so a very large photo never needs its
full-size bitmap in memory. A HEIC or HEIF file the browser cannot decode SHALL be decoded by a HEIC decoder that the
page loads only then, so no other upload pays for it. A file that could not be decoded or resized SHALL show "That
image couldn't be read. Try a JPEG or PNG." before anything uploads, and SHALL be reported to monitoring with its
content type and byte size. The user avatar picker and the team avatar picker, chooser and drag-and-drop alike, SHALL
go through this one path. The server's limits stay as they are.

#### Scenario: A large photo uploads small

- **WHEN** a user picks a 48-megapixel JPEG
- **THEN** the upload is a JPEG of at most 512 pixels on its longest edge, under the server's limit

#### Scenario: A HEIC file uploads in a browser without HEIC decoding

- **WHEN** a user picks a HEIC file in a browser whose own decoder rejects it
- **THEN** the HEIC decoder loads, the file is decoded, and the upload is the resized JPEG

#### Scenario: An undecodable file uploads nothing

- **WHEN** a user picks a file that neither the browser nor the HEIC decoder can decode
- **THEN** the message shows, nothing is sent, and a report names the file's content type and byte size

#### Scenario: The upload keeps no EXIF metadata

- **WHEN** a user picks a JPEG with location metadata
- **THEN** the uploaded JPEG holds no EXIF segment

#### Scenario: A transparent logo stays transparent

- **WHEN** a user picks a PNG logo with a transparent background
- **THEN** the upload is a PNG of at most 512 pixels on its longest edge whose transparent pixels stay transparent

#### Scenario: The team chooser resizes too

- **WHEN** a leader picks a team avatar through the file chooser
- **THEN** the upload is the resized re-encode, as it is through drag-and-drop
