## ADDED Requirements

### Requirement: The signup page says what an action a visitor tried needs
Every gated action that sends a signed-out visitor to the signup page SHALL name its call to action in the `cta`
parameter through one shared helper, and the signup page SHALL toast what that call to action needs, from one map:
- `chat`: "Sign up to chat", for a chat question, the chat panel's sign-up, and an attachment
- `chat-voice`: "Sign up to speak with Carl", for the chat mic
- `podcast-question`: "Sign up to speak with Carl and Vienna", for the podcast player's mic
- `new-topic`: "Sign up to create a topic"
- `subscribe`: "Sign up to follow this topic"
- `team-join`: "Sign up to join this team"
- `profile-team-up`: "Sign up to team up"
- `note`: "Sign up to add a note"

A sign-up link the visitor picks on purpose, such as the header's, the menu's, the pricing page's, the login page's,
and a gate's, SHALL show no toast, and a `cta` value outside the map, which such a link may pass for the signup event,
SHALL show none either. The signup page SHALL show one toast however often it renders, through the one toast host that
the root route mounts for every page. The `cta` SHALL still be saved for the signup event as before.

#### Scenario: A visitor taps the podcast mic
- **WHEN** a signed-out visitor taps the podcast player's mic
- **THEN** the signup page opens with `cta=podcast-question` and toasts "Sign up to speak with Carl and Vienna"

#### Scenario: The header's sign-up shows no toast
- **WHEN** a visitor opens the signup page from the header
- **THEN** no toast shows
