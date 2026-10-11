# supply-chain Specification

## Purpose
TBD - created by archiving change survive-a-viral-day. Update Purpose after archive.

## Requirements

### Requirement: Dependabot keeps the lockfile, the actions, and the image bases current

The repository SHALL configure Dependabot version updates for the Bun lockfile, the GitHub Actions the workflows use,
and the Docker bases of the app image, the LiteLLM image, and the scanner image, each checked weekly. Minor and patch
updates to production dependencies SHALL arrive grouped in one pull request, and development dependencies in another.
A security update SHALL arrive as soon as GitHub publishes the advisory, outside the weekly schedule, once the
repository's Dependabot security updates are on.

#### Scenario: A week's updates arrive grouped

- **WHEN** several production dependencies publish patch releases in one week
- **THEN** one Dependabot pull request includes them together

#### Scenario: An advisory brings its own pull request

- **WHEN** GitHub publishes an advisory for a package in the lockfile
- **THEN** Dependabot opens a security update for it without waiting for the weekly run

### Requirement: Every CI run audits the lockfile against the GitHub Advisory Database, report-only

The CI gate SHALL run `bun audit`, which checks the lockfile against the GitHub Advisory Database, on every push and
pull request into main, and SHALL report what it finds in the run's log without failing the run. A new advisory SHALL
never block an unrelated push; the Dependabot security update is what fixes it.

#### Scenario: An open advisory is visible

- **WHEN** a push runs CI while the lockfile holds a package with an open advisory
- **THEN** the audit step lists the advisory in the run's log and the run's result is decided by the gate alone

### Requirement: CodeQL analyzes the TypeScript

A CodeQL workflow SHALL analyze the repository's JavaScript and TypeScript with the extended security queries on
every push and pull request into main and once a week, with no build step, and SHALL write its findings as code
scanning alerts. The workflow SHALL hold only the permissions it needs: reading the repository and writing security
events.

#### Scenario: A pull request shows its new findings

- **WHEN** a pull request introduces code a security query flags
- **THEN** the CodeQL check reports the finding on that pull request

### Requirement: Actions and images are pinned to what was reviewed

Every `uses:` in the workflows SHALL name a full commit SHA, with the version it was resolved from in a comment beside
it, so a moved tag changes nothing until Dependabot proposes the new commit. Every image the Dockerfiles build from or
copy from SHALL name its digest beside its tag.

#### Scenario: A re-pointed tag does not reach CI

- **WHEN** an action's major tag is moved to a new commit
- **THEN** the workflows keep running the commit they name until a pull request changes it

### Requirement: A new package version waits three days before an install picks it

`bunfig.toml` SHALL set a minimum release age of three days, so `bun add` and `bun update` never pick a version
published inside that window, the time in which a hijacked release is usually pulled. CI installs from the frozen
lockfile, so the setting resolves nothing there.

#### Scenario: A release from this morning is skipped

- **WHEN** a developer runs `bun update` on a package whose newest version is a day old
- **THEN** the update resolves the newest version at least three days old

### Requirement: The repository says how to report a vulnerability

`SECURITY.md` SHALL tell a researcher to report privately, through GitHub's private vulnerability reporting or the
contact in the site's `security.txt`, SHALL state the response times, and SHALL list the checks above.

#### Scenario: A researcher finds the policy

- **WHEN** a researcher opens the repository's Security tab
- **THEN** the policy names a private channel and what to expect after reporting

### Requirement: Dependency changes run through the pinned Bun

A change to `package.json` dependencies SHALL be made with the Bun version the Dockerfile and CI pin, so the lockfile
keeps the format that Bun reads; a lockfile written by a newer Bun SHALL NOT be committed.

#### Scenario: CI reads the lockfile

- **WHEN** a dependency change is pushed
- **THEN** CI's frozen install reads the lockfile without rewriting it
