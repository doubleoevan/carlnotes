# Spec Delta

## ADDED Requirements

### Requirement: Social events name the object and the owner flag and hold no text

A save of a Reaction, a post of a Comment, a delete of either, a share or an unshare, a flag of a social subject, and
the first showing of a thread SHALL each send one PostHog event named `social_<object>_<action>`. Each event SHALL
include the object's id, its Topic's id, and whether the actor owns that Topic, and SHALL never include a Comment's
body or a username. With no PostHog key set, nothing SHALL be sent.

#### Scenario: A type sends a react event

- **WHEN** a follower presses a type on a Finding
- **THEN** one `social_finding_react` event is sent with the Finding's id, the Topic's id, and the owner flag false

#### Scenario: A type on a Comment sends a hot take react event

- **WHEN** a user presses a type on a Comment
- **THEN** one `social_hot_take_react` event is sent with the Comment's id

#### Scenario: A Comment sends a hot take event with no text

- **WHEN** a Topic's owner posts a Comment on their own Topic
- **THEN** one `social_topic_hot_take` event is sent with the owner flag true, `isReply` false, and no text

#### Scenario: A reply says so

- **WHEN** a user posts a reply on a Podcast Episode's thread
- **THEN** one `social_podcast_episode_hot_take` event is sent with `isReply` true

#### Scenario: A delete of each sends an event

- **WHEN** a user removes their Reaction and a Topic's owner deletes a Comment
- **THEN** a `social_reaction_delete` event and a `social_hot_take_delete` event are sent

#### Scenario: A share and an unshare each send an event

- **WHEN** an editor shares a Comment and then unshares it
- **THEN** two `social_hot_take_share` events are sent, the first with `isShared` true and the second false

#### Scenario: A flag sends both events

- **WHEN** a user flags a Comment
- **THEN** a `social_hot_take_flag` event and the existing `content_flagged` event are sent

#### Scenario: A thread's first showing sends a view

- **WHEN** a Topic's thread first shows on a user's page
- **THEN** one `social_topic_hot_takes_view` event is sent for that page load

#### Scenario: A self-hosted install sends nothing

- **WHEN** the PostHog key is unset
- **THEN** none of these events is sent
