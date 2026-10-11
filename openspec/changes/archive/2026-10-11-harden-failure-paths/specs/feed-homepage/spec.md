## ADDED Requirements

### Requirement: The featured and popular order is shared across replicas

The ids of the featured and popular sections SHALL be read through the Redis store's read-through cache under one shared
key with a 60-second time to live, so every api replica serves the same order. Every change to a Topic's feature order,
setting one or releasing one, SHALL delete the shared key, so the next request on any replica reads the new order. While
Redis is unreachable the ids SHALL load from Postgres on each request.

#### Scenario: Two replicas read the same order after a featuring change

- **WHEN** an admin sets a Topic's feature order through one api replica and the homepage loads through another
- **THEN** both replicas serve the new order on their next request

#### Scenario: A released feature order clears the shared key

- **WHEN** a featured Topic's feature order is released by a visibility change or its deletion
- **THEN** the shared key is deleted, and the next request reads the order without that Topic

#### Scenario: Redis down reads Postgres

- **WHEN** Redis is unreachable
- **THEN** each homepage request reads the section ids from Postgres, and the order is correct

### Requirement: The search bar finds topics by name on the server

The search bar's topic matches SHALL come from `GET /api/topics/search?q=`, requested with the same debounce and the
same two-character minimum as the user and team searches, limited to five matches ordered by the shortest name first.
The route SHALL apply the `topic:view` rules in SQL, so a Topic the user has a role on, a public Topic with at least the
minimum shown findings, the user's own public Topic at any size, and an invite Topic the user is invited to or
subscribed to match, and a private Topic the user has no role on never does. A visitor SHALL match public Topics with at
least the minimum shown findings alone. The rules SHALL apply before the limit, so the five matches are the first five
the user may see. Finding matches SHALL keep coming from the loaded home feed.

#### Scenario: A public topic off the home feed is found

- **WHEN** a visitor types the name of a public Topic that is neither featured nor popular
- **THEN** the Topic is in the matches

#### Scenario: A private topic never appears

- **WHEN** a user types the exact name of a private Topic they have no role on
- **THEN** the Topic is not in the matches

#### Scenario: An invite topic appears only for its invitees

- **WHEN** two users type the name of an invite Topic, one invited to it and one not
- **THEN** the invited user sees the Topic and the other does not

#### Scenario: A small public topic appears for its owner alone

- **WHEN** a public Topic has fewer than the minimum shown findings and its owner and a visitor each type its name
- **THEN** the owner sees the Topic and the visitor does not

#### Scenario: The rules apply before the limit

- **WHEN** six private Topics and one public Topic share a name prefix a visitor types
- **THEN** the public Topic is in the matches
