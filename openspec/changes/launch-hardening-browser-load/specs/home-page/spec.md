## ADDED Requirements

### Requirement: Carl's hero image loads at the width it shows

The visitor face's hero image SHALL be a webp offered at two widths, so a phone loads the narrower file and a wide
screen the wider one. The home SHALL request no png for it.

#### Scenario: A phone loads the narrower file

- **WHEN** a visitor opens `/` on a phone
- **THEN** the hero image loads the narrower webp, and no png is requested for it

#### Scenario: A wide screen loads the wider file

- **WHEN** a visitor opens `/` on a screen 1280 pixels wide
- **THEN** the hero image loads the wider webp

## MODIFIED Requirements

### Requirement: The home route has a visitor face and a user face

`/` SHALL render a visitor's face on the server, cached at the edge under the `rendered` and `home` tags, and a user's
face in the browser, chosen by the session. Until the session read returns, the session cookie SHALL choose the
face, as the `page-load` capability states. The directory SHALL live at `/topics`, one click away from both faces.

#### Scenario: A visitor is served from the edge

- **WHEN** a request with no session cookie fetches `/`
- **THEN** the HTML holds the visitor face and the response carries the edge headers of a rendered page with the
  `home` tag

#### Scenario: A user opens their own face

- **WHEN** a signed-in user opens `/`
- **THEN** the page shows the headline, their Brews News, the featured cards, and their Topics as cards, rendered in
  the browser

#### Scenario: A signed-in load opens on the user face

- **WHEN** a signed-in user loads `/` on a full page load
- **THEN** the home opens on the user face while its reads load, and the visitor's how it works steps never show
