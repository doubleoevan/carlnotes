# Spec Delta

## ADDED Requirements

### Requirement: The directory lives on the Topics page

Everything this capability says of the homepage SHALL hold for the Topics page at `/topics`: the Tags and New Topic
row, the sections, the sort and view menus, the paging, and the opening rules. The user menu SHALL list Topics, and
`/` SHALL be the home page the `home-page` capability describes.

#### Scenario: The directory moved whole

- **WHEN** a user opens `/topics`
- **THEN** they see the sections, controls, and paging the homepage showed before this change

#### Scenario: Topics is in the user menu

- **WHEN** a signed-in user opens the user menu
- **THEN** a Topics entry opens `/topics`

### Requirement: A Topic row carries its image

Each Topic row on the Topics page SHALL show the Topic's `page` image at the row's width at its left, beside the title,
the byline and reactions, and the tags, and the placeholder ground when the Topic has no image yet.

#### Scenario: A row shows its image

- **WHEN** a Topic with an image is listed
- **THEN** its row shows the `page` image beside its title

## MODIFIED Requirements

### Requirement: The homepage renders the Feed from the committed design export
The Topics page at `/topics` SHALL implement the committed design export at `apps/docs/design/homepage.html`: the dark
hero band with Carl's headline, the overlapping search field (visual for now), and the collapsible Topic sections **Your
topics**, **Featured**, and **Popular**. Display type SHALL use Architects Daughter and body type SHALL use Karla. The
export is the source of truth for layout and interaction; the shipped theming and ambient background have since evolved
past it. The home route `/` renders the home page instead, which the `home-page` capability describes.

#### Scenario: Homepage shows the hero and topic sections
- **WHEN** the Topics page loads against the seeded dev data
- **THEN** it renders the hero band with the headline and the Your topics / Featured / Popular sections, each
  collapsible

### Requirement: The homepage opens the section that has something in it
For a signed-in user the Topics page SHALL open the "Your topics" section first, except when the user owns no Topic and
follows at least one, when it SHALL open "Your followed topics" instead. A visitor SHALL still see the featured Topics
first. A closed section SHALL be in the html and SHALL show without JavaScript, so a reader who cannot open it still
reads it, and SHALL hide with JavaScript until opened.

#### Scenario: A follower who owns nothing lands on what they follow
- **WHEN** a user who follows a Topic but owns none loads the Topics page
- **THEN** "Your followed topics" is the open section

#### Scenario: An owner lands on their own topics
- **WHEN** a user who owns a Topic loads the Topics page
- **THEN** "Your topics" is the open section, whatever they follow

#### Scenario: A closed section shows without JavaScript
- **WHEN** a client with no JavaScript loads a visitor's Topics page
- **THEN** the Popular section's topics are shown under the open Featured section, and a browser with JavaScript sees
  them only once the section is opened
