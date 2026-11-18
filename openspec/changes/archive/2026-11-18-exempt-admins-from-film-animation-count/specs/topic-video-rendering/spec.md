## MODIFIED Requirements

### Requirement: A new film can animate one generated illustration with Gemini Omni

A new animated film SHALL send at most one displayed generated illustration selected for a public Finding to Gemini Omni. The platform SHALL fund one distinct shot per Free account per UTC calendar month. Non-admin Plus and Premium owners SHALL fund up to three and seven respectively per month. Admin owners MAY fund extra shots from their model budget. Each film MAY also use up to eight distinct local picture effects and the reusable host steam.

#### Scenario: A paid generation succeeds

- **WHEN** the provider returns a five-second video, the worker SHALL remove provider audio and verify the silent video’s dimensions, rate and frame count
- **THEN** matching shots SHALL use the saved video with the original montage and narration

#### Scenario: A request fails or its activity retries

- **WHEN** a competing or retried render encounters a prior reservation for the episode
- **THEN** it SHALL reuse a completed animation for the same approved picture, or retain its local effect after failure, without another provider request

#### Scenario: The account has used its monthly allowance

- **WHEN** another film requests an eligible picture in the same UTC month
- **THEN** an existing animation of that exact picture for the account may be reused without a charge
- **AND** a new picture receives no paid generation once a non-admin owner reaches the plan limit

#### Scenario: The film has used its local effects

- **WHEN** eight distinct local pictures have been assigned animation
- **THEN** later chapters SHALL make no new picture planning requests
- **AND** the host steam and the Omni animation SHALL use none of these eight slots

#### Scenario: An admin owner has used the plan allowance

- **WHEN** an admin-owned episode requests an eligible new picture after the monthly plan allowance
- **THEN** the worker SHALL reserve it under the episode owner and bill the owner’s model key
- **AND** retries and reuse SHALL follow the existing reservation rules

#### Scenario: An included reservation fails before submission

- **WHEN** a Free admin releases the included reservation after another film reserves an owner-funded extra
- **THEN** the next eligible film SHALL be able to reserve the platform-funded shot
