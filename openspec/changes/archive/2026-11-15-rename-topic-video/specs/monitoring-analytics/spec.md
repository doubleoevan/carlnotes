## REMOVED Requirements

### Requirement: Featured film events hold ids only

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "Featured film events send ids only"

## MODIFIED Requirements

### Requirement: Film events hold ids only

A started play SHALL send `episode_played` with its `format`, `audio` or `video`. The worker SHALL send
`episode_video_render_failed` with a reason code and `episode_video_rebuilt` with the rebuild's seconds. The browser
SHALL send `visit_episode_format_switched`, `visit_episode_video_section_toggled`, `visit_episode_videos_page_viewed`,
and `visit_episode_video_dialog_opened` with the surface. Each SHALL hold only ids and short codes.

#### Scenario: A film play names its format

- **WHEN** a signed-in user starts a film
- **THEN** one `episode_played` event is sent with `format` `video` and the Podcast Episode's id

#### Scenario: A failed render reports a code

- **WHEN** a film's render fails for good
- **THEN** one `episode_video_render_failed` event is sent with the Topic's and the Podcast Episode's ids and a reason
  code, and never ffmpeg's error text

#### Scenario: A collapse is counted

- **WHEN** a user collapses the topic video section
- **THEN** one `visit_episode_video_section_toggled` event is sent with the Topic's id and `isOpen` false

#### Scenario: Nothing without a key

- **WHEN** the PostHog key is unset
- **THEN** none of these events is sent

## ADDED Requirements

### Requirement: Featured film events send ids only

An admin's change to the home's featured films SHALL send `episode_video_home_order_change` with the Podcast Episode's
id and the new position. An owner's change to their Café's featured films SHALL send `social_profile_order_change` with
the film kind. A press on a film card's play button SHALL send `visit_episode_video_dialog_opened` with the Podcast
Episode's id and its section. None SHALL carry text.

#### Scenario: A Café's featured film is reported by kind

- **WHEN** an owner features a film on their Café at position two
- **THEN** one `social_profile_order_change` event is sent with the film kind, the id, and position two
