# push-notifications Specification

## Purpose
Delivers a push notification to a signed-in user's phone when a scheduled Scan keeps new Findings on a Topic they
follow or when someone mentions them in a Team chat room, as a delivery added beside the digest email and the badges.

## Requirements

### Requirement: A phone registers its push token only after permission

The app SHALL send its Expo push token to the api only while a user is signed in and notification permission is
granted. It SHALL register after the permission is first granted and on each later sign-in or app start with a
session. The api SHALL authenticate the registration with the existing session and save the token, the platform, the
app version, the session, and the time it was last seen. A visitor's request SHALL be rejected.

#### Scenario: Permission granted registers the phone

- **WHEN** a signed-in user grants notification permission
- **THEN** the app registers its token, and the api saves it with the platform, app version, session, and last-seen
  time

#### Scenario: A later sign-in registers again

- **GIVEN** a phone whose permission was granted earlier
- **WHEN** a user signs in on it
- **THEN** the app registers its current token for the new session without asking for permission again

#### Scenario: No permission sends nothing

- **WHEN** a signed-in user has not granted notification permission
- **THEN** the app sends no token to the api

#### Scenario: A visitor cannot register

- **WHEN** a request without a session registers a token
- **THEN** the api rejects it with 401 and saves nothing

#### Scenario: A malformed or oversized token is rejected

- **WHEN** a registration sends a value that is not an Expo push token, or one longer than 256 characters
- **THEN** the api rejects it with 400 and saves nothing

### Requirement: An account keeps at most ten phones

Registration SHALL be rate limited per user, and an account SHALL keep at most its ten most recently seen phones. A
registration past ten SHALL retire the phones seen longest ago.

#### Scenario: An eleventh phone registers

- **GIVEN** an account with ten registered phones
- **WHEN** an eleventh phone registers
- **THEN** the phone seen longest ago is retired and receives no push

### Requirement: A push device belongs to the session that registered it

A token SHALL be bound to exactly one session at a time. Signing out, a revoked session, and an expired session SHALL
end the binding, and a token with no live session SHALL receive no push. The app SHALL also unregister its token
before signing out, and a failed unregister SHALL NOT block the sign-out.

#### Scenario: Sign-out unbinds the phone

- **WHEN** a user signs out on a registered phone
- **THEN** the phone's binding is removed and no later push for that account reaches it

#### Scenario: A revoked session stops pushes

- **WHEN** a user's session on a phone is revoked from another device
- **THEN** pushes for that account stop reaching the phone

#### Scenario: An expired session stops pushes

- **WHEN** the session that registered a token has expired
- **THEN** no push is sent to that token

### Requirement: A token registered by another account moves to it

When a token that is bound to one account is registered by another account's session, the binding SHALL move to the
new account and session. The earlier account SHALL receive no push on that phone from then on, and a send that was
planned for the earlier account SHALL check the binding again before it goes out.

#### Scenario: A second account signs in on the phone

- **GIVEN** a phone registered by account A
- **WHEN** account B signs in on the phone and registers the same token
- **THEN** the token is bound to account B, and a mention of account A sends nothing to the phone

#### Scenario: The token rotates

- **WHEN** the app reads a new push token for the same session
- **THEN** the new token is registered and the old token's binding is removed

### Requirement: Closing an account deletes its push devices

Closing an account SHALL delete every push device bound to it, in the same delete that removes the account, and SHALL
leave no push for that account queued to any phone.

#### Scenario: A closed account's phones get nothing

- **GIVEN** an account registered on two phones
- **WHEN** the account is closed
- **THEN** both bindings are deleted and no push for the account is sent

### Requirement: A scheduled Scan's new Findings push to its digest recipients

A scheduled Scan that succeeds with one or more new Findings SHALL push to the Scan's digest recipients, the same
people the digest emails, who turned Topic pushes on. A Scan with no new Findings, a failed Scan, and a manual or
creation Scan SHALL send no Topic push. Nobody outside the digest recipients SHALL receive one.

