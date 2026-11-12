## MODIFIED Requirements

### Requirement: The page header copies the Activity page

Each Dashboard page SHALL use the Activity page's page layout: a header row with its menu row's icon and the page
heading, "Topic Daily Specials", "Podcast Daily Specials", or "Team Daily Specials", on the left, and under it the
subject header with the person's or team's avatar, name, and summary strip. On a person's own Topic and Podcast
Dashboards, whatever they count, and on every Team Dashboard, the header row SHALL hold the New Topic button at its
right, as the Activity page's and the team page's do.

#### Scenario: The header names the page beside its icon

- **WHEN** a reader opens a person's Podcast Dashboard
- **THEN** the header reads "Podcast Daily Specials" beside its menu row's icon, with the person's avatar and name
  under it

#### Scenario: One's own page offers a new topic

- **WHEN** a user opens their own Topic Dashboard, with or without a topic
- **THEN** the New Topic button sits at the right of the header row, where it sits on the Activity page, and opens
  the new topic choice

#### Scenario: Every Team Dashboard offers a new topic

- **WHEN** a reader opens a Team Dashboard, whether they lead the team, belong to it, or neither
- **THEN** the New Topic button sits at the right of the header row, as it does on the team page

#### Scenario: Another person's page offers none

- **WHEN** a user opens the Topic Dashboard of another person
- **THEN** the header row has no New Topic button
