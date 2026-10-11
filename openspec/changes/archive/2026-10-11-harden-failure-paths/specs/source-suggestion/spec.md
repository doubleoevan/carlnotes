## MODIFIED Requirements

### Requirement: The daily suggestion limit counts in Redis

Each user SHALL be limited to a fixed number of suggestion model calls per UTC day, currently 300, and an admin SHALL be
exempt. The count SHALL live in Redis through the Redis store's fixed-window counter, keyed by the UTC day and the user,
so it survives a deploy, holds across every api replica, and starts over each UTC day. The route and the
`suggestTopicDraftSources` Topic Tool SHALL count against the same key. While Redis is unreachable the counter counts in
each replica's memory, so a user is bounded at the limit per replica and a call inside the limit is still allowed.

#### Scenario: A deploy does not reset the count

- **WHEN** a user has reached the daily suggestion limit and the api restarts
- **THEN** their next suggestion is still rejected for the limit

#### Scenario: Two replicas share one count

- **WHEN** a user's suggestion calls are split across two api processes inside one UTC day
- **THEN** the calls past the limit are rejected whichever process receives them

#### Scenario: A new day starts fresh

- **WHEN** the UTC day rolls over
- **THEN** the user's next suggestion counts as their first

#### Scenario: Redis down allows the call

- **WHEN** Redis is unreachable and a user asks for suggestions inside the limit
- **THEN** the call is allowed and no error reaches the user

#### Scenario: Redis down bounds one replica

- **WHEN** Redis is unreachable and a user's suggestion calls to one replica pass the daily limit
- **THEN** the calls past the limit are rejected
