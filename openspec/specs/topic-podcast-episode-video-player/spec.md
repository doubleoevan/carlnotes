# topic-podcast-episode-video-player Specification

## Purpose
The film format of the podcast player: the film section of the topic page, which this spec calls Topic Cinema, and of
the podcast episode page, both titled "Coffee Break Cinema", the Video dialog that a film card, a Brews News row, and
the Topic roast open, and the Coffee Break films list, on web, mobile, and MCP.

## Requirements

### Requirement: One player plays a Podcast Episode as audio or as a film from one position

The podcast player SHALL hold one Podcast Episode, as audio or as a film, at one position. The film's play SHALL
continue the film from the audio's second, and the audio player card's play SHALL continue the audio from the film's
second, each stopping the other. The audio player card SHALL have no button for the film. Closing the dialog or
leaving the page SHALL pause a film outside picture-in-picture, and the docked player's play SHALL continue as audio.

#### Scenario: A switch continues from the same second

- **GIVEN** a listener at 12:40 in a Podcast Episode's audio, with the film player on the same page
- **WHEN** they press play on the film
- **THEN** the audio stops, and the film plays from 12:40

#### Scenario: The audio takes over from the film

- **GIVEN** a viewer at 9:05 in a film, with the audio player card on the same page
- **WHEN** they press play on the audio player card
- **THEN** the film pauses on its poster, and the audio plays from 9:05

#### Scenario: The card has no button for the film

- **WHEN** the audio player card shows a Podcast Episode with a film, on the topic page or the podcast episode page
- **THEN** the card shows no button for the film, and the film's own play button sits in the film section on the same
  page

#### Scenario: Closing the dialog pauses the film

- **GIVEN** a viewer watching a film in the Video dialog at 4:10
- **WHEN** they close the dialog
- **THEN** the film stops at 4:10, the docked player shows play, and its play continues the audio from 4:10

### Requirement: A film never autoplays

A film SHALL start only from a press. Until then the player SHALL show the film's own image as its poster, or the
podcast episode image if the film has none. Opening Topic Cinema, the Video dialog, or a Coffee Break films row's target
SHALL NOT start playback by itself. A film card's play button is a play press: its dialog SHALL play the film once it
loads, and SHALL stay on the poster where the platform refuses the play.

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

### Requirement: The play button sits over the film

The film player SHALL show its play button in the middle of the film's frame, over the poster. While the film plays
the button SHALL be hidden, and a press on the frame SHALL pause the film and show the button again. The button SHALL
take presses over the whole frame, and SHALL be reachable by keyboard and screen reader under its play or pause label.
The other controls SHALL stay under the frame.

#### Scenario: A press on the playing film pauses it

- **GIVEN** a film playing with no play button showing
- **WHEN** the viewer presses the film's frame
- **THEN** the film pauses, and the play button shows over the frame

#### Scenario: The keyboard reaches the button while the film plays

- **GIVEN** a film playing
- **WHEN** a keyboard user moves focus to the film's frame
- **THEN** the button shows with the label "Pause" and the podcast episode's number, and Enter pauses the film

### Requirement: The film player offers captions, mute, fullscreen, and picture-in-picture

The film player SHALL show the seek bar split by chapter, the playback controls, a captions control that is on by
default, and a Mute control that turns off the film's sound alone. It SHALL have no control that switches to the audio.
It SHALL offer native fullscreen, and picture-in-picture where the platform supports it. The captions and mute choices
SHALL last for the session.

#### Scenario: Captions turn off

- **WHEN** a viewer presses the captions control during a film
- **THEN** the captions hide, and pressing it again shows them

#### Scenario: Mute silences the film alone

- **WHEN** a viewer presses Mute during a film
- **THEN** the film plays on without sound, its captions stay, and the control reads "Unmute"

#### Scenario: Picture-in-picture where supported

- **WHEN** a viewer on a browser with picture-in-picture presses its control
- **THEN** the film continues in a floating window

### Requirement: A chapter's tooltip on the film's seek bar shows its title and image

