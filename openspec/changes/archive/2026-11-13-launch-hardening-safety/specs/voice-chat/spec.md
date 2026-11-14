## MODIFIED Requirements

### Requirement: A recording is transcribed on the user's key with storage off and never kept
`POST /api/chat/transcription` SHALL take the chat page and the recording, under the per-caller rate limit and the
same authorization as a chat turn on that page, rejecting a signed-out caller before the body is read and a spent
budget with the chat's rejection. It SHALL transcode the recording with ffmpeg to 16 kHz mono WAV in memory, reading
only the containers a browser records (`matroska`, `webm`, `mov`, `mp4`, `m4a`, `ogg`) and the codecs in them (`opus`,
`aac`, `vorbis`), writing at most 61 seconds, and stopping the transcode after 10 seconds; a recording ffmpeg rejects
SHALL answer 422. It SHALL transcribe the WAV with the transcription model through Google's Interactions API on
LiteLLM's Gemini pass-through on the user's virtual key, with `store` set to false so Google saves no interaction in
the project. It SHALL record the call's cost from the response's token usage as a chat spend row, which is what
the app's budget and cutoffs read for a transcription, while the pass-through charges the key for the same call, and
return the transcript. A WAV with
no samples SHALL call no model, write no spend row, and return an empty transcript. CarlNotes SHALL keep the audio only
in memory for the request. An empty transcript SHALL send nothing and SHALL toast "Carl didn't catch that. Please try
again." A failed transcription SHALL toast "Carl lost his train of thought. Please try again.", while the chat's own
failure notice keeps its retry button and no "Please try again."

#### Scenario: A recording becomes a transcript
- **WHEN** a signed-in user sends a recording on a page they may chat on
- **THEN** the route returns the transcript, and a chat spend row names the user and the page

#### Scenario: The transcription asks Google to store nothing
- **WHEN** the api transcribes a recording
- **THEN** its request to the Interactions API sets `store` to false and includes the WAV inline

#### Scenario: A silent recording calls no model
- **WHEN** the transcode returns a WAV with no samples
- **THEN** the route returns an empty transcript, no model is called, and no spend row is written

#### Scenario: A recording in another container is rejected
- **WHEN** a recording is posted in a container no browser records, such as a WAV or a playlist
- **THEN** ffmpeg rejects it and the route answers 422

#### Scenario: An empty transcript sends nothing
- **WHEN** the model returns no words - **THEN** no chat turn is sent, the composer returns empty, and the toast reads
           "Carl didn't catch that. Please try again."

#### Scenario: A spent budget transcribes nothing
- **WHEN** a user whose monthly spend is exhausted sends a recording
- **THEN** the route answers 402 with the chat's rejection, and no model is called
