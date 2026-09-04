## MODIFIED Requirements

### Requirement: Invites are token rows targeting a Topic or a Team

The schema SHALL record invite access in an `invites` table: its own `id` as the primary key, a nullable `topic_id` referencing `topics` with cascade delete, a nullable `team_id` referencing `teams` with cascade delete, a unique `token`, a nullable `email`, a nullable `invited_user_id` referencing `users` with cascade delete, a nullable `invited_by_user_id` referencing `users` with set-null delete, `max_uses`, `used_count`, a nullable `expires_at`, a nullable `declined_at`, and an `invited_at` timestamp. A check SHALL require exactly one target set. The email records which identifier the sender used and the invited user its resolved recipient, so a resolved email invite holds both, each creation path sets its own column, and a link invite holds neither. `(topic_id, email)`, `(team_id, email)`, `(topic_id, invited_user_id)`, and `(team_id, invited_user_id)` SHALL each keep a unique index so re-inviting the same address or person is a no-op, across modes included, and because Postgres treats nulls as distinct, any number of link rows coexist under them.

An invite row is one grant reached three ways. An email invite SHALL have its address and a `max_uses` of one, and when that address already belongs to an account, `invited_user_id` SHALL name it too. A username invite SHALL have the invited user and a `max_uses` of one, and never an address. A link invite SHALL have neither and a limited `max_uses`, and whoever holds its token may accept it until the uses are spent or the expiry passes. `invited_by_user_id` is nullable for the rows that predate tokens, and its set-null delete means closing a sender's account leaves the invitation standing with no sender. `declined_at` records a recipient turning an invitation down, kept instead of deleted so sender reputation can be measured.

Invites reference what the sender knew: an email for someone who may hold no account, a user for someone named by username. A topic invite SHALL grant topic-page view access and stand as a pending subscription offer, with no subscription until acceptance or acceptance. A Subscription row's `created_at` SHALL be its activation time — rows are created at self-subscribe, invite acceptance, token acceptance, or team join — and the invite-topic Finding visibility gate compares Scan start times against it. A team invite SHALL grant membership on acceptance or acceptance, as the teams capability specifies.

#### Scenario: An address is unique per topic and an invite follows its topic

- **WHEN** the same email is invited to a Topic twice and the Topic is later deleted
- **THEN** exactly one invite row existed for that address and Topic, and deleting the Topic removed every invite on it

#### Scenario: Many link invites coexist on one topic

- **WHEN** several address-free invites are created for the same Topic
- **THEN** every one is stored, because the unique index on the topic and address pair treats their null addresses as distinct

#### Scenario: Pending needs no schema of its own

- **WHEN** an invited email's user has no subscription row on the Topic
- **THEN** that state is the pending invite, and accepting creates the subscription row whose `created_at` is the activation time

#### Scenario: An invite has exactly one target

- **WHEN** an invite row sets both a Topic and a Team, or neither
- **THEN** the database rejects the row

#### Scenario: Re-inviting a person is a no-op in either mode

- **WHEN** the same account is invited to one Topic twice, whether by username both times or by username after a resolved email invite
- **THEN** exactly one invite row exists for that person and Topic, enforced by the unique index on the target and invited user

#### Scenario: A accepted token is spent against its limit

- **WHEN** a token is accepted
- **THEN** its `used_count` increases, and a token whose count has reached its `max_uses` no longer accepts

#### Scenario: Visibility gains no link value

- **WHEN** the schema is inspected after link and team invites ship
- **THEN** `topics.visibility` still holds only public, invite, and private, because what a link grants is recorded on the invite row, not on the Topic
