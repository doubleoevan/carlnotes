## MODIFIED Requirements

### Requirement: Speech prices live where they are read, with no unused alias

`litellm-config.yaml` SHALL NOT gain a model alias for speech. The file SHALL say in a comment that speech goes through
the pass-through and that the proxy charges it from LiteLLM's own price table. The app's own speech rates SHALL live in
one file, `worker/budget.ts`, so a price change in the repo is an edit to
      that file alone. The standard tier's rates are $0.50 per million text input tokens and $9 per million audio output
      tokens through December 31, 2026. A Flex call SHALL be recorded at what the proxy charges the key for it, which is
      half the text input rate and the full audio output rate, so the app's spend sum and the key's metered spend agree.

`litellm-config.yaml` SHALL NOT gain a model alias for transcription either. A transcription SHALL call Google's
model by name on the pass-through's Interactions route, which checks the key's budget and charges the key nothing for
the call, so the app's own spend row is the only meter of a transcription. The file's comment SHALL say so. The app's
transcription rate SHALL live in `worker/budget.ts` beside the speech rates, from Google's page: $2 per million audio
and text input tokens and $12 per million output tokens, with thought tokens priced as output.

#### Scenario: The config has no speech alias

- **WHEN** the LiteLLM proxy starts with the config
- **THEN** its model list has no speech model, and a pass-through speech request still succeeds

#### Scenario: A price change is one file

- **WHEN** the speech rates change
- **THEN** the only repo file that states them is `worker/budget.ts`

#### Scenario: The config has no transcription alias
- **WHEN** the LiteLLM proxy starts with the config
- **THEN** its model list has no transcription model, and a transcription through the pass-through's Interactions route
  still succeeds

### Requirement: Speech is one two-speaker request through the proxy on the user's key

The worker SHALL render speech only through the LiteLLM proxy, never by calling Google directly. Each request SHALL be
one `generateContent` call on LiteLLM's Gemini pass-through route for the configured speech model, authenticated with
the billed user's virtual key, so the spend posts to that key. The request SHALL name two speakers with one prebuilt
voice each, SHALL send one part per turn with that turn's speaker and optional style, and SHALL ask for audio output. A
request for a scheduled Scan SHALL select the Flex tier with `"service_tier": "flex"` in the body, and a request for any
other Scan SHALL use the standard tier. The two voices SHALL come from configuration, with `Alnilam` for the host and
`Laomedeia` for the co-host as the defaults.

A spoken chat reply SHALL be a second request shape on the same route and key: one `generateContent` call naming a
single speaker in the host's prebuilt voice, on the standard tier, asking for audio output.

#### Scenario: A request names both voices

- **WHEN** the worker renders a chapter
- **THEN** one request is sent whose voice config maps the host to its voice and the co-host to its voice, with one part
  per turn

#### Scenario: A scheduled render selects Flex

- **WHEN** the worker renders a chapter for a scheduled Scan
- **THEN** the request body includes `"service_tier": "flex"`

#### Scenario: A manual render uses the standard tier

- **WHEN** the worker renders a chapter for a manual Scan
- **THEN** the request body selects no service tier

#### Scenario: The spend posts to the user's key

- **WHEN** a chapter renders on a user's virtual key
- **THEN** that key's spend in LiteLLM rises by the call's cost

#### Scenario: A spent key budget leaves the chapter out

- **WHEN** the proxy rejects a speech request because the key's budget is spent
- **THEN** the chapter is not retried and is left out, and if no chapter renders, the Podcast Episode fails with the
  budget as its reason

#### Scenario: A spoken answer names one voice
- **WHEN** a spoken part of a chat reply is spoken
- **THEN** the request names the host voice alone with no service tier, and the spend posts to the user's key
