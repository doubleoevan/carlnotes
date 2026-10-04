## ADDED Requirements

### Requirement: The gate decides whether a Topic may render a Podcast Episode

`isAllowed(user, "podcastEpisode:render", topic)` SHALL decide whether a Topic may render a Podcast Episode, read for the
Topic's owner, whose plan funds it. It SHALL be true for an owner on a paid plan and for an owner who is an admin. For
an owner on the free plan it SHALL be true only while that Topic has no rendering, published, or removed Podcast
Episode, so each Topic on the free plan renders its first Podcast Episode and no more. A failed Podcast Episode does not
count. The episode workflow SHALL check the same rule before it spends anything, the settings tool SHALL ask it before
it turns a Topic's podcast on, and the topic page SHALL read the same result to show the upgrade link on that Topic's
podcast switch.

#### Scenario: A paid plan renders

- **WHEN** a Scan of an owner on plus succeeds
- **THEN** the gate allows the render

#### Scenario: A Topic on the free plan renders its first Podcast Episode

- **GIVEN** a Topic on the free plan with no published Podcast Episode
- **WHEN** its Scan succeeds
- **THEN** the gate allows the render

#### Scenario: A second Podcast Episode of a Topic on the free plan is rejected

- **GIVEN** a Topic on the free plan with one published Podcast Episode
- **WHEN** its next Scan succeeds
- **THEN** the gate rejects the render, nothing is spent, and that Topic's podcast switch shows the upgrade link

#### Scenario: A Scan during the first render on the free plan gets no Podcast Episode

- **GIVEN** a Topic on the free plan whose first Podcast Episode is still rendering
- **WHEN** another Scan of the Topic succeeds
- **THEN** the gate rejects the render, and nothing is spent

#### Scenario: A failed Podcast Episode does not use the free plan's one Podcast Episode

- **GIVEN** a Topic on the free plan whose only Podcast Episode failed
- **WHEN** its next Scan succeeds
- **THEN** the gate allows the render

#### Scenario: Removing the Podcast Episode of a Topic on the free plan does not earn another

- **GIVEN** a Topic on the free plan whose owner removed its one Podcast Episode
- **WHEN** the Topic's next Scan succeeds
- **THEN** `podcastEpisode:render` is rejected for that Topic, and no Podcast Episode is rendered

#### Scenario: Each Topic on the free plan gets its own first Podcast Episode

- **GIVEN** an owner on the free plan with two Topics, one of which has a published Podcast Episode
- **WHEN** the other Topic's Scan succeeds
- **THEN** the gate allows the render for that Topic

#### Scenario: Upgrading resumes a Topic

- **GIVEN** a Topic on the free plan that has used its Podcast Episode
- **WHEN** the owner moves to a paid plan and the Topic's next Scan succeeds
- **THEN** the gate allows the render

### Requirement: The gate decides whether a user may remove a Podcast Episode

`isAllowed(user, "podcastEpisode:remove", topic)` SHALL decide whether a user may remove a Podcast Episode of a Topic. It SHALL
be true for the Topic's owner and for an admin, and false for everyone else, a team leader and a subscriber included.
The removal route SHALL ask the gate before it deletes anything, and the topic page SHALL read the same result to show
the remove control.

#### Scenario: The owner may remove

- **WHEN** a Topic's owner asks to remove one of its Podcast Episodes
- **THEN** the gate allows it

#### Scenario: An admin may remove

- **WHEN** an admin asks to remove a Podcast Episode of another user's Topic
- **THEN** the gate allows it

#### Scenario: A subscriber may not remove

- **WHEN** a subscriber of the Topic asks to remove one of its Podcast Episodes
- **THEN** the gate rejects it
