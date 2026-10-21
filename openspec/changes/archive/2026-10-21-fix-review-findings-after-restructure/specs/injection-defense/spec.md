## ADDED Requirements

### Requirement: The injection threshold falls back to its default on an empty or invalid setting

The scanner's injection threshold SHALL be the configured `LLM_GUARD_INJECTION_THRESHOLD` only if that value parses to a
finite number above 0 and at most 1. An unset value, an empty string, a word, or a number outside that range SHALL
leave the threshold at the measured default, so an empty setting never becomes a threshold of zero that rejects every
text.

#### Scenario: An empty threshold setting keeps the default

- **GIVEN** `LLM_GUARD_INJECTION_THRESHOLD` set to an empty string
- **WHEN** the scanner's scores are read for any screen type
- **THEN** a detector rejects the text only at or above the default threshold

#### Scenario: A threshold outside the range keeps the default

- **GIVEN** `LLM_GUARD_INJECTION_THRESHOLD` set to `0`, `1.5`, or `high`
- **WHEN** the scanner's scores are read
- **THEN** the default threshold applies

#### Scenario: A valid threshold applies

- **GIVEN** `LLM_GUARD_INJECTION_THRESHOLD` set to `0.65`
- **WHEN** a detector scores a text at `0.7`
- **THEN** the text is rejected