#### Scenario: New Findings push to a follower

- **GIVEN** a follower who receives the Topic's digest and has Topic pushes on
- **WHEN** a scheduled Scan succeeds with three new Findings
- **THEN** each of the follower's registered phones receives one push for the Scan

#### Scenario: A Scan with nothing new sends no push

- **WHEN** a scheduled Scan succeeds with no new Findings
- **THEN** the digest still sends, and no push is sent

#### Scenario: A manual Scan sends no Topic push

- **WHEN** a user runs a manual Scan that keeps new Findings
- **THEN** the report email goes to whoever ran it, and no Topic push is sent

#### Scenario: Topic pushes off

- **WHEN** a digest recipient has turned Topic pushes off
- **THEN** they receive the digest and no push

### Requirement: A Topic's push follows its email subscription

A Topic push SHALL reach only a user whose subscription to the Topic is active with email on when the push is sent.
Unfollowing a Topic, or turning its email off, SHALL stop both the digest and the push for that Topic.

#### Scenario: Unfollowing stops both

- **WHEN** a user unfollows a Topic
- **THEN** its next Scan sends them neither the digest nor the push

#### Scenario: The email is turned off

- **WHEN** a follower turns a Topic's email off
- **THEN** its next Scan sends them neither the digest nor the push

#### Scenario: A Topic made private

- **GIVEN** a follower with no role on a public Topic
- **WHEN** the owner makes the Topic private and a scheduled Scan keeps new Findings
- **THEN** the follower receives neither the digest nor the push, and the owner and the Topic's teams' members still
  receive both

#### Scenario: Unfollowing before a retry

- **GIVEN** a Topic push that failed and is waiting for its retry
- **WHEN** the recipient unfollows the Topic before the retry
- **THEN** the retry sends them nothing

### Requirement: A Topic push names the Topic and its new Findings

A Topic push SHALL be titled with the Topic's name and SHALL say how many new Findings the Scan kept and the title of
the first one, in plain facts. It SHALL include no greeting, no urgency, no guilt, and no request to come back.

#### Scenario: The push states the facts

- **WHEN** a Scan of "Home espresso" keeps two new Findings, the first titled "A cheaper grinder burr"
- **THEN** the push is titled "Home espresso" and its body reads
  "2 new findings, including “A cheaper grinder burr”"

#### Scenario: A long title is shortened

- **WHEN** the first new Finding's title is longer than the push body allows
- **THEN** the title is cut at a word with an ellipsis, and the payload stays within the platforms' 4096-byte limit

### Requirement: A saved room mention pushes to each mentioned member, never its author

Each member who has a saved mention row for a room message SHALL receive one push for that message if they turned
mention pushes on. A reply notifies the replied-to member the same way. The author SHALL never receive a push for
their own message, and `@all`, which saves no mention rows, SHALL send no push.

#### Scenario: A named member is pushed

- **WHEN** a member posts "@sam can you check this" in a Team chat room
- **THEN** sam's registered phones each receive one push for the message

#### Scenario: A reply pushes the replied-to member

- **WHEN** a member replies to sam's message
- **THEN** sam receives a push that says the member replied

#### Scenario: The author is never pushed

- **WHEN** a member mentions themself in their own message
- **THEN** no push reaches the author

#### Scenario: @all sends no push

- **WHEN** a member posts a message addressed to @all
- **THEN** no push is sent

### Requirement: A mention push checks access when it sends

A mention push SHALL be sent only if, at send time, the recipient is still a member of the room's Team, the room's
Topic still belongs to that Team, the recipient has not blocked the author, and the recipient has not reported the
message. A deleted message SHALL send no push.

#### Scenario: A member who left gets nothing

- **WHEN** a mentioned member leaves the Team before the push sends
- **THEN** no push is sent to them

