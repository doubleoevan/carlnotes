## ADDED Requirements

### Requirement: The topic video section shows a Topic's films as cards

On a Topic with a ready film that the user may watch, the topic page SHALL show a collapsible section headed "Coffee
Break Cinema" at the anchor `#film`, directly under the topic header. It SHALL hold every ready film of the Topic as a
film card, newest first, six to a page, in the home page's Featured films grid, with the film count at the far right.
This spec calls it the topic video section. A Topic with no ready film and none rendering SHALL show no section.

#### Scenario: The section shows every film

- **GIVEN** a Topic with eight ready films across two seasons
- **WHEN** a user opens the topic page
- **THEN** "Coffee Break Cinema" reads "8 films" and shows the six newest as film cards, with pages 1 and 2

#### Scenario: A card's play button opens the dialog

- **WHEN** a user presses a film card's play button in the topic video section
- **THEN** the Video dialog opens, and the film plays once it loads

#### Scenario: No film, no section

- **WHEN** a user opens a Topic whose Podcast Episodes have no films
- **THEN** no topic video section renders

#### Scenario: Every card without script

- **GIVEN** a Topic with eight ready films
- **WHEN** a browser without JavaScript opens the topic page
- **THEN** the topic video section holds all eight cards, each linked to its podcast episode page

#### Scenario: Mobile shows the same cards

- **WHEN** a mobile user opens the topic screen of a Topic with films
- **THEN** the topic video section shows the same cards and pages, and a card's "Play film" opens the Video sheet

### Requirement: The topic page holds no film player

The topic page SHALL show no film player of its own and no list of films by season. A film plays from a card's Video
dialog, and the audio player card plays the latest Podcast Episode.

#### Scenario: The page has one film section

- **WHEN** a user opens a Topic with films
- **THEN** the topic video section's cards are the page's only films, with no player card and no Coffee Break films
  list

### Requirement: The film sections say the hosts are filming while a film renders

While a published Podcast Episode's film renders, the recording card's frame SHALL show "Carl and Vienna are filming..."
after a 🎬 hidden from a screen reader: in the film player's place on the podcast episode page, and above the cards in
the topic video section for the Topic's latest Podcast Episode. A page showing the card SHALL read again until the film
is ready, for at most four hours. A failed film SHALL show nothing.

#### Scenario: The filming card shows while the film renders

- **GIVEN** a published Podcast Episode whose film is rendering
- **WHEN** a user who may listen to it opens its page
- **THEN** Coffee Break Film shows the Podcast Episode's cover and title with "🎬 Carl and Vienna are filming..." in
  the recording card's frame and shimmer, and no film player

#### Scenario: A Topic's first film shows the card in the topic video section

- **GIVEN** a Topic with no ready film, whose latest published Podcast Episode's film is rendering
- **WHEN** a user opens the topic page
- **THEN** an open section headed "Coffee Break Cinema" shows the filming card and no film cards

#### Scenario: The ready films show under the card

- **GIVEN** a Topic with two ready films, and a newer Podcast Episode whose film is rendering
- **WHEN** a user opens the topic page
- **THEN** the topic video section shows the filming card above the two film cards

#### Scenario: The new film joins the cards without a reload

- **GIVEN** a topic page showing the filming card
- **WHEN** the film becomes ready
- **THEN** the page's next read drops the card and shows the new film as the first card, and a film playing in the
  Video dialog plays on

#### Scenario: The reads pause in the background and stop after four hours

- **GIVEN** a page showing the filming card
- **WHEN** the app goes to the background or offline, or four hours pass
- **THEN** the page stops reading again, and a return to the foreground within the four hours reads at once

#### Scenario: A failed film shows nothing

- **WHEN** a user opens the page of a Podcast Episode whose film failed or was skipped
- **THEN** the page shows no Coffee Break Film, and its Topic's page shows no filming card and no card for it

#### Scenario: The card shows on web and mobile

- **WHEN** a film is rendering
- **THEN** the web and the mobile app draw the filming card from the one shared card that draws the recording card, with
  the same words

#### Scenario: The home, profile, and team cards list ready films alone

- **WHEN** a film is rendering
- **THEN** no home, profile, team, or topic page card shows it

### Requirement: A card holds the film and its controls on the podcast episode page

On the podcast episode page, web and mobile, the film's frame, its seek bar, and its control row SHALL sit inside one
card in the podcast player card's style, and the frame SHALL keep its rounded corners. The card SHALL hold the film's
title, its date, length, and chapter count, and nothing else, for an editor too. The Video dialog and sheet SHALL keep
their own frame and add no card.

#### Scenario: The podcast episode page shows one card

- **WHEN** a user opens the page of a Podcast Episode that has a film
- **THEN** Coffee Break Film shows the film, the seek bar, and the control row inside one card, with the title at the
  top left and the date, length, and chapter count in small text at the top right

#### Scenario: The card holds no image controls

- **WHEN** a Topic's editor opens the page of a Podcast Episode that has a film
- **THEN** the film's card holds the film, the seek bar, and the control row, with no image prompt, Regenerate, or
  Upload

