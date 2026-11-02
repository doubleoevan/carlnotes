## ADDED Requirements

### Requirement: A push sets its recipient's update count as the app icon badge

Each Topic push and mention push SHALL set the app icon badge to the recipient's update count, read once per
recipient account when the push sends. The count SHALL be the sum the apps show: unseen chat mentions in the user's
teams' chat rooms, unread note edits and comments, and pending topic invitations counted once per topic.

#### Scenario: Every phone of one account shows its count

- **WHEN** a Scan pushes to a user with two phones, two unseen chat mentions, and one pending topic invitation
- **THEN** both phones' pushes set the badge to 3

#### Scenario: A recipient with nothing waiting clears the badge

- **WHEN** a Scan pushes to a user with no unseen chat mentions, no unread note changes, and no pending invitation
- **THEN** the push sets the badge to 0

#### Scenario: A count that fails to load leaves the badge alone

- **WHEN** a recipient's update count fails to load while a Scan push sends
- **THEN** that recipient's phones get the push with no badge, and their icon keeps its number

#### Scenario: An email and a username invitation to one topic count once

- **WHEN** a user holds an email invitation and a username invitation to the same topic
- **THEN** the push counts one pending invitation, as the Activity page shows one row
