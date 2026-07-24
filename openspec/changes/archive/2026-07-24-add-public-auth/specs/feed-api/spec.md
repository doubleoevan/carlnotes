## ADDED Requirements

### Requirement: The topic feed read is public; a session only enriches it
The `GET /topic-feed` route SHALL resolve an optional Better Auth session and SHALL respond to a request with no session rather than rejecting it. A signed-out visitor SHALL receive the Featured and Popular sections. A signed-in user SHALL additionally receive their own "Yours" section.

#### Scenario: A signed-out visitor gets the public sections
- **WHEN** a request to the topic feed carries no session or an invalid/expired one
- **THEN** the API responds 200 with the Featured and Popular sections, no "Yours" section, and reads no user's private data

#### Scenario: A signed-in user also gets their own section
- **WHEN** a request to the topic feed carries a valid session
- **THEN** the API resolves that user and responds with their "Yours" section alongside Featured and Popular

### Requirement: Feed mutations require a session
The rating, consume, and view routes SHALL require a valid Better Auth session. A request with no valid session SHALL receive a 401 and SHALL perform no write. An authenticated request SHALL remain subject to the existing ownership and subscription checks.

#### Scenario: An unauthenticated mutation is rejected
- **WHEN** a rating, consume, or view request carries no session or an invalid/expired one
- **THEN** the API responds 401 and performs no write on any user's behalf

#### Scenario: A missing session is distinct from a forbidden action
- **WHEN** an authenticated user acts on a Finding they don't own and aren't subscribed to
- **THEN** the API responds 403 (unchanged existing behavior), reserving 401 for the no-session case
