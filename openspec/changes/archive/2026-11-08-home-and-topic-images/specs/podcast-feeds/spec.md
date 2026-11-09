# Spec Delta

## MODIFIED Requirements

### Requirement: Every show and every Podcast Episode has a cover drawn on the cover illustration

Every cover SHALL be a 3000 by 3000 pixel RGB JPEG under 512 KB, drawn by the preview cards' satori and
resvg pipeline over the Topic's image, center-cropped square and scaled to the cover's size, when the Topic has one,
and over the illustration at `apps/docs/design/podcast/cover-base.png` otherwise, whose top 18 percent is an empty band
and whose bottom 25 percent is empty table. The top band SHALL read "Coffee Break podcast", centered across and down the
band, in Architects Daughter, with "Coffee Break" in `#f09050` and "podcast" in `#f3e9db`. Over a Topic's image the top
band and the title SHALL each sit on a translucent gradient in a tone picked from the picture under it, so they stay
legible: a dark band, the hero band's espresso with Dark roast's text and the orange "Coffee Break", unless the picture
under the band is bright, which takes a light band, a card's cream with Latte's text and the badge brown "Coffee
Break". Over the illustration they SHALL sit on no gradient.

A Topic's show cover SHALL show the Topic's name in the bottom band in Architects Daughter, `#332a22`, left-aligned, and
SHALL be the channel's `itunes:image`. A title SHALL step down in size as it gets longer, SHALL wrap, and SHALL stop at
three lines with an ellipsis. All text SHALL stay inside a 10 percent safe margin at the cover's sides and a 5 percent
margin at its bottom, and a title SHALL sit below the newspaper on the table.

Each Podcast Episode SHALL have its own cover, set as its item's `itunes:image`, laid out as a podcast episode card: the
Podcast Episode's own image across the top two thirds at 3:2, or its Topic's image until its own is drawn, or the
illustration when neither exists, and under it a panel in the hero band's espresso with the Podcast Episode's title in
`heroForeground`, stepping down once long and stopping at two lines with an ellipsis, then its detail line, the Topic's
name with the season and number as `Topic · 2026 · E20`, in `heroMuted` on one line. The episode cover SHALL have no
play control and no top band.

A cover SHALL be served at 3000 pixels for feeds and at 600 pixels for email. A cover's url SHALL be unguessable and
SHALL work without a session. Its path includes a key that only the app can compute, made from the cover's Topic or
Podcast Episode, its title, the Topic's image hash, and for a Podcast Episode its own image hash and its detail line. A
public Topic's covers SHALL be served with the edge headers that the preview cards get. A cover SHALL be drawn again
when its title, its Topic's image, or a Podcast Episode's own image or detail line changes, at a new url.

#### Scenario: The show cover names the Topic

- **WHEN** a podcast app fetches a feed's channel image
- **THEN** it gets a 3000 by 3000 RGB image under 512 KB with "Coffee Break podcast" across the top band and the Topic's
  name in the bottom band

#### Scenario: A Podcast Episode has its own cover

- **WHEN** a podcast app fetches an item's `itunes:image`
- **THEN** the image shows that Podcast Episode's own image over a panel with its title and its detail line, and no
  play control

#### Scenario: A long title stops at three lines

- **WHEN** a show cover is drawn for a title too long for three lines at the smallest size, or an episode cover for a
  title too long for two
- **THEN** the title wraps to its last line, which ends with an ellipsis, and no text crosses the safe margin

#### Scenario: A renamed Topic gets a new show cover

- **WHEN** an owner renames a Topic and its feed is fetched again
- **THEN** the channel image's url has changed and the image shows the new name

#### Scenario: A private Topic's cover loads without a session

- **WHEN** an email client with no session requests a private Topic's podcast episode cover at the url that the digest
  gave it
- **THEN** the cover is served

#### Scenario: A guessed cover url is missing

- **WHEN** a client requests a cover with the right Podcast Episode id and a key it made up
- **THEN** the response is not found

#### Scenario: The email size is 600 pixels

- **WHEN** a cover is requested at its email size
- **THEN** the image is 600 by 600 pixels

#### Scenario: A public cover is cached at the edge

- **WHEN** a public Topic's cover is requested
- **THEN** the response has the edge headers that a preview card has

#### Scenario: A cover looks like its Topic

- **WHEN** a Topic with an image publishes a Podcast Episode
- **THEN** the episode's cover shows the Topic's image until the episode's own image is drawn, and then the episode's
  own image at a new url, and a new Topic image moves the show cover to a new url on its next read

#### Scenario: A Topic without an image keeps the illustration

- **WHEN** a Topic whose render failed publishes a Podcast Episode whose own image is not drawn yet
- **THEN** its cover is drawn over the illustration
