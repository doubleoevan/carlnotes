# Podcast episode player delta

## MODIFIED Requirements

### Requirement: The player streams from a short-lived URL and resumes where the listener stopped

The web player SHALL play through one audio element of its own. Carl's spoken chat replies SHALL play through a second
element the chat owns, so neither element ever plays the other's audio. The mobile app SHALL use one platform audio
player with the same playback rules. Mobile voice and recording remain outside this change. The browser SHALL load the Podcast Episode's stable
audio url, which redirects to a short-lived presigned object storage URL that supports range requests, so seeking never
downloads the whole file. Mobile SHALL resolve that same authorized audio to its short-lived URL without passing
session credentials to object storage. Neither app SHALL persist the short-lived URL as a playback credential. For a signed-in listener it SHALL start at their saved progress. If the presigned URL has expired, the
web player SHALL load the stable URL again. Mobile SHALL resolve a fresh authorized URL through the API before passing it to Expo. Both SHALL continue from the same position.

#### Scenario: A listener resumes

- **GIVEN** a listener who stopped a Podcast Episode at 12:40
- **WHEN** they press play on it again, on any device
- **THEN** playback starts at 12:40

#### Scenario: Seeking uses a range request

- **WHEN** a listener drags the seek bar to chapter 8
- **THEN** the browser requests that byte range instead of the whole file

#### Scenario: An expired URL recovers

- **GIVEN** a listener who paused for longer than the presigned URL lasts
- **WHEN** they press play
- **THEN** web reloads the stable URL, while mobile resolves a fresh authorized URL through the API
- **AND** playback continues from the saved position

#### Scenario: Carl's voice never touches the player
- **WHEN** Carl speaks a chat reply
- **THEN** the episode is paused where it stood and stays loaded there, and Carl's audio never reaches the episode's
  element

### Requirement: Lock-screen controls show the Podcast Episode and skip chapters

The web player SHALL use the Media Session API and mobile SHALL use the platform's media controls. Both SHALL show the Podcast Episode's
title, the current chapter's title, and the Podcast Episode's cover as the artwork. The topic page's player SHALL show
no cover, as its wireframe has none. The next and previous controls SHALL skip to the next and previous chapter. Mobile system seek controls SHALL use
the same 15-second backward and 30-second forward intervals as the player. A chapter skip SHALL preserve whether
playback is paused, and a skip beyond the first or last chapter SHALL leave the position unchanged.

While Carl speaks a chat reply, the lock screen SHALL show Carl, and once he stops the controls SHALL return to the
Podcast Episode. With no Podcast Episode loaded, the lock screen keeps Carl until something else claims it.

#### Scenario: Next skips a chapter

- **GIVEN** a Podcast Episode playing chapter 2
- **WHEN** the listener presses next on the lock screen
- **THEN** playback moves to the start of chapter 3, and the lock screen shows chapter 3's title

#### Scenario: The lock screen returns to the episode
- **WHEN** Carl finishes a spoken answer while an episode is loaded
- **THEN** the lock screen shows the episode again

## ADDED Requirements

### Requirement: Mobile play controls operate one shared player

Every mobile episode and chapter play control SHALL operate the same loaded Podcast Episode across screens.
Title links SHALL open its episode screen without starting playback. Existing Topic cards, seasons, search results,
roasts, tables, Finding sheets, and chat chapter tags SHALL retain their placement and use these actions.

#### Scenario: Playing from a different screen preserves one episode

- **WHEN** a listener starts an episode from Home and opens its Topic or episode screen
- **THEN** every play control reflects the same episode, position, rate, and playing state
- **AND** no browser opens and no second audio stream starts

#### Scenario: A loaded episode toggles without restarting

- **WHEN** a listener presses an episode play control whose episode is already loaded
- **THEN** that episode pauses or resumes at its current position through the existing player
- **AND** mobile rechecks current permission before resuming and resolves fresh audio only when its source expires

#### Scenario: Opening an episode is not a play

- **WHEN** a listener opens an episode title, search result, or episode link
- **THEN** its screen opens ready to play without sending a playback-start event

### Requirement: Mobile chapter actions preserve the web distinction between titles pills and Findings

A chapter title SHALL start playback at that chapter's start. Its pill SHALL pause or resume the current chapter,
and start another chapter at its start. The remaining row SHALL open its visible Finding; without one, it SHALL
play the chapter. These actions SHALL not trigger each other.

#### Scenario: Forward and backward chapter selection

- **WHEN** a listener selects chapter 4's title, then chapter 2's title
- **THEN** playback starts at chapter 4's start and then chapter 2's start
- **AND** the chapter label, row, Finding highlight, progress, and system metadata follow each selection

#### Scenario: The active title restarts while its pill toggles

