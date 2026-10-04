## ADDED Requirements

### Requirement: A Podcast Episode render is traced with its cost, duration, and retries

Every published Podcast Episode's render SHALL be one trace in the existing telemetry, named for the render and grouped
by its Topic and its Scan. The trace SHALL record how long the render took, how many attempts each chapter needed, the
speech tier it used, the cost, and the cost per minute of audio. A render that fails SHALL record its failure reason on
the Podcast Episode, and SHALL be reported to Sentry under an `episode` stage with the Scan, the Topic, and the reason.
A render that is skipped SHALL log which check skipped it. Telemetry SHALL stay optional, and a render with no
telemetry keys runs the same.

#### Scenario: A published Podcast Episode's trace shows its cost per minute

- **WHEN** a Podcast Episode publishes
- **THEN** its trace records the render's duration, each chapter's attempt count, the tier, the cost, and the cost per
  audio minute

#### Scenario: A failed render is reported

- **WHEN** no chapter renders, or a script call fails for good
- **THEN** the Podcast Episode is saved as failed with the reason, and Sentry receives a report under the `episode`
  stage naming the Scan and the Topic

#### Scenario: A left-out chapter is reported

- **WHEN** a chapter is left out
- **THEN** the Podcast Episode publishes, and Sentry receives a report under the `episode` stage naming the Podcast
  Episode, the Topic, the Scan, and how many chapters were left out

#### Scenario: A skipped render says why

- **WHEN** the budget check skips a render
- **THEN** the worker's log names the Scan and the budget check, and no Podcast Episode row is written
