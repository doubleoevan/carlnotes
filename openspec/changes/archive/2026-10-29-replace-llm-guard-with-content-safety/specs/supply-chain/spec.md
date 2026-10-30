# Spec Delta

## MODIFIED Requirements

### Requirement: Dependabot keeps the lockfile, the actions, and the image bases current

The repository SHALL configure Dependabot version updates for the Bun lockfile, the GitHub Actions the workflows use,
and the Docker bases of the app image and the LiteLLM image, each checked weekly. Minor and patch
updates SHALL arrive grouped in one pull request, and a major update in a pull request of its own. A security update
SHALL arrive as soon as GitHub publishes the advisory, outside the weekly schedule, once the repository's Dependabot
security updates are on.

#### Scenario: A week's updates arrive grouped

- **WHEN** several dependencies publish patch releases in one week
- **THEN** one Dependabot pull request includes them together

#### Scenario: An advisory brings its own pull request

- **WHEN** GitHub publishes an advisory for a package in the lockfile
- **THEN** Dependabot opens a security update for it without waiting for the weekly run
