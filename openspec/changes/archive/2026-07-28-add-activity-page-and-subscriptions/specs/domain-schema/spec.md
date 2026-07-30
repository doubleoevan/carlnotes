## MODIFIED Requirements

### Requirement: Topic invites are rows keyed by topic and email
The schema SHALL record invite-visibility access in a `topic_invites` table: `topic_id` referencing `topics` with cascade delete, the invited `email`, and an `invited_at` timestamp. `(topic_id, email)` SHALL be the composite primary key so re-inviting the same email is a no-op. Invites reference emails, not user rows, so a Topic can be shared with someone before they have an account. An invite row SHALL grant topic-page view access and stand as a pending subscription offer: a matching-email user with no subscription row on the Topic holds a pending invite, and no subscription exists until they accept. A Subscription row's `created_at` SHALL be its activation time — rows are created at self-subscribe or invite acceptance — and the invite-topic Finding visibility gate compares Scan start times against it.

#### Scenario: An invite is unique per topic and email and follows its topic
- **WHEN** the same email is invited to a Topic twice and the Topic is later deleted
- **THEN** exactly one invite row existed for that pair, and deleting the Topic removed it

#### Scenario: Pending needs no schema of its own
- **WHEN** an invited email's user has no subscription row on the Topic
- **THEN** that state is the pending invite, and accepting creates the subscription row whose `created_at` is the activation time
