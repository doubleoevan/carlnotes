## ADDED Requirements

### Requirement: The feed includes each Topic's latest Podcast Episode

Every Topic in the feed SHALL include its latest published Podcast Episode that the user may listen to, with its
chapters and the user's progress, or null if it has none or the instance has no speech model. An invite Topic SHALL
include a subscriber's latest Podcast Episode only if it published after the subscriber's subscription activated,
unless the user is an admin, the Topic's owner, or a member of a holding Team. The topic page SHALL read the same field.

The Feed API SHALL read every Topic's latest Podcast Episode in a fixed number of queries: one for the newest published
Podcast Episode of each Topic, one each for the kept Podcast Episodes' chapters and the user's progress, and one each
for the user's access, the user's holding Teams, and the subscriptions' activation times among the invite Topics.

#### Scenario: A visitor's feed includes a public Topic's latest Podcast Episode

- **WHEN** a visitor's feed holds a public Topic with a published Podcast Episode and an invite Topic with one
- **THEN** the public Topic includes its latest Podcast Episode with its chapters, and the invite Topic includes none

#### Scenario: More Topics take no more queries

- **WHEN** the feed holds more Topics
- **THEN** the number of queries that read the latest Podcast Episodes stays the same
