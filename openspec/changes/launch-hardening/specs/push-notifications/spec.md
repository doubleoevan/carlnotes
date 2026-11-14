## MODIFIED Requirements

### Requirement: A push sets its recipient's update count as the app icon badge

Each Topic push and mention push SHALL set the app icon badge to the recipient's update count. The counts of a chunk's
recipient accounts SHALL be counted together, grouped by account, once as the chunk sends, and never one account at a
time. The send SHALL report that it is alive before a chunk's first read. The count SHALL be the sum the apps show:
unseen chat mentions in the user's teams' chat rooms, unread note edits and comments, and pending topic invitations
counted once per topic.

#### Scenario: Every phone of one account shows its count

- **WHEN** a Scan pushes to a user with two phones, two unseen chat mentions, and one pending topic invitation
- **THEN** both phones' pushes set the badge to 3

#### Scenario: A recipient with nothing waiting clears the badge

- **WHEN** a Scan pushes to a user with no unseen chat mentions, no unread note changes, and no pending invitation
- **THEN** the push sets the badge to 0

#### Scenario: A count that fails to load leaves the badge alone

- **WHEN** a chunk's update counts fail to load while a Scan push sends
- **THEN** that chunk's recipients get the push with no badge, and their icons keep their numbers

#### Scenario: An email and a username invitation to one topic count once

- **WHEN** a user holds an email invitation and a username invitation to the same topic
- **THEN** the push counts one pending invitation, as the Activity page shows one row

#### Scenario: A chunk of a hundred is counted once

- **GIVEN** a Scan push to a hundred recipient accounts, some of them on teams
- **WHEN** the chunk sends
- **THEN** their update counts come from one grouped count, and each equals the count that the app shows that account
