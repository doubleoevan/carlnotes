## ADDED Requirements

### Requirement: Each process keeps the centroid for an hour

Each api process SHALL keep the centroid it last read or computed in its own memory for an hour, so that while Redis
is unreachable a related read ranks with that copy and computes no centroid. A process with no copy and no Redis
SHALL compute the centroid once and keep it.

#### Scenario: A second related read with Redis unreachable sends no centroid query

- **GIVEN** Redis is unreachable and an api process that has served one related read
- **WHEN** the process serves a second related read within the hour
- **THEN** no centroid query runs, and the read ranks with the copy the process kept

#### Scenario: The copy lasts an hour

- **WHEN** a process's copy of the centroid is more than an hour old
- **THEN** its next related read reads the centroid from Redis, or computes it if Redis has none
