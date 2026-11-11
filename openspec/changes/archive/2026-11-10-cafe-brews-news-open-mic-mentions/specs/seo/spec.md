# Spec Delta

## ADDED Requirements

### Requirement: The header keeps its links without JavaScript

The header's menu button on a narrow screen opens its menu by script, so it SHALL show only once a script has run.
Without JavaScript the header SHALL show a visitor's Topics, Plans, sign-in, and sign-up links as plain anchors at
every width, wrapped onto a second row where they do not fit, with no menu button. With JavaScript the header SHALL
be as it was, with no shift as the page loads.

#### Scenario: A phone without JavaScript sees the links

- **WHEN** a visitor without JavaScript opens a server-rendered page 390 pixels wide
- **THEN** Topics, Plans, Log in, and Sign up show in a row under the logo, each a link, and no menu button shows

#### Scenario: A phone with JavaScript keeps the menu

- **WHEN** a visitor with JavaScript opens the same page 390 pixels wide
- **THEN** the menu button shows from the first paint, the links are inside its menu, and nothing moves as the page
  loads

#### Scenario: A wide screen is unchanged

- **WHEN** a visitor opens the page 1280 pixels wide, with or without JavaScript
- **THEN** the links show in the header's top row beside the logo, and no menu button shows
