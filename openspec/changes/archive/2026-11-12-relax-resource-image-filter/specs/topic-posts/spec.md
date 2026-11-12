## MODIFIED Requirements

### Requirement: The Topic page shows its Topic Posts below its comment thread

The Topic page and the mobile Topic screen SHALL show a collapsible section titled "Open Mic" right below the Topic's
comment thread, holding the Topic's published Topic Posts as cards, newest first, six a page, with every card in the
server's HTML. An author SHALL see their own drafts first, each marked Draft. A user who may publish SHALL see the
button that starts a draft. The button and the cards SHALL sit inside one card, as the comment thread's do, and the
page buttons SHALL sit under that card, as the scan history's do. The section SHALL be absent for a reader who may not
publish if it has no card.

#### Scenario: A visitor sees the section on a public Topic

- **WHEN** a visitor opens a public Topic that has two Topic Posts
- **THEN** the section shows both cards below the comment thread, newest first, and no button

#### Scenario: An empty section is absent for a follower

- **WHEN** a follower opens a Topic with no Topic Post
- **THEN** the page shows no Open Mic section

#### Scenario: An author sees their draft

- **WHEN** an author with one draft opens the Topic
- **THEN** the section shows the draft's card first, marked Draft, and nobody else's read holds it

#### Scenario: The page buttons sit under the card

- **WHEN** a visitor opens a Topic with seven Topic Posts
- **THEN** six cards show inside the section's card, and the page buttons sit under it

### Requirement: Every published Topic Post gets a generated image

Publishing SHALL draw the Topic Post an image as a Topic's is drawn: a scene written from the post's fenced text, the
house style, and the same sizes. Until the image is stored, a card and the page SHALL show the image's empty frame
pulsing, still if the user asked for reduced motion. An image url SHALL be immutable and gated by the Topic's
visibility.

#### Scenario: A new post's card gains its image

- **WHEN** an author publishes a Topic Post
- **THEN** its card shows the empty frame pulsing at once and the generated image once the render stores it
