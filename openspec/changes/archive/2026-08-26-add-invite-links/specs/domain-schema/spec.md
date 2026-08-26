## RENAMED Requirements

- FROM: `### Requirement: Topic invites are rows keyed by topic and email`
- TO: `### Requirement: Topic invites are token rows, with or without an address`

## MODIFIED Requirements

### Requirement: Topic invites are token rows, with or without an address

The schema SHALL record invite-visibility access in a `topic_invites` table: its own `id` as the primary key, `topic_id` referencing `topics` with cascade delete, a unique `token`, a nullable `email`, a nullable `invited_by_user_id` referencing `users`, `max_uses`, `used_count`, a nullable `expires_at`, a nullable `revoked_at`, and an `invited_at` timestamp. `(topic_id, email)` SHALL keep a unique index so re-inviting the same address is a no-op, and because Postgres treats nulls as distinct, any number of address-free rows coexist under it.

An invite row is one grant reached two ways. An email invite SHALL have its address and a `max_uses` of one. A link invite SHALL have a null email and a limited `max_uses`, and whoever holds its token may accept it until the uses are spent, the expiry passes, or `revoked_at` is set. `invited_by_user_id` is nullable only for the rows that existed before invites had tokens, which never recorded who wrote them.

Invites reference emails, not user rows, so a Topic can be shared with someone before they have an account. A pending invite row — not revoked, not expired, its uses not spent — SHALL grant a user whose account email matches its address topic-page view access and stand as their pending subscription offer: no subscription exists until they accept or accept, and a row that is no longer pending grants nothing. A Subscription row's `created_at` SHALL be its activation time — rows are created at self-subscribe, invite acceptance, or token acceptance — and the invite-topic Finding visibility gate compares Scan start times against it.

#### Scenario: An invite is unique per topic and email and follows its topic

- **WHEN** the same email is invited to a Topic twice and the Topic is later deleted
- **THEN** exactly one invite row existed for that address and Topic, and deleting the Topic removed every invite on it

#### Scenario: Many link invites coexist on one topic

- **WHEN** several address-free invites are created for the same Topic
- **THEN** every one is stored, because the unique index on the topic and address pair treats their null addresses as distinct

#### Scenario: Pending needs no schema of its own

- **WHEN** an invited email's user has no subscription row on the Topic
- **THEN** that state is the pending invite, and accepting creates the subscription row whose `created_at` is the activation time

#### Scenario: A accepted token is spent against its limit

- **WHEN** a token is accepted
- **THEN** its `used_count` increases, and a token whose count has reached its `max_uses` no longer accepts

#### Scenario: Visibility gains no link value

- **WHEN** the schema is inspected after link invites ship
- **THEN** `topics.visibility` still holds only public, invite, and private, because what a link grants is recorded on the invite row, not on the Topic
