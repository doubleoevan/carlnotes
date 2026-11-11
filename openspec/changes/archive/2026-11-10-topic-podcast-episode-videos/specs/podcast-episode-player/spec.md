## ADDED Requirements

### Requirement: Listen state counts a play in either format and records film plays

A signed-in user's play of a Podcast Episode SHALL count toward their plays whether it starts as audio or as a film,
and their listen state SHALL record how many of those plays were film plays. Progress SHALL save on the same schedule
in both formats, into the one listen state, so either format resumes from the other's position. The Podcast Episode's
listener count SHALL count a film viewer as a listener.

#### Scenario: A film play counts

- **WHEN** a signed-in user starts a Podcast Episode's film
- **THEN** their play count rises by one, and so does their film play count

#### Scenario: Audio resumes where the film stopped

- **GIVEN** a user who paused a film at 9:05 on the web
- **WHEN** they press play on the same Podcast Episode's audio in the mobile app
- **THEN** the audio starts at 9:05

#### Scenario: A visitor's film play is not saved

- **WHEN** a signed-out visitor plays a public Topic's film
- **THEN** no progress request is sent, and the Podcast Episode's listener count still counts the play
