## MODIFIED Requirements

### Requirement: The bell toggles this user's Subscription
The 🔔 bell SHALL toggle a Subscription for the current user through the api, rendering filled when subscribed and outline when not. Subscribing SHALL be permitted on public Topics for anyone and on invite Topics for invited users — where subscribing IS accepting the invite, activating the subscription from that moment and carrying the same next-scan disclaimer as the Activity page's accept control. The api SHALL reject subscription writes on private Topics.

#### Scenario: Subscribing persists
- **WHEN** a non-owner activates the bell on a public Topic and reloads
- **THEN** the bell renders filled and a Subscription row exists for that user

#### Scenario: The bell accepts an invite
- **WHEN** an invited user activates the bell on an invite Topic
- **THEN** their pending invite becomes an active subscription, and the next-scan expectation is shown