On the web, hovering a chapter's segment of the film's seek bar SHALL show a tooltip centered over the segment and kept
inside the window: the chapter's title, and under it the image the film shows for the chapter, at 16:9 and about 240
pixels wide. The image SHALL be the Finding's link preview image, or else the chapter's imagined image, or else the
podcast card. Hovering SHALL NOT seek. The audio player card's bar and the mobile apps SHALL show no tooltip.

#### Scenario: A chapter with a link preview image

- **WHEN** a viewer rests the pointer on the segment of a chapter whose Finding has a link preview image
- **THEN** a tooltip centered over the segment shows the chapter's title in bold, on two lines at most, over that image

#### Scenario: A chapter with an imagined image

- **GIVEN** a chapter whose Finding has no link preview image, in a film that stored an imagined image for it
- **WHEN** a viewer hovers its segment
- **THEN** the tooltip shows the imagined image under the title

#### Scenario: A chapter with neither shows the podcast card

- **WHEN** a viewer hovers the segment of a chapter with no link preview image and no imagined image
- **THEN** the tooltip shows Carl and Vienna's podcast card, at the band the film shows

#### Scenario: The image's frame shows the loading note until the image loads

- **WHEN** a chapter's tooltip shows before its image has loaded
- **THEN** the image's frame shows the loading note, and the image takes its place once it loads

#### Scenario: Images that fail leave the title alone

- **WHEN** none of the chapter's images loads
- **THEN** the tooltip shows the title alone, with no broken image

#### Scenario: The tooltip stays inside the window

- **WHEN** a viewer hovers the first or the last segment in a narrow window
- **THEN** the tooltip stays inside the window, and its arrow still points at the segment

#### Scenario: A hover does not seek, and a press still does

- **GIVEN** a film on its poster at 0:01
- **WHEN** a viewer hovers the third chapter's segment, then presses it
- **THEN** the hover leaves the film at 0:01, and the press plays the film from the pressed second

#### Scenario: A private Topic's imagined image is gated

- **WHEN** a visitor who may not see a private Topic requests the imagined image of a chapter of its film
- **THEN** the image is not found

#### Scenario: The audio bar and the mobile apps show no tooltip

- **WHEN** a listener hovers a segment of the audio player card's seek bar, or a mobile user touches the film's seek bar
- **THEN** no tooltip shows

### Requirement: A film that ends plays nothing after it

When a film plays to its end, the player SHALL mark the Podcast Episode completed and stop, and SHALL NOT load or play
another film or Podcast Episode. A Podcast Episode that ends as audio SHALL still continue to the Topic's next unplayed
Podcast Episode for a signed-in user.

#### Scenario: A film ends and nothing follows

- **GIVEN** a signed-in viewer on a Topic with an unplayed Podcast Episode after the one whose film plays
- **WHEN** the film reaches its end
- **THEN** the Podcast Episode is marked completed, the player shows play, and nothing else starts

#### Scenario: The audio still continues

- **GIVEN** the same user playing that Podcast Episode as audio
- **WHEN** the audio reaches its end
- **THEN** the Topic's next unplayed Podcast Episode plays

### Requirement: The film's control groups sit at the row's two ends

The film player's control row SHALL hold two groups: skip back, skip forward, and the speed at its left end, and
captions, Mute, picture-in-picture, and fullscreen at its right end. On a screen too narrow for both groups in one row,
the film's own controls SHALL wrap to a second row under the others, starting at the left.

#### Scenario: A wide screen spreads the groups

- **WHEN** a viewer opens a film on a desktop browser
- **THEN** the skips and the speed sit at the left end of the control row, and captions, Mute, picture-in-picture, and
  fullscreen at the right end

#### Scenario: A narrow screen wraps the film's own controls

- **WHEN** a viewer opens a film on a screen too narrow for both groups in one row
- **THEN** captions, Mute, and the film's other controls sit in a second row under the skips and the speed, starting at
  the left

### Requirement: The skips and the speed show before the film plays

The film player SHALL show skip back, skip forward, and the speed at the left of its control row before the film is
loaded, as it does once the film plays. A press on one of them before the film is loaded SHALL start the film as the
play button does. Skip forward SHALL start it 30 seconds past its start position, skip back 15 seconds before it and
never before zero, and the speed at the next speed. On a loaded film each SHALL act as before.

#### Scenario: The controls show on the poster

