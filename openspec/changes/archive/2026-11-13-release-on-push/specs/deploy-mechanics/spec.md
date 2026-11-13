## REMOVED Requirements

### Requirement: A release deploys only a commit that CI passed

**Reason**: Releases no longer wait for CI, so a failing or slow check never holds one back.

**Migration**: A push to main starts `release-main` through its push trigger. A CI failure is fixed by a later push.

## ADDED Requirements

### Requirement: A push to main starts the release

The `release-main` release flow SHALL have a GitHub push trigger on `main`, and each run SHALL build the newest commit
on `main`. No CI job SHALL start or hold back the release. A run started by hand in the Northflank console SHALL remain
possible.

#### Scenario: A push releases without waiting for CI

- **WHEN** a commit reaches main
- **THEN** a release run starts at once and deploys that commit, whatever CI's result

#### Scenario: A hand-started run deploys main

- **WHEN** someone runs `release-main` from the Northflank console
- **THEN** the run builds and deploys the newest commit on `main`
