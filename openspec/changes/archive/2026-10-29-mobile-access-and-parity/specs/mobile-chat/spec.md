# Spec Delta

## ADDED Requirements

### Requirement: Mention counts show where the web shows them

The app SHALL show unread chat mention counts on the web's placements: the chat launcher pill, the room menu trigger,
each room in the room list, the Topic and Team headers, the Feed's Topic cards, the Team membership rows, the menu
button, and the Profile and Teams menu items, each as one summed badge in the web's style. A page badge's press SHALL
open that page's chat room while a mention waits, else the page.

#### Scenario: A mention arrives in a team room

- **WHEN** a teammate mentions the user in a Topic's team room while the user reads another screen
- **THEN** the launcher pill, the menu button, and the Teams item count it after the next poll, and the Topic's header
  badge opens that room

#### Scenario: Opening the room clears its count

- **WHEN** the user opens the room
- **THEN** its mentions are acknowledged and every badge that counted them drops

### Requirement: The app icon counts the waiting updates

The app SHALL badge its icon with the sum the web's tab title shows, the unread chat mentions, note changes, and topic
invitations the badge poll last read. The badge SHALL clear for a visitor and on sign-out. On iOS the app SHALL ask
for the badge permission once, the first time a signed-in user has a count, with alerts and sounds left off, and a
refused permission SHALL leave the icon bare. Until push notifications ship, the count SHALL change only while the
app is open.

#### Scenario: Updates wait when the app closes

- **WHEN** a user with two unread chat mentions sends the app to the background
- **THEN** the app icon shows 2 until the app opens again and the next poll reads the count

#### Scenario: The user signs out

- **WHEN** a user with a badged icon signs out
- **THEN** the icon's badge clears

### Requirement: Badge polling runs only in the foreground and online

The chat mention count and the waiting topic invitations SHALL be read by one shared poll every 45 seconds while the
app is in the foreground and online, at once on return to the foreground or on reconnect, one request per source in
flight, and never from the background. The room list SHALL reload when the mention count changes. A response from a
previous account SHALL be dropped, and sign-out SHALL clear the counts.

#### Scenario: The app goes to the background

- **WHEN** the app is backgrounded for ten minutes
- **THEN** no badge request is sent until it returns, then the counts are read at once

#### Scenario: The account changes mid-request

- **WHEN** a badge read is in flight and the user signs out
- **THEN** its response is dropped and no count shows for the visitor

#### Scenario: A focused topic screen's requests are documented

- **WHEN** a reader opens the mobile module guide
- **THEN** it states how many requests a signed-in, focused Topic screen sends per minute and which polls send them