- **WHEN** a user opens Topic Cinema on a film that has not played
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

### Requirement: A card holds the film and its controls on a page

On the topic page and the podcast episode page, web and mobile, the film's frame, its seek bar, and its control row
SHALL sit inside one card in the podcast player card's style, and the frame SHALL keep its rounded corners. The card
SHALL hold nothing else, for an editor too. The Video dialog and sheet SHALL keep their own frame and add no card.

#### Scenario: Topic Cinema shows one card

- **WHEN** a user opens a Topic with a film
- **THEN** Topic Cinema shows the film, the seek bar, and the control row inside one card, in the style of the podcast
  player card under it

#### Scenario: The card holds no image controls

- **WHEN** a Topic's editor opens the page of a Podcast Episode that has a film
- **THEN** the film's card holds the film, the seek bar, and the control row, with no image prompt, Regenerate, or
  Upload

#### Scenario: The dialog adds no card

- **WHEN** a user opens the Video dialog on web or the Video sheet on mobile
- **THEN** the film player sits in the dialog's own frame, with no card around it

#### Scenario: The card on mobile

- **WHEN** a mobile user opens the topic screen or the podcast episode screen of a film
- **THEN** the same card holds the film, the seek bar, and the control row, and nothing else

### Requirement: A film in picture-in-picture keeps playing across pages on the web

On the web, a film in picture-in-picture SHALL keep playing at its one position while the user opens other pages of the
app, and the docked player SHALL show it playing. Closing its window on a page that shows the film's player SHALL
return the picture to that player. Closing it on any other page SHALL pause the film. Playing a Podcast Episode's audio
or another film SHALL end it. The mobile apps SHALL keep their platform's own picture-in-picture.

#### Scenario: Navigating away during picture-in-picture

- **GIVEN** a film playing in picture-in-picture on its podcast episode page
- **WHEN** the viewer opens the home page
- **THEN** the film keeps playing in its window from the same position, and the docked player shows pause

#### Scenario: Closing the window on the film's page returns the picture

- **GIVEN** a film in picture-in-picture, on a page that shows that film's player
- **WHEN** the viewer closes the window
- **THEN** the picture returns to the player at the same position

#### Scenario: Closing the window on another page pauses the film

- **GIVEN** a film in picture-in-picture, on a page without that film's player
- **WHEN** the viewer closes the window
- **THEN** the film pauses, and the docked player's play continues as audio from that position

#### Scenario: The audio ends picture-in-picture

- **GIVEN** a film in picture-in-picture
- **WHEN** the viewer presses play on a Podcast Episode's audio
- **THEN** the window closes, and the audio plays

### Requirement: The window's return button opens the film where the viewer is

On the web, on a page without the film's player, the picture-in-picture window's return button SHALL open the film in
the Video dialog on that page, still playing at its position. The dialog's picture-in-picture control SHALL close the
dialog and send the film back to its window. Closing the dialog SHALL pause the film. The window's close button SHALL
pause the film and open no dialog. A film that is still playing once its window closes was returned, and a paused one
was closed.

#### Scenario: Returning on another page opens the dialog

- **GIVEN** a film in picture-in-picture, and the viewer on the home page
- **WHEN** the viewer presses the window's return button
- **THEN** the Video dialog opens on the home page with the film playing on from the same position

#### Scenario: The dialog sends the film back to its window

- **GIVEN** the Video dialog that a returned film opened
- **WHEN** the viewer presses its picture-in-picture control
- **THEN** the dialog closes, and the film plays on in its window while the viewer browses

#### Scenario: The close button opens no dialog

- **GIVEN** a film in picture-in-picture, on a page without that film's player
- **WHEN** the viewer presses the window's close button
- **THEN** the film pauses, no dialog opens, and the docked player's play continues as audio

### Requirement: Topic Cinema holds the latest film at the top of the topic page

On a Topic with a film that the user may watch, the topic page SHALL show a collapsible section headed "Coffee Break
Cinema", the title of the podcast episode page's film section, directly under the topic header, holding the player with
the Topic's latest film. This spec calls the topic page's section Topic Cinema. A Topic with no ready film and none
rendering SHALL show no section.

