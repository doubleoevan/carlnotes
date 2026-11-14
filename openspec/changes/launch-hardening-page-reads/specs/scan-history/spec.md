## ADDED Requirements

### Requirement: The topic page reads its newest fifty Scans, and older ones by page

A topic page read that asks for pages SHALL hold the Topic's newest fifty Scans without their recaps, the count of all
its Scans, and the one recap that the info card shows, and SHALL read the month's scan spend as a sum. The Scan history
SHALL request each page past those fifty from the server, and a Scan's ⓘ popover SHALL read that Scan's recap from the
Scan's own read. A read that does not ask SHALL hold every Scan as before. The web SHALL ask.

#### Scenario: A busy Topic's page holds fifty Scans

- **GIVEN** a Topic with 320 Scans
- **WHEN** the web reads the Topic's page
- **THEN** the payload holds the newest 50 Scans with no recap in any row, a count of 320, and the info card's one recap

#### Scenario: A page past the fiftieth Scan is requested

- **WHEN** a user opens page 11 of that Topic's Scan history
- **THEN** the page requests those five Scans from the server and shows them

#### Scenario: A popover reads its Scan's recap

- **WHEN** a user opens a history row's ⓘ
- **THEN** the popover shows that Scan's full recap, read from the Scan's own read

#### Scenario: The cost stays with the owner and an admin

- **WHEN** a signed-in user who neither owns the Topic nor is an admin reads its page
- **THEN** no Scan row and no sum in the payload holds a cost

#### Scenario: A released app still gets every Scan

- **WHEN** a read that does not ask for pages reads the Topic
- **THEN** its `scans` holds every Scan with its recap, as before
