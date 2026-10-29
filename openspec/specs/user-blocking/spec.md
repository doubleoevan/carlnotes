# user-blocking Specification

## Purpose
One person blocks another so that person's messages, comments, mentions, invitations, and people search results stop
reaching them, on both apps, without the blocked person being told.

## Requirements

### Requirement: A user blocks and unblocks another user

A signed-in user SHALL be able to block any other user and to unblock them later. A block SHALL be one row naming
the blocker and the blocked user, written once however many times it is asked for, and SHALL take effect on the next
read on every replica and both apps. A user SHALL NOT block themselves. Blocking SHALL need no reason and SHALL send
no email.

#### Scenario: A block is written once

- **WHEN** a user blocks the same person twice
- **THEN** one block exists and the second request succeeds without a second row

#### Scenario: A self block is rejected

- **WHEN** a user tries to block their own account
- **THEN** the request is rejected and no block is written

#### Scenario: Unblocking restores the reads

- **WHEN** a user unblocks a person
- **THEN** the next load of a room, thread, or invite list shows that person's content again

### Requirement: Block and Report sit together on content and on the profile

A room message, a note comment, and a note SHALL offer Report where the reader sees them, and the report dialog for a
subject with an author SHALL offer to block the author in the same step. A profile page's action menu SHALL offer
Block, or Unblock once blocked, beside its existing Report. Both apps SHALL place these actions where the web places
them: in the message and comment footer beside Reply and Copy, in the note's dialog beside its existing actions, and
in the page action menu.

#### Scenario: A report offers the block

- **WHEN** a reader opens Report on a message
- **THEN** the dialog shows the author's name with a "Block" choice, and sending with it set blocks the author and
  reports the message in one submission

#### Scenario: The profile menu toggles the block

- **WHEN** a user opens a blocked person's profile
- **THEN** the action menu shows Unblock in place of Block

### Requirement: A blocker does not see what the blocked person writes to them

For the blocker, a blocked person's room messages SHALL be absent from the transcript and from live events, their
note comments from every thread, their mentions from the mention badge, their pending invitations from the invite
lists and badges, and the person from people search results. Published Topics, podcast episodes, notes, and profiles
SHALL stay visible.

#### Scenario: A reply to a hidden message keeps its marker

- **WHEN** another member replies to a blocked person's message in a room the blocker reads
- **THEN** the blocker sees the reply marked as a reply to a hidden message, with none of the hidden text

#### Scenario: A live message from a blocked person is dropped

- **WHEN** a blocked person posts to a room the blocker has open
- **THEN** the blocker's stream carries no event for the message, and the room's other members receive it

#### Scenario: A blocked person's comments are hidden on every page

- **WHEN** the blocker opens a note thread holding the blocked person's comments
- **THEN** those comments are absent, and the thread's count for the blocker excludes them

#### Scenario: A blocked person's pending invite is hidden

- **WHEN** the blocked person had invited the blocker to a Topic before the block
- **THEN** the invite is absent from the blocker's Activity and badge, and accepting it by link is rejected as unknown

#### Scenario: The blocked person's public topic stays open

- **WHEN** the blocker opens a public Topic the blocked person owns
- **THEN** the Topic, its findings, and its byline render as for anyone else

### Requirement: A blocked person is not told who blocked them

A blocked person SHALL see no sign of the block: the blocker's content stays visible to them, their own posts succeed
and reach everyone but the blocker, and an invitation they send to the blocker SHALL be rejected with the same words
and status the "not accepting invitations" setting already uses. No response, count, or page SHALL differ between a
block and that setting.

#### Scenario: An invite to the blocker is rejected like a closed setting

- **WHEN** a blocked person invites the blocker by username or email
- **THEN** the sender is told the recipient is not accepting invitations, in the words the invite-access setting uses,
  and no invite is written

#### Scenario: The blocked person's post succeeds

- **WHEN** a blocked person posts a room message
- **THEN** the post is accepted, every other member receives it, and the blocked person sees it in their transcript

### Requirement: Account settings list blocked people with Unblock

Both apps' Account settings SHALL show a Blocked people section listing each blocked person by username with an
Unblock control, placed with the Invitations section and before the delete-account section. An empty list SHALL say
so. The section SHALL read and write through the same api as the profile's Block and Unblock.

#### Scenario: The list shows and clears a block

- **WHEN** a user opens Account settings after blocking someone
- **THEN** the person is listed, and Unblock removes them from the list and restores their content

#### Scenario: The list is empty

- **WHEN** a user with no blocks opens the section
- **THEN** it says no one is blocked, with no controls

### Requirement: A block survives the blocked person's content changes and dies with either account

A block SHALL hide content the blocked person posts after the block as well as before it, SHALL be removed when
either account closes, and SHALL be reported as a count only in the admin console, never as a list.

#### Scenario: A closed account's blocks go with it

- **WHEN** the blocked person closes their account
- **THEN** the block row is gone and the blocker's list no longer shows them