#### Scenario: The section shows the latest film

- **WHEN** a user opens a Topic whose latest two Podcast Episodes both have films
- **THEN** a section headed "Coffee Break Cinema" shows the newer film under the topic header

#### Scenario: No film, no section

- **WHEN** a user opens a Topic whose Podcast Episodes have no films
- **THEN** no Topic Cinema section renders

### Requirement: The film section says the hosts are filming while a film renders

While a published Podcast Episode's film renders, the film section SHALL show the recording card's frame with "Carl and
Vienna are filming..." after a 🎬 hidden from a screen reader, in the film player's place: on the podcast episode page,
and in Topic Cinema on a Topic with no ready film. A page showing the card SHALL read again until the film is ready, for
at most four hours, and then show the film player. A failed film SHALL show nothing.

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
- **THEN** the page's next read shows the film player in the card's place, on its poster, with no reload

#### Scenario: The reads pause in the background and stop after four hours

- **GIVEN** a page showing the filming card
- **WHEN** the app goes to the background or offline, or four hours pass
- **THEN** the page stops reading again, and a return to the foreground within the four hours reads at once

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

### Requirement: The playing chapter highlights its Finding, and a Finding's pill jumps the film

While a film plays, the Finding that the current chapter narrates SHALL be highlighted, as it is during the audio.
Pressing a Finding's chapter pill while the film is loaded SHALL seek the film to that chapter.

#### Scenario: A pill seeks the film

- **GIVEN** a film playing chapter 1 in Topic Cinema
- **WHEN** a viewer presses the `E14 · ch 4` pill on a Finding
- **THEN** the film jumps to chapter 4, and that Finding is highlighted

### Requirement: The podcast episode page has a Coffee Break Cinema section and a Coffee Break podcast section

A podcast episode page SHALL show two collapsible sections, both open at first and neither saved: "Coffee Break
podcast", holding the audio player card, then "Coffee Break Cinema" at the anchor `#film`, holding the film player. A
Podcast Episode with no ready film and none rendering SHALL show no Coffee Break Cinema. On the topic page the film's
section stays first.

#### Scenario: The page shows its film

- **WHEN** a user opens the page of a Podcast Episode that has a film
- **THEN** Coffee Break podcast shows the audio player card, above Coffee Break Cinema with the film player

#### Scenario: No film, no Coffee Break Cinema

- **WHEN** a user opens the page of a Podcast Episode without a film
- **THEN** the page shows Coffee Break podcast and no Coffee Break Cinema

#### Scenario: A closed section's divider

- **WHEN** a user closes both sections
- **THEN** each shows a divider under its title, since another section follows it

### Requirement: The theme song's credits sit right after the film and podcast section titles

On the topic page and the podcast episode page, web and mobile, a headphones button labeled "Theme song credits" SHALL
sit right after the title of the film section and of the Coffee Break podcast section, centered on the title. A press
SHALL open the credits and SHALL NOT open or close the section. The button SHALL sit outside the section's toggle and
take keyboard focus by itself. A section's count SHALL stay at the far right. The credits SHALL show nowhere else.

#### Scenario: Both titles of a podcast episode page have the button

- **WHEN** a user opens the page of a Podcast Episode that has a film
- **THEN** a headphones button sits right after "Coffee Break Cinema" and right after "Coffee Break podcast", and none
  sits beside the page's title or the title in the audio player card

#### Scenario: A Topic with no film has one button

- **WHEN** a user opens a Topic with a published Podcast Episode and no film
- **THEN** the headphones button sits right after "Coffee Break podcast" and nowhere else on the page

#### Scenario: A press opens the credits and leaves the section alone

- **GIVEN** an open Coffee Break Cinema section
- **WHEN** a user presses the headphones button after its title
- **THEN** the theme song's credits open, and the section stays open

#### Scenario: The title still toggles the section

- **WHEN** a user presses the title beside the headphones button
- **THEN** the section closes, and the credits do not open

#### Scenario: Mobile matches the web

- **WHEN** a mobile user opens the topic screen or the podcast episode screen of a film
- **THEN** the same button sits right after both titles, and a press opens the credits in a sheet

### Requirement: An editor changes a film's image from Edit film in the action menu

