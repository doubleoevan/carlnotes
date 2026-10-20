## REMOVED Requirements

### Requirement: A signed-in user's header opens the topic tutorial video beside the wordmark

**Reason**: A visitor now sees the button too, on every page without the hero.

**Migration**: Replaced by "The header opens the topic tutorial video beside the logo".

## ADDED Requirements

### Requirement: The header opens the topic tutorial video beside the logo

The header SHALL show YouTube's red play button right after the "CarlNotes" logo on every page that has no hero, for
a visitor and a signed-in user alike, with a tooltip reading "Watch Brew with Carl" that is also its accessible name.
A primary click with no modifier key SHALL open the topic tutorial video's dialog. The button SHALL be a link to the
video's YouTube page, so a click with a modifier key opens the video on YouTube instead. On the home page a visitor
SHALL see the hero's button and no button beside the logo. A page load that brings a session cookie SHALL show the
button before the session request finishes.

#### Scenario: A signed-in user opens the video from the header

- **WHEN** a signed-in user presses the button beside the logo
- **THEN** the video's dialog opens on its thumbnail, and the page stays where it is

#### Scenario: A visitor opens the video from a topic page

- **WHEN** a visitor presses the button beside the logo on a topic page
- **THEN** the video's dialog opens on its thumbnail, and the page stays where it is

#### Scenario: A visitor on the home page sees the hero's button alone

- **WHEN** a visitor opens the home page
- **THEN** the hero shows the video's button, and the header shows no video button beside the logo
