# Spec Delta

## ADDED Requirements

### Requirement: A block hides comments in both directions

For two users with a block between them in either direction, each SHALL see none of the other's Comments or replies
on any page, and neither SHALL be suggested to the other as a mention. Neither SHALL save a Reaction or post a
Comment on a social target of a Topic the other owns. A reaction summary SHALL leave the other person out of its
counts and its names.

#### Scenario: The blocker stops seeing the blocked person's text

- **WHEN** a user blocks a person who commented on a public Topic
- **THEN** that person's Comments and replies are absent from every thread the user reads

#### Scenario: The blocked person stops seeing the blocker's text

- **WHEN** the blocked person, signed in, opens a thread the blocker commented on
- **THEN** the blocker's Comments are absent

#### Scenario: A blocked person cannot post on the blocker's Topic

- **WHEN** a person a Topic's owner blocked posts a Comment on that Topic
- **THEN** the post is rejected, and the composer shows the client's ordinary failure

#### Scenario: Unblocking restores both

- **WHEN** the user unblocks the person
- **THEN** each sees the other's Comments again on the next read

#### Scenario: A reaction summary leaves the other person out

- **WHEN** a user reads a summary that holds a Reaction from someone in a block with them, in either direction
- **THEN** neither the count nor the names include that person

### Requirement: An admin block removes a person's reactions and comments from every page

An admin SHALL be able to set and clear an admin block on any user. While it is set, that user's Reactions and
Comments SHALL be absent from every read, count, email, and model context, and that user SHALL save no Reaction and
post no Comment. Clearing it SHALL restore what was hidden.

#### Scenario: An admin block hides a person's Comments from everyone

- **WHEN** an admin blocks a user who has commented on three Topics
- **THEN** no user or visitor sees those Comments, and each Topic's reaction counts leave that user out

#### Scenario: A blocked user's post is rejected

- **WHEN** a user under an admin block posts a Comment
- **THEN** the post is rejected and nothing is stored

#### Scenario: Clearing the block restores the Comments

- **WHEN** the admin clears the block
- **THEN** the user's Comments show again and the user may post

### Requirement: The blocked people list and a blocked profile name the block

The Blocked people section SHALL show each blocked person as the standard avatar and username link to their profile.
Unblock there SHALL ask the user to confirm before it sends. A profile the signed-in user blocked SHALL show Blocked
with its icon after the follower count, linked to the account page's Blocked people section, on both apps. Nobody
else SHALL see it.

#### Scenario: Unblock asks first

- **WHEN** a user presses Unblock on a row of the Blocked people section
- **THEN** a confirmation opens, and the block stays until the user confirms

#### Scenario: A blocked profile says so

- **WHEN** a user opens the profile of someone they blocked
- **THEN** Blocked shows after the follower count, and its link opens the account page at the Blocked people section

## MODIFIED Requirements

### Requirement: A blocked person is not told who blocked them

A blocked person SHALL see no sign of the block: the blocker's content stays visible to them, their own posts succeed
and reach everyone but the blocker, and an invitation they send to the blocker SHALL be rejected with the same words
and status the "not accepting invitations" setting already uses. No response, count, or page SHALL differ between a
block and that setting.

Comments and reaction summaries are the one exception. A block hides the other person's Comments and leaves them out
of a reaction summary, in both directions, and stops each person reacting or posting on a social target of a Topic the
other owns, so a blocked person who compares a page with its signed-out copy can tell. No response SHALL name the
block or the blocker.

#### Scenario: An invite to the blocker is rejected like a closed setting

- **WHEN** a blocked person invites the blocker by username or email
- **THEN** the sender is told the recipient is not accepting invitations, in the words the invite-access setting uses,
  and no invite is written

#### Scenario: The blocked person's post succeeds

- **WHEN** a blocked person posts a room message
- **THEN** the post is accepted, every other member receives it, and the blocked person sees it in their transcript

#### Scenario: A rejected Comment names no block

- **WHEN** a blocked person posts a Comment on a Topic the blocker owns
- **THEN** the rejection is the one any failed post gets, and it names neither the block nor the blocker