- **GIVEN** playback is partway through chapter 2
- **WHEN** the listener presses chapter 2's title
- **THEN** playback starts again at chapter 2's start
- **WHEN** the listener presses chapter 2's pill
- **THEN** playback pauses at the current position, and pressing the pill again resumes there

#### Scenario: A Finding opens independently

- **WHEN** a listener presses a chapter's source line or remaining row with a visible Finding
- **THEN** the existing Finding reader opens without seeking or restarting playback
- **AND** a chapter without a visible Finding opens no fabricated Finding reader

#### Scenario: A linked chapter no longer exists

- **WHEN** a chapter play link names a missing chapter in an accessible episode
- **THEN** playback uses that episode's normal saved-progress start, as on web

### Requirement: Mobile seeking and speed preserve web playback rules

The player SHALL clamp seeks to zero through the episode duration, skip back 15 seconds, and skip forward 30 seconds.
Speed SHALL cycle through 1, 1.25, 1.5, 2, and 0.75 before returning to 1.
Seeking an unloaded episode SHALL load and play it. Seeking a loaded paused episode SHALL retain pause.

#### Scenario: Skips cross chapter boundaries

- **WHEN** a listener skips forward or backward across a chapter boundary
- **THEN** the destination time and selected chapter match the web's rule
- **AND** backward at the start clamps to zero and forward at the end clamps to duration

#### Scenario: Seek while paused

- **GIVEN** an episode is loaded and paused
- **WHEN** the listener taps or drags the progress control ahead, then behind
- **THEN** the position and chapter display update after each action and playback remains paused

#### Scenario: Seek before first play

- **GIVEN** the shown episode is not loaded
- **WHEN** the listener presses its progress control at a position
- **THEN** that episode loads and starts at the selected position

#### Scenario: Speed stays in the web order

- **WHEN** a listener cycles speed five times from 1x
- **THEN** the displayed and actual rates are 1.25x, 1.5x, 2x, 0.75x, and 1x
- **AND** loading another episode retains the selected rate

### Requirement: Mobile chapter presentation follows the web player

The card SHALL show a duration-weighted segmented progress bar and initially show three chapters with the web's expansion control.
The loaded episode SHALL show its current chapter, Playing or Paused status, and matching active styling.
An unloaded unplayed episode SHALL show new episode and the AI-voices note. Selecting another screen SHALL not reset playback.

#### Scenario: Expanded chapters retain correct styling

- **GIVEN** an episode has twelve chapters
- **WHEN** the listener expands + 9 chapters and plays chapter 8
- **THEN** all twelve chapters remain visible, chapter 8 is highlighted, and its pill shows pause while playing
- **AND** collapsing restores three rows without changing audio or the selected chapter

#### Scenario: Intro gaps and the sign-off match web

- **WHEN** the position precedes the first chapter, reaches an exact chapter start, or passes the last chapter's end
- **THEN** selection uses the last chapter whose start is at or before the position, or the first chapter before all starts
- **AND** an episode with no chapters has no current chapter
- **AND** the intro, theme song, sign-off, and goodbye remain part of the full episode audio

### Requirement: Mobile retains one docked player without obscuring other controls

While an episode is loaded, a mini player SHALL remain available across screens with cover, title, current chapter,
progress, play/pause, and both skip controls. The Coffee Talk pill SHALL sit above it. Content, sheets, and keyboard
composers SHALL reserve usable space without adding a tab bar. The mini player SHALL not add a speed button or microphone.

#### Scenario: Navigation and keyboard leave controls reachable

- **WHEN** a listener navigates through Home, Topic, episode, Account, chat, and a note editor with an episode loaded
- **THEN** playback continues, the mini player remains available, and the final content and actions can be reached
- **AND** the keyboard, chat composer, and mini player do not overlap

#### Scenario: Cover or title opens the episode

- **WHEN** the listener presses the mini player's cover or title
- **THEN** the same episode opens in the app without restarting playback

#### Scenario: Unloading removes reserved space

- **WHEN** the loaded episode is removed or the session exits
- **THEN** the mini player disappears, its clearance is released, and the Coffee Talk pill returns to its normal position

### Requirement: Mobile audio continues through background playback and system controls

Playback SHALL continue when the app backgrounds or the screen locks. System controls SHALL show episode artwork,
hosts, episode title, and current chapter. Headset and Bluetooth play/pause, timed skips, and supported chapter
commands SHALL control the same audio. Disconnecting the audio route SHALL pause instead of playing through the speaker.

#### Scenario: Lock-screen chapter navigation

- **GIVEN** chapter 2 is playing while the iPhone is locked
- **WHEN** a supported next-chapter command is received and then a previous-chapter command
- **THEN** playback moves to chapter 3's start and then chapter 2's start with matching metadata

