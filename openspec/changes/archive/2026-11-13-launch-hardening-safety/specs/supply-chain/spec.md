## RENAMED Requirements

- FROM: `### Requirement: Every CI run audits the lockfile against the GitHub Advisory Database, report-only`
- TO: `### Requirement: Every CI run audits the lockfile and fails on a high or critical advisory that is not allowlisted`

## MODIFIED Requirements

### Requirement: Every CI run audits the lockfile and fails on a high or critical advisory that is not allowlisted

CI SHALL run `scripts/check-dependency-advisories.ts`, which reads `bun audit --json`, the lockfile checked against
the GitHub Advisory Database, on every push and pull request into main. The script SHALL keep the advisories at high
and critical, drop those on the reviewed allowlist, and fail on any that are left and on an allowlist entry that
matches no advisory. Each allowlist entry SHALL name the advisory, its package, the reason it does not apply, and the
date it was reviewed. The script SHALL run in a CI job of its own, apart from the gate, so a new advisory
turns that job red and leaves the gate's result as it is. No release SHALL wait on it. A moderate or low advisory
SHALL NOT fail the job.

#### Scenario: An open advisory is visible

- **WHEN** a push runs CI while the lockfile holds a package with an open high or critical advisory that is not on
  the allowlist
- **THEN** the advisory job lists the advisory in the run's log and fails, and the gate's own result is unchanged

#### Scenario: An allowlisted advisory passes

- **GIVEN** an allowlist entry naming a high advisory, its package, why it does not apply, and the date reviewed
- **WHEN** CI runs while the lockfile holds that package
- **THEN** the advisory job passes

#### Scenario: A stale allowlist entry fails

- **WHEN** an allowlist entry matches no advisory the audit lists
- **THEN** the advisory job fails naming the entry

#### Scenario: A moderate advisory does not fail the job

- **WHEN** the audit lists only moderate and low advisories
- **THEN** the advisory job passes

#### Scenario: A hotfix deploys under a new advisory

- **GIVEN** a high advisory published during a launch that nobody has fixed or allowlisted yet
- **WHEN** a hotfix is pushed to main
- **THEN** the release runs, and the advisory job is red on that commit

#### Scenario: An allowlisted package's fixed copy stays fixed

- **GIVEN** an allowlisted advisory on the zod 3 a development tool installs
- **WHEN** a workspace's own zod resolves to a version the advisory covers
- **THEN** the advisory job fails, although the advisory is on the allowlist

### Requirement: Dependabot keeps the lockfile, the actions, and the image bases current

The repository SHALL configure Dependabot version updates for the Bun lockfile, the GitHub Actions the workflows use,
and the Docker bases of the app image and the LiteLLM image, each checked weekly. Minor and patch
updates SHALL arrive grouped in one pull request, and a major update in a pull request of its own. A security update
for a package a workspace declares SHALL arrive as soon as GitHub publishes the advisory, outside the weekly schedule,
once the repository's Dependabot security updates are on. A package the repository patches gets none, and neither
does a package only another package depends on, which the advisory check covers.

#### Scenario: A week's updates arrive grouped

- **WHEN** several dependencies publish patch releases in one week
- **THEN** one Dependabot pull request includes them together

#### Scenario: An advisory brings its own pull request

- **WHEN** GitHub publishes an advisory for a package that a workspace declares and the repository does not patch
- **THEN** Dependabot opens a security update for it without waiting for the weekly run

## ADDED Requirements

### Requirement: Dependabot leaves the patched packages alone, and preflight checks each patch

Dependabot SHALL ignore every package named in the root `patchedDependencies`, so no update drops a patch, and a
package patched at one version SHALL be declared at exactly that version. A preflight check SHALL fail if a
`patchedDependencies` key names a version that is not installed.

#### Scenario: A week's grouped update leaves the patched packages

- **WHEN** Dependabot opens the week's grouped update
- **THEN** it bumps none of `expo-audio`, `markdown-to-jsx`, `react-native-enriched-html`, and `react-native-sse`

#### Scenario: A bumped patched package fails preflight

- **WHEN** a change installs a newer version of a patched package and leaves its `patchedDependencies` key
- **THEN** the preflight check fails naming the key, although the install itself succeeded
