# Spec Delta

## ADDED Requirements

### Requirement: A Topic result's row opens the Topic's note

A click or a tap on a Topic result's row, anywhere but its title and its image, SHALL open that Topic's note, the note
the Topic page's header opens, in a popover on the web and a sheet in the mobile app. The Topic SHALL load when the
note opens. The row SHALL hold a note button that opens the same note from a keyboard and a screen reader. The title
and the image SHALL open the Topic's page.

#### Scenario: A row click opens the note

- **WHEN** a user clicks a Topic result's row beside its title
- **THEN** the Topic's note opens over the results, and the search page stays open

#### Scenario: The image opens the Topic

- **WHEN** a user clicks a Topic result's image
- **THEN** the Topic's page opens, as it does from the title

### Requirement: Published Topic Posts are a kind of search result

The site search SHALL find published Topic Posts as the kind `topicPosts`, after `podcastEpisodes` in the kind order,
by a match on the title, the summary, or the body's text. A draft SHALL never be found. A Topic Post SHALL be read
under its Topic's view rules, as a Finding is, and tags SHALL narrow it by its Topic's tags. Its date SHALL be its
published time, and it SHALL have no count, so it follows the counted rows under the `trending` sort.

#### Scenario: A published post matches on its text

- **GIVEN** a published Topic Post on a public Topic whose body holds "orbit" and whose title does not
- **WHEN** a visitor searches "orbit"
- **THEN** the page holds the Topic Post's row with the kind `topicPost`, ranked after every name match

#### Scenario: A draft is never found

- **GIVEN** a draft titled "Orbit notes"
- **WHEN** its author searches "orbit"
- **THEN** the page holds no row for the draft

#### Scenario: A private Topic's post is hidden

- **GIVEN** a published Topic Post titled "Orbit" on a private Topic
- **WHEN** a visitor, or a user with no access to the Topic, searches "orbit"
- **THEN** the page holds no row for the Topic Post, and the Topic's owner finds it

#### Scenario: A post ties after a podcast

- **GIVEN** a Podcast Episode, a published Topic Post, and a Finding that each start with "Orbit"
- **WHEN** a visitor searches "orbit"
- **THEN** the rows read the Podcast Episode, the Topic Post, then the Finding

### Requirement: The Filters menu turns posts on and off

The web Filters menu's Search for group SHALL list Posts after Podcasts with the notebook-pen icon, and turning it
off SHALL leave `topicPosts` out of the search's kinds and its url. The search bar's placeholder and label SHALL name
posts after podcasts on the web and in the mobile app. The MCP `search` tool SHALL take `topicPosts` among its kinds
and return Topic Post rows as the site search does.

#### Scenario: Posts turned off

- **WHEN** a user turns Posts off in Filters on the search page
- **THEN** the url's kinds leave out `topicPosts`, and the page holds no Topic Post row

#### Scenario: An empty search names Posts

- **WHEN** a search with Posts turned off finds nothing
- **THEN** the empty state lists Posts among the kinds turned off in Filters

### Requirement: A Topic Post result shows its image and ends with its Topic

A Topic Post row SHALL include the post's page path, its Topic's id and name, its author, its summary, and its own
image urls, or its Topic's until its own is drawn. The search page, the mobile search screen, and the search MCP view
SHALL show that image at the `thumbnail` size where a Topic row shows its image, or the notebook-pen icon with no
image, the title linking to the post's page, and the line `Post · age · Topic` with the Topic's name linking to the
Topic.

#### Scenario: A post result shows its own image

- **WHEN** a search lists a published Topic Post with its own image
- **THEN** its row shows that image at the `thumbnail` size and the line `Post · 1w ago · Home espresso`

#### Scenario: A post without an image shows its Topic's

- **WHEN** a search lists a Topic Post whose image is not drawn yet, on a Topic with an image
- **THEN** its row shows the Topic's image

#### Scenario: The title opens the post

- **WHEN** a user clicks a Topic Post result's title
- **THEN** the post's page opens, on the web and in the mobile app
