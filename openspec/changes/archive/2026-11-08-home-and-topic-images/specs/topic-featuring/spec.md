# Spec Delta

## ADDED Requirements

### Requirement: A Podcast Episode holds a feature order too

A published Podcast Episode of a public Topic SHALL be able to hold a feature order, set by an admin from the episode
page's Rank dialog with the Topic dialog's rules: contiguous from one, one holder per position, moved rather than
copied, released when the Podcast Episode is removed or its Topic leaves the public set.

#### Scenario: An admin pins an episode

- **WHEN** an admin gives a Podcast Episode position one
- **THEN** it leads the home's featured Podcast Episode cards on the next refresh

### Requirement: Dropping a pin asks first

A Rank dialog's Save that drops a pinned Topic or Podcast Episode SHALL first ask the admin to confirm, naming each row
it drops, and SHALL send nothing if the admin cancels.

#### Scenario: An admin cancels a drop

- **WHEN** an admin removes a pinned row with its X, presses Save, and cancels the confirmation
- **THEN** no feature order changes and the Rank dialog stays open with the row removed

### Requirement: The admin console lists both pin lists

The admin console SHALL show a Featured card listing the pinned Topics and the pinned Podcast Episodes in order, each
row with the move and clear controls the Rank dialog offers.

#### Scenario: An admin clears a pin from the console

- **WHEN** an admin clears a pinned Topic's row in the Featured card
- **THEN** the Topics below move up by one and the home page is purged at the edge

### Requirement: A pin change purges the home page

Setting, moving, or clearing a feature order SHALL clear the home card ids' cache entry and purge the home page's
edge cache tag.

#### Scenario: The edge serves the new featured topics

- **WHEN** an admin pins a Topic and a visitor loads `/`
- **THEN** the served page shows the pinned Topic first
