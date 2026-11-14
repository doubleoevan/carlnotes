## MODIFIED Requirements

### Requirement: The film section says the hosts are filming while a film renders

While a published Podcast Episode's film renders, the film section SHALL show the recording card's frame with "Carl and
Vienna are filming..." after a 🎬 hidden from a screen reader, in the film player's place: on the podcast episode page,
and in Topic Cinema on a Topic with no ready film. A page showing the card SHALL poll the film's status every 30
seconds, as the status-reads capability states, for at most four hours, SHALL read its page once that status leaves
rendering, and SHALL then show the film player. A topic page that shows a ready film's player while a newer Podcast
Episode's film renders, with the same filming line under that player, SHALL poll the newer film's status the same way
and SHALL read its page once that status leaves rendering. A failed film SHALL show nothing, and a failed status SHALL
stop the poll.

#### Scenario: The filming card shows while the film renders

- **GIVEN** a published Podcast Episode whose film is rendering
- **WHEN** a user who may listen to it opens its page
- **THEN** Coffee Break Cinema shows the Podcast Episode's cover and title with "🎬 Carl and Vienna are filming..." in
  the recording card's frame and shimmer, and no film player

#### Scenario: A Topic's first film shows the card in Topic Cinema

- **GIVEN** a Topic with no ready film, whose latest published Podcast Episode's film is rendering
- **WHEN** a user opens the topic page
- **THEN** an open section headed "Coffee Break Cinema" shows the filming card under the topic header

#### Scenario: An older ready film stays in Topic Cinema

- **GIVEN** a Topic with a ready film, and a newer Podcast Episode whose film is rendering
- **WHEN** a user opens the topic page
- **THEN** Topic Cinema shows the ready film's player, and the newer Podcast Episode's page shows the filming card

#### Scenario: The film replaces the card without a reload

- **GIVEN** a page showing the filming card
- **WHEN** the film becomes ready
- **THEN** the page's next status poll returns ready, and the page reads once and shows the film player in the card's
  place, on its poster, with no reload

#### Scenario: The reads pause in the background and stop after four hours

- **GIVEN** a page showing the filming card
- **WHEN** the app goes to the background or offline, or four hours pass
- **THEN** the page stops polling the film's status, and a return to the foreground within the four hours polls at once

#### Scenario: A failed film shows nothing

- **WHEN** a user opens the page of a Podcast Episode whose film failed or was skipped
- **THEN** the page shows no Coffee Break Cinema, and its Topic's page shows no filming card

#### Scenario: The card shows on web and mobile

- **WHEN** a film is rendering
- **THEN** the web and the mobile app draw the filming card from the one shared card that draws the recording card, with
  the same words

#### Scenario: The home, profile, and team cards list ready films alone

- **WHEN** a film is rendering
- **THEN** no home, profile, or team card shows it, and Coffee Break films does not list it

#### Scenario: A poll reads the status and no page

- **WHEN** a page shows the filming card for ten minutes
- **THEN** it sends the film's status read every 30 seconds, and no read of the page

#### Scenario: A newer film takes Topic Cinema without a reload

- **GIVEN** a topic page that shows a ready film's player with "Carl and Vienna are filming..." under it
- **WHEN** a poll of the newer film's status returns ready
- **THEN** the page reads once, and Topic Cinema shows the newer film with no filming line

#### Scenario: A closed-out film ends the card

- **WHEN** the sweep fails a film that was stuck rendering, and the next status poll returns failed
- **THEN** the page reads once, shows no filming card, and sends no further status read
