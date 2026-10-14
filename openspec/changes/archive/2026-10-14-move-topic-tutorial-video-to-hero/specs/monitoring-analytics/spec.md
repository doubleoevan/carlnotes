## ADDED Requirements

### Requirement: A play of the topic tutorial video is a visit event naming the video and its opener
Pressing the play button in the topic tutorial video's dialog SHALL send the visit event `visit_video_played` with the
video's `youtubeVideoId` and its `opener`, where the dialog was opened from: `hero`, `account-menu`, or `mobile-menu`.
Opening the dialog without pressing play SHALL send nothing. A visitor's click that opens YouTube instead, without
JavaScript or with a modifier key, leaves the app, so YouTube's own analytics count it.

#### Scenario: A play from the hero names the video and the hero
- **WHEN** a visitor opens the video from the hero's button and presses play
- **THEN** PostHog receives `visit_video_played` with the video's `youtubeVideoId` and `opener` set to `hero`

#### Scenario: A play from a menu names the menu
- **WHEN** a user opens the video from the account menu and presses play
- **THEN** PostHog receives `visit_video_played` with `opener` set to `account-menu`
