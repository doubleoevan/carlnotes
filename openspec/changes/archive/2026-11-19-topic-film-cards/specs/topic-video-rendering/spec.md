## MODIFIED Requirements

### Requirement: A failed render never touches the Podcast Episode

A first render that fails for good SHALL leave the Podcast Episode, its audio, and its feed item unchanged. That
Podcast Episode SHALL have no film section, no play button over a film, no Video button on its Brews News row, no film
card, and no item in the film feed. Its uploaded parts SHALL be deleted, and the failure
SHALL be reported.

#### Scenario: A failed film leaves the audio

- **WHEN** a Podcast Episode's first film render fails
- **THEN** the Podcast Episode plays as audio as before, and no film control or film card shows for it
