## ADDED Requirements

### Requirement: The native private composer shows a Suggested Reply to accept

The native private composer SHALL show a suggestion under the same shared rules as the web, as its empty input's
placeholder. A small Nightshift Button SHALL accept it into the input without sending, by touch and through a screen reader's
activate action. The composer SHALL match the web's at phone width, and its height SHALL not change when a suggestion
shows at any system text size.

#### Scenario: The button accepts without sending

- **WHEN** the empty input shows "Weekly is fine" and the user taps the accept button
- **THEN** the input holds "Weekly is fine", the input is focused, and nothing is sent

#### Scenario: The button is named and reachable

- **WHEN** VoiceOver or TalkBack focuses the accept button
- **THEN** it reads a label holding the suggestion and the button role, and its touch target is at least 44 points on
  iOS and 48 dp on Android

#### Scenario: One polite announcement

- **WHEN** a suggestion arrives while a screen reader runs
- **THEN** it is announced once, queued behind what the screen reader was reading

#### Scenario: Height holds at the largest text size

- **WHEN** a suggestion at the suggestion limit shows at the largest system text size
- **THEN** it shows on one line, cut with an ellipsis, and the composer is as tall as it is without one

#### Scenario: Voice and visitors show none

- **WHEN** the voice composer is open, or a visitor sees the composer
- **THEN** no suggestion and no accept button show

### Requirement: A swipe right across the empty input accepts the suggestion

A horizontal swipe right across the empty input SHALL accept the suggestion into it, through the gesture handler the app
already has. The swipe SHALL lose to a vertical scroll, to the text cursor and text selection, and to Android's back
gesture at the screen's edge. Reduced motion SHALL get no animation.

#### Scenario: A swipe accepts

- **WHEN** the input is empty, shows a suggestion, and the user swipes right across it
- **THEN** the input holds the suggestion and nothing is sent

#### Scenario: A scroll wins

- **WHEN** the user's drag over the input moves mostly up or down
- **THEN** the conversation scrolls and the input is not filled

#### Scenario: Android's back gesture wins at the edge

- **WHEN** a swipe starts inside the system's edge gesture zone on Android
- **THEN** the back gesture runs and the input is not filled

#### Scenario: Text in the input disables the swipe

- **WHEN** the input holds text and the user drags across it
- **THEN** the text cursor or selection moves and nothing is filled

#### Scenario: Reduced motion

- **WHEN** the system's reduce motion setting is on
- **THEN** the suggestion appears and fills with no animation

### Requirement: The native app reads the suggestion lines through the shared client

The app SHALL read the `saved` line and `suggestedReply` through the shared chat client and the shared suggestion hook. The
change SHALL add no native dependency, so it ships to phones as an EAS Update.

#### Scenario: An updated app frees Send early

- **WHEN** an app with this update reads the `saved` line
- **THEN** Stop turns back into Send before the suggestion arrives

#### Scenario: An older app keeps working

- **WHEN** an app without this update reads a stream with both new lines
- **THEN** it ignores them, and its composer frees when the stream closes

#### Scenario: No native rebuild

- **WHEN** this change is released to phones
- **THEN** its native dependencies match the installed build, and it ships as an EAS Update
