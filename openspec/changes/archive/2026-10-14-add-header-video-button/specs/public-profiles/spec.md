## ADDED Requirements

### Requirement: A signed-in user's header opens the topic tutorial video beside the wordmark
For a signed-in user, the header SHALL show YouTube's red play button right after the "CarlNotes" wordmark on every
page, with a tooltip reading "Watch A Fresh Brew with Carl" that is also its accessible name. A primary click with no
modifier key SHALL open the topic tutorial video's dialog. The button SHALL be a link to the video's YouTube page, so a
click with a modifier key opens the video on YouTube instead. A page load that brings a session cookie SHALL show the
button before the session request finishes, and a visitor SHALL not see it.

#### Scenario: A signed-in user opens the video from the header
- **WHEN** a signed-in user presses the button beside the wordmark
- **THEN** the video's dialog opens on its thumbnail, and the page stays where it is

#### Scenario: A visitor sees no header button
- **WHEN** a visitor opens any page
- **THEN** the header shows no video button beside the wordmark
