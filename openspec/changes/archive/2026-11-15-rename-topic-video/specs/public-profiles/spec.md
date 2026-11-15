## REMOVED Requirements

### Requirement: Café pins stay the owner's

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "A Café's featured items stay the owner's"

## MODIFIED Requirements

### Requirement: A Topic's and a Podcast Episode's page open the Home and Featured lists by name

On the page of a public Topic, or of a published Podcast Episode of one, the action menu SHALL offer Home topics or Home
podcasts to an admin, under the home icon, and Featured topics or Featured podcasts to the Topic's owner. Each option
SHALL open the dialog titled as the option reads: the home's featured items for Home, and the owner's own featured
profile items for Featured, with the page's item offered a place. The mobile app SHALL offer the Featured option the
same way.

#### Scenario: An admin who owns the Topic gets both options

- **WHEN** an admin opens the action menu on their own public Topic
- **THEN** the menu lists Home topics under the home icon and Featured topics, and each opens the dialog of that name

#### Scenario: An owner who is no admin gets Featured alone

- **WHEN** a user opens the action menu on their own public Topic
- **THEN** the menu lists Featured topics and no Home topics, and Featured topics opens their own profile's featured
  items

### Requirement: The Café's tiles include the Topics of the Teams the person leads

The Featured Topics, Films, and Podcasts tiles SHALL show the Topics the person owns and the Topics held by Teams they
lead, whether a Team owns the Topic or has it shared in. Anyone but the person and an admin SHALL see public Topics
alone, and a Team's only if the Team is public and shows the person's membership, by the rule the news follows. A
private Topic another member owns SHALL stay out until its Personal sources text is converted. Each Topic SHALL be
listed once.

#### Scenario: A leader's Café shows their Team's Topics

- **WHEN** anyone opens the Café of a person who leads a public Team holding a public Topic someone else owns
- **THEN** the Topic is in the tiles and the table, after the person's own featured items

#### Scenario: A private Team stays off a visitor's Café

- **WHEN** a visitor opens the Café of a person who leads a private Team holding a public Topic
- **THEN** the Topic is in neither the tiles nor the table

#### Scenario: A shared-in Topic

- **WHEN** a Team the person leads has a Topic shared in that another Team owns
- **THEN** the Topic is in the person's tiles and table

#### Scenario: A hidden membership stays off a visitor's Café

- **WHEN** a person hid their membership of a public Team they lead, and another user opens their Café
- **THEN** that Team's Topics are in neither the tiles nor the table, and the person and an admin still see them

## ADDED Requirements

### Requirement: A Café's featured items stay the owner's

A featured item SHALL count only on a Topic the person owns. The person's own featured items lead the tiles in their
order, then the rest follow in the home's trending order. The rank dialogs SHALL offer owned public Topics alone.

#### Scenario: A team Topic's featured item does not lead another member's Café

- **WHEN** the owner of a team Topic has featured it, and a leader of that Team opens their own Café
- **THEN** the Topic follows the leader's own featured items in the trending order, and their rank dialog does not offer
  it
