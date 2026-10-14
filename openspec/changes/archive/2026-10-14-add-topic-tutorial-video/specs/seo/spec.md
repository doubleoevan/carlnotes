## ADDED Requirements

### Requirement: The homepage's structured data describes the topic tutorial video
The homepage's head SHALL include a `VideoObject` JSON-LD block for the topic tutorial video, beside its `WebSite`,
`Organization`, and `SoftwareApplication` blocks. The block SHALL give the video's name, description, upload date,
absolute thumbnail url on this origin, and its `www.youtube-nocookie.com` embed url, the same player the page plays.

#### Scenario: The homepage declares the video
- **WHEN** a crawler reads the homepage's head
- **THEN** it finds a `VideoObject` block whose `embedUrl` is the video's YouTube embed url and whose `thumbnailUrl`
  is an absolute url on this origin
