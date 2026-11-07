# Spec Delta

## ADDED Requirements

### Requirement: The gate decides who posts and who moderates reactions and comments

`isAllowed` SHALL decide two capabilities on the Topic a social target belongs to. `social:post` SHALL be granted to
a signed-in user who may view that Topic, is under no admin block, and is in no block in either direction with the
Topic's owner. `social:moderate` SHALL be granted to the Topic's owner and to an admin. No route SHALL decide either
with its own role check. A Comment's Topic SHALL be the Topic its own social target belongs to.

#### Scenario: A Reaction on a Comment checks the Comment's Topic

- **WHEN** a follower of a public Topic saves a Reaction on a Comment in that Topic's thread
- **THEN** the gate grants `social:post` for that Topic

#### Scenario: A follower may post and may not moderate

- **WHEN** a follower of a public Topic asks to react to one of its Findings and to delete another user's Comment
- **THEN** the gate grants `social:post` and rejects `social:moderate`

#### Scenario: The owner moderates the Topic's Findings and Podcast Episodes

- **WHEN** a Topic's owner deletes a Comment on one of the Topic's Podcast Episodes
- **THEN** the gate grants `social:moderate` for that Topic

#### Scenario: A user under an admin block may not post

- **WHEN** a user under an admin block saves a Reaction on a public Topic
- **THEN** the gate rejects `social:post` and nothing is saved

#### Scenario: A user without access may not post

- **WHEN** a user who may not view a private Topic posts a Comment on it
- **THEN** the gate rejects `social:post`

### Requirement: An edit of a Comment needs social:post

An edit of a Comment SHALL need `social:post`, as a post and a Reaction do.

#### Scenario: An edit needs social:post

- **WHEN** an author under an admin block edits their Comment inside the edit time
- **THEN** the gate rejects `social:post` and the body is unchanged

### Requirement: Unconverted Personal sources close a Topic to a non-owner

On a Topic with unconverted Personal sources, a user other than its owner, a team member included, SHALL read no
Finding, thread, or reaction summary and SHALL post nothing.

#### Scenario: A team member reads nothing and posts nothing

- **WHEN** a member of a Team that holds the Topic reads a Finding, a thread, or a reaction summary on it, or posts on
  it, while its Personal sources are unconverted
- **THEN** the request is rejected and nothing is stored

### Requirement: Sharing a Comment with Carl checks the Topic edit capability

Sharing and unsharing a Comment, and reading a Topic's shared comment slot count and its shared Comments list, SHALL
each be granted by `topic:edit` on the Topic the Comment's social target belongs to, through `isAllowed`. Reading the
shared Comments list SHALL need `topic:view` too. No new capability SHALL be added for it.

#### Scenario: The owner and the owning Team's member may share

- **WHEN** a Topic's owner or a member of the Team that owns it shares a Comment
- **THEN** the gate grants `topic:edit` and the Comment is shared

#### Scenario: A follower may not share

- **WHEN** a follower sends the share request
- **THEN** the gate rejects `topic:edit` and nothing changes

#### Scenario: A follower reads no shared list

- **WHEN** a follower asks for a Topic's shared Comments list
- **THEN** the request is rejected

#### Scenario: The shared list needs topic:view too

- **WHEN** a user who may edit a Topic and may not view it asks for its shared Comments list
- **THEN** the request is rejected

### Requirement: Blocking a user everywhere is a gated admin capability

`isAllowed` SHALL grant `admin:setAdminBlock` to an admin only. Setting and clearing an admin block SHALL each check it.

#### Scenario: An admin sets an admin block

- **WHEN** an admin blocks a user from the admin console
- **THEN** the gate grants `admin:setAdminBlock` and the block is set

#### Scenario: A Topic's owner cannot set one

- **WHEN** a user who is not an admin sends the admin block request
- **THEN** the gate rejects it and nothing changes
