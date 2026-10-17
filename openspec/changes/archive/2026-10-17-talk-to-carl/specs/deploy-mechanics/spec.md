## MODIFIED Requirements

### Requirement: The runtime image includes ffmpeg

The root Dockerfile's runtime stage, which the app and the worker share, SHALL install ffmpeg, so the worker can join
and encode a Podcast Episode's audio, and the app can draw a cover, transcode a chat recording, and encode a spoken
reply to MP3 with the `libmp3lame` encoder. The build SHALL fail if ffmpeg cannot be installed.

#### Scenario: The worker finds ffmpeg

- **WHEN** the worker's encode step runs in the deployed image
- **THEN** `ffmpeg` is on the path and encodes the Podcast Episode

#### Scenario: The app finds ffmpeg
- **WHEN** the app transcodes a recording or encodes a spoken answer
- **THEN** ffmpeg runs from the same image, and the reply encodes to MP3
