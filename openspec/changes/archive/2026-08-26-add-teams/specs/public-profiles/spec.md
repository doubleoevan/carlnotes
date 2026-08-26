## ADDED Requirements

### Requirement: A profile holds the person's topics and their teams

A profile page SHALL show two sections: the person's Topics, then the Teams they belong to. On the
viewer's own profile the sections read "Your topics" and "Your teams"; on anyone else's they read the
counts, "N topics" and "N teams".

The topics section SHALL show the owner's own table on the viewer's own profile, the one the Activity
page used to hold, with its email and active controls intact. Every other viewer SHALL see the
read-only profile table instead, over the Topics that viewer may see.

The teams section SHALL reuse the teams index table. On the viewer's own profile it SHALL list every
Team they are an active member of, with the index's own controls. Every other viewer SHALL see a
read-only table of that person's public Teams where their membership is shown, dropping the columns
that belong to the viewer's own membership: who invited them, the spend, the chat badge, and the
join and leave controls. A Team the person hid their membership on, and a private Team, SHALL appear
on their own profile alone.

#### Scenario: A visitor reads someone else's profile

- **WHEN** a signed-in user opens another person's profile
- **THEN** the topics section shows the read-only profile table, and the teams section lists only that
  person's public Teams where their membership is shown, with no spend, invited-by, or membership controls

#### Scenario: A hidden membership stays off the public profile

- **WHEN** a member who set their membership hidden on a public Team is viewed by anyone else
- **THEN** that Team is absent from their profile's teams section, and present on their own profile

## MODIFIED Requirements

### Requirement: A public Topic credits its owner with a byline

A public Topic SHALL show a byline reading `Brewed by <name>` with the label muted and the name holding the link. The credit is derived at read time: when the Topic's owning Team is public or the viewer is one of its members, the byline SHALL show the Team's avatar and name; otherwise it SHALL show the creator's avatar and username. Flipping a Team public moves every attached public Topic's credit with no data written to the Topic, and a member who opted out of the members stays hidden under team attribution.

The byline SHALL link to the team page only when the viewer can reach it — the Team is public, or the viewer is a member — and to the creator's profile otherwise, so an outsider is never linked to a team page that refuses them. On the topic page the byline SHALL sit under the title. On a homepage Topic card it SHALL appear in a smaller, secondary position, so the Topic stays the hero and the credit reads as the credit line.

The byline SHALL render on every Topic card, whatever section it sits in and whether or not a visitor is signed in. Withholding it on a signed-in visitor's own Topics was considered and dropped: a public Topic's credit is already public, so hiding it anywhere buys no privacy and only makes one card disagree with another.

#### Scenario: The topic page credits its owner

- **WHEN** a public Topic with no Team renders its page
- **THEN** the creator's avatar and username appear under the title and link to their profile

#### Scenario: Every Topic card shows the same byline

- **WHEN** the homepage renders a Topic card in any section, signed in or signed out
- **THEN** the card shows the same derived byline in a smaller, secondary position beneath the Topic title

#### Scenario: A public Team takes the credit

- **WHEN** a public Topic belongs to a public Team
- **THEN** the byline shows the Team and links to the team page

#### Scenario: A private Team leaves the credit with the creator

- **WHEN** an outsider views a public Topic whose Team is private
- **THEN** the byline shows the creator and links to their profile, and no link points at the gated team page

#### Scenario: Every Topic card carries the same byline

- **WHEN** the homepage renders a Topic card in any section, signed in or signed out
- **THEN** the card carries the same owner byline in a smaller, secondary position beneath the Topic title


### Requirement: The subscriber count is denormalised and moved transactionally

Each Topic SHALL have a denormalised subscriber count, so a profile listing many Topics does not run a count query per row.

The count SHALL be incremented and decremented in the same transaction as the write that changes who subscribes — a subscribe, an unsubscribe, a team join or removal writing membership Subscriptions — and the owner's own subscription SHALL NOT count. A subscription is one row per user and Topic whatever the number of holding teams: a join that reaches a Topic the user already subscribes to reuses that row through the unique-index upsert and moves no count, and a removal leaves the row active while any of the member's other teams still reaches the Topic. Any write path that changes who follows a Topic SHALL move the count in the same transaction, so the stored number cannot drift from the rows it summarises.

#### Scenario: Subscribing moves the count atomically

- **WHEN** a user subscribes to a public Topic
- **THEN** the subscription row and the Topic's count change in one transaction

#### Scenario: A team join moves every count it touches

- **WHEN** a user joins a Team holding Topics
- **THEN** each Topic's count reflects the join in the same transaction — one new muted row and one count move where the user was not subscribed, and no double count where an existing row was reused

#### Scenario: The owner is not counted

- **WHEN** a Topic's count is computed or moved
- **THEN** the owner's own subscription is excluded
