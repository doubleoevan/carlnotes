## ADDED Requirements

### Requirement: A visitor's homepage shows the topic tutorial video card
The homepage SHALL show a visitor a card right above the Featured topics section, under the tags and the New Topic
button, centered in the page body. The card SHALL be titled "A Fresh Brew with Carl ☕" in the display font, and SHALL
hold the topic tutorial video: the YouTube video on making a topic. The card SHALL be in the server-rendered html. A
page load that brings a session cookie SHALL not show the card, even before the session request finishes, and a
signed-in user SHALL never see it.

The video SHALL show its thumbnail, served from this origin, at full color with YouTube's red play button over it, and
nothing SHALL reach YouTube until the play button is pressed. Pressing it SHALL play the video in place from
`www.youtube-nocookie.com`, with its sound on.
The thumbnail SHALL be a link to the video's YouTube page, so a visitor without JavaScript and a click with a modifier
key open the video on YouTube instead.

The link preview card's YouTube player SHALL be the same player, so a YouTube link preview in a chat or a finding
plays the same way and links the same way, with the app's own play button over a dimmed thumbnail.

#### Scenario: A visitor sees the card above Featured topics
- **WHEN** a visitor opens the homepage
- **THEN** the server-rendered html includes the card titled "A Fresh Brew with Carl ☕" above the Featured topics
  section, with the video's thumbnail linked to the video's YouTube page

#### Scenario: A signed-in user does not see the card
- **WHEN** a signed-in user opens the homepage
- **THEN** the page shows no topic tutorial video card, including before the session request finishes

#### Scenario: Pressing play plays the video in place
- **WHEN** a visitor presses the card's play button
- **THEN** the thumbnail is replaced by the video playing from `www.youtube-nocookie.com` with its sound on, and the
  page stays on the homepage

#### Scenario: A visitor without JavaScript opens the video on YouTube
- **WHEN** a visitor without JavaScript presses the thumbnail
- **THEN** the browser opens the video's YouTube page
