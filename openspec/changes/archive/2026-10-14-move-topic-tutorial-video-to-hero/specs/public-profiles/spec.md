## MODIFIED Requirements

### Requirement: The menus play the topic tutorial video in a dialog
The signed-in user's account menu, on desktop and in the mobile drawer, and a visitor's mobile drawer SHALL each offer
an option named "A Fresh Brew with Carl", marked with YouTube's red play button lined up with the icons around it,
right above "What CarlNotes Is". Choosing it SHALL close the menu and open a dialog titled "A Fresh Brew with Carl ☕"
that shows the topic tutorial video's thumbnail with YouTube's play button, which plays the video in place from
`www.youtube-nocookie.com`. The Escape key SHALL close the dialog, and closing it SHALL stop the video. One dialog SHALL
serve every menu and the hero's button.

#### Scenario: A user plays the video from the account menu
- **WHEN** a signed-in user opens the account menu and chooses "A Fresh Brew with Carl"
- **THEN** the menu closes and a dialog shows the topic tutorial video's thumbnail with YouTube's play button

#### Scenario: A visitor plays the video from the mobile drawer
- **WHEN** a visitor opens the mobile drawer and chooses "A Fresh Brew with Carl"
- **THEN** the drawer closes and a dialog shows the topic tutorial video's thumbnail with YouTube's play button

#### Scenario: Pressing play plays the video in the dialog
- **WHEN** the user presses the dialog's play button
- **THEN** the thumbnail is replaced by the video playing from `www.youtube-nocookie.com`

#### Scenario: Escape closes the dialog and stops the video
- **WHEN** the dialog is open and the user presses Escape
- **THEN** the dialog closes and the video's player is removed from the page
