## ADDED Requirements

### Requirement: The latest Podcast Episode plays from every topic table

Every table that lists topics SHALL show, beside a topic's name, the play button of the topic's latest published
Podcast Episode that the user may listen to, with the tooltip that the button beside the note icon shows. The tables are
the profile page's topics, the team topics under a team row on the teams page and the profile page, the team page's
topics, the activity page's topics and subscriptions, and the admin console's user and team topic subtables. A topic
with no such Podcast Episode SHALL show no button.

Each table's response SHALL read the latest Podcast Episodes of all its topics in a fixed number of queries, and SHALL
check access to each Podcast Episode as the user viewing the table.

#### Scenario: A profile topic plays its latest Podcast Episode

- **WHEN** a user presses the play button beside a topic's name in the profile page's topics table
- **THEN** the topic's latest Podcast Episode plays, and the button shows a pause icon

#### Scenario: A topic with no Podcast Episode shows no button

- **WHEN** a topic in a team page's topics table has no published Podcast Episode
- **THEN** no play button shows beside the topic's name

#### Scenario: An invite topic's earlier Podcast Episode stays hidden from a subscriber

- **WHEN** a subscriber's activity page lists an invite topic whose latest Podcast Episode was published before the
  subscriber joined
- **THEN** no play button shows beside the topic's name

#### Scenario: A longer table reads no more queries

- **WHEN** the profile page lists 30 topics
- **THEN** the latest Podcast Episodes are read in the same number of queries as for 3 topics
