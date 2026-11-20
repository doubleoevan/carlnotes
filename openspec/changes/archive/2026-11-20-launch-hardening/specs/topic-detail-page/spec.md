## ADDED Requirements

### Requirement: Carl's Notes show the newest recap that was written

The Topic's info card and the feed card SHALL show the recap of the newest succeeded Scan that wrote one, with
stopped Scans skipped, as the page's meta description already does. A later Scan that succeeded with an empty recap,
because it reviewed nothing or its recap call failed, SHALL NOT blank the note.

#### Scenario: A Scan that reviewed nothing keeps the note

- **GIVEN** a Topic whose last Scan wrote a recap, and a newer Scan that rediscovered only pages it already judged
- **WHEN** the topic page loads
- **THEN** Carl's Notes show the earlier Scan's recap

#### Scenario: A newer recap replaces the note

- **GIVEN** a Topic whose note shows an earlier Scan's recap
- **WHEN** a newer Scan succeeds and writes a recap
- **THEN** Carl's Notes and the feed card show the newer recap
