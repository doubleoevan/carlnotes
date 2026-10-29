# Spec Delta

## MODIFIED Requirements

### Requirement: Native note counts match web presentation

Mobile SHALL show separate unread edit/comment information on note rows and the combined count on rendered Topic titles and the Tasting Notes section. The menu button SHALL sum the unread note changes with the unread chat mentions and waiting invitations as the web's avatar does, the Profile item SHALL sum the topics' notes with their chats, and the Teams item SHALL sum the teams' own, as the web menu does. Count copy, outline treatment, and abbreviation SHALL match web. Accessible text and a press or long-press explanation SHALL expose the same details that web supplies by hover. Native Team pages SHALL use the same note counts and controls.

#### Scenario: A Topic has edits and comments waiting

- **WHEN** one Topic note has one unread edit and another has two unread comments
- **THEN** the Topic and section show three, and each note row identifies its own waiting changes

#### Scenario: A count exceeds nine

- **WHEN** more than nine changes are waiting
- **THEN** the compact badge reads "9+" and its accessible explanation retains the actual count

#### Scenario: The menu sums the notes

- **WHEN** a Topic note has one unread edit and a Team note has one unread comment
- **THEN** the menu button shows 2, the Profile item shows 1, the Teams item shows 1, and a long press on each lists
  the notes by name under a "notes" heading
