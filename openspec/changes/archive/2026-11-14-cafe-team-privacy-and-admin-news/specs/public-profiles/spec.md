## MODIFIED Requirements

### Requirement: The Café's tiles include the Topics of the Teams the person leads

The Featured Topics, Films, and Podcasts tiles SHALL show the Topics the person owns and the Topics held by Teams they
lead, whether a Team owns the Topic or has it shared in. Anyone but the person and an admin SHALL see public Topics
alone, and a Team's only if the Team is public and shows the person's membership, by the rule the news follows. A
private Topic another member owns SHALL stay out until its Personal sources text is converted. Each Topic SHALL be
listed once.

#### Scenario: A leader's Café shows their Team's Topics

- **WHEN** anyone opens the Café of a person who leads a public Team holding a public Topic someone else owns
- **THEN** the Topic is in the tiles and the table, after the person's own pins

#### Scenario: A private Team stays off a visitor's Café

- **WHEN** a visitor opens the Café of a person who leads a private Team holding a public Topic
- **THEN** the Topic is in neither the tiles nor the table

#### Scenario: A shared-in Topic

- **WHEN** a Team the person leads has a Topic shared in that another Team owns
- **THEN** the Topic is in the person's tiles and table

#### Scenario: A hidden membership stays off a visitor's Café

- **WHEN** a person hid their membership of a public Team they lead, and another user opens their Café
- **THEN** that Team's Topics are in neither the tiles nor the table, and the person and an admin still see them

### Requirement: The person's own table lists the Topics of every Team they are on

The person's own All Topics table SHALL list every Topic they own and every Topic held by a Team they are an active
member of, at every visibility, shared-in Topics included, each once. A private Topic another member owns SHALL stay
out until its Personal sources text is converted. Everyone else's table SHALL list the Topics of their tiles. The "N
topics" count SHALL follow the table. A row for a Topic the person does not own SHALL show no email switch, month's
cost, or scans.

#### Scenario: A non-leader member's table

- **WHEN** a member who does not lead a Team opens their own Café
- **THEN** the Team's Topics are in their All Topics table at every visibility, with no owner's controls, and not in
  their tiles

#### Scenario: A Topic reached two ways

- **WHEN** the person owns a Topic that a Team they lead also holds
- **THEN** the Topic is listed once in the tiles and once in the table, and the count counts it once

#### Scenario: An unconverted private Topic stays out

- **WHEN** another member owns a private Topic on the person's Team whose Personal sources text is not converted
- **THEN** the Topic is not in the person's table, and it is listed once the text is converted

## ADDED Requirements

### Requirement: A profile's table names whose Topic each row is

A profile's All Topics table SHALL show an Owner column on the web and in the mobile app. A row on a Team SHALL name the
Team and link to its page, and any other row SHALL name the owner and link to their profile. A private Team SHALL be
named only to its active members, and anyone else SHALL see the owner. The Activity page's table SHALL keep its
columns.

#### Scenario: A Team's row

- **WHEN** a member opens their own Café and a row is a Topic on their Team
- **THEN** the row's Owner column shows the Team and opens the team page

#### Scenario: A private Team named to an outsider

- **WHEN** an admin who is not a member opens the Café of a person whose private Team holds a Topic
- **THEN** the row's Owner column shows the Topic's owner

### Requirement: An admin switches someone else's profile between the user view and the visitor view

An admin on someone else's profile SHALL see a select in the news card, highlighted in the primary color, between
"User view" and "Visitor view" on the web and in the mobile app. The select SHALL change the whole page to what the
person sees or what a visitor sees, and another profile SHALL open in the user view. A read in the visitor audience
SHALL return what a visitor reads to any reader.

#### Scenario: An admin starts in the user view

- **WHEN** an admin opens someone else's profile
- **THEN** the select shows "User view", and the Café and the table show the person's private Topics, except one whose
  Personal sources text is not converted

#### Scenario: An admin switches to the visitor view

- **WHEN** the admin chooses "Visitor view"
- **THEN** the Café, the table, and the news show only what a visitor sees, and the news shows no opener

#### Scenario: Another profile starts in the user view

- **WHEN** the admin, in the visitor view, opens another person's profile
- **THEN** that profile opens in the user view

#### Scenario: No select for anyone else

- **WHEN** the person opens their own profile, or a user who is not an admin opens someone else's
- **THEN** the news card shows no view select
