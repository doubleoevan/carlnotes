# Spec Delta

## ADDED Requirements

### Requirement: A Topic result carries its image

A Topic row in a search result SHALL include the Topic's image urls, and the search page, the mobile search screen,
and the search MCP view SHALL show the image at the row's left through the shared image component.

#### Scenario: A result shows its image

- **WHEN** a search lists a Topic with an image
- **THEN** its row shows the image before its title

### Requirement: A Podcast Episode result carries its own image and ends with its Topic

A Podcast Episode row in a search result SHALL include the Podcast Episode's own image urls, and the search page and the
mobile search screen SHALL show its image at the row's left through the shared image component, or the podcast
icon until its image is drawn. The row's line SHALL read `Podcast · age · listeners · Topic` with the Topic's name
last, before the play pill, and a Finding row's line SHALL end with `· Topic` the same way, before its chapter pill.
The dot SHALL stay with the Topic's name when the line wraps.

#### Scenario: A podcast result shows its own image

- **WHEN** a search lists a Podcast Episode with its own image
- **THEN** its row shows that image at the `thumbnail` size and the line `Podcast · 1w ago · 2 listeners · Home
  espresso` before its play pill

#### Scenario: A finding result ends with its Topic

- **WHEN** a search lists a Finding
- **THEN** its line reads the source, the age, then `· ` and the Topic's name, with no "in"
