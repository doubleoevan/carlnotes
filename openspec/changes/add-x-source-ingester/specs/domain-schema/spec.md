## MODIFIED Requirements

### Requirement: Source is a topic input with an optional Integration
A Source SHALL belong to a Topic and declare a `kind` from {url, rss, reddit, youtube, search, x, composio, plugin}. Its `integration_id` MUST be nullable so credential-free sources (RSS) need no Integration, and MUST reference `integrations` when present. A Source whose ingester authenticates with one operator-level key rather than a per-user grant — `search` and `x` — SHALL leave `integration_id` null, since the key belongs to the deployment and not to any user. An `x` Source SHALL carry the handle it follows in its `config`, so it names an account the way a `reddit` Source names a subreddit.

#### Scenario: A keyless source has no integration
- **WHEN** an RSS source is created
- **THEN** its `integration_id` is null and the row is valid

#### Scenario: A credentialed source references an integration
- **WHEN** a composio source is created
- **THEN** its `integration_id` references an `integrations` row

#### Scenario: An x source names a handle and holds no integration
- **WHEN** a Source of kind `x` is created with a handle in its `config`
- **THEN** the row is valid, its `config` carries that handle, and its `integration_id` is null
