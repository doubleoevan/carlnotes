## ADDED Requirements

### Requirement: The runtime image includes ffmpeg

The root Dockerfile's runtime stage, which the app and the worker share, SHALL install ffmpeg, so the worker can join
and encode a Podcast Episode's audio. The build SHALL fail if ffmpeg cannot be installed.

#### Scenario: The worker finds ffmpeg

- **WHEN** the worker's encode step runs in the deployed image
- **THEN** `ffmpeg` is on the path and encodes the Podcast Episode

### Requirement: The LiteLLM service alone holds the Gemini key

`GEMINI_API_KEY` SHALL be passed to the LiteLLM service: in `docker-compose.yml` beside `FIREWORKS_API_KEY` for local
development, and in the LiteLLM service's own settings in production. It SHALL be listed in `.env.example`. The app and
the worker SHALL NOT read it, and they SHALL reach Gemini only through the LiteLLM proxy.

#### Scenario: The local proxy has the key

- **WHEN** `bun run carl-up` starts the local services
- **THEN** the LiteLLM container has `GEMINI_API_KEY` in its environment

#### Scenario: The app runs without the key

- **WHEN** the app and the worker start with no `GEMINI_API_KEY` in their environment
- **THEN** they start normally, and a speech request through the proxy still succeeds