#### Scenario: System pause and timed skips

- **WHEN** the listener pauses through system controls and requests backward or forward seek
- **THEN** the position moves by 15 seconds backward or 30 seconds forward and remains paused
- **AND** the in-app player reflects the changes on return

#### Scenario: Interruption and disconnect

- **WHEN** another audio session interrupts playback or headphones disconnect
- **THEN** the player reflects the system pause and preserves position
- **AND** it resumes only when the interruption permits resumption and the listener has not since paused, switched, or lost access

### Requirement: Mobile restores account-owned episode position without restoring authorization

The app SHALL remember the last episode, position, completion, and rate for the current signed-in account.
Reopening SHALL revalidate access and restore a paused player, ready to resume; it SHALL not autoplay on launch.
Session exit or account change SHALL clear account-owned playback data, pending work, audio, and system metadata.
A new explicit play of a completed episode SHALL start at zero unless a chapter or seek position was chosen.

#### Scenario: Restart resumes the right episode

- **GIVEN** a listener pauses an unfinished episode at 12:40 and closes the app
- **WHEN** they reopen under the same account and press play after access is revalidated
- **THEN** the same episode starts at 12:40 at the selected speed
- **AND** restoration alone records no play

#### Scenario: Signing out wins over delayed responses

- **WHEN** sign-out or account change occurs while a load, URL refresh, progress save, or next-episode request is pending
- **THEN** old results cannot restart audio, populate the new account's player, or send the old episode's progress as the new user

#### Scenario: Completed episodes restart

- **WHEN** a completed episode is loaded for a new play with no explicit position
- **THEN** playback starts at zero
- **AND** an explicit chapter or seek selection takes precedence

### Requirement: Mobile listen recording and autoplay retain web semantics

A real first play SHALL record one playback start per episode load for a signed-in listener.
Playing progress SHALL save no more often than every 30 seconds, with additional saves on pause, background, replacement, and completion.
Completion SHALL request the next unplayed episode from other owned or followed Topics.
No eligible next episode, a failed request, or a visitor SHALL leave playback stopped.

#### Scenario: Several controls do not create several plays

- **WHEN** one loaded episode is paused and resumed from its card, mini player, and system controls
- **THEN** exactly one playback-start request belongs to that load
- **AND** ordinary progress and completion are not duplicated by multiple rendered controls

#### Scenario: Late autoplay cannot replace a user choice

- **WHEN** a next-episode request resolves after the listener selects another episode or signs out
- **THEN** the response does not change the player

#### Scenario: Visitor playback records no personal progress

- **WHEN** a permitted visitor plays a public episode
- **THEN** no personal listen state or durable account playback record is written
- **AND** existing anonymous listener-count behavior is unchanged

### Requirement: Mobile handles expired audio and lost access without leaking credentials

Mobile SHALL request playable audio under current episode authorization and stream ranges without downloading a permanent copy.
An expired media URL SHALL be refreshed through that authorization at the same position and rate.
Revoked or removed episodes SHALL stop and unload when detected. Credentials, private feed tokens, and signed media URLs
SHALL be excluded from persistence and telemetry.

#### Scenario: An expired URL reloads once

- **WHEN** seeking or resuming fails because the media URL expired
- **THEN** the app obtains fresh authorized audio and resumes at the preserved position and rate
- **AND** retries are bounded instead of repeatedly loading the same rejected URL

#### Scenario: Permission loss stops playback

- **WHEN** a foreground refresh, resume check, source refresh, or playback access check confirms lost access
- **THEN** audio stops, the source and private metadata are cleared, and no resume or retry restarts the episode

#### Scenario: Session credentials stay on the API origin

- **WHEN** a private episode resolves to an object-storage media URL
- **THEN** the API request carries the current session and the media request carries no CarlNotes session credential
- **AND** neither URL enters analytics, error breadcrumbs, or persistent playback storage

### Requirement: Existing mobile Topic podcast settings retain their save semantics

The saved Topic's podcast switch SHALL remain in the existing edit form under the current ownership gate.
It SHALL save with the form, preserve failure feedback, and update the existing settings summary.
Turning it off SHALL prevent future episodes without removing published episodes. Existing mobile pricing restrictions SHALL remain in effect.

#### Scenario: Save and cancellation

- **WHEN** an authorized owner changes Podcast and saves
- **THEN** the setting and Topic fields use the existing save flow and the summary shows the confirmed state
- **WHEN** the owner cancels or the podcast write fails
- **THEN** cancellation sends no setting change and failure does not claim a successful setting save

#### Scenario: Unauthorized settings stay unavailable

- **WHEN** someone outside the current podcast-setting gate opens the form
- **THEN** they cannot change the switch or bypass the API permission
