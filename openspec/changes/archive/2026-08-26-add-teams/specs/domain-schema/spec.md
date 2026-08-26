## RENAMED Requirements

- FROM: `### Requirement: Topic invites are token rows, with or without an address`
- TO: `### Requirement: Invites are token rows targeting a Topic or a Team`

- FROM: `### Requirement: Topic carries a denormalised subscriber count`
- TO: `### Requirement: Topic includes a denormalised subscriber count`

## MODIFIED Requirements

### Requirement: Canonical domain entities are persisted

The schema SHALL define the domain vocabulary as Drizzle tables: Topic, Source, Scan, Resource, Finding, Subscription, Team, and Integration, plus a `users` table and the `team_members` and `team_topics` joins. Entity names MUST be singular in code and plural as table names. No rejected term (Channel, Item, Update, Run, Crawl, Group, List, Cohort, Follow, Org, Workspace) SHALL be used as a domain entity, table, or type name. This scopes to domain nouns only — incidental substrings in standard column names (e.g. `updated_at`, `created_at`) are exempt.

#### Scenario: Schema type-checks and exposes every entity

- **WHEN** `bunx tsc -b` runs against the repository
- **THEN** `db/schema.ts` compiles and exports a Drizzle table for each of `topics`, `sources`, `scans`, `resources`, `findings`, `subscriptions`, `teams`, `team_members`, `team_topics`, `integrations`, and `users`

#### Scenario: No rejected domain noun appears

- **WHEN** the schema's entity, table, and type names are inspected
- **THEN** none is a rejected domain noun, and standard columns like `updated_at` are not flagged

### Requirement: Users table anchors ownership

The schema SHALL define a `users` table shaped to Better Auth's current core columns (as documented by its Drizzle adapter) so Better Auth can adopt it at launch without a rewrite. Email MUST be unique.

#### Scenario: A user owns records via foreign keys

- **WHEN** a topic, team membership, or integration row is created
- **THEN** its owner/user reference is a foreign key to `users.id`

#### Scenario: Email is unique

- **WHEN** two user rows are inserted with the same email
- **THEN** the database rejects the second insert

### Requirement: Topic is the configuration and the authority anchor

A Topic SHALL have its name, context document, frequency, privacy level (public, invite, or private), and `owner_id` referencing `users`. Topic authority MUST be expressed through `owner_id` and, where teams hold the Topic — the owning `team_id` and the `team_topics` shares — through the member roles on `team_members` — the one table that may hold a role column standing for Topic authority, and only as the gate's input. No other table may hold a role column or role enum for it. `users.role` remains the platform admin override, which is not a Topic authority.

#### Scenario: Topic records its owner and privacy

- **WHEN** a topic row is created
- **THEN** it stores `owner_id`, a privacy value from {public, invite, private}, and a frequency value

#### Scenario: Topic authority is ownership plus membership, through the gate

- **WHEN** the schema is inspected
- **THEN** Topic authority is expressed through `owner_id` and `team_members.role`, both consumed only by the gate, with `users.role` the platform admin exception

#### Scenario: Topic authority is ownership, not a role
- **WHEN** the schema is inspected
- **THEN** Topic authority is expressed only through `owner_id`, and no table carries a role column or role enum standing for it
- **AND** the one exception is `users.role`, the platform admin override, which is not a Topic authority


### Requirement: Invites are token rows targeting a Topic or a Team

The schema SHALL record invite access in an `invites` table: its own `id` as the primary key, a nullable `topic_id` referencing `topics` with cascade delete, a nullable `team_id` referencing `teams` with cascade delete, a unique `token`, a nullable `email`, a nullable `invited_by_user_id` referencing `users`, `max_uses`, `used_count`, a nullable `expires_at`, a nullable `revoked_at`, and an `invited_at` timestamp. A check SHALL require exactly one target set. `(topic_id, email)` and `(team_id, email)` SHALL each keep a unique index so re-inviting the same address is a no-op, and because Postgres treats nulls as distinct, any number of address-free rows coexist under them.

An invite row is one grant reached two ways. An email invite SHALL have its address and a `max_uses` of one. A link invite SHALL have a null email and a limited `max_uses`, and whoever holds its token may accept it until the uses are spent, the expiry passes, or `revoked_at` is set. `invited_by_user_id` is nullable only for the rows that existed before invites had tokens, which never recorded who wrote them.

Invites reference emails, not user rows, so a Topic or a Team can be shared with someone before they have an account. A topic invite SHALL grant topic-page view access and stand as a pending subscription offer: a matching-email user with no subscription row on the Topic holds a pending invite, and no subscription exists until they accept or accept. A Subscription row's `created_at` SHALL be its activation time — rows are created at self-subscribe, invite acceptance, token acceptance, or team join — and the invite-topic Finding visibility gate compares Scan start times against it. A team invite SHALL grant membership on acceptance, as the teams capability specifies.

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

#### Scenario: A accepted token is spent against its limit

- **WHEN** a token is accepted
- **THEN** its `used_count` increases, and a token whose count has reached its `max_uses` no longer accepts

#### Scenario: Visibility gains no link value

- **WHEN** the schema is inspected after link and team invites ship
- **THEN** `topics.visibility` still holds only public, invite, and private, because what a link grants is recorded on the invite row instead of on the Topic

### Requirement: Users carry a public username and an avatar source

