## REMOVED Requirements

### Requirement: Every feed says the hosts are AI voices

**Reason**: The disclosure now says Carl and Vienna are AI hosts.

**Migration**: The requirement below replaces it with the same checks.

## ADDED Requirements

### Requirement: Every feed says Carl and Vienna are AI hosts

The feed's channel description, each item's description, and each transcript SHALL say that Carl and Vienna are AI
hosts, as Apple's guidelines require of a show with AI hosts.

#### Scenario: The channel discloses AI hosts

- **WHEN** a feed is fetched
- **THEN** its channel description says Carl and Vienna are AI hosts

#### Scenario: Each item discloses AI hosts

- **WHEN** a feed is fetched
- **THEN** every item's description says Carl and Vienna are AI hosts
