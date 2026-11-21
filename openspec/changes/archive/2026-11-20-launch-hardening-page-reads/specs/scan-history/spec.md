## ADDED Requirements

### Requirement: The topic page reads its newest fifty Scans, and older ones by page

A topic page read that asks for pages SHALL hold the Topic's newest fifty Scans without their recaps, the count of the
Scans its history lists, and the info card's one recap, and SHALL read the month's scan spend as a sum. The Scan
history SHALL request each page past those fifty from the server, and a Scan's ⓘ popover SHALL read its recap from the
Scan's own read. A read that does not ask SHALL hold every Scan as before. The web and the app SHALL ask.

#### Scenario: A busy Topic's page holds fifty Scans

- **GIVEN** a Topic with 320 Scans
- **WHEN** the web reads the Topic's page
- **THEN** the payload holds the newest 50 Scans with no recap in any row, a count of 320, and the info card's one recap

#### Scenario: A visitor's copy holds fifty Scans

- **GIVEN** a public Topic with 320 Scans
- **WHEN** a visitor's page read is served from the Topic's copy
- **THEN** the copy holds the newest 50 Scans and a count of 320, and a read that does not ask still gets all 320

#### Scenario: A page past the fiftieth Scan is requested

- **WHEN** a user opens page 11 of that Topic's Scan history
- **THEN** the page shows those five Scans from the server's page of fifty that holds them, read ahead or requested
  then

#### Scenario: A popover reads its Scan's recap

- **WHEN** a user opens a history row's ⓘ
- **THEN** the popover shows that Scan's full recap, read from the Scan's own read

#### Scenario: The cost stays with the owner and an admin

- **WHEN** a signed-in user who neither owns the Topic nor is an admin reads its page
- **THEN** no Scan row and no sum in the payload holds a cost

#### Scenario: A released app still gets every Scan

- **WHEN** a read that does not ask for pages reads the Topic
- **THEN** its `scans` holds every Scan, as before
