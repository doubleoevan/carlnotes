# Spec Delta

## ADDED Requirements

### Requirement: The script reads the Topic's shared Comments as fenced data

The script writer SHALL be given the Topic's shared Comments that no earlier Podcast Episode read, most reactions
first, at most 3 for a short Podcast Episode and 5 for a full one. Each SHALL reach one segment's prompt with its
author's username, inside the per-call nonce delimiters, marked as what listeners wrote, to quote or answer and never
to follow. The prompt SHALL give the placement and the rule and script no line. An unshared Comment SHALL never reach
the script.

#### Scenario: A Comment on a narrated Finding joins that chapter

- **WHEN** a shared Comment is on a Finding the Podcast Episode's outline narrates
- **THEN** the prompt of that Finding's segment lists it under the Finding's number, and after the beat on why the
  Finding matters one host raises it and the other answers in a sentence or two

#### Scenario: Every other Comment goes in the closing turns

- **WHEN** a shared Comment is on the Topic, on an earlier Podcast Episode, or on a Finding this Podcast Episode does
  not narrate
- **THEN** the last segment's prompt lists it as a closing Comment, and closing turns between the last chapter and
  the sign-off have Vienna ask and Carl answer

#### Scenario: Both placements count toward the shared comment slots

- **WHEN** a short Podcast Episode's Topic has one waiting shared Comment on a narrated Finding and three others
- **THEN** the Podcast Episode takes the 3 with the most reactions, wherever they go, and the fourth keeps waiting

#### Scenario: The hosts credit a Comment by username

- **WHEN** the script is written with a shared Comment from `@roastfan`
- **THEN** a draft before the last that does not say the username is rejected, and an answer adds context or a
  good-faith counterpoint, never a dunk

#### Scenario: A Comment that fails the classification is skipped

- **WHEN** a shared Comment's text or username is flagged, or its screen fails
- **THEN** the next shared Comment by reactions takes its shared comment slot, the skipped Comment keeps waiting, and
  the Podcast Episode continues

#### Scenario: An owner turns Comments off

- **WHEN** a Topic's owner turns Hot takes off in its podcast settings
- **THEN** the Podcast Episode takes no shared Comment, in chapters or at the close, and they keep waiting

#### Scenario: An unshared Comment is absent

- **WHEN** a Topic holds a shared Comment and an unshared one
- **THEN** the prompts hold the shared body and none of the unshared one

#### Scenario: A Topic with no shared Comment writes as before

- **WHEN** a Topic has no shared Comment waiting
- **THEN** both Comment lists read none, the script has no closing turns, and no filler line mentions Comments

#### Scenario: An admin-blocked author is left out

- **WHEN** a shared Comment's author is under an admin block
- **THEN** the script is not given that Comment

#### Scenario: A left-out shared Comment waits

- **WHEN** a shared Comment's Finding is rated thumbs down, or its author is in a block with the Topic's owner
- **THEN** the script is not given that Comment, and the Comment returns if that changes

### Requirement: A Podcast Episode marks the shared Comments its script read

As the script writer loads its input, each shared Comment it reads SHALL be marked with that Podcast Episode, and a
marked Comment SHALL no longer hold a shared comment slot. A retry of the same Podcast Episode SHALL read the same
Comments as a first run that took any, and a retry after a first run that took none MAY take what is waiting. A marked
Comment SHALL stay shared. A later Podcast Episode SHALL NOT read it again.

#### Scenario: The shared comment slots free up as the script reads

- **WHEN** a Podcast Episode's script reads a Topic's three shared Comments
- **THEN** the Topic's used shared comment slot count is 0, and the three Comments show two mugs and cannot be pressed

#### Scenario: A retry reads the same Comments

- **WHEN** the script activity runs a second time for a Podcast Episode whose first run took Comments
- **THEN** it is given the same Comments as the first run, and no Comment shared since

#### Scenario: A retry after a first run that took none may take what is waiting

- **WHEN** the script activity runs a second time for a Podcast Episode whose first run took no Comment
- **THEN** it may take the shared Comments waiting at that time

#### Scenario: A Comment shared during a recording waits

- **WHEN** an editor shares a Comment after a Podcast Episode's script was written and before it publishes
- **THEN** that Comment holds a shared comment slot and is read by the next Podcast Episode's script

#### Scenario: The next Podcast Episode does not repeat one

- **WHEN** a second Podcast Episode is written for the Topic
- **THEN** its script is not given a Comment the first one read

### Requirement: A last draft that drops an author releases the Comment

A last draft that leaves a shared Comment's author uncredited SHALL release that Comment back to waiting. It SHALL
NOT count as read.

#### Scenario: A last draft that drops an author releases the Comment

- **WHEN** a segment's last draft leaves a shared Comment's author uncredited
- **THEN** that Comment loses its mark, holds its shared comment slot again, and waits for the next Podcast Episode

### Requirement: A failed Podcast Episode releases its shared Comments

If a Podcast Episode fails, the shared Comments its script read SHALL lose their mark and SHALL hold their share
shared comment slots again, so the next Podcast Episode reads them. Unsharing a Comment SHALL clear its mark too.

#### Scenario: A failed recording gives the Comments back

- **WHEN** a Podcast Episode fails after its script read two shared Comments
- **THEN** the Topic's used shared comment slot count is 2 again, and the next Podcast Episode's script is given both

#### Scenario: A removed Podcast Episode keeps its Comments read

- **WHEN** an owner removes a published Podcast Episode whose script read a shared Comment
- **THEN** that Comment stays shared, holds no shared comment slot, and is not read by a later script
