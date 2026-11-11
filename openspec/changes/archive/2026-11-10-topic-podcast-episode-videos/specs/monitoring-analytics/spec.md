## ADDED Requirements

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

- **WHEN** a user collapses Topic Cinema
- **THEN** one `visit_episode_video_section_toggled` event is sent with the Topic's id and `isOpen` false

#### Scenario: Nothing without a key

- **WHEN** the PostHog key is unset
- **THEN** none of these events is sent

### Requirement: A Video dialog open names where it was opened

`visit_episode_video_dialog_opened` SHALL hold the Podcast Episode's id and one of seven `surface` values. A Brews News
row's Video button SHALL send `home-news` on the home and `profile-news` on a profile. The Topic roast's play button
SHALL send `topic-info`. A film card's play button SHALL send `home-videos` in the home's Featured films,
`newest-videos` in its New films this week, `profile-videos` in a Café's Featured Films, and `team-videos` in a team
page's Featured Films.

#### Scenario: A news row's open names the news

- **WHEN** a user presses Video on a Brews News podcast episode row on a profile
- **THEN** one `visit_episode_video_dialog_opened` event is sent with `surface` `profile-news` and the Podcast
  Episode's id

#### Scenario: The Topic roast's open names the topic info

- **WHEN** a user presses the play button over the film's poster in the Topic roast
- **THEN** one `visit_episode_video_dialog_opened` event is sent with `surface` `topic-info`
