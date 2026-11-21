## MODIFIED Requirements

### Requirement: The home shows Featured films and New films this week before the home podcasts

Both faces of the home page SHALL show a collapsible Featured films section and then a collapsible New films this week
section, right before the Featured podcasts section. Each SHALL show six film cards a page with the home sections'
pager. Every Featured films card SHALL be in the server's HTML. New films this week, which the server pages, SHALL hold
its first page of six in the server's HTML, and its page buttons SHALL be links that show without JavaScript, as the
home-page capability states for the week's new sections. A section with no film SHALL be hidden.

#### Scenario: Film sections lead the podcast sections

- **WHEN** a visitor opens a home page that has films
- **THEN** Featured films and New films this week appear in that order, directly above Featured podcasts

#### Scenario: Every card without script

- **GIVEN** nine films new this week
- **WHEN** a browser without JavaScript opens the home page
- **THEN** New films this week lists its first six cards and a link to its second page, and following the link lists the
  other three, so every card is reached without a script

#### Scenario: Featured films keeps every card in the HTML

- **GIVEN** twelve Featured films
- **WHEN** a browser without JavaScript opens the home page
- **THEN** the HTML holds all twelve Featured films cards

#### Scenario: No films, no sections

- **WHEN** no public Topic has a film
- **THEN** neither film section renders
