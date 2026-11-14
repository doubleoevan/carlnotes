## MODIFIED Requirements

### Requirement: Speech prices live where they are read, with no unused alias

`litellm-config.yaml` SHALL NOT gain a model alias for speech. The file SHALL say in a comment that speech goes through
the pass-through and that the proxy charges it from LiteLLM's own price table. The app's own speech rates SHALL live in
one file, `packages/models/budget.ts`, so a price change in the repo is an edit to
      that file alone. The standard tier's rates are $0.50 per million text input tokens and $9 per million audio output
      tokens through December 31, 2026. A Flex call SHALL be recorded at what the proxy charges the key for it, which is
      half the text input rate and the full audio output rate, so the app's spend sum and the key's metered spend agree.

`litellm-config.yaml` SHALL NOT gain a model alias for transcription either. A transcription SHALL call Google's
model by name on the pass-through's Interactions route, which checks the key's budget and charges the key for the
call from LiteLLM's own price table, as it charges speech, so the app's spend row for a transcription and the key's
metered spend agree. The file's comment SHALL say so. The app's transcription rate SHALL live in
`packages/models/budget.ts` beside the speech rates, from Google's page: $2 per million audio and text input tokens and
$12 per million output tokens, with thought tokens priced as output. The dev stack SHALL run the proxy at production's
version, so the speech smoke test checks the charge that production makes.

#### Scenario: The config has no speech alias

- **WHEN** the LiteLLM proxy starts with the config
- **THEN** its model list has no speech model, and a pass-through speech request still succeeds

#### Scenario: A price change is one file

- **WHEN** the speech rates change
- **THEN** the only repo file that states them is `packages/models/budget.ts`

#### Scenario: The config has no transcription alias

- **WHEN** the LiteLLM proxy starts with the config
- **THEN** its model list has no transcription model, and a transcription through the pass-through's Interactions route
  still succeeds

#### Scenario: A transcription is charged to the key at the app's rate

- **WHEN** a recording is transcribed on a user's key through the proxy at production's version
- **THEN** the key's spend rises by what the app's transcription rate estimates for the call
