## MODIFIED Requirements

### Requirement: Admin is platform authority that bypasses entitlement and overrides Topic authority
A user whose `role` is `admin` SHALL pass every entitlement check regardless of plan, and SHALL be the single override permitted to edit or delete any Topic regardless of `topic.owner_id`. A non-admin's authority over a Topic SHALL remain its `owner_id`, and a non-admin's entitlements SHALL come from their plan.

Every check that asks whether a user may reach a Topic SHALL ask the gate, so that the override applies wherever it is asked rather than only where it is remembered. A write that asks the underlying visibility rule directly, bypassing the gate, SHALL be treated as a defect: it leaves an admin able to open a Topic and unable to act on it.

#### Scenario: An admin acts on a Topic they do not own
- **WHEN** `isAllowed(admin, "topic:edit", topic)` or `isAllowed(admin, "topic:delete", topic)` is asked for a Topic the admin does not own
- **THEN** the gate allows it

#### Scenario: A non-admin non-owner is rejected
- **WHEN** `isAllowed(user, "topic:edit", topic)` is asked for a user who is neither the owner nor an admin
- **THEN** the gate rejects it

#### Scenario: An admin bypasses an entitlement limit
- **WHEN** an admin is at or beyond a plan limit (for example the topic cap) and asks the gate for the gated capability
- **THEN** the gate allows it regardless of the limit

#### Scenario: A write reaches the override through the gate
- **WHEN** a write decides whether a user may reach a Topic
- **THEN** it asks the gate rather than the visibility rule beneath it, so an admin is answered the same way there as on the page that offered the action
