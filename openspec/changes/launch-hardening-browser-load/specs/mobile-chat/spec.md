## MODIFIED Requirements

### Requirement: Badge polling runs only in the foreground and online

The chat mention count, the waiting topic invitations, the note badges, and the unseen Comment Mentions SHALL be read
by one shared poll every 45 seconds while the app is in the foreground and online, at once on return to the foreground
or on reconnect, one request in progress, and never from the background. Each poll SHALL send one badges request, which
returns every count. The room list SHALL reload when the mention count changes. A response from a previous account
SHALL be dropped, and sign-out SHALL clear the counts.

#### Scenario: The app goes to the background

- **WHEN** the app is backgrounded for ten minutes
- **THEN** no badge request is sent until it returns, then the counts are read at once

#### Scenario: The account changes mid-request

- **WHEN** a badge read is in flight and the user signs out
- **THEN** its response is dropped and no count shows for the visitor

#### Scenario: A focused topic screen's requests are documented

- **WHEN** a reader opens the mobile module guide
- **THEN** it states how many requests a signed-in, focused Topic screen sends per minute and which polls send them

#### Scenario: A poll is one request

- **WHEN** the poll runs in the foregrounded app
- **THEN** it sends one badges request, and no request per count
