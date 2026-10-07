## REMOVED Requirements

### Requirement: The gate decides whether a Topic may render a Podcast Episode

**Reason**: A removed Podcast Episode no longer counts toward the free plan's one Podcast Episode per Topic, so the
scenario that removing a Podcast Episode earns no new Podcast Episode no longer holds.

**Migration**: Replaced by "The gate decides whether a Topic may render a Podcast Episode, counting only rendering and
published Podcast Episodes".

## ADDED Requirements

### Requirement: The gate decides whether a Topic may render a Podcast Episode, counting only rendering and published Podcast Episodes

`isAllowed(user, "podcastEpisode:render", topic)` SHALL decide whether a Topic may render a Podcast Episode, read for the
Topic's owner, whose plan funds it. It SHALL be true for an owner on a paid plan and for an owner who is an admin. For
an owner on the free plan it SHALL be true only while that Topic has no rendering or published Podcast Episode, so each
Topic on the free plan has one Podcast Episode at a time. A failed or removed Podcast Episode does not count. The
episode workflow SHALL check the same rule before it spends anything, the settings tool SHALL ask it before it turns a
Topic's podcast on, and the topic page SHALL read the same result to show the upgrade link on that Topic's podcast switch.

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

#### Scenario: Removing the Podcast Episode of a Topic on the free plan lets the Topic render a new Podcast Episode

- **GIVEN** a Topic on the free plan whose owner removed its one Podcast Episode
- **WHEN** the Topic's next Scan succeeds
- **THEN** the gate allows the render

#### Scenario: Each Topic on the free plan gets its own first Podcast Episode

- **GIVEN** an owner on the free plan with two Topics, one of which has a published Podcast Episode
- **WHEN** the other Topic's Scan succeeds
- **THEN** the gate allows the render for that Topic

#### Scenario: Upgrading resumes a Topic

- **GIVEN** a Topic on the free plan that has used its Podcast Episode
- **WHEN** the owner moves to a paid plan and the Topic's next Scan succeeds
- **THEN** the gate allows the render
