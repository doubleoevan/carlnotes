## ADDED Requirements

### Requirement: An invitation that admits its recipient is spent

When an invitation admits the person it addresses through a different invitation to the same Team, the addressing invitation SHALL be consumed. It SHALL NOT remain in the recipient's invitations list as though it were unanswered, and its use SHALL count toward the sender's invite limit exactly as a directly accepted invitation does.

#### Scenario: The addressing invitation leaves the recipient's list

- **WHEN** an invitation admits the person it addresses through a different invitation
- **THEN** the addressing invitation is spent and no longer stands unanswered for that recipient

#### Scenario: The sender's limit counts it once

- **WHEN** an addressing invitation is consumed by admitting its recipient
- **THEN** it counts toward that sender's invite limit as an accepted invitation