#### Scenario: The dialog adds no card

- **WHEN** a user opens the Video dialog on web or the Video sheet on mobile
- **THEN** the film player sits in the dialog's own frame, with no card around it

#### Scenario: The card on mobile

- **WHEN** a mobile user opens the podcast episode screen of a film
- **THEN** the same card holds the film, the seek bar, and the control row, and nothing else

### Requirement: The podcast episode page has a Coffee Break Film section above a Coffee Break podcast section

A podcast episode page SHALL show two collapsible sections, both open at first and neither saved: "Coffee Break Film"
at the anchor `#film`, holding the film player, then "Coffee Break podcast", holding the audio player card. A Podcast
Episode with no ready film and none rendering SHALL show no Coffee Break Film.

#### Scenario: The page shows its film

- **WHEN** a user opens the page of a Podcast Episode that has a film
- **THEN** Coffee Break Film shows the film player, above Coffee Break podcast with the audio player card

#### Scenario: No film, no Coffee Break Film

- **WHEN** a user opens the page of a Podcast Episode without a film
- **THEN** the page shows Coffee Break podcast and no Coffee Break Film

#### Scenario: A closed section's divider

- **WHEN** a user closes both sections
- **THEN** each shows a divider under its title, because another section follows it

## MODIFIED Requirements

### Requirement: A film never autoplays

A film SHALL start only from a press. Until then the player SHALL show the film's own image as its poster, or the
podcast episode image if the film has none. Opening the topic video section or the Video dialog SHALL NOT
start playback by itself. A film card's play button is a play press: its dialog SHALL play the
film once it loads, and SHALL stay on the poster where the platform refuses the play.

#### Scenario: The dialog opens on the poster

- **WHEN** a user presses Video on a Brews News podcast episode row
- **THEN** the dialog shows the film's image with a play control, and nothing plays until they press it

#### Scenario: A film card's play button plays the film

- **WHEN** a user presses the play button on a home film card
- **THEN** the Video dialog opens, and the film plays once it loads

#### Scenario: A refused play leaves the poster

- **GIVEN** a browser that refuses a play which starts after the film loads
- **WHEN** a user presses the play button on a film card
- **THEN** the dialog shows the film's image with its play button and no error, and a press on it plays the film

#### Scenario: A film without its own image shows the podcast episode image

- **WHEN** a user opens a film whose own image was never drawn
- **THEN** the poster is the podcast episode image

### Requirement: The skips and the speed show before the film plays

The film player SHALL show skip back, skip forward, and the speed at the left of its control row before the film is
loaded, as it does once the film plays. A press on one of them before the film is loaded SHALL start the film as the
play button does. Skip forward SHALL start it 30 seconds past its start position, skip back 15 seconds before it and
never before zero, and the speed at the next speed. On a loaded film each SHALL act as before.

#### Scenario: The controls show on the poster

- **WHEN** a user opens the podcast episode page of a film that has not played
- **THEN** skip back, skip forward, and the speed show at the left of the control row, under the poster, with their
  labels

#### Scenario: Skip forward starts the film

- **GIVEN** a film on its poster with no saved progress
- **WHEN** the viewer presses skip forward
- **THEN** the film plays from 0:30

#### Scenario: Skip back starts the film behind the audio

- **GIVEN** a listener at 1:40 in a Podcast Episode's audio, with the film player on the same page
- **WHEN** they press skip back in the film player
- **THEN** the audio stops, and the film plays from 1:25

#### Scenario: Skip back with nothing behind it

- **GIVEN** a film on its poster at 0:00
- **WHEN** the viewer presses skip back
- **THEN** the film plays from 0:00

#### Scenario: The speed starts the film

- **GIVEN** a film on its poster with the speed at 1x
- **WHEN** the viewer presses the speed
- **THEN** the film plays at 1.25x, and the control reads "1.25x"

#### Scenario: The dialog shows them too

- **WHEN** a user opens the Video dialog on web or the Video sheet on mobile
- **THEN** the same three controls show before the film plays, and a press on one starts the film

### Requirement: The playing chapter highlights its Finding, and a Finding's pill jumps the film

While a film plays, the Finding that the current chapter narrates SHALL be highlighted, as it is during the audio.
Pressing a Finding's chapter pill while the film is loaded SHALL seek the film to that chapter.

#### Scenario: A pill seeks the film

- **GIVEN** a film playing chapter 1 in the Video dialog
- **WHEN** a viewer presses the `E14 · ch 4` pill on a Finding
- **THEN** the film jumps to chapter 4, and that Finding is highlighted

### Requirement: The theme song's credits sit right after the film and podcast section titles

On the topic page and the podcast episode page, web and mobile, a headphones button labeled "Theme song credits" SHALL
sit right after the title of the film section and of the Coffee Break podcast section, centered on the title. A press
SHALL open the credits and SHALL NOT open or close the section. The button SHALL sit outside the section's toggle and
take keyboard focus by itself. A section's count SHALL stay at the far right. The credits SHALL show nowhere else.

#### Scenario: Both titles of a podcast episode page have the button

