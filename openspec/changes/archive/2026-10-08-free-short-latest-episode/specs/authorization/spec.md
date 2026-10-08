## ADDED Requirements

### Requirement: The gate decides whether a Topic gets full Podcast Episodes

`isAllowed(user, "podcastEpisode:full", topic)` SHALL decide whether a Topic gets full Podcast Episodes, read for the
Topic's owner, whose plan funds it. It SHALL be true for an owner on a paid plan and for an owner who is an admin, and
false for an owner on the free plan. A Topic with full Podcast Episodes SHALL get episodes of up to 30 minutes and 15
Findings and SHALL keep every one. A Topic without them SHALL get short episodes of up to 10 minutes and 5 Findings and
SHALL keep only its latest short one. The episode workflow SHALL check the same rule before it spends anything, and the
topic page SHALL read the same result to show the free plan's hint and upgrade link on that Topic's podcast switch.

#### Scenario: A paid plan gets full Podcast Episodes

- **WHEN** a Scan of an owner on plus succeeds
- **THEN** the gate allows full Podcast Episodes, and the Podcast Episode plans up to 30 minutes

#### Scenario: An admin's free-plan Topic gets full Podcast Episodes

- **GIVEN** an admin whose plan is free
- **WHEN** a Scan of the admin's Topic succeeds
- **THEN** the gate allows full Podcast Episodes

#### Scenario: A free Topic gets short Podcast Episodes

- **GIVEN** a Topic whose owner is on the free plan and is not an admin
- **WHEN** its Scan succeeds
- **THEN** the gate rejects full Podcast Episodes, and the Podcast Episode plans up to 10 minutes and 5 Findings

#### Scenario: Upgrading gives full Podcast Episodes

- **GIVEN** a Topic on the free plan
- **WHEN** the owner moves to a paid plan and the Topic's next Scan succeeds
- **THEN** the gate allows full Podcast Episodes, the new Podcast Episode replaces none, and the earlier short one stays

## REMOVED Requirements

### Requirement: The gate decides whether a Topic may render a Podcast Episode, counting only rendering and published Podcast Episodes

**Reason**: A free Topic now records a short Podcast Episode after every Scan and keeps only its latest, so the plan
decides the kind of Podcast Episode instead of whether one is recorded.

**Migration**: See "The gate decides whether a Topic gets full Podcast Episodes". The free plan's one recording at a time
is in podcast-episode-rendering's "A free Topic keeps only its latest short Podcast Episode".