For a user who may edit a ready film's image, the action menu SHALL offer "Edit film": right above "Edit podcast" on
the podcast episode page, and right after "Share topic" on the topic page, for the Topic's latest film. It SHALL open a
dialog titled "Edit film" with a close button and no Cancel or Save, holding the standard image editor at 16:9. No page
SHALL show the controls, and no one else SHALL see the option.

#### Scenario: The option sits right above Edit podcast

- **WHEN** a Topic's editor opens the action menu on the page of a Podcast Episode that has a ready film
- **THEN** "Edit film" shows with the clapperboard icon, directly above "Edit podcast"

#### Scenario: The topic page edits the latest film

- **WHEN** a Topic's editor picks "Edit film" in the action menu of a Topic whose latest Podcast Episode has a ready
  film
- **THEN** the same dialog opens on that film's image, with the option right after "Share topic" and above "Edit
  topic"

#### Scenario: The dialog is the standard image editor

- **WHEN** the dialog opens
- **THEN** it shows the title "Edit film", a close button, an "Image" label, the film's image at 16:9, or the podcast
  episode's image until the film has its own, and one row with the image prompt and Regenerate, with no Cancel, Save,
  or Upload button

#### Scenario: The image is the upload control

- **WHEN** an editor hovers the image on the web and presses it, or taps the image with the camera badge in the app
- **THEN** the file picker opens, and the picked image, cropped to 16:9, replaces the image in the dialog and the
  poster on the page

#### Scenario: A regeneration reads Dreaming

- **WHEN** an editor presses Regenerate in the dialog
- **THEN** the image pulses and the dialog reads "Dreaming, takes about a minute..." until the new image shows in the
  dialog and as the film player's poster

#### Scenario: The month's limit

- **WHEN** an editor at the month's regeneration limit opens the dialog
- **THEN** the image prompt and Regenerate are absent, the count line shows the limit, and the image still uploads

#### Scenario: No film, no option

- **WHEN** an editor opens the action menu on a Podcast Episode with no ready film, or on a Topic with no film
- **THEN** the menu holds no "Edit film"

#### Scenario: A follower sees no option

- **WHEN** a follower who may not edit the Topic opens either action menu
- **THEN** the menu holds no "Edit film"

#### Scenario: Mobile matches the web

- **WHEN** the same editor opens the action menu on the podcast episode screen or the topic screen in the mobile app
- **THEN** "Edit film" sits in the same place and opens the same editor in a sheet with a close button, with the image
  prompt above Regenerate, as the app's other image editors have them

### Requirement: A Video button beside Play opens the film in a dialog

A Brews News podcast episode row SHALL show a Video button beside Play for a Podcast Episode that has a film. The
button SHALL open the film player in a dialog on web and a full-screen sheet on mobile. A podcast card, on the home
page, the Café's Featured Podcasts, and a team's, SHALL show Play and no film button, with or without a film.

#### Scenario: A news row opens the dialog

- **WHEN** a user presses Video on a Brews News podcast episode row
- **THEN** a dialog opens with the film player for that Podcast Episode

#### Scenario: No film, no button

- **WHEN** a Brews News row's Podcast Episode has no film
- **THEN** the row shows Play and no Video button

#### Scenario: A podcast card has no film button

- **WHEN** a Featured Podcasts card's Podcast Episode has a film
- **THEN** the card shows Play and no Video button

### Requirement: The Topic roast shows the latest film above Coffee Break podcast

The Topic roast SHALL show a part labeled "Coffee Break film" directly above its "Coffee Break podcast" part, only if
the Topic's latest Podcast Episode has a ready film. The part SHALL be one row: the film's poster at 16:9 under a round
play button, the Podcast Episode's title beside it, and its date and length under the title. Pressing play SHALL open
the film player in the Video dialog on web and the Video sheet on mobile.

#### Scenario: A ready film shows above the podcast part

- **GIVEN** a Topic whose latest Podcast Episode has a ready film
- **WHEN** a user opens the Topic roast from the notebook tile beside the Topic's title
- **THEN** "Coffee Break film" shows directly above "Coffee Break podcast", with the film's poster under a play button,
  the Podcast Episode's title, and its date and length

