# Spec Delta

## Purpose

One Topic card, one Podcast Episode card, and one Topic image component, shared by the web, the mobile app, and the MCP
views through platform adapters, so every place a Topic shows its image draws it the same way.

## ADDED Requirements

### Requirement: One image component picks the file for its size

A shared `TopicImage` component SHALL take a Topic's image urls and a `TopicImageSize` and draw the 1x and 2x files for
that size, with the placeholder ground until the file loads and when no image exists. The web SHALL offer both
densities, the mobile app SHALL load the 2x file on every device, and no copy of the component SHALL exist per app.

#### Scenario: A retina browser gets the 2x file

- **WHEN** a 2x display shows a Topic card
- **THEN** the browser loads the `page@2x` file

#### Scenario: A Topic with no image shows the ground

- **WHEN** a Topic's image has not rendered
- **THEN** the component draws the placeholder ground at the size's aspect box

### Requirement: One Topic card and one Podcast Episode card render everywhere

A shared `TopicCard` SHALL show the `page` image over the Topic's name, byline, tags, and reactions count as one link,
and a shared `PodcastEpisodeCard` SHALL show its Topic's `page` image, the title, the Topic's name, the season and
number, and a play control. Both SHALL have a Nightshift card contract and SHALL render on the home page and the mobile
Home tab through platform adapters, never as a copy, and the MCP views SHALL draw the shared `TopicImage`.

#### Scenario: The parity check reads the cards as shared

- **WHEN** the component parity check runs
- **THEN** both apps' card files import the core card or its adapter type and the check passes

#### Scenario: A deviation is named

- **WHEN** the mobile card differs from the web card
- **THEN** the difference is a platform need recorded in the mobile parity inventory with its reason
