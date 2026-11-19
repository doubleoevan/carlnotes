## MODIFIED Requirements

### Requirement: A card section's count sits beside its title where the cards do not fill the row

On the web, an open section of cards whose cards do not fill one row of its grid SHALL show its count right after its
title instead of at the far right: with one card where the grid has two columns or more, and with two cards where it
has three. A closed section, a section whose cards fill the row, and every section on a phone's single column, SHALL
keep the count at the far right. The rule SHALL hold for every web card row, the topic page's Coffee Break Cinema
included, and SHALL come from the one Nightshift module that also holds the card grid's columns.

#### Scenario: One film on a wide screen

- **WHEN** a user opens the home on a wide screen with one film in Featured films
- **THEN** "1 film" sits right after the "Featured films" title, above the one card

#### Scenario: A closed section keeps the far right

- **WHEN** a user closes a section of one card on a wide screen
- **THEN** its count moves back to the far right of the title row

#### Scenario: Three cards fill the row

- **WHEN** a user opens the home on a wide screen with twelve topics in Featured topics
- **THEN** "12 topics" sits at the far right of the title row

#### Scenario: A phone keeps the far right

- **WHEN** a user opens the home on a phone with one film in Featured films
- **THEN** "1 film" sits at the far right of the title row

#### Scenario: Two films on the topic page

- **GIVEN** a Topic with two ready films
- **WHEN** a user opens its topic page on a desktop, where the card grid has three columns
- **THEN** "2 films" sits right after Coffee Break Cinema's theme song credits, and on a tablet's two columns it sits
  at the far right