#### Scenario: Play opens the film over the Topic roast

- **WHEN** the user presses the play button over the poster
- **THEN** the Video dialog opens over the Topic roast with the film player, the press reports the `topic-info` value,
  and closing the dialog returns to the open Topic roast with focus on the play button

#### Scenario: No ready film, no part

- **WHEN** a user opens the Topic roast of a Topic whose latest Podcast Episode has no film, or a film still rendering
- **THEN** the Topic roast shows "Coffee Break podcast" and no "Coffee Break film" part

#### Scenario: Mobile matches the web

- **WHEN** a mobile user opens the Topic roast sheet of a Topic whose latest Podcast Episode has a ready film
- **THEN** the same part shows in the same place, and its play button opens the Video sheet over the Topic roast sheet

### Requirement: Coffee Break films lists a Topic's films above Coffee Break podcast episodes

On a Topic with a film, the topic page SHALL show a collapsible section headed "Coffee Break films" directly above
Coffee Break podcast episodes. It SHALL look and page like that list, with season tabs, five rows to a page, and the
latest mark. Each row SHALL have a play button, the episode number and title, the date, and the length. It SHALL have
no remove button.

#### Scenario: Films page five at a time

- **GIVEN** a season with seven films
- **WHEN** the list renders
- **THEN** it shows the newest five and pages 1 and 2

#### Scenario: Removal stays on the podcast episodes list

- **WHEN** a Topic's owner views Coffee Break films
- **THEN** no row offers removal, and Coffee Break podcast episodes still does

#### Scenario: A Topic without films shows no list

- **WHEN** a user opens a Topic with no film
- **THEN** no Coffee Break films section renders

### Requirement: A Coffee Break films row loads its film into Topic Cinema

Pressing a Coffee Break films row's play button SHALL load that film into Topic Cinema, open the section, scroll to it,
and play. A browser without JavaScript, and the page the server renders, SHALL list every film of the season with a
link to its podcast episode page.

#### Scenario: A row plays in Topic Cinema

- **WHEN** a user presses play on an older film's row
- **THEN** Topic Cinema opens with that film, scrolls into view, and plays

#### Scenario: Every film without script

- **GIVEN** a season with seven films
- **WHEN** a browser without JavaScript opens the topic page
- **THEN** Coffee Break films lists all seven, each title linked to its podcast episode page, with no page numbers

### Requirement: Mobile shows the same film surfaces and keeps the film's audio in the background

The mobile topic screen SHALL show Topic Cinema and Coffee Break films in the web's order. The podcast episode screen
SHALL show the web's two sections. A film card's play button, labeled "Play film", SHALL open the film in a full-screen
sheet, and a podcast card SHALL show Play alone. The film SHALL offer native fullscreen and picture-in-picture. Its
audio SHALL keep playing with the phone locked or the app in the background.

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

Headings SHALL read "Coffee Break Cinema", on the topic and podcast episode pages, and "Coffee Break films", and a
single video SHALL be called a film in copy. The buttons SHALL read "Video", "Mute", and "Unmute", a film card's play
button SHALL be labeled "Play film", the action menu's option SHALL read "Edit film", and the MCP view's link SHALL
read "Watch on CarlNotes". No heading SHALL contain the word video, and no film surface SHALL show a notice, a warning,
or explanatory text.

#### Scenario: Headings use the film names

- **WHEN** a Topic with films renders
- **THEN** its headings read "Coffee Break Cinema" and "Coffee Break films", and none contains "video"

### Requirement: Topic Cinema opens on every page load

Topic Cinema SHALL be open each time a topic page loads, for a signed-in user and a visitor alike, whether or not the
user played the latest film. A collapse SHALL last until the page is left, and SHALL NOT be saved. The topic read SHALL
return the latest film alone, with no open state. The first render SHALL show the section open.

#### Scenario: A played film opens the section

- **GIVEN** a user who played the Topic's latest film
- **WHEN** they open the topic page
- **THEN** Topic Cinema is open

#### Scenario: A collapse is not saved

- **GIVEN** a user who collapsed Topic Cinema on a Topic
- **WHEN** they open the same Topic again, in the browser or the mobile app
- **THEN** Topic Cinema is open
