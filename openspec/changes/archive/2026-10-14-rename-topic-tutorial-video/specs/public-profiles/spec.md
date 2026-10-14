## MODIFIED Requirements

### Requirement: The menus play the topic tutorial video in a dialog
The signed-in user's account menu, on desktop and in the mobile drawer, and a visitor's mobile drawer SHALL each offer
an option named "Brew with Carl", marked with YouTube's red play button lined up with the icons around it, right above
"What CarlNotes Is". Choosing it SHALL close the menu and open a dialog titled "Brew with Carl ☕" that shows the topic
tutorial video's thumbnail with YouTube's play button, which plays the video in place from `www.youtube-nocookie.com`.
The Escape key SHALL close the dialog, and closing it SHALL stop the video. One dialog SHALL serve every menu and the
hero's button.

#### Scenario: A user plays the video from the account menu
- **WHEN** a signed-in user opens the account menu and chooses "Brew with Carl"
- **THEN** the menu closes and a dialog shows the topic tutorial video's thumbnail with YouTube's play button

#### Scenario: A visitor plays the video from the mobile drawer
- **WHEN** a visitor opens the mobile drawer and chooses "Brew with Carl"
- **THEN** the drawer closes and a dialog shows the topic tutorial video's thumbnail with YouTube's play button

#### Scenario: Pressing play plays the video in the dialog
- **WHEN** the user presses the dialog's play button
- **THEN** the thumbnail is replaced by the video playing from `www.youtube-nocookie.com`

#### Scenario: Escape closes the dialog and stops the video
- **WHEN** the dialog is open and the user presses Escape
- **THEN** the dialog closes and the video's player is removed from the page

### Requirement: A signed-in user's header opens the topic tutorial video beside the wordmark
For a signed-in user, the header SHALL show YouTube's red play button right after the "CarlNotes" wordmark on every
page, with a tooltip reading "Watch Brew with Carl" that is also its accessible name. A primary click with no modifier
key SHALL open the topic tutorial video's dialog. The button SHALL be a link to the video's YouTube page, so a click
with a modifier key opens the video on YouTube instead. A page load that brings a session cookie SHALL show the button
before the session request finishes, and a visitor SHALL not see it.

#### Scenario: A signed-in user opens the video from the header
- **WHEN** a signed-in user presses the button beside the wordmark
- **THEN** the video's dialog opens on its thumbnail, and the page stays where it is

#### Scenario: A visitor sees no header button
- **WHEN** a visitor opens any page
- **THEN** the header shows no video button beside the wordmark
