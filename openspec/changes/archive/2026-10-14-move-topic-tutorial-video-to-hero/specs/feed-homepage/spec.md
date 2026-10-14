## REMOVED Requirements

### Requirement: A visitor's homepage shows the topic tutorial video card
**Reason**: The hero's headline offers the video through a button that opens the video's dialog.
**Migration**: A visitor opens the video from the button beside "All of it." in the hero.

## ADDED Requirements

### Requirement: A visitor's hero opens the topic tutorial video beside its headline
The hero SHALL show YouTube's red play button right after the headline "He already read it. All of it.", in the
server-rendered html, with a tooltip reading "Watch A Fresh Brew with Carl" that is also its accessible name. A
primary click with no modifier key SHALL open the topic tutorial video's dialog, the one the menus open. The button
SHALL be a link to the video's YouTube page, so a visitor without JavaScript and a click with a modifier key open the
video on YouTube instead. The hero shows only to a visitor on the homepage, so a signed-in user never sees the button.

The dialog's player and the link preview card's YouTube player SHALL be one player, so a YouTube link preview in a
chat or a finding plays the same way and links the same way, with the app's own play button over a dimmed thumbnail.

#### Scenario: A visitor sees the button beside the headline
- **WHEN** a visitor opens the homepage
- **THEN** the server-rendered html includes YouTube's play button after "All of it.", linked to the video's YouTube
  page

#### Scenario: Pressing the button opens the dialog
- **WHEN** a visitor presses the button
- **THEN** the video's dialog opens on its thumbnail, and the page stays on the homepage

#### Scenario: A visitor without JavaScript opens the video on YouTube
- **WHEN** a visitor without JavaScript presses the button
- **THEN** the browser opens the video's YouTube page
