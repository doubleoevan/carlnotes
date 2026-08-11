# content-reporting Specification

## Purpose
TBD - created by archiving change social-profiles-and-sharing. Update Purpose after archive.
## Requirements
### Requirement: Topics and profiles carry a flag control routed to the admin inbox

A Topic a reader can open and a public profile SHALL each carry a flag control. A submitted flag SHALL be delivered over the existing Resend sender to the address `SUPPORT_EMAIL` names, carrying enough to identify what was flagged and who flagged it. Only a signed-in reader may flag, so every flag names an account, and each account SHALL be capped at a fixed number of flags over a rolling day.

Whether a Topic may be flagged SHALL be decided by the same visibility rule that decides whether it may be read, so an invite Topic is flaggable by the people invited to it. Anything a reader can be shown, a reader can report; gating the flag on public alone would leave invite Topics with an audience and no way to report what it sees.

#### Scenario: Flagging a Topic reaches the moderation address

- **WHEN** a reader flags a Topic they can open
- **THEN** an email reaches the moderation address identifying that Topic

#### Scenario: An invited reader may flag an invite Topic

- **WHEN** a reader who was invited to an invite Topic flags it
- **THEN** the flag is accepted and reaches the moderation address

#### Scenario: The daily cap rejects further flags

- **WHEN** an account submits a flag after reaching its daily cap
- **THEN** the flag is rejected with an answer naming the limit, and nothing is mailed

#### Scenario: Flagging a profile reaches the moderation address

- **WHEN** a reader flags a public profile
- **THEN** an email reaches the moderation address identifying that profile

#### Scenario: A subject the reader could not have seen is refused

- **WHEN** a flag names a Topic the sender cannot see, or a Topic or username that does not exist
- **THEN** the flag is refused in the same words for every one of those cases, disclosing nothing about which it was

### Requirement: The flag control is the whole moderation surface while no free-text content exists

The flag control SHALL be the entire moderation surface for this change. No queue, appeal path, or takedown workflow SHALL be built here.

This is proportionate only because the product carries no user-authored prose: there are no bios, comments, or reader-facing descriptions, so what can be reported is a Topic name, a username, and links to third-party content. Shipping any free-text field that other users can read SHALL be the trigger for building more than this.

#### Scenario: No moderation queue is introduced

- **WHEN** a report is submitted
- **THEN** it is delivered as email and no in-app moderation queue, appeal, or takedown flow exists

#### Scenario: A free-text field raises the bar

- **WHEN** a user-authored free-text field readable by other users is proposed
- **THEN** the moderation surface is revisited before it ships, since the reasoning that makes one flag control sufficient no longer holds

