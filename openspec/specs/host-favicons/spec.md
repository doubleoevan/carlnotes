# host-favicons Specification

## Purpose
TBD - created by archiving change show-host-favicons. Update Purpose after archive.
## Requirements
### Requirement: A host's favicon is fetched and stored when a page on it is read

When review stores a fetched page's content, the worker SHALL fetch and store the favicon of the page's host if the host has
no favicon row or its row was fetched more than thirty days ago. It SHALL resolve the icon url Firecrawl names
against the page url and fetch it through the public-url guard. It SHALL try `/favicon.ico` at the host's root, then the icon
the page named, then `/favicon.svg` and `/apple-touch-icon.png` at the root, then those three at the host's www or bare spelling,
and keep the first that fetches. It SHALL keep only an image
type, the link preview image types plus ico and svg, and only one of 256 KB or less. The fetch SHALL be best effort: a failure, a page naming no icon, or an icon
the rules reject SHALL be logged, SHALL write the host's row with no stored object so the host is not tried again for
thirty days, and SHALL neither fail nor delay the scan.

#### Scenario: A new host's icon is stored

- **WHEN** review stores a page from a host with no favicon row and Firecrawl names an icon the rules accept
- **THEN** the icon is stored once for that host and the row records its object, type, and fetch time

#### Scenario: A host is not fetched again for a month

- **WHEN** review stores a second page from a host whose row was fetched less than thirty days ago
- **THEN** no icon fetch is made

#### Scenario: A host with no icon is remembered

- **WHEN** no candidate url fetches as an image of an allowed type and size
- **THEN** the row is written with no object, the scan continues, and the host is not tried again for thirty days

#### Scenario: A failed refetch keeps the stored icon

- **WHEN** a host's row is due, has a stored icon, and no candidate url fetches
- **THEN** the row keeps its object and type and only its fetch time moves

### Requirement: A favicon is served from this origin with a month-long cache

`GET /api/favicons/:host` SHALL stream the host's stored icon with the stored-file headers a link preview image
gets, a `Cache-Control` of `public, max-age=2592000`, and a content security policy that allows nothing and
sandboxes the document, so an icon opened as a page runs nothing on this origin, and a `Cross-Origin-Resource-Policy`
of `same-origin`, so only this origin's pages embed it. A host with no row or no stored object SHALL get a 404. The
path SHALL be the same wherever the host is shown, so one browser cache entry serves every place.

#### Scenario: A stored icon is served cacheable

- **WHEN** a browser requests a host that has a stored icon
- **THEN** it receives the image with the stored-file headers and a month-long public cache lifetime

#### Scenario: An unknown host is a 404

- **WHEN** a browser requests a host with no row, or one with no stored icon
- **THEN** the response is a 404

### Requirement: The Finding and the link preview name their host's favicon

The Finding payload and the link preview payload SHALL each include `faviconPath`, the path this origin serves the
host's favicon from, or null when the host has no stored icon. No payload SHALL include a third-party url for an icon.

#### Scenario: A resource on a host with an icon names the path

- **WHEN** the feed lists a resource whose host has a stored icon
- **THEN** the Finding's `faviconPath` is that host's path

#### Scenario: A resource on a host without one is null

- **WHEN** the feed lists a resource whose host has no stored icon
- **THEN** its `faviconPath` is null

### Requirement: The host name shows its favicon, or a globe

Wherever the ui names an external host beside a finding or a link preview, it SHALL show the host's favicon in a round chip
at the size of the text's icons, faint on the light theme and white on the dark one, decorative with an empty alt,
and a muted globe glyph in the chip while the image loads and when the path is null or the image fails to load. The scan email SHALL NOT include one.

#### Scenario: The feed row shows the icon

- **WHEN** a feed row's resource has a `faviconPath`
- **THEN** the icon shows before the host name in the metadata line

#### Scenario: The globe shows while the icon loads

- **WHEN** the image has not loaded yet
- **THEN** the globe shows in the chip until it has

#### Scenario: A missing or broken icon shows the globe

- **WHEN** the resource's `faviconPath` is null, or the image fails to load
- **THEN** a muted globe glyph shows in its place at the same size

#### Scenario: The link preview card shows the icon

- **WHEN** a link preview card names its host and the preview has a `faviconPath`
- **THEN** the icon shows before the host name

