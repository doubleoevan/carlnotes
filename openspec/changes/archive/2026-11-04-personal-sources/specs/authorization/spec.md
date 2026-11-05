## MODIFIED Requirements

### Requirement: Admin is platform authority that bypasses entitlement and overrides Topic authority
A user whose `role` is `admin` SHALL pass every entitlement check regardless of plan, and SHALL be the single override permitted to edit or delete any Topic regardless of `topic.owner_id`. A non-admin's authority over a Topic SHALL follow ownership and existing owning-Team edit rules, and a non-admin's entitlements SHALL come from their plan. Administrative authority SHALL NOT grant access to another sender’s Personal Source Entries, summary, or annotations.

Every check that asks whether a user may reach a Topic SHALL ask the gate, so that the override applies wherever it is asked rather than only where it is remembered. A write that asks the underlying visibility rule directly, bypassing the gate, SHALL be treated as a defect: it leaves an admin able to open a Topic and unable to act on it.

#### Scenario: An admin acts on a Topic they do not own
- **WHEN** `isAllowed(admin, "topic:edit", topic)` or `isAllowed(admin, "topic:delete", topic)` is asked for a Topic the admin does not own
- **THEN** the gate allows it

#### Scenario: A non-admin non-owner is rejected
- **WHEN** `isAllowed(user, "topic:edit", topic)` is asked for a user with neither ownership, owning-Team edit authority, nor admin authority
- **THEN** the gate rejects it

#### Scenario: An admin bypasses an entitlement limit
- **WHEN** an admin is at or beyond a plan limit (for example the topic cap) and asks the gate for the gated capability
- **THEN** the gate allows it regardless of the limit

#### Scenario: A write reaches the override through the gate
- **WHEN** a write decides whether a user may reach a Topic
- **THEN** it asks the gate rather than the visibility rule beneath it, so an admin is answered the same way there as on the page that offered the action


#### Scenario: Administrative authority does not reveal another sender's content
- **WHEN** an administrator requests another sender's private items, summary, references, or annotations
- **THEN** the sender-only read gate refuses access
- **AND** the admin may still contribute their own material wherever normal Topic edit authority permits

## ADDED Requirements

### Requirement: Personal sources capabilities use the shared authority and entitlement gate

Sending and importing SHALL use the central Topic edit gate. Reading private material SHALL require its sender identity and appropriate Topic read access. Deletion SHALL permit senders to clean up their own data. For non-admins, email SHALL require the sender's Plus or Premium capability on each request; AI Agent API keys SHALL retain their Premium gate. Admins SHALL bypass those plan gates while remaining subject to the shared 200-delivery ceiling and sender-only privacy.

#### Scenario: An owning-Team editor sends
- **WHEN** the user has ordinary Topic edit authority through the owning Team
- **THEN** their send may be accepted and its private content remains theirs alone

#### Scenario: A worker processes mail after downgrade or edit revocation
- **WHEN** the sender loses required entitlement or Topic edit permission after webhook receipt
- **THEN** the worker stores no new entry and does not report successful filing

#### Scenario: Plus includes forwarding
- **WHEN** a Plus sender forwards authenticated mail with shared send allowance remaining
- **THEN** email entitlement permits normal editable-Topic filing

#### Scenario: Free has send allowance but no forwarding
- **WHEN** a Free sender forwards authenticated mail while AI Agent sends remain available
- **THEN** no email is filed or charged, and Carl replies with Plus-or-Premium upgrade guidance

#### Scenario: A downgraded sender removes content
- **WHEN** a sender without Premium requests deletion of their own item or credential revocation
- **THEN** cleanup remains permitted without exposing another sender's content

### Requirement: AI Agent sends and forwarded emails share one daily allowance

One shared configuration constant SHALL define a placeholder ceiling of 200 accepted deliveries per UTC day across MCP, API, and forwarded email on every plan, to stop runaway AI Agents. Non-admin email entitlement SHALL be Plus or Premium; admins bypass that plan gate. Each accepted delivery SHALL count once across all destination Topics. Existing accepted sends and emails SHALL contribute to the same total. Days SHALL reset at UTC midnight; plan changes SHALL not reset usage.

#### Scenario: The common ceiling stops runaway AI Agents
- **WHEN** any account, including an admin, reaches 200 accepted sends and emails in one UTC day
- **THEN** further new deliveries are refused with “The day's limit is reached.” for AI sends or “The day's email limit is reached.” for email, and the UTC reset
- **AND** upgrading cannot raise this operational ceiling or clear its count

#### Scenario: Multiple AI Agents share the same allowance
- **WHEN** a user on any plan has accepted 200 sends across several AI Agents
- **THEN** the next new send is refused until the next UTC day
- **AND** switching clients or keys cannot reset the count

#### Scenario: Email and an AI Agent compete for the last slot
- **WHEN** a forwarded email and AI Agent send concurrently compete for the last shared daily acceptance
- **THEN** at most one consumes it and no accepted count exceeds the configured cap

#### Scenario: A Plus sender mixes email and AI Agent sends
- **WHEN** a Plus user accepts 150 AI Agent sends and 50 forwarded emails, in either order
- **THEN** the shared count is 200 and either transport's next new delivery is refused until reset
- **AND** every plan has the same 200 ceiling, with non-admin email available only on Plus and Premium

#### Scenario: Existing usage is retained
- **WHEN** the shared-cap implementation reads pre-existing send and email counters for the current UTC day
- **THEN** their accepted counts combine without resetting usage or counting multi-Topic items separately

#### Scenario: A plan changes during the day
- **WHEN** the user upgrades or downgrades after accepted deliveries
- **THEN** the same 200 ceiling applies to the unchanged combined count
- **AND** a count at or above the limit blocks new deliveries without deleting existing items

#### Scenario: A delivery has several destinations
- **WHEN** one send or email is accepted into several editable Topics
- **THEN** it consumes one allowance in the sender's shared daily pool and creates one independent item per Topic
- **AND** separate Topic-owner model charges do not multiply the delivery allowance

#### Scenario: A deleted entry is followed by another send
- **WHEN** an accepted entry is deleted on the same day
- **THEN** the consumed daily allowance is not refunded

#### Scenario: The day changes
- **WHEN** UTC midnight passes
- **THEN** the next accepted delivery counts toward the new day's pool without resurrecting prior content

### Requirement: Rejected and repeated deliveries do not consume allowance

A rejected, untargeted, duplicate, or replayed request SHALL not consume a fresh daily allowance. Imports and unfiled account-guidance, upgrade, cap, recipient-correction, and clarification emails SHALL not consume the shared send pool. The accepted-content transaction SHALL be atomic with quota consumption.

#### Scenario: Persistence fails after checking allowance
- **WHEN** the entry cannot be committed
- **THEN** no daily allowance remains consumed by that failed acceptance

#### Scenario: A retry reaches another API replica
- **WHEN** a second replica processes an already accepted delivery ID
- **THEN** it returns the prior outcome without another charge
