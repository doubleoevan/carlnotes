## Purpose

A page that waits on a film, a Topic Post Discussion, or a Scan polls a small status and never a whole page. This
capability states the status reads, what one costs, who may read one, and how the polls use them.

## ADDED Requirements

### Requirement: A film's, a discussion's, and a Scan's status each have a read after /api/status/

The api SHALL serve three status reads after the one prefix `/api/status/`: a film's render status, a Topic Post
Discussion's recording status, and a Scan's status. Each SHALL return the status alone, with no field of the page that
shows it.

#### Scenario: A film's status holds no page field

- **WHEN** a client reads the status of a film that is rendering
- **THEN** the response holds the status, and no film url, poster, captions, or other field of the page

#### Scenario: A discussion's status holds no turn

- **WHEN** a client reads the status of a Topic Post Discussion that has published
- **THEN** the response holds the status and none of the transcript

### Requirement: A status read is a key read that the status writes clear

Each status read SHALL load one row through the Redis store's read-through cache, with a lifetime under a third of its
poll's shortest interval. Every pipeline write of that status SHALL delete its key inside the write's own activity, so
the next read loads the new status and no workflow changes. While Redis is unreachable each read SHALL load the row.

#### Scenario: A watched Scan costs one row read a lifetime

- **WHEN** 200 readers poll one Scan's status inside the key's lifetime
- **THEN** one read loads the Scan's row, and every other read is served from the key with no query

#### Scenario: A finished film shows on the next poll

- **WHEN** a film's ready write lands
- **THEN** its status key is deleted, and the next status read returns ready

#### Scenario: A lost delete ends inside one poll

- **WHEN** a status write's key delete fails
- **THEN** the old status is served for less than a third of the poll's interval, and the poll after it reads the new
  one

#### Scenario: Redis down reads the row

- **WHEN** Redis is unreachable and a page polls a status
- **THEN** the read loads the row and returns its status

### Requirement: A poll reads the status, and its page once the status leaves in progress

A page that waits on a film, a discussion, or a Scan SHALL poll that subject's status read. It SHALL read its page once
if the status leaves in progress, so the result shows with no reload, and a failed status SHALL stop the poll. A
released app that polls a whole page SHALL keep working on the routes it reads.

#### Scenario: A status in progress reads no page

- **WHEN** a status poll returns rendering, recording, or running
- **THEN** no page read is sent

#### Scenario: A landed film replaces the card

- **GIVEN** a podcast episode page that shows the filming card
- **WHEN** a status poll returns ready
- **THEN** the page reads its page once and shows the film player in the card's place, with no reload

#### Scenario: A closed-out row stops the poll

- **WHEN** the sweep fails a film stuck rendering, and the next status poll returns failed
- **THEN** the page reads its page once, shows no filming card, and sends no further status read

### Requirement: A waiting reader's poll is as quick as it was

A status poll SHALL keep the interval its page poll had: 30 seconds for a film, 15 seconds for a discussion, and for a
Scan 3 seconds, then 10 seconds after half a minute, then 30 seconds after two minutes. A reader who may not scan the
Topic SHALL start the Scan's poll at 10 seconds. No reader who waits on a result they started SHALL get a slower poll.

#### Scenario: The owner sees a Scan finish within seconds

- **WHEN** a Topic's owner starts a Scan that finishes inside half a minute
- **THEN** their page polls its status every 3 seconds and reads the page once it finishes

#### Scenario: A visitor's Scan poll starts at ten seconds

- **WHEN** a visitor opens a public Topic whose Scan is running
- **THEN** their page polls the Scan's status every 10 seconds, then every 30 seconds after two minutes

### Requirement: A public subject's status is read without credentials

A status read of a subject on a public Topic SHALL be served to anyone. The web and the mobile app SHALL send it without
credentials, as they send a public Topic's counts, for every reader but the one who waits on the result. A status read
of any other subject SHALL pass the access check of the page that shows it, and a caller who fails it SHALL be answered
as for a subject that does not exist.

#### Scenario: A watching user's poll reads no session

- **WHEN** a signed-in user who did not start it watches a public Topic's Scan
- **THEN** each status request carries no cookie, and no session is read for it

#### Scenario: The waiting reader reads with their session

- **WHEN** the owner who started a Scan polls its status
- **THEN** each request carries their session, so the edge never answers it

#### Scenario: A private Topic's status needs the page's access

- **WHEN** someone who may not open a private Topic requests its Scan's status
- **THEN** the response is the same as for a Scan that does not exist

### Requirement: A status read counts no view and no play

A status read SHALL count no view and no play, and a poll SHALL fetch no audio or film route.

#### Scenario: A film's status poll counts no play

- **WHEN** a page polls a rendering film's status for an hour
- **THEN** the podcast episode's play counts and its listener count do not change

### Requirement: A poll pauses while its page is hidden

Every poll for a result SHALL pause while its tab is hidden, the app is in the background, or the device is offline, and
SHALL read at once on return. The web's linked podcast episode poll and its topic image render poll SHALL pause the same
way and SHALL each stop at a time limit. The mobile app SHALL tell each film and discussion poll whether its screen is
the active one, and a poll on a covered screen SHALL stop.

#### Scenario: A hidden tab sends no status read

- **WHEN** a tab that shows a filming card is hidden for ten minutes
- **THEN** it sends no status read until it shows again, then reads at once

#### Scenario: A covered screen stops polling

- **WHEN** a user opens another screen over a podcast episode screen whose film is rendering
- **THEN** that screen's status poll stops until it is the active screen again

#### Scenario: The image render poll pauses

- **WHEN** an editor who started a topic image render hides the tab
- **THEN** the render's status is not read until the tab shows again