- **WHEN** a user opens the page of a Podcast Episode that has a film
- **THEN** a headphones button sits right after "Coffee Break Film" and right after "Coffee Break podcast", and none
  sits beside the page's title or the title in the audio player card

#### Scenario: A Topic with no film has one button

- **WHEN** a user opens a Topic with a published Podcast Episode and no film
- **THEN** the headphones button sits right after "Coffee Break podcast" and nowhere else on the page

#### Scenario: A press opens the credits and leaves the section alone

- **GIVEN** an open Coffee Break Film section
- **WHEN** a user presses the headphones button after its title
- **THEN** the theme song's credits open, and the section stays open

#### Scenario: The title still toggles the section

- **WHEN** a user presses the title beside the headphones button
- **THEN** the section closes, and the credits do not open

#### Scenario: Mobile matches the web

- **WHEN** a mobile user opens the topic screen or the podcast episode screen of a film
- **THEN** the same button sits right after both titles, and a press opens the credits in a sheet

### Requirement: Mobile shows the same film surfaces and keeps the film's audio in the background

The mobile topic screen SHALL show the topic video section with the web's film cards. The podcast
episode screen SHALL show the web's two sections. A film card's play button, labeled "Play film", SHALL open the film in
a full-screen sheet, and a podcast card SHALL show Play alone. The film SHALL offer native fullscreen and
picture-in-picture. Its audio SHALL keep playing with the phone locked or the app in the background.

#### Scenario: The film keeps talking when locked

- **GIVEN** a viewer watching a film in the mobile app
- **WHEN** they lock the phone
- **THEN** the film's audio keeps playing, and the lock screen offers play, pause, and seek

#### Scenario: The sheet fills the screen

- **WHEN** a mobile user presses "Play film" on a home film card
- **THEN** a full-screen sheet opens with the film player, and the film plays once it loads

#### Scenario: A podcast card has Play alone

- **WHEN** a mobile user views a home podcast card whose Podcast Episode has a film
- **THEN** the card shows Play and no button for the film

### Requirement: Film copy never says video in a heading

Headings SHALL read "Coffee Break Cinema" on the topic page and "Coffee Break Film" on the podcast episode page, and
a single video SHALL be called a film in copy. The buttons SHALL read "Video", "Mute", and "Unmute", a film card's play
button SHALL be labeled "Play film", the action menu's option SHALL read "Edit film", and the MCP view's link SHALL
read "Watch on CarlNotes". No heading SHALL contain the word video, and no film surface SHALL show a notice, a warning,
or explanatory text.

#### Scenario: Headings use the film names

- **WHEN** a Topic with films renders
- **THEN** its page's film heading reads "Coffee Break Cinema", its podcast episode pages' read "Coffee Break Film",
  and none contains "video"

### Requirement: The topic video section opens on every page load

The topic video section SHALL be open each time a topic page loads, for a signed-in user and a visitor alike, whether or
not the user played the latest film. A collapse SHALL last until the page is left, and SHALL NOT be saved. The topic
read SHALL return the Topic's films with no open state. The first render SHALL show the section open.

#### Scenario: A played film opens the section

- **GIVEN** a user who played the Topic's latest film
- **WHEN** they open the topic page
- **THEN** the topic video section is open

#### Scenario: A collapse is not saved

- **GIVEN** a user who collapsed the topic video section on a Topic
- **WHEN** they open the same Topic again, in the browser or the mobile app
- **THEN** the topic video section is open

## REMOVED Requirements

### Requirement: A card holds the film and its controls on a page

**Reason**: The topic page no longer shows a film player, so the card holds the film on the podcast episode page alone.

**Migration**: "A card holds the film and its controls on the podcast episode page" covers the card.

### Requirement: The topic video section holds the latest film at the top of the topic page

**Reason**: The topic video section shows every film of the Topic as cards instead of the latest film in a player.

**Migration**: "The topic video section shows a Topic's films as cards" covers the section.

### Requirement: The film section says the hosts are filming while a film renders

**Reason**: On the topic page the filming card sits above the film cards instead of in a player's place.

**Migration**: "The film sections say the hosts are filming while a film renders" covers both pages.

### Requirement: The podcast episode page has a Coffee Break Cinema section and a Coffee Break podcast section

**Reason**: The podcast episode page's film section is named Coffee Break Film and leads the page.

**Migration**: "The podcast episode page has a Coffee Break Film section above a Coffee Break podcast section" covers
the page.

### Requirement: Coffee Break films lists a Topic's films above Coffee Break podcast episodes

**Reason**: The topic video section's cards list every film, so the list by season repeated them.

**Migration**: None. The topic video section shows every film.

### Requirement: A Coffee Break films row loads its film into the topic video section

**Reason**: The topic page has no film player to load a film into. A film card opens the Video dialog.

**Migration**: None. A film card's play button opens the Video dialog.

### Requirement: Film publication updates an open Topic page

**Reason**: The topic page has no film player to keep playing or to offer a new film in.

**Migration**: "The film sections say the hosts are filming while a film renders" covers the new film's card.
