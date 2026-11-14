## ADDED Requirements

### Requirement: The Café's tiles include the Topics of the Teams the person leads

The Featured Topics, Films, and Podcasts tiles SHALL show the Topics the person owns and the Topics held by Teams they
lead, whether a Team owns the Topic or has it shared in. Anyone but the person and an admin SHALL see public Topics
alone, and a Team's only if the Team is public. Each Topic SHALL be listed once.

#### Scenario: A leader's Café shows their Team's Topics

- **WHEN** anyone opens the Café of a person who leads a public Team holding a public Topic someone else owns
- **THEN** the Topic is in the tiles and the table, after the person's own pins

#### Scenario: A private Team stays off a visitor's Café

- **WHEN** a visitor opens the Café of a person who leads a private Team holding a public Topic
- **THEN** the Topic is in neither the tiles nor the table

#### Scenario: A shared-in Topic

- **WHEN** a Team the person leads has a Topic shared in that another Team owns
- **THEN** the Topic is in the person's tiles and table

### Requirement: The person's own table lists the Topics of every Team they are on

The person's own All Topics table SHALL list every Topic they own and every Topic held by a Team they are an active
member of, at every visibility, shared-in Topics included, each once. Everyone else's table SHALL list the Topics of
their tiles. The "N topics" count SHALL follow the table. A row for a Topic the person does not own SHALL show no email
switch, month's cost, or scans.

#### Scenario: A non-leader member's table

- **WHEN** a member who does not lead a Team opens their own Café
- **THEN** the Team's Topics are in their All Topics table at every visibility, with no owner's controls, and not in
  their tiles

#### Scenario: A Topic reached two ways

- **WHEN** the person owns a Topic that a Team they lead also holds
- **THEN** the Topic is listed once in the tiles and once in the table, and the count counts it once

### Requirement: Café pins stay the owner's

A pin SHALL count only on a Topic the person owns. The person's own pins lead the tiles in their order, then the rest
follow in the home's trending order. The rank dialogs SHALL offer owned public Topics alone.

#### Scenario: A team Topic's pin does not lead another member's Café

- **WHEN** the owner of a team Topic has pinned it, and a leader of that Team opens their own Café
- **THEN** the Topic follows the leader's own pins in the trending order, and their rank dialog does not offer it