The `users` table SHALL include `username` (text), `username_normalized` (text, the comparison form), `avatar_source` (enum of `generated`, `oauth`, `upload`, default `generated`), and `avatar_key` (text, nullable). Both name columns SHALL be NOT NULL, since the name is drawn inside the signup insert and no row may exist without one. Uniqueness SHALL be enforced by a unique index on `users.username_normalized`.

`avatar_key` SHALL hold the object-storage key and SHALL be null unless `avatar_source` is `upload`. The provider photo is resolved from the user's email address and stores nothing, so it needs no key.

Better Auth's existing `users.image` SHALL be left as it is. It stays a private account-surface field and SHALL NOT become the public avatar.

#### Scenario: A username is unique regardless of case

- **WHEN** two users would hold usernames differing only by case
- **THEN** the unique index on `users.username_normalized` rejects the second

#### Scenario: Only an upload has a key

- **WHEN** a user's `avatar_source` is `generated` or `oauth`
- **THEN** their `avatar_key` is null

#### Scenario: The Better Auth image column is untouched

- **WHEN** the migration runs
- **THEN** `users.image` keeps its existing shape and meaning


#### Scenario: Only an upload carries a key

- **WHEN** a user's `avatar_source` is `generated` or `oauth`
- **THEN** their `avatar_key` is null


### Requirement: Subscription joins a subscriber to a Topic

A Subscription SHALL reference a Topic and a subscribing user, and SHALL include delivery preferences. `subscriber_user_id` SHALL be NOT NULL: a user is the only kind of subscriber, and a Team reaches a Topic through its members' own Subscription rows instead of through a subscriber of its own.

#### Scenario: Every subscription names its user

- **WHEN** a subscription row is written without a subscribing user
- **THEN** the database rejects the row

#### Scenario: Team delivery is per member

- **WHEN** a Team holds a Topic
- **THEN** each member's delivery is their own Subscription row, and no row subscribes the Team itself

### Requirement: Topic includes a denormalised subscriber count

The `topics` table SHALL include `subscriber_count` (integer, default zero), holding the number of the Topic's subscribers — every active subscribing user, never the owner's own subscription.

It SHALL be maintained by the write paths that change it instead of recomputed on read, and it is the column the public follower count and the popular ranking both read.

#### Scenario: The column defaults to zero

- **WHEN** a Topic is created
- **THEN** its `subscriber_count` is zero

#### Scenario: The count excludes the owner

- **WHEN** a Topic's owner holds their own subscription row
- **THEN** it is not reflected in `subscriber_count`

## ADDED Requirements

### Requirement: Room messages are an ordered, encrypted log

A room message table SHALL include an ordered bigint identity id (the SSE cursor needs ordering a uuid cannot give), the Topic, the holding team as a NOT NULL `team_id` — each holding team's room keeps its own log — a nullable author reference cleared when the account closes, the author name recorded at post time (Carl's rows record his name with no account reference), a nullable reply reference to a prior message, encrypted content using the chat text helper, and created_at. A companion table SHALL hold one running summary per room, its primary key the `(topic_id, team_id)` pair that names the room, with the message id it is summarized through. The room attachments table SHALL name its team the same way, NOT NULL.

#### Scenario: Ids order the log

- **WHEN** messages are written concurrently
- **THEN** their ids give one total order a cursor can resume from

#### Scenario: Attribution survives the author

- **WHEN** an author's account closes
- **THEN** the message keeps the recorded name with the account reference cleared, and never reads as Carl's

### Requirement: Signal capture columns and tables exist and stay inert

`findings` SHALL gain nullable `rated_by_user_id`, `rated_team_id`, and `rated_role`, written when a rating is cast and cleared with it. A feedback table SHALL store verbatim text against a Finding, its Topic, and its author. A view-event table SHALL record per-user opens and dismissals. No read path in scoring, ranking, retrieval, or the feed SHALL touch any of them.

#### Scenario: The captures write and nothing reads them

- **WHEN** ratings, feedback, and view events accumulate
- **THEN** the rows exist as specified and no query outside their own writes selects them

### Requirement: The change includes the teams migrations

The change SHALL include generated migrations that, in order: add the unique index on `users.username_normalized`; create `teams` with its caseless unique name index, `team_members`, `topics.team_id` for the owning team, and the `team_topics` share join — team, topic, and created_at, a primary key on the pair, and an index on the topic; drop the audiences scaffolding and make `subscriber_user_id` NOT NULL; rename the invites table with its target columns and checks; add the signal capture columns and tables; and create the room tables with their NOT NULL `team_id` columns. Applying them to a database at the current schema MUST succeed without altering any other table.

#### Scenario: No deploy window lacks usernames

- **WHEN** the usernames migration completes
- **THEN** every existing user already holds a username row, backfilled inside the same migration

## REMOVED Requirements

### Requirement: Audience is a named set of users that subscribes as one

**Reason**: Superseded by Team. The audiences scaffolding was never given a write path — no route, no UI, no seed — so both tables are empty in every real database and every reader is a dead branch. Team is the named set of people this schema slot was reserved for, and keeping both would be two nouns for one concept.

**Migration**: Drop `audiences`, `audience_members`, and `subscriptions.subscriber_audience_id` with its XOR check, and make `subscriptions.subscriber_user_id` NOT NULL. No data moves, because none exists.
