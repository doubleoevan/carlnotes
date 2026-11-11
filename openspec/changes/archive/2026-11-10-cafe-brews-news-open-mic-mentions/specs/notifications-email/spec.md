# Spec Delta

## ADDED Requirements

### Requirement: The email covers Topic Posts

The email SHALL include the Reactions and Comments that other people wrote on the person's own Topic Posts, beside
those on the Topic Posts of Topics the person owns. Each such line SHALL name the Topic Post by its title and link to
its page. A line SHALL show once, even if the person both owns the Topic and wrote the Topic Post.

#### Scenario: A Comment on a member's post reaches the member

- **WHEN** a follower comments on a Topic Post that a team member published on someone else's Topic
- **THEN** the member's email names the Topic Post and quotes the Comment, with a link to the Topic Post's page

#### Scenario: An owner who wrote the post gets one line

- **WHEN** a follower comments on a Topic Post that the Topic's owner published
- **THEN** the owner's email holds that Comment once

## MODIFIED Requirements

### Requirement: Quoted text is escaped, shortened, and never a link

The email SHALL quote at most ten texts, each escaped, cut to 140 characters, and with every url in it written so
that a mail client does not turn it into a link. It SHALL count the remainder. A mention's quote SHALL hold no more
than the Comment's first line, cut and escaped the same way.

#### Scenario: A url in a Comment is not a link

- **WHEN** a quoted Comment holds a url
- **THEN** the email shows it as text that no mail client links

#### Scenario: Markup in a Comment shows as text

- **WHEN** a quoted Comment holds an html tag
- **THEN** the email shows the characters and renders no element from them

#### Scenario: A busy day is summarized

- **WHEN** a person's day holds 14 Comments
- **THEN** the email quotes ten and says four more are waiting

#### Scenario: A mention quotes the first line alone

- **WHEN** a Comment of three lines mentions a person
- **THEN** that person's email quotes the first line and none of the other two
