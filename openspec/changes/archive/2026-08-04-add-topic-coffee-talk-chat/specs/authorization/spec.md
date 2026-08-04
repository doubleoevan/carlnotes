## ADDED Requirements

### Requirement: Chat capabilities are answered by the gate
`isAllowed(user, "chat:send", topic)` SHALL answer whether a user may send a chat turn about a Topic, combining the Topic view rule with the user's remaining monthly spend budget. `isAllowed(user, "chat:persist")` SHALL answer whether the conversation is kept server-side, which every signed-in user has on every plan. No chat call site SHALL compare a plan or role itself.

#### Scenario: Chat send reuses the Topic view rule
- **WHEN** `isAllowed(user, "chat:send", topic)` is asked
- **THEN** it refuses any user who could not view the Topic, introducing no second visibility rule

#### Scenario: An exhausted budget refuses chat send
- **WHEN** a user's chat and scan spend together have reached their effective monthly budget
- **THEN** `isAllowed(user, "chat:send", topic)` refuses, even though the user may still view the Topic

#### Scenario: Persistence is answered by capability, not tier comparison
- **WHEN** the system decides whether to store a chat turn's text
- **THEN** it calls `isAllowed(user, "chat:persist")` and no `plan ===` or rank comparison appears at the call site

#### Scenario: Every chat capability requires sign-in
- **WHEN** any `chat:*` capability is asked for a signed-out caller
- **THEN** the gate refuses it, so no anonymous request can spend against a model

