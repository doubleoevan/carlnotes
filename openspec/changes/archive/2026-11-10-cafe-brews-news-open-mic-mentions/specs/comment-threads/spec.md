# Spec Delta

## ADDED Requirements

### Requirement: A comment thread counts its Comments and replies

A comment thread's page SHALL include how many Comments and replies the thread holds in all, counting only the
authors the reader sees, beside the week's count. A delete SHALL return the count as it stands. The field SHALL be
optional, and a client that reads a thread without it SHALL show no count.

#### Scenario: The first page counts the whole thread

- **WHEN** a reader loads a thread with twelve Comments and replies, four of them from the last seven days
- **THEN** the page's whole count is twelve and its week count is four

#### Scenario: A blocked author's Comments are not counted

- **WHEN** a reader who blocked the author of two of a thread's five Comments loads the thread
- **THEN** the page's whole count is three

#### Scenario: A delete returns the count without the Comment and its replies

- **WHEN** an author deletes their top-level Comment with two replies from a thread of five
- **THEN** the delete returns a whole count of two

## MODIFIED Requirements

### Requirement: An editor's own Comment starts shared

A Comment or a reply posted by a user who may edit the Topic SHALL be shared if a shared comment slot is free, unless
the composer's share switch is off. The switch SHALL show only to a user who may share, and SHALL start on, or on an
edit from the Comment's share. A post with no share choice SHALL share a top-level Comment and not a reply. A Comment by
anyone else SHALL start unshared, whatever its post asks. A Comment or a reply on a Topic Post SHALL start unshared
whoever posts it: its composer's switch SHALL start off, and a post with no share choice SHALL share nothing. A user
who may edit the Topic SHALL share and unshare it afterward as any Comment.

#### Scenario: The owner's Comment starts shared

- **WHEN** a Topic's owner posts a top-level Comment with a shared comment slot free
- **THEN** the Comment is shared and the used shared comment slot count is one higher

#### Scenario: The owner turns the share off

- **WHEN** a Topic's owner turns off the composer's share switch and posts a top-level Comment with a shared comment
  slot free
- **THEN** the Comment is not shared and the shared comment slot count is unchanged

#### Scenario: A follower never sees the switch

- **WHEN** a user who may not share opens the composer
- **THEN** the composer shows no share switch, and a post that asks to share is posted unshared

#### Scenario: The owner's reply starts shared

- **WHEN** a Topic's owner posts a reply through the composer with a shared comment slot free and the switch on
- **THEN** the reply is shared and the used shared comment slot count is one higher

#### Scenario: The switch with no shared comment slot free

- **WHEN** an editor opens the composer with no shared comment slot free
- **THEN** the switch is off and disabled and says the next podcast episode is full, unless the edited Comment already
  holds a shared comment slot

#### Scenario: An edit takes a share back

- **WHEN** an editor turns off the switch while editing a waiting shared Comment and saves
- **THEN** the words are saved, the Comment is not shared, and the used shared comment slot count is one lower

#### Scenario: An aired Comment stays shared on an edit

- **WHEN** an editor edits a Comment that has aired
- **THEN** the switch is on and disabled, and the Comment stays shared

#### Scenario: A reply with no share choice starts unshared

- **WHEN** a Topic's owner posts a reply from an AI app, which sends no share choice
- **THEN** the reply is not shared and the shared comment slot count is unchanged

#### Scenario: The owner's Comment at the limit starts unshared

- **WHEN** a Topic's owner posts a top-level Comment with no shared comment slot free
- **THEN** the Comment is posted unshared

#### Scenario: The owner's Comment on a Topic Post starts unshared

- **WHEN** a Topic's owner posts a top-level Comment on one of the Topic's Topic Posts with a shared comment slot free
- **THEN** the composer's switch starts off, the Comment is posted unshared, and the shared comment slot count is
  unchanged

#### Scenario: A team member shares a Comment on a Topic Post by hand

- **WHEN** a member of a Team that holds the Topic presses the share toggle on a Comment on a Topic Post
- **THEN** the Comment is shared, and pressing the toggle again unshares it
