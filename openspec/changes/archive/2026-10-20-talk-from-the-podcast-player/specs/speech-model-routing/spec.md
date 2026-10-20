## MODIFIED Requirements

### Requirement: Speech is one two-speaker request through the proxy on the user's key

The worker SHALL render speech only through the LiteLLM proxy, never by calling Google directly. Each request SHALL be
one `generateContent` call on LiteLLM's Gemini pass-through route for the configured speech model, authenticated with
the billed user's virtual key, so the spend posts to that key. The request SHALL name two speakers with one prebuilt
voice each, SHALL send one part per turn with that turn's speaker and optional style, and SHALL ask for audio output. A
request for a scheduled Scan SHALL select the Flex tier with `"service_tier": "flex"` in the body, and a request for any
other Scan SHALL use the standard tier. The two voices SHALL come from configuration, with `Alnilam` for the host and
`Laomedeia` for the co-host as the defaults.

A spoken chat reply SHALL be a second request shape on the same route and key: one `generateContent` call naming a
single speaker in the answering speaker's prebuilt voice, the host's for `host` and the co-host's for `cohost`, on the
standard tier, asking for audio output. The two request shapes SHALL read the same two configured voices.

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
- **WHEN** a spoken part of a reply Carl gave is spoken
- **THEN** the request names the host voice alone with no service tier, and the spend posts to the user's key

#### Scenario: Vienna's spoken answer names the co-host voice
- **WHEN** a spoken part of a reply Vienna gave is spoken
- **THEN** the request names the co-host voice alone with no service tier
