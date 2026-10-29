# Podcast feeds delta

## ADDED Requirements

### Requirement: Mobile Subscribe opens the authorized feed in a sheet

The mobile player's Subscribe action SHALL open a sheet with the web's feed loading, error, copy, and private-link states.
It SHALL request the feed allowed for the current listener and Topic.
Public visitors SHALL receive only a public feed; private and invite feeds SHALL use the current listener's token.
The sheet SHALL clear its feed when closed or when its session or Topic changes.

#### Scenario: A private feed loads

- **WHEN** an authorized listener opens Subscribe on a private or invite Topic
- **THEN** the sheet obtains that listener's allowed feed and shows the web's warning about sharing its private link
- **AND** it does not reuse a feed from another Topic or account

#### Scenario: The feed request fails

- **WHEN** the feed cannot be fetched
- **THEN** the sheet shows feedback and a retry action without an active stale link

#### Scenario: A closed sheet finishes loading

- **WHEN** a feed request resolves after the sheet closes or the session changes
- **THEN** the response cannot reopen the sheet or restore a private link

### Requirement: Mobile podcast-app opening has a copy fallback

On iOS, the feed sheet SHALL offer the web's podcast-app destination using the podcast scheme.
On Android, it SHALL offer the pcast destination.
It SHALL open only a supported destination built from the authorized feed URL and SHALL always offer Copy feed link.
An unavailable or failed app launch SHALL leave the copy fallback usable. The sheet SHALL NOT offer Spotify for private feeds.

#### Scenario: A supported podcast app opens

- **WHEN** a listener selects the podcast-app action and the platform supports its scheme
- **THEN** the app receives the selected feed URL with the expected scheme and all required feed-token information preserved

#### Scenario: No podcast app handles the link

- **WHEN** the platform cannot open the podcast-app destination or opening fails
- **THEN** the sheet remains usable, explains the fallback, and lets the listener copy the feed link

#### Scenario: Copying succeeds or fails

- **WHEN** a listener selects Copy feed link
- **THEN** the app copies the exact authorized URL and shows success only after copying succeeds
- **AND** a copy failure retains the sheet and provides retry feedback

### Requirement: Resetting a private podcast feed requires confirmation on both platforms

Web and mobile SHALL confirm Reset my link before resetting a private or invite feed.
The confirmation SHALL explain that the old link stops working and must be replaced in podcast apps.
Cancellation SHALL send no reset. Confirmation SHALL send one reset, prevent duplicate submission, and replace the shown URL only after success.
Failure SHALL retain the current link and show an error.

#### Scenario: A listener cancels the reset

- **WHEN** a listener selects Reset my link and then cancels
- **THEN** the feed token remains unchanged and the existing link still works

#### Scenario: A listener confirms the reset

- **WHEN** a listener confirms the reset once, including while tapping the pending action again
- **THEN** one reset is submitted, the sheet shows the returned replacement link, and the old link stops authorizing the feed and audio
- **AND** the confirmation and result behave the same on web and mobile

#### Scenario: Reset fails or loses access

- **WHEN** a reset fails with a retryable error
- **THEN** the current link remains visible with failure feedback and no claim that it was replaced
- **WHEN** the API instead confirms loss of feed access
- **THEN** the sheet clears the link and shows the unavailable state

### Requirement: Mobile preserves private feed-token handling

Private feed links SHALL remain temporary sheet state and SHALL NOT enter persistent app storage, playback state, analytics, or error logs.
The app SHALL disclose the link only through the listener's explicit copy or podcast-app action.
Session exit or confirmed access loss SHALL clear the link and pending actions.
The internal audio player SHALL NOT create or store a feed token to play an episode.

#### Scenario: Feed actions are monitored without their secret

- **WHEN** a feed fetch, reset, copy, or app-open action succeeds or fails
- **THEN** monitoring records only permitted event fields and excludes the token-bearing URL and launch destination

#### Scenario: Sign-out happens during reset

- **WHEN** the listener signs out while a private feed reset is pending
- **THEN** the sheet and token state clear, and a late reset response cannot expose a link in the next session
