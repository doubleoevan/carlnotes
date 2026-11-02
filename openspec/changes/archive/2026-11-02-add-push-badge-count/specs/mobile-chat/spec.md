## MODIFIED Requirements

### Requirement: The app icon counts the waiting updates

The app SHALL badge its icon with the sum the web's tab title shows, the unread chat mentions, note changes, and topic
invitations the badge poll last read. The badge SHALL clear for a visitor and on sign-out. The app SHALL NOT ask for a
permission to badge the icon. On iOS the badge permission SHALL be requested with the notification permission, and
until it is granted the icon SHALL stay bare. While the app is closed, each push SHALL set the count the server read
for the recipient when it sent, so the count changes when a push arrives as well as while the app is open.

#### Scenario: Updates wait when the app closes

- **WHEN** a user with two unread chat mentions sends the app to the background
- **THEN** the app icon shows 2 until a push arrives or the app opens again and the next poll reads the count

#### Scenario: The user signs out

- **WHEN** a user with a badged icon signs out
- **THEN** the icon's badge clears

#### Scenario: The badge asks nothing at launch

- **WHEN** a signed-in user with a count opens the app on an iOS phone whose notification permission is undetermined
- **THEN** no permission prompt shows, and the icon stays bare until the user grants the notification permission

#### Scenario: A push leaves the count alone

- **WHEN** a Topic push arrives while the app is closed and the user's count has not changed since the last poll
- **THEN** the icon keeps the count it shows

#### Scenario: A push raises the count while the app is closed

- **WHEN** a user whose icon shows 2 is mentioned in a chat room while the app is closed
- **THEN** the mention push sets the icon to 3 without the app opening
