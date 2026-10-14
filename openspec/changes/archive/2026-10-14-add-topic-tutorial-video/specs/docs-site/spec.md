## ADDED Requirements

### Requirement: The quickstart page plays the topic tutorial video
The docs quickstart page SHALL embed the topic tutorial video above its first step, as a lazily loaded frame at the
page's full width and a 16:9 ratio. The frame SHALL first show the app's thumbnail for the video with YouTube's play
button over it, and nothing SHALL load from YouTube until the play button is pressed. Pressing it SHALL play the video
in the frame from `www.youtube-nocookie.com`. The docs build SHALL make the frame from the same video details the app
reads, so the page names no video id, and the docs SHALL serve the thumbnail from the app's own file. The page SHALL
stay a markdown file, so the docs embedding sync still reads it, and the sync SHALL leave the video's marker out of the
text it embeds for chat.

#### Scenario: The quickstart shows the video's thumbnail
- **WHEN** a reader opens the docs quickstart page
- **THEN** the topic tutorial video's thumbnail shows with YouTube's play button, above "1. Sign in"

#### Scenario: Pressing play plays the video in the page
- **WHEN** a reader presses the thumbnail
- **THEN** the frame plays the video from `www.youtube-nocookie.com`, and the page stays on the quickstart

#### Scenario: The docs sync reads the words around the video
- **WHEN** the docs embedding sync reads the quickstart page
- **THEN** its text includes the page's words and none of the video's markup
