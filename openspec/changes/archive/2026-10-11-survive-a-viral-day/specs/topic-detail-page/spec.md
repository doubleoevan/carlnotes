## MODIFIED Requirements

### Requirement: A public topic page links more topics

A public shown Topic's page SHALL end with a "More topics" section of up to five plain links to other public shown
Topics, rendered on the server so a crawler and a visitor without JavaScript read them. The Topics SHALL be chosen in
this order: other public shown Topics that a public team holding this Topic also holds, owned or shared; then public
shown Topics sharing a tag with this Topic, most shared tags first; then the public shown Topics with the newest
Finding. The Topic itself SHALL never be listed, a Topic SHALL be listed once, and a private or invite Topic, or a
Topic held only by a private team, SHALL never be listed. Each link SHALL use the Topic's slugged url and show its
name. A Topic page that is not public, or a public one not yet shown, SHALL have no such section.

The section SHALL be served from one copy per Topic for a minute, the same for every user and visitor. An edit or a
delete of the Topic, a Source added to or removed from it, or a team attach or detach of it, SHALL drop its own copy, so a Topic made private has no section once its save
returns. Another Topic's copy MAY still list a Topic that just went private, or leave out one that just went public,
until that copy's minute ends, the same window the edge already serves a page for.

#### Scenario: A team's other topics come first

- **GIVEN** a public Topic held by a public team with three other public shown Topics, and two more public Topics
  sharing its tag
- **WHEN** a visitor opens its page
- **THEN** "More topics" lists the three team Topics, then the two tagged ones

#### Scenario: Recent topics fill the rest

- **GIVEN** a public Topic with no team and no tag
- **WHEN** a crawler fetches its page without running JavaScript
- **THEN** "More topics" lists the five other public shown Topics with the newest Findings, each as a plain link

#### Scenario: A private topic has no section

- **WHEN** an owner opens their private Topic's page
- **THEN** there is no "More topics" section

#### Scenario: A topic made private loses its section at once

- **GIVEN** a public Topic whose "More topics" copy was built a moment ago
- **WHEN** its owner makes it private and opens its page
- **THEN** there is no "More topics" section

#### Scenario: Another page's list catches up within a minute

- **GIVEN** a public Topic listed in another Topic's "More topics" copy
- **WHEN** its owner makes it private
- **THEN** the other Topic's page stops listing it once that copy's minute ends