#### Scenario: A blocked author's mention is silent

- **WHEN** the recipient has blocked the author
- **THEN** no push is sent, as the room hides the mention

#### Scenario: A deleted message is not pushed

- **WHEN** the message is deleted before its push sends
- **THEN** no push is sent

### Requirement: A mention push names the sender and the room, never the message

A mention push SHALL be titled with the room's name, the Topic's name for a Topic room or the Team's name for the
Team's own room, and its body SHALL say that the sender mentioned or replied to the recipient. It SHALL never include
the message text, which the app stores encrypted.

#### Scenario: A mention in a Topic room

- **WHEN** alex mentions sam in the room of the Topic "Home espresso"
- **THEN** sam's push is titled "Home espresso" and reads "alex mentioned you"

#### Scenario: A reply in the Team's own room

- **WHEN** alex replies to sam in the room of the Team "Roasters"
- **THEN** sam's push is titled "Roasters" and reads "alex replied to you"

### Requirement: A retry never repeats an accepted push

Each push that the push service accepts SHALL be recorded once per event, recipient, and phone, where the event is
the Scan or the room message. A retried send SHALL skip every recorded phone, and a send whose retries run out SHALL
be reported without naming a token.

#### Scenario: A send fails partway and retries

- **GIVEN** a Scan push that was accepted for two of five phones before the send failed
- **WHEN** the send is retried
- **THEN** only the other three phones are sent to

#### Scenario: The same event starts twice

- **WHEN** a mention push for one message is started a second time
- **THEN** the second start sends nothing

### Requirement: One bad token never blocks a push

A token from another Expo project SHALL be retired when the push service names it, and the rest of its chunk SHALL be
sent again without it. A chunk the service rejects SHALL be reported, and the chunks after it SHALL still be sent.

#### Scenario: A token from another project

- **GIVEN** a Scan push whose phones include one registered with another Expo project's token
- **WHEN** the push service rejects the chunk for mixing projects
- **THEN** that phone is retired, and every other phone in the chunk receives the push

#### Scenario: A rejected chunk

- **WHEN** the push service rejects one chunk of a Topic push
- **THEN** the later chunks still send, and the send is reported as failed for good

#### Scenario: A long send

- **WHEN** a Topic push to many phones outlasts one attempt's heartbeat
- **THEN** the attempt stops between chunks, and only its retry sends to the phones it had not reached

### Requirement: Receipts are read and unregistered phones retired

About 15 minutes after a send, the worker SHALL read the push receipts of the accepted pushes, within the 24 hours
the service keeps them. A `DeviceNotRegistered` receipt SHALL delete that phone's binding, and any other receipt error
SHALL be reported by its error code without the token.

#### Scenario: An uninstalled app's token is retired

- **WHEN** a receipt reports `DeviceNotRegistered`
- **THEN** the phone's binding is deleted and no later push is sent to the token until it registers again

#### Scenario: A credentials error is reported

- **WHEN** a receipt reports `InvalidCredentials`
- **THEN** the error is reported with its code and the event, and the binding is kept

### Requirement: A push never fails the Scan or the post

A Topic push SHALL run apart from the Scan and its digest, and a mention push SHALL start after the message is saved
without delaying the post's response. A push that cannot start or send SHALL be reported, and the Scan, the digest,
and the post SHALL succeed as they would without it.

#### Scenario: The push service is down

- **WHEN** the push service rejects every send for a Scan
- **THEN** the Scan stays succeeded and the digest still sends

#### Scenario: The workflow cannot start for a post

- **WHEN** the mention push cannot be started for a new message
- **THEN** the message posts and the failure is reported

### Requirement: Push tokens and contents stay on the server side

Push tokens, the Expo access token, and push contents SHALL be read and sent only by server packages and the mobile
app. No universal package SHALL send a push or hold a token, analytics events SHALL include neither tokens nor push
text, and error reports SHALL redact any Expo push token in a message.

