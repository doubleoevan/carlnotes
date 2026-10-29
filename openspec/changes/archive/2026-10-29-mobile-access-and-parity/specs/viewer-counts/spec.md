# Spec Delta

## MODIFIED Requirements

### Requirement: The pages show the counts after hydration and refresh them while visible

The topic page SHALL end with a line reading "Viewers: N" and "Followers: N", with space between the two counts and no
separator, and the Podcast Episode page with a line reading "Listeners: N". Each label SHALL be fixed and muted and
followed by a colon, so a count of one reads "Viewers: 1", and each number SHALL be bold in the text color. Each line
SHALL hold one line of height in the server render and SHALL show its counts only after the page has mounted, so no
count is in the server-rendered HTML and nothing shifts as the line fills in. The page SHALL read its counts once after
hydration if the page is visible, then every 60 seconds while its tab is visible, and at once when the tab shows again.
It SHALL never send a second read while one is in flight. The mobile app's Topic and Podcast Episode screens SHALL read
their counts on the same 60-second rhythm while the screen is the active route and the app is in the foreground, never
from the background, and a failed read SHALL keep the last counts shown.

#### Scenario: The server render includes no count
- **WHEN** a visitor's topic page is rendered on the server
- **THEN** its HTML holds the empty line and no viewer or follower count in it

#### Scenario: A count of one keeps its label
- **WHEN** a Topic has one viewer and the topic page's counts arrive
- **THEN** the line reads "Viewers: 1"

#### Scenario: A hidden tab stops reading
- **WHEN** the topic page's tab is hidden for five minutes
- **THEN** the page reads no counts until the tab shows again, then reads them at once

#### Scenario: The app's episode screen keeps its count
- **WHEN** a Podcast Episode screen is open in the app for three minutes and its second read fails
- **THEN** the screen sent three reads, one a minute, and the line still shows the last count that arrived

#### Scenario: A backgrounded app reads no counts
- **WHEN** the app goes to the background on a Topic screen for five minutes
- **THEN** no count is read until it returns to the foreground, then the counts are read at once
