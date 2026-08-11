## ADDED Requirements

### Requirement: Users carry a public username and an avatar source

The `users` table SHALL carry `username` (text, unique without regard to case), `username_normalized` (text, the comparison form the unique index is built on), `avatar_source` (enum of `generated`, `oauth`, `upload`, default `generated`), and `avatar_key` (text, nullable). Both name columns SHALL be NOT NULL, since the name is drawn inside the signup insert and no row may exist without one.

`avatar_key` SHALL hold the object-storage key and SHALL be null unless `avatar_source` is `upload`. The provider photo is resolved from the user's email address and stores nothing, so it needs no key.

Better Auth's existing `users.image` SHALL be left as it is. It stays a private account-surface field and SHALL NOT become the public avatar.

#### Scenario: A username is unique regardless of case

- **WHEN** two users would hold usernames differing only by case
- **THEN** the database refuses the second

#### Scenario: Only an upload carries a key

- **WHEN** a user's `avatar_source` is `generated` or `oauth`
- **THEN** their `avatar_key` is null

#### Scenario: The Better Auth image column is untouched

- **WHEN** the migration runs
- **THEN** `users.image` keeps its existing shape and meaning

### Requirement: Topic carries a denormalised subscriber count

The `topics` table SHALL carry `subscriber_count` (integer, default zero), holding the number of effective subscribers to that Topic — direct subscribers and audience-inherited members, never the owner's own subscription.

It SHALL be maintained by the write paths that change it rather than recomputed on read, and it is the column the public follower count and the popular ranking both read.

#### Scenario: The column defaults to zero

- **WHEN** a Topic is created
- **THEN** its `subscriber_count` is zero

#### Scenario: The count excludes the owner

- **WHEN** a Topic's owner holds their own subscription row
- **THEN** it is not reflected in `subscriber_count`

### Requirement: The change includes the social identity migration and the count backfill

The change SHALL include the migration adding the four `users` columns and `topics.subscriber_count`.

It SHALL also backfill `subscriber_count` from the existing subscription and audience-membership rows, and assign a username to every existing user. Without the backfill every Topic that already has subscribers reads zero, and without username assignment existing accounts have no profile route.

#### Scenario: The migration is applied with the change

- **WHEN** the change is deployed
- **THEN** the migration adding the user columns and the topic count has been applied

#### Scenario: Existing Topics carry their real counts

- **WHEN** the backfill completes
- **THEN** each existing Topic's `subscriber_count` matches its effective subscribers under the owner-excluded, audience-inclusive rule

#### Scenario: Existing users get usernames

- **WHEN** the backfill completes
- **THEN** every existing user holds a username meeting the uniqueness and blocklist rules
