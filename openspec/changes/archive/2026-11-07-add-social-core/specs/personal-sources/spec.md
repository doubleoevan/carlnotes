# personal-sources delta

## MODIFIED Requirements

### Requirement: Documentation describes shipped confirmation and retention

The MCP guide and privacy policy SHALL explain deliberate sends, imports, forwarding, plan limits, Topic-owner-funded
summarization with sender-private summaries, model processing, retention, deletion, key/grant revocation, and
editable-Topic routing and sender-only private content. Existing policy coverage of collection, use/storage, sharing,
retention, and contact SHALL remain intact.

#### Scenario: A reader compares docs with the product
- **WHEN** the feature ships
- **THEN** the existing MCP documentation URL covers all twenty-two tools and all confirmation paths
- **AND** the policy distinguishes uploaded export text from independent access to an assistant's history or memory
- **AND** no copy claims directory approval or unverified provider retention settings

## ADDED Requirements

### Requirement: The account shows API keys to Premium

The account page SHALL show the AI Agent API keys section, on both apps, only to an account that may create a key or
that holds an active key. A free account with no active key SHALL NOT see the section. An account that lost Premium
SHALL still see its active keys so it can revoke them.

#### Scenario: A free account sees no API keys

- **WHEN** a signed-in user without Premium and with no active key opens their account
- **THEN** no AI Agent API keys heading, link, or Premium note appears

#### Scenario: A lapsed account revokes its keys

- **WHEN** a signed-in user who lost Premium and holds an active key opens their account
- **THEN** the section lists the key with its Revoke button and offers no new key

### Requirement: The account opens Add to AI

The Connected AI apps section SHALL offer an Add to AI button, on both apps, that opens the Add to AI dialog, with or
without a connected app.

#### Scenario: A user with no connected app adds one

- **WHEN** a signed-in user with no connected AI app presses Add to AI on their account
- **THEN** the Add to AI dialog opens, the same one the page menu opens

### Requirement: The Personal sources section lists the Topic's shared Comments

The Personal sources section in Topic info SHALL show, to a user who may edit the Topic, a "Hot takes" group that
lists the Topic's shared Comments, newest shared first, each as one shared `ExpandableRow` with its author and its
text. The group SHALL NOT count toward the 10 Source limit and SHALL be absent if no Comment is shared. A user who
may not edit the Topic SHALL NOT see the group or read its list.

#### Scenario: An editor sees the shared Comments

- **WHEN** a Topic's owner opens Topic info on a Topic with two shared Comments
- **THEN** the Personal sources section shows a Hot takes group with two rows, and the Sources count is unchanged

#### Scenario: A follower sees no group

- **WHEN** a follower opens Topic info on the same Topic
- **THEN** no Hot takes group shows, and the shared Comments list request is rejected

#### Scenario: No shared Comment shows no group

- **WHEN** an editor opens Topic info on a Topic with no shared Comment
- **THEN** no Hot takes group shows

#### Scenario: Unsharing removes the row

- **WHEN** an editor unshares a Comment and opens Topic info again
- **THEN** the group no longer lists that Comment

### Requirement: The Hot takes group leaves out a blocked author's Comment

The Hot takes group SHALL leave out a shared Comment while its Finding is rated thumbs down, or while its author is
under an admin block or in a block with the Topic's owner. It SHALL also leave out a Comment by someone in a block
with the reader, in either direction.

#### Scenario: A left-out shared Comment is not listed

- **WHEN** a shared Comment's Finding is rated thumbs down, or its author is under an admin block or in a block with
  the Topic's owner
- **THEN** the group does not list that Comment until that changes

#### Scenario: A block with the reader hides a row

- **WHEN** an editor opens Topic info on a Topic with a Comment shared by someone in a block with the editor, in either
  direction
- **THEN** the group does not list that Comment
