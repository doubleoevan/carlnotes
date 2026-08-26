## MODIFIED Requirements

### Requirement: Recipients are the Topic's frequency-matched subscribers

Recipients SHALL be the distinct email addresses of the Topic's directly subscribed users whose `subscriptions.frequency` matches the Topic's frequency, whose subscription is active, and whose email preference is on. A subscriber reached more than once SHALL be emailed once — duplicate addresses SHALL be collapsed. A Topic with no matched subscribers SHALL send no email.

A team member's delivery goes through their own Subscription row like anyone else's: written muted at join, it makes them a recipient only after they turn the email preference on.

#### Scenario: A direct subscriber at the matching frequency is a recipient

- **WHEN** a user is subscribed to the Topic with `frequency` equal to the Topic's frequency, active, and email on
- **THEN** that user's email is a recipient

#### Scenario: A mismatched-frequency subscriber is excluded

- **WHEN** a subscriber's `frequency` does not match the Topic's frequency
- **THEN** that subscriber is not a recipient

#### Scenario: A muted team member is not a recipient

- **WHEN** a team member's Subscription on a team Topic still has its email preference off
- **THEN** no scan email reaches them, and turning the preference on makes them a recipient from the next send

#### Scenario: No matched subscribers means no send

- **WHEN** a Topic has no active, email-enabled subscriber at its frequency
- **THEN** no email is sent
