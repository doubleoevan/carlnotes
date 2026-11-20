## MODIFIED Requirements

### Requirement: A lost Temporal store is started empty

The Recovery section SHALL state that a lost Temporal store is started empty and never restored from an older copy,
because old workflows would run again against rows that have moved on. It SHALL list the rows a lost workflow leaves,
which of them the sweep reaps or starts again, and which it leaves.

#### Scenario: An operator recovers from a lost Temporal store

- **WHEN** an operator opens the Temporal part after the store is lost
- **THEN** it says to start the store empty, names the rows the sweep reaps or starts again and how long each
  takes, and says that no schedule has to be made again
