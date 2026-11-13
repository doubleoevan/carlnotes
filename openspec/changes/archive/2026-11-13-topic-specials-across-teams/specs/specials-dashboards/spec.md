## MODIFIED Requirements

### Requirement: Three Dashboard pages share one dashboard component

The app SHALL offer Topic Dashboard across every topic a person owns, on any of their teams or on none, at
`/profiles/<userId>/specials/topics`, Podcast Dashboard across the podcasts of those same topics at
`/profiles/<userId>/specials/podcasts`, and Team Dashboard across a team's topics at `/teams/<teamId>/specials`, on
the web and in the mobile app, named "Topic Specials", "Podcast Specials", and "Team Specials". All three SHALL render
one shared dashboard component with the same summary strip, paragraph, and five chart sections.

#### Scenario: A person's Topic Dashboard opens

- **WHEN** a visitor opens `/profiles/u1/specials/topics` for a person with public topics
- **THEN** the page shows that person's Topic Dashboard with its summary strip, Carl's paragraph, and five chart
  sections

#### Scenario: A team's Team Dashboard opens

- **WHEN** a team member opens `/teams/t1/specials`
- **THEN** the page shows Team Dashboard across the topics team t1 owns

#### Scenario: Topic Dashboard counts a person's team topics

- **WHEN** a person owns one topic on no team and one topic on their team t1, and opens their own Topic Dashboard
- **THEN** the charts and the strip count both topics

#### Scenario: Podcast Dashboard counts a person's team topics' podcasts

- **WHEN** a person owns a podcast on no team and a podcast on their team t1, and opens their own Podcast Dashboard
- **THEN** the charts and the strip count both podcasts and their plays
