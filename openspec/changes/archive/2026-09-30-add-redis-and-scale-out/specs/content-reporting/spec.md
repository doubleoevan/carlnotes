## REMOVED Requirements

### Requirement: Topics and profiles carry a flag control routed to the admin inbox
**Reason**: The flag limit now counts in Redis, and the scenario that named the limit a cap now names it a limit. A scenario cannot be renamed in place, so the requirement is restated under a new name.
**Migration**: "Topics and profiles carry a flag control routed to the admin inbox, with a daily flag limit" replaces this requirement.

## ADDED Requirements

### Requirement: Topics and profiles carry a flag control routed to the admin inbox, with a daily flag limit

A Topic a reader can open and a public profile SHALL each carry a flag control. A submitted flag SHALL be delivered over the existing Resend sender to the address `SUPPORT_EMAIL` names, carrying enough to identify what was flagged and who flagged it. Only a signed-in reader may flag, so every flag names an account, and each account SHALL be limited to a fixed number of flags over a rolling day. The count SHALL live in Redis through the Redis store's fixed-window counter, keyed by the account, with the day starting at the account's first flag, so every api replica counts against one window and a deploy does not reset it. A flag the mailer rejects SHALL give its slot back. While Redis is unreachable the limit SHALL allow the flag, since the limit keeps nuisance out of the moderation inbox and protects no data.

Whether a Topic may be flagged SHALL be decided by the same visibility rule that decides whether it may be read, so an invite Topic is flaggable by the people invited to it. Anything a reader can be shown, a reader can report; gating the flag on public alone would leave invite Topics with an audience and no way to report what it sees.

#### Scenario: Flagging a Topic reaches the moderation address

- **WHEN** a reader flags a Topic they can open
- **THEN** an email reaches the moderation address identifying that Topic

#### Scenario: An invited reader may flag an invite Topic

- **WHEN** a reader who was invited to an invite Topic flags it
- **THEN** the flag is accepted and reaches the moderation address

#### Scenario: The daily limit rejects further flags

- **WHEN** an account submits a flag after reaching its daily limit
- **THEN** the flag is rejected with an answer naming the limit, and nothing is mailed

#### Scenario: The limit holds across replicas

- **WHEN** an account's flags are split across two api processes inside one day
- **THEN** the flags past the limit are rejected whichever process receives them

#### Scenario: A rejected send gives the slot back

- **WHEN** the mailer rejects a flag
- **THEN** the account's count is one lower, so the failed send does not count toward the limit

#### Scenario: Flagging a profile reaches the moderation address

- **WHEN** a reader flags a public profile
- **THEN** an email reaches the moderation address identifying that profile

#### Scenario: A subject the reader could not have seen is refused

- **WHEN** a flag names a Topic the sender cannot see, or a Topic or username that does not exist
- **THEN** the flag is refused in the same words for every one of those cases, disclosing nothing about which it was
