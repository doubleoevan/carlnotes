# Spec Delta

## ADDED Requirements

### Requirement: A digest reaches only subscribers who can still read the Topic

A scan email's digest SHALL reach a subscriber only while that subscriber can read the Topic. A public or invite
Topic's active subscribers can read it. A private Topic SHALL reach only its owner and the active members of a Team
that owns or holds it, so a Topic made private stops reaching the followers it had. The Topic push reads the same
recipients.

#### Scenario: A Topic made private stops a follower's digest

- **GIVEN** a follower with no role on a Topic that was public when they followed it
- **WHEN** the owner makes the Topic private and a scheduled Scan succeeds
- **THEN** the follower receives no digest

#### Scenario: A team member of a private Topic still receives it

- **GIVEN** an active member of a Team that holds a private Topic, subscribed with email on
- **WHEN** a scheduled Scan of the Topic succeeds
- **THEN** the member receives the digest