#### Scenario: An error quotes a token

- **WHEN** a push error's message includes an Expo push token
- **THEN** the error report shows the token redacted

#### Scenario: The access token is configured

- **WHEN** the worker sends a push in an environment with the Expo access token set
- **THEN** the send authenticates with that token, read from Doppler

### Requirement: The app asks for permission in context

The app SHALL NOT ask for notification permission at launch. It SHALL ask after the user's first Topic follow or the
first time they open a Team chat room, while permission is undetermined, first with a sheet explaining what the
notifications say, then with the system prompt only if the user continues. Declining the sheet SHALL NOT show it again.

#### Scenario: The first follow explains, then asks

- **WHEN** a signed-in user follows their first Topic on a phone that never asked
- **THEN** a sheet explains the Topic and mention notifications, and the system prompt shows only after **Turn on
  notifications**

#### Scenario: Not now

- **WHEN** the user presses **Not now** on the sheet
- **THEN** no system prompt shows, and the sheet does not show again on that phone

#### Scenario: Launch asks nothing

- **WHEN** a user opens the app with permission undetermined
- **THEN** no permission prompt shows until a follow or a room visit

### Requirement: The account screen has one switch for each kind

The account screen SHALL show a **Notifications** section with a switch for Topic pushes and a switch for mention
pushes, saved to the account. Both switches SHALL start off and turn on when the user first grants permission. A
switch the user turned off SHALL stay off on every later grant and on other phones.

#### Scenario: Granting permission turns both on

- **WHEN** a user who never chose grants notification permission
- **THEN** both switches show on, and both kinds of push reach the user

#### Scenario: A switch turned off stays off

- **GIVEN** a user who turned mention pushes off
- **WHEN** they sign in on a second phone and grant permission
- **THEN** mention pushes stay off and Topic pushes stay on

#### Scenario: A save fails

- **WHEN** saving a switch fails
- **THEN** the switch returns to its saved value and the section shows the shared save failure line

### Requirement: A denied permission shows how to allow it

If notification permission is denied, or iOS allows the app no alerts, the Notifications section SHALL disable both
switches, say that notifications are off for CarlNotes in the phone's settings, and offer a button that opens the
app's system settings. Returning with permission granted SHALL register the phone and enable the switches.

#### Scenario: Denied permission

- **WHEN** a user who denied the system prompt opens the account screen
- **THEN** the section explains that notifications are off in the phone's settings and offers **Open settings**

#### Scenario: Allowed in the settings

- **WHEN** the user allows notifications in the system settings and returns to the app
- **THEN** the phone registers, and the switches are enabled at their saved values

#### Scenario: Badge-only permission on iOS

- **GIVEN** an iOS phone that granted only the badge permission
- **WHEN** the user opens the account screen
- **THEN** the section shows the system-settings guidance, since no alert can show

### Requirement: Opening a push opens its Topic or room

Opening a push SHALL open its Topic page or its room through the app's link rules, from the foreground, the
background, or a closed app. A push for another account than the one signed in, or a link that is not a site link,
SHALL open Home instead. A push for the room already on screen SHALL show no banner.

#### Scenario: A closed app opens the Topic

- **WHEN** the user opens a Topic push while the app is closed
- **THEN** the app starts and shows the Topic's page

#### Scenario: A backgrounded app opens the room

- **WHEN** the user opens a mention push while the app is in the background
- **THEN** the app shows that room

#### Scenario: A push in the foreground

- **WHEN** a push arrives while the app is open on another screen
- **THEN** a banner shows, and opening it navigates to the push's Topic or room

#### Scenario: The room is already open

- **WHEN** a mention push arrives for the room on screen
- **THEN** no banner shows, and the room shows the message through its stream

#### Scenario: Another account's push

- **WHEN** the user opens a push addressed to an account other than the one signed in
- **THEN** the app opens Home and shows none of that push's Topic or room
