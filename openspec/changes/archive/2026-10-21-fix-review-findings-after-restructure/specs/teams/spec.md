## ADDED Requirements

### Requirement: A team created for an invite link attaches its Topics once

The create modal SHALL create the team before Save only if the user asks for an invite link first, since a token needs
a team to point at. That early create SHALL send no Topics. The final Save SHALL then update the team the early create
made and attach the selected Topics once, so no Topic is attached twice and no attach is rejected as already held. A
Save with no earlier create SHALL create the team with its selection in one request.

#### Scenario: An invite link before Save attaches nothing

- **WHEN** a user names a new team, picks Topics, makes an invite link, then saves
- **THEN** the team exists from the link onward with no Topics, and the Save attaches each picked Topic exactly once

#### Scenario: A Save with no link creates in one step

- **WHEN** a user names a new team, picks Topics, and saves without making a link
- **THEN** one create request writes the team with its selection

### Requirement: A failed team save is reported as a failure

A team create or update that fails SHALL be reported to the user as a failure, never as a success and never as a
rejection it was not. A create SHALL read a 409 as a taken name and a 429 as the daily creation limit; an update SHALL
read a 409 as a taken name. Every other failed response, a network failure included, SHALL read as a failure, and the
modal SHALL show an error in place and stay open.

#### Scenario: A failed update shows an error

- **WHEN** a leader saves a rename and the api responds 500
- **THEN** the modal says the save failed and stays open, and nothing says the name was taken

#### Scenario: A failed create shows an error

- **WHEN** a user creates a team and the request fails with a status that is neither 409 nor 429
- **THEN** the modal says the team was not made, and nothing says the daily limit was reached

## MODIFIED Requirements

### Requirement: Joining a Team writes muted Subscriptions

Joining a Team SHALL write a Subscription per team Topic — active, email muted, frequency copied from the Topic —
and attaching a Topic SHALL write the same for every member. A subscription is one row per user and Topic whatever
the number of holding teams: a join reuses an existing row through the unique-index upsert, reactivating it and
leaving its preferences alone, and never writes a second row. Active rows put team Topics in members' feeds and
follower counts through the mechanisms that already read Subscriptions; the muted flag sends no digests at join. A
member SHALL be able to unmute delivery per Topic with the existing preference.

Membership and subscription SHALL stay separable: a member who unsubscribes from a team Topic keeps access through the
Team, since access comes from membership and delivery from the Subscription. Removing a member SHALL deactivate their
Subscriptions on the Team's Topics, and a member keeps their row while any of their teams — the owning team or a
shared-into one — still reaches the Topic, so a private team Topic never lingers in a departed member's feed and no
still-reached Topic loses its row.

A Subscription to a Topic the departing user owns SHALL stay active. A member who leaves or is removed, and a leader
who deletes the Team as its only member, keeps the row for every team Topic whose owner they are, since the Topic
returns to them and stays in their feed. Only their Subscriptions to the Team's other Topics deactivate.

#### Scenario: Joining is quiet but present

- **WHEN** a user joins a Team with twenty Topics
- **THEN** twenty muted Subscriptions are written, no email is sent, the Topics appear in their feed, and each Topic's
  follower count includes them

#### Scenario: Unsubscribing does not eject

- **WHEN** a member unsubscribes from one team Topic
- **THEN** they keep reading and editing it through the Team, and only delivery stops

#### Scenario: Removal clears the feed

- **WHEN** a member is removed from the Team
- **THEN** their Subscriptions on the Team's Topics deactivate, and the Team's private Topics leave their feed

#### Scenario: A departing owner keeps their own Topic

- **WHEN** a member who owns one of the Team's Topics leaves, is removed, or deletes the Team as its only member
- **THEN** their Subscription to that Topic stays active, while their Subscriptions to the Team's other Topics
  deactivate
