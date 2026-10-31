# mobile-store-delivery Specification

## Purpose
Gives the mobile app one repeatable path from a commit to a store build, a reviewer who can see the product, the
artifacts a store listing asks for, and the acceptance list a release must pass.

## Requirements

### Requirement: A store build is numbered remotely and submitted from Doppler

The production build SHALL take its build number from EAS and increment it on each build. A root script SHALL submit
a built binary to App Store Connect or the Play Console, taking every credential from Doppler through the existing
env sync, writing any key file only for the length of the submit, and SHALL run the contract freeze check first.
No credential SHALL be typed into a dashboard or committed.

#### Scenario: Two production builds

- **WHEN** two production builds run in a row
- **THEN** the second has a higher build number with no edit to the config

#### Scenario: A submit with a stale freeze

- **WHEN** the submit script runs while the snapshot differs from a fresh freeze
- **THEN** it stops before submitting and names the freeze

#### Scenario: Credentials stay out of the repo

- **WHEN** the repository and the exported bundles are searched for a submit key
- **THEN** none appears

### Requirement: Crash reports name the build and the update

Every release build SHALL report to Sentry with a release naming the app version and build and a dist naming the
loaded update, so a frame from an EAS Update resolves to its source map.

#### Scenario: A crash on an updated build

- **WHEN** a build running an EAS Update crashes
- **THEN** Sentry shows the release, the update, and readable frames

### Requirement: A native change ships as a build and a JavaScript change may ship as an update

An EAS Update SHALL reach only builds with the same runtime fingerprint, and the release path documentation SHALL
say how to tell a change that needs a build from one an update can include, and how to verify an update on a preview
build before production.

#### Scenario: A JavaScript-only change

- **WHEN** an update is published for a change with no native difference
- **THEN** installed builds on that fingerprint load it on their next start

#### Scenario: A native module change

- **WHEN** a change alters the fingerprint
- **THEN** the documentation directs a new build and the update does not reach the old binaries

### Requirement: A reviewer account is seeded in an explicitly chosen environment

A root script SHALL create or refresh a reviewer account in the environment named on its command line and exit with an
error when that name does not match the injected configuration. The account SHALL be on the free plan with a Topic, its
Findings and scan recap, a Note, a Team with a room, and access to a published Podcast Episode. The credentials SHALL
come from Doppler and SHALL never be printed or committed.

#### Scenario: The environment flag is missing

- **WHEN** the script runs without naming the environment
- **THEN** it stops before touching any account

#### Scenario: A refresh keeps the account

- **WHEN** the script runs twice against the same environment
- **THEN** the same account exists once with its fixtures present

### Requirement: The listing, data inventory, and encryption declaration are written from the code

The repository SHALL hold the store listing copy in Carl's voice for both stores, a data inventory naming what the
app, the api, analytics, error reporting, and each native module collect, and an encryption declaration that
matches the dependencies in use. The inventory SHALL name the microphone: the recording of a spoken question reaches
the api and Google's transcription with storage off, is never kept, and on the phone stays in the app's cache alone.
The listing SHALL answer the stores' purchase questions as yes, name the in-app subscriptions, and give the reviewer the
sandbox purchase steps, and the inventory SHALL name the purchase processor, the purchase history it holds against a
random RevenueCat app user id the api saves per account, never the account id, and the customer's delete when the
account closes.

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

#### Scenario: The listing and the inventory name the purchases

- **WHEN** the store payments change ships
- **THEN** the listing's rating answers say digital purchases yes, the review notes name the sandbox purchase, and the
  inventory's purchase row names the processor, the receipt, the random RevenueCat app user id it is keyed to, and
  its delete when the account closes

### Requirement: A release passes the acceptance list

A release SHALL pass a written acceptance list covering devices, accessibility, roles, links, forced update, push
notifications, spoken questions, store purchases, and the dashboards, and an item not checked SHALL be named in the
release record as unverified, never marked passed.

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

#### Scenario: Store purchases

- **WHEN** the list is run
- **THEN** on a device for each platform with the store's sandbox account, a purchase of each plan at each interval, a
  plan switch, a restore after a reinstall, a cancellation and its expiry, a refund, a sandbox billing failure, a
  second account's restore, a storefront with no offering, and the web's account page after each step pass, and the
  web's own checkout and portal pass unchanged

#### Scenario: An item is unverified

- **WHEN** a release ships with an item not checked
- **THEN** the release record names the item as unverified

### Requirement: The release path is documented in the mobile guide

The mobile guide SHALL document build, test, freeze, submit, rollout, rollback, update, and minimum-version steps,
and the docs site SHALL have a "Get the app" page with the store links once they exist.

#### Scenario: A new maintainer ships

- **WHEN** someone follows the guide from a clean checkout
- **THEN** they reach a submitted build without a step that lives only in someone's head
