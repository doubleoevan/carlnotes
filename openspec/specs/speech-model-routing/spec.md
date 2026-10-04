# speech-model-routing Specification

## Purpose
TBD - created by archiving change coffee-break-podcast. Update Purpose after archive.
## Requirements
### Requirement: Speech prices live where they are read, with no unused alias

`litellm-config.yaml` SHALL NOT gain a model alias for speech. The file SHALL say in a comment that speech goes through
the pass-through, that the proxy charges it from LiteLLM's own price table, and that Google's rates double on January 1,
2027. The app's own speech rates SHALL live in one file, `worker/budget.ts`, so a price change in the repo is an edit to
      that file alone. The standard tier's rates are $0.50 per million text input tokens and $9 per million audio output
      tokens through December 31, 2026. A Flex call SHALL be recorded at what the proxy charges the key for it, which is
      half the text input rate and the full audio output rate, so the app's spend sum and the key's metered spend agree.

#### Scenario: The config has no speech alias

- **WHEN** the LiteLLM proxy starts with the config
- **THEN** its model list has no speech model, and a pass-through speech request still succeeds

#### Scenario: A price change is one file

- **WHEN** the speech rates change
- **THEN** the only repo file that states them is `worker/budget.ts`

### Requirement: Speech is one two-speaker request through the proxy on the user's key

The worker SHALL render speech only through the LiteLLM proxy, never by calling Google directly. Each request SHALL be
one `generateContent` call on LiteLLM's Gemini pass-through route for the configured speech model, authenticated with
the billed user's virtual key, so the spend posts to that key. The request SHALL name two speakers with one prebuilt
voice each, SHALL send one part per turn with that turn's speaker and optional style, and SHALL ask for audio output. A
request for a scheduled Scan SHALL select the Flex tier with `"service_tier": "flex"` in the body, and a request for any
other Scan SHALL use the standard tier. The two voices SHALL come from configuration, with `Alnilam` for the host and
`Laomedeia` for the co-host as the defaults.

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

### Requirement: A smoke script proves a two-speaker clip renders and its spend is recorded

The repo SHALL include a smoke script, run under `doppler run` against the local proxy that `bun run carl-up` starts,
that renders a short two-speaker clip on each tier through the same code path that the worker uses. It SHALL use a test
key that it creates for the run, SHALL assert that each response is playable audio, and SHALL assert that the test key's
spend in LiteLLM rose by each call's token counts at that tier's rate in `worker/budget.ts`, so a change in what the
proxy charges for either tier fails the smoke. It SHALL print both amounts, and SHALL delete the test key when it ends.

#### Scenario: The clip renders on both tiers

- **WHEN** the smoke runs with the local proxy up and `GEMINI_API_KEY` set
- **THEN** it receives audio for the standard request and for the Flex request

#### Scenario: The spend posted to the test key

- **WHEN** the smoke reads the test key's spend after each call
- **THEN** the spend rose by the call's tokens at the tier's rate, or the smoke fails and prints both amounts

#### Scenario: A change in the proxy's Flex price fails the smoke

- **WHEN** the proxy starts charging a Flex call's audio at half the standard rate while the app still records it in
  full
- **THEN** the smoke fails, which is the signal to change the app's Flex rate

### Requirement: The app's own cost estimate follows Google's rates by date

The cost the app records for a Podcast Episode SHALL use the speech rates for the tier the render used, and SHALL use
the doubled rates for a render on or after January 1, 2027 UTC, so the app's monthly spend sum does not under-count from
that day.

#### Scenario: A render in 2026 uses the 2026 rates

- **WHEN** a Flex render in December 2026 produces a million audio output tokens
- **THEN** the recorded speech cost is $9, the amount that the proxy charges the key

#### Scenario: A render in 2027 uses the doubled rates

- **WHEN** a Flex render in January 2027 produces a million audio output tokens
- **THEN** the recorded speech cost is $18

