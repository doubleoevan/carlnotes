# mobile-store-delivery Specification

## MODIFIED Requirements

### Requirement: The listing, data inventory, and encryption declaration are written from the code

The repository SHALL hold the store listing copy in Carl's voice for both stores, a data inventory naming what the
app, the api, analytics, error reporting, and each native module collect, and an encryption declaration that
matches the dependencies in use. The inventory SHALL name the microphone: the recording of a spoken question reaches
the api and Google's transcription with storage off, is never kept, and on the phone stays in the app's cache alone.

#### Scenario: The inventory names every collector

- **WHEN** a native module that collects data is added
- **THEN** the inventory lists it or the release checklist catches the gap

#### Scenario: The declaration matches the code

- **WHEN** the dependency audit finds only transport encryption and the system keychain
- **THEN** the app declares that it uses no non-exempt encryption

#### Scenario: The inventory names the microphone

- **WHEN** the voice change ships
- **THEN** the inventory's microphone row names the recording, where it goes, that nothing is kept, and the store
  answers follow it

### Requirement: A release passes the acceptance list

A release SHALL pass a written acceptance list covering devices, accessibility, roles, links, forced update, push
notifications, spoken questions, and the dashboards, and an item not checked SHALL be named in the release record as
unverified, never marked passed.

#### Scenario: Devices and themes

- **WHEN** the list is run
- **THEN** phones and tablets in both orientations with the keyboard, safe areas, larger text, and both palettes pass

#### Scenario: Accessibility and the small phone

- **WHEN** the list is run
- **THEN** VoiceOver traverses every screen and the proposed Topic card works with the iPhone SE keyboard

#### Scenario: Roles and a second account

- **WHEN** the list is run
- **THEN** the owner, member, editor, read-only follower, leader, and admin flows pass, and a second account's Profile
  defaults are checked

#### Scenario: Links, update, and dashboards

- **WHEN** the list is run
- **THEN** each app link passes installed and uninstalled, cold and warm, the forced update and its recovery pass on
  each platform, Android passes on a device, and the analytics and error dashboards are checked with real access

#### Scenario: Push notifications

- **WHEN** the list is run
- **THEN** on a device for each platform, the in-context permission sheet, a denial and its settings guidance, a Topic
  push and a mention push opened from the foreground, the background, and a closed app, sign-out unbinding, and a
  second account on the same phone pass, and the data inventory names the push token

#### Scenario: Spoken questions

- **WHEN** the list is run
- **THEN** on a device for each platform, one at a time, the microphone prompt on the first tap, a denial and its
  settings guidance, a spoken question in a private chat, a Team room with a second account listening, and the
  podcast player with the episode's resume, a call and a headset removal mid-recording and mid-answer, listen mode,
  and sign-out cleanup pass

#### Scenario: An item is unverified

- **WHEN** a release ships with an item not checked
- **THEN** the release record names the item as unverified
