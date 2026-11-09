## RENAMED Requirements

- FROM: `### Requirement: The editor regenerates and uploads from the photo library`
- TO: `### Requirement: The editor regenerates, and uploads from a tap on the image`

## MODIFIED Requirements

### Requirement: The editor regenerates, and uploads from a tap on the image

The mobile topic editor SHALL show the Topic's image with Regenerate, and a tap on the image SHALL upload from the photo
library, with no separate Upload button, the same count, the same absent control at the limit, and the server's center
crop.

#### Scenario: An owner uploads a photo

- **WHEN** an owner taps the image and picks a tall photo from the library
- **THEN** the stored image is the center 3:2 of it and the editor shows it
