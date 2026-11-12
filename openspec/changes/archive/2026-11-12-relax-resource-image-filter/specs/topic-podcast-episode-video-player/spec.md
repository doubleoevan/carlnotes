## REMOVED Requirements

### Requirement: Topic Cinema opens for an unseen film and remembers each user's choice

**Reason**: A saved open or collapse choice made the section collapse for a user who had played the film, and the
Coffee Break podcast section saves no choice either.
**Migration**: `PUT /api/topics/:id/video-section` is removed, and no released app version calls it. Nothing reads
`topic_podcast_episode_video_sections`, and a later migration drops the table once the api that this deploy replaces
is gone.

## ADDED Requirements

### Requirement: Topic Cinema opens on every page load

Topic Cinema SHALL be open each time a topic page loads, for a signed-in user and a visitor alike, whether or not the
user played the latest film. A collapse SHALL last until the page is left, and SHALL NOT be saved. The topic read SHALL
return the latest film alone, with no open state. The first render SHALL show the section open.

#### Scenario: A played film opens the section

- **GIVEN** a user who played the Topic's latest film
- **WHEN** they open the topic page
- **THEN** Topic Cinema is open

#### Scenario: A collapse is not saved

- **GIVEN** a user who collapsed Topic Cinema on a Topic
- **WHEN** they open the same Topic again, in the browser or the mobile app
- **THEN** Topic Cinema is open
