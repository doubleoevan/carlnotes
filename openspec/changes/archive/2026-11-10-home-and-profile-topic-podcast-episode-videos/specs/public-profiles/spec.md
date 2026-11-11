## MODIFIED Requirements

### Requirement: The Café lists its sections in a fixed order

The profile page SHALL show, top to bottom: the header, the person's news, Featured Topics, Featured Films, Featured
Podcasts, Featured Posts, the topics table, the teams table, and the Visitors line. A card section with nothing to show
SHALL be absent, and the order of the rest SHALL hold. Each table SHALL always show, an empty one with its line in a
card. The page SHALL show no Open Mic section, since Featured Posts lists every post, and no notice, warning, or
guideline text.

#### Scenario: A full Café reads in order

- **WHEN** a visitor opens the profile of a person with public Topics, ready films, Podcast Episodes, Topic Posts, and
  a shown Team
- **THEN** the page shows the header, the news, Featured Topics, Featured Films, Featured Podcasts, Featured Posts, the
  two tables, and the Visitors line, in that order, with no Open Mic section

#### Scenario: A new person's Café is short

- **WHEN** a visitor opens the profile of a person with one public Topic and nothing else
- **THEN** the page shows the header, the news, Featured Topics, the topics table, the teams table with "No public
  teams." in a card, and the Visitors line
