# Spec Delta

## MODIFIED Requirements

### Requirement: The join route accepts a token and subscribes the accepter

`GET /invite/:token` SHALL resolve the token and, for a signed-in visitor holding a valid one, create an active subscription to the Topic and land them on it. Acceptance SHALL increment the token's use count. The mobile app SHALL open the same path natively, on the web's page or on the `carlnotes://` scheme, accept the token once, show "Carl is checking your invitation…" while it runs, offer a retry when the request fails, say which way a rejected token failed in the web's words, and open the joined Topic or Team in place of the invitation.

Accepting a valid token for a Topic the visitor already actively subscribes to SHALL answer joined before the limit is consulted: no use is spent, no second subscription is created, and it is never reported as a failure.

What the new subscriber may then see SHALL follow the rule already in force for invite Topics: a subscriber sees Findings from Scans that ran after their subscription became active, and the same next-scheduled-scan disclaimer applies at the moment they join.

#### Scenario: A valid token subscribes the visitor

- **WHEN** a signed-in visitor opens an invite URL for a valid token
- **THEN** an active subscription to the Topic is created, the use count increases by one, and they land on the Topic

#### Scenario: Accepting twice subscribes once

- **WHEN** a visitor who is already subscribed opens the invite URL again
- **THEN** they are answered joined before the limit is consulted, no use is spent, and no second subscription is created

#### Scenario: A new subscriber sees Findings from later Scans

- **WHEN** a visitor accepts a token and opens the Topic
- **THEN** they see Findings from Scans that ran after their subscription became active, with the next-scheduled-scan disclaimer

#### Scenario: The app accepts a token

- **WHEN** a signed-in user opens `carlnotes://invite/<token>` for a valid Topic invitation
- **THEN** the app shows "Carl is checking your invitation…", the subscription is created, and the Topic screen replaces
  the invitation

#### Scenario: The app says which way a token failed

- **WHEN** a signed-in user opens an expired, exhausted, or unknown token in the app
- **THEN** the screen reads "That invitation went cold.", "That invitation is all poured out.", or "Carl doesn't know
  that invitation.", with the web's follow-up line, and a full team reads "That team is full to the brim."

#### Scenario: The app's request fails

- **WHEN** the acceptance request throws in the app
- **THEN** the screen reads "Carl couldn't check your invitation." with a retry, and the token is not reported as
  rejected

### Requirement: A signed-out visitor is carried through sign-in and back

A signed-out visitor opening an invite URL SHALL be sent to sign in and returned to the same invite URL afterwards, with the join intent preserved across the round trip. On the web it SHALL be sent in the `next` search parameter the sign-in page already reads, instead of by a mechanism of its own. In the mobile app it SHALL be kept as the app's pending destination, the one the app already uses to return a visitor after sign-in, and consumed when the session arrives.

The sign-in step SHALL render the app's shared session layout, so that its embedded-webview handling applies. An invite link is opened inside a mail client or a chat application more often than not, and Google's OAuth rejects an embedded webview, so a sign-in surface without that handling would put a dead provider button at the end of the funnel.

#### Scenario: Sign-in returns to the invite URL

- **GIVEN** a signed-out visitor opening an invite URL
- **WHEN** they finish signing in or signing up
- **THEN** they return to the same invite URL and the token is accepted

#### Scenario: The sign-in step is the shared session layout

- **WHEN** the join route asks a visitor to sign in
- **THEN** it renders the shared session layout, so an embedded webview leads with email sign-in instead of a provider button that cannot work

#### Scenario: The app carries a visitor through sign-in

- **GIVEN** a visitor opening `carlnotes://invite/<token>` in the app
- **WHEN** they sign in with any provider or sign up by email
- **THEN** the invitation screen opens again and the token is accepted
