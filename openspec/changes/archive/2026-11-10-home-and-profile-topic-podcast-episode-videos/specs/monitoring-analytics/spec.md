## ADDED Requirements

### Requirement: Featured film events hold ids only

An admin's home film pin change SHALL send `episode_video_home_order_change` with the Podcast Episode's id and the new
position. An owner's Café film pin change SHALL send `social_profile_order_change` with the film kind. A press on a
film card's play button SHALL send `visit_episode_video_dialog_opened` with the Podcast Episode's id and its section.
None SHALL carry text.

#### Scenario: A Café pin is reported by kind

- **WHEN** an owner pins a film on their Café at position two
- **THEN** one `social_profile_order_change` event is sent with the film kind, the id, and position two

### Requirement: A film card's open names its section

A film card's `visit_episode_video_dialog_opened` SHALL hold the `surface` of the section that holds the card:
`home-videos` in the home's Featured films, `newest-videos` in its New films this week, `profile-videos` in a Café's
Featured Films, and `team-videos` in a team page's Featured Films. No film card SHALL send the other three values:
`home-news` and `profile-news` come from a Brews News row's Video button on the home and on a profile, and `topic-info`
from the Topic roast's play button.

#### Scenario: A film card's open names its section

- **WHEN** a visitor presses a film card's play button in New films this week
- **THEN** one `visit_episode_video_dialog_opened` event is sent with `surface` `newest-videos` and the Podcast
  Episode's id

#### Scenario: A team page's card names the team's films

- **WHEN** a member presses a film card's play button in a team page's Featured Films
- **THEN** one `visit_episode_video_dialog_opened` event is sent with `surface` `team-videos`
