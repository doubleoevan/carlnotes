## ADDED Requirements

### Requirement: An admin block takes the person's items off the home

While a user is under an admin block, the Topics that user owns, the Podcast Episodes and films of those Topics, and
the Topic Posts that user wrote SHALL be absent from every card section of the home, pinned or not. The home SHALL
follow a block that is set or cleared on its next cache refresh. The items SHALL still open at their own urls.

#### Scenario: A blocked user's Topic leaves the home

- **GIVEN** a public shown Topic among the home's Featured topics
- **WHEN** an admin sets an admin block on its owner
- **THEN** on the next cache refresh the home holds no card of that Topic, of its Podcast Episodes, or of its films

#### Scenario: A blocked user's Topic Post leaves the week's posts

- **GIVEN** a Topic Post published this week on a public shown Topic
- **WHEN** an admin sets an admin block on its author
- **THEN** on the next cache refresh New posts this week and Featured posts no longer hold it

#### Scenario: The Topic still opens at its url

- **WHEN** a visitor opens a blocked user's public Topic by its url
- **THEN** the Topic page opens as before

#### Scenario: Clearing the block brings the items back

- **WHEN** the admin clears the block
- **THEN** the user's items may show on the home again on its next cache refresh

### Requirement: A switch limits the home to its pinned items

While the pinned-only switch in the spend control settings is on, every card section of the home SHALL hold only
items an admin pinned: no trending Topic, no Podcast Episode or film ranked by its listeners, no newest Topic Post,
and no unpinned item in a section of the week's new items. Your topics and Brews News on the user face SHALL stay as
they are. The switch SHALL be off until an admin turns it on, and no copy SHALL tell a user that it is on.

#### Scenario: An unpinned Topic leaves the home

- **GIVEN** two pinned Topics and ten trending public shown Topics on the home
- **WHEN** an admin turns the pinned-only switch on
- **THEN** Featured topics holds the two pinned Topics alone on the home's next cache refresh

#### Scenario: A new account's Topic Post does not reach the home

- **GIVEN** the pinned-only switch is on
- **WHEN** a new account publishes a Topic Post on its public shown Topic
- **THEN** neither Featured posts nor New posts this week holds it, and the Topic Post still opens at its url

#### Scenario: A week's section with no pinned item is absent

- **GIVEN** the pinned-only switch is on and no pinned film was published in the last seven days
- **WHEN** a visitor opens the home
- **THEN** New films this week is absent, as an empty week's section is

#### Scenario: Turning the switch off brings the unpinned items back

- **WHEN** an admin turns the pinned-only switch off
- **THEN** the home's sections fill as before on its next cache refresh

#### Scenario: A user's own Topics stay

- **GIVEN** the pinned-only switch is on
- **WHEN** a signed-in user opens the home
- **THEN** Your topics lists the Topics the user owns and follows as before
