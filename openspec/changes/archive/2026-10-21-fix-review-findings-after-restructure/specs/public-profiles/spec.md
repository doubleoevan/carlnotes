## ADDED Requirements

### Requirement: A missing profile gives way to the next loaded profile

The profile page SHALL show its missing message, "No one here by that name.", only for the user id whose load found
nobody. A navigation to another profile id SHALL clear that state if its profile loads, so the page shows the new
profile instead of the missing message it showed for the last id.

#### Scenario: A real profile follows a missing one

- **WHEN** a visitor opens a profile id that matches nobody, then follows a link to a profile that exists
- **THEN** the first shows the missing message and the second shows that profile

## MODIFIED Requirements

### Requirement: Follower counts are shown as they are

A follower count SHALL render as its number, including zero. A public Topic's follower count is not sensitive, and a
reader who can add a column themselves is owed the figure that column sums to. The header's count SHALL carry its noun
in the number's form: `1 follower`, and `followers` for zero and for two or more.

#### Scenario: A zero count renders as zero

- **WHEN** a profile's table renders a Topic nobody follows yet
- **THEN** that row's follower cell reads 0, and the column and its footer cell render like any other

#### Scenario: One follower reads singular

- **WHEN** a profile whose Topics exactly one person follows renders its header
- **THEN** the header reads `1 follower`, and a profile with none or with two reads `followers`

### Requirement: A profile holds the person's topics and their teams

A profile page SHALL show two sections: the person's Topics, then the Teams they belong to. On the
user's own profile the sections read "Your topics" and "Your teams"; on anyone else's they read the
counts, "N topics" and "N teams".

The topics section SHALL show the owner's own table on the user's own profile, the one the Activity
page used to hold, with its email and active controls intact. Everyone else SHALL see the
read-only profile table instead, over the Topics they may see.

The teams section SHALL reuse the teams index table. On the user's own profile it SHALL list every
Team they are an active member of, with the index's own controls. Everyone else SHALL see a
read-only table of that person's public Teams where their membership is shown, dropping the columns
that belong to the user's own membership: who invited them, the spend, the chat badge, and the
join and leave controls. A Team the person hid their membership on, and a private Team, SHALL appear
on their own profile alone.

The members and topics subtables a read-only row opens SHALL be read-only too, whatever the person's role in the Team:
no role select, no admit toggle, no remove button, and no Topic removal, since the user is reading someone else's
membership. On the user's own profile the subtables keep the controls their own role grants.

#### Scenario: A visitor reads someone else's profile

- **WHEN** a signed-in user opens another person's profile
- **THEN** the topics section shows the read-only profile table, and the teams section lists only that
  person's public Teams where their membership is shown, with no spend, invited-by, or membership controls

#### Scenario: A hidden membership stays off the public profile

- **WHEN** a member who set their membership hidden on a public Team is viewed by anyone else
- **THEN** that Team is absent from their profile's teams section, and present on their own profile

#### Scenario: A leader's team reads plain on their public profile

- **WHEN** anyone else opens the members or topics subtable of a Team the profile's person leads
- **THEN** the subtable lists the members and Topics with no role select, admit toggle, remove button, or Topic removal
