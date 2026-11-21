## MODIFIED Requirements

### Requirement: The film sections say the hosts are filming while a film renders

While a published Podcast Episode's film renders, the recording card's frame SHALL show "Carl and Vienna are filming..."
after a 🎬 hidden from a screen reader in the film player's place on the podcast episode page. While the Topic's latest
Podcast Episode's film renders, the topic video section SHALL show the same words, after the same 🎬 and with the same
shimmer, as a line at the right of its title row right before the film count, which wraps to its own line at the left if
the row runs out of room, and SHALL show no filming card. A page showing the card or the line SHALL poll the film's
status every 30 seconds, as the status-reads capability states, for at most four hours, and SHALL read its page once
that status leaves rendering. A failed film SHALL show nothing, and a failed status SHALL stop the poll.

#### Scenario: The filming card shows while the film renders

- **GIVEN** a published Podcast Episode whose film is rendering
- **WHEN** a user who may listen to it opens its page
- **THEN** Coffee Break Film shows the Podcast Episode's cover and title with "🎬 Carl and Vienna are filming..." in
  the recording card's frame and shimmer, and no film player

#### Scenario: A Topic's first film shows the card in the topic video section

- **GIVEN** a Topic with no ready film, whose latest published Podcast Episode's film is rendering
- **WHEN** a user opens the topic page
- **THEN** an open section headed "Coffee Break Cinema" shows the filming line, and no filming card and no film cards

#### Scenario: The ready films show under the card

- **GIVEN** a Topic with two ready films, and a newer Podcast Episode whose film is rendering
- **WHEN** a user opens the topic page on a wide screen
- **THEN** the topic video section's title row shows the filming line right before "2 films" at the far right, and
  the two film cards sit under the title with no filming card

#### Scenario: The filming line wraps to its own line on a phone

- **GIVEN** a Topic with two ready films, and a newer Podcast Episode whose film is rendering
- **WHEN** a user opens the topic page on a phone too narrow for the title row to hold the line
- **THEN** the filming line wraps under the title at the left, with "2 films" at the far right, above the two film
  cards

#### Scenario: The new film joins the cards without a reload

- **GIVEN** a topic page showing the filming line
- **WHEN** a poll of the film's status returns ready
- **THEN** the page reads once, drops the line, and shows the new film as the first card, and a film playing in the
  Video dialog plays on

#### Scenario: The reads pause in the background and stop after four hours

- **GIVEN** a page showing the filming card or the filming line
- **WHEN** the app goes to the background or offline, or four hours pass
- **THEN** the page stops polling the film's status, and a return to the foreground within the four hours polls at once

#### Scenario: A failed film shows nothing

- **WHEN** a user opens the page of a Podcast Episode whose film failed or was skipped
- **THEN** the page shows no Coffee Break Film, and its Topic's page shows no filming line and no card for it

#### Scenario: The card shows on web and mobile

- **WHEN** a film is rendering
- **THEN** the web and the mobile app draw the filming card from the one shared card that draws the recording card, and
  the filming line in the same look as that card's line, with the same words

#### Scenario: The home, profile, and team cards list ready films alone

- **WHEN** a film is rendering
- **THEN** no home, profile, team, or topic page card shows it

#### Scenario: A poll reads the status and no page

- **WHEN** a page shows the filming card or the filming line for ten minutes
- **THEN** it sends the film's status read every 30 seconds, and no read of the page

#### Scenario: A reaped film ends the card

- **WHEN** the sweep fails a film that was stuck rendering, and the next status poll returns failed
- **THEN** the page reads once, shows no filming card or filming line, and sends no further status read
