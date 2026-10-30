# minimum-app-version Specification

## Purpose
Lets the api ask an installed mobile build to update once it is older than the platform's supported minimum, without
touching the web or any request that sends no mobile version, and lets the minimum change without a deployment.

## Requirements

### Requirement: Every mobile transport sends the app version and platform

Every request the app sends to the api SHALL include the platform, the app version, and the native build in the
shared device headers: the typed api client, the plain fetch, the chat stream, the room event source, and the auth
client alike. The web SHALL send none of them.

#### Scenario: Each transport sends the version

- **WHEN** the app makes a typed call, a plain fetch, a chat turn, opens a room stream, or signs in
- **THEN** each request has the platform, the app version, and the build in its headers, and a test covers each
  transport

#### Scenario: The web sends no version

- **WHEN** the web app makes any request
- **THEN** the request has no platform or app version header

### Requirement: A minimum version per platform is stored and edited without a deployment

The api SHALL keep a minimum supported app version for iOS and one for Android in the database, SHALL show and change
each from the admin console behind the console permission, and SHALL read the current values on the request path
through a short cache so a change takes effect within a minute with no deployment or restart. A platform with no
stored minimum has none.

#### Scenario: An admin raises a minimum

- **WHEN** an admin saves a minimum version for iOS in the console
- **THEN** within a minute a request from an older iOS build is rejected and the console shows the new value, who
  saved it, and when

#### Scenario: A non-admin cannot change a minimum

- **WHEN** a signed-in user without the console permission posts a minimum version
- **THEN** the api answers 403 and nothing changes

#### Scenario: No minimum is stored

- **WHEN** no minimum has been saved for Android
- **THEN** every Android build is served

### Requirement: An older build receives 426 with its store url

A request whose platform header is `ios` or `android` and whose app version is lower than that platform's minimum
SHALL be answered 426 on every api path except the health route, with a body naming the rejection, the minimum
version, and the platform's store url, and with no caching. The comparison SHALL compare dotted integer versions, and
a version that does not parse SHALL be served.

#### Scenario: An old build is rejected

- **WHEN** the iOS minimum is 1.2.0 and a request arrives with app version 1.1.9 and platform `ios`
- **THEN** the response is 426 with the rejection, `1.2.0`, and the App Store url, on a typed call, a plain fetch, a
  chat turn, a room stream, and a sign-in alike

#### Scenario: A current build is served

- **WHEN** the iOS minimum is 1.2.0 and a request arrives with app version 1.2.0 or 1.10.0
- **THEN** the request is served as usual

#### Scenario: The health route is never gated

- **WHEN** an old build or an uptime monitor requests the health route
- **THEN** it is served

### Requirement: A request without mobile version metadata is never gated

A request with no platform header, a platform header that is not `ios` or `android`, or no app version header SHALL be
served regardless of any stored minimum. The web, crawlers, MCP clients, and feed readers are such requests.

#### Scenario: The web is unaffected

- **WHEN** both minimums are set and the web app makes a request
- **THEN** the request is served and no 426 is ever returned to the web

#### Scenario: A mobile request without a version

- **WHEN** a request has platform `android` and no app version header
- **THEN** the request is served

### Requirement: The app shows a blocking update notice in Carl's voice

When any transport receives a 426, the app SHALL show a full-screen notice over every screen, in Carl's words, with
a button that opens the platform's store page and a "Check again" action, and SHALL offer no way to dismiss it. The
notice SHALL name the minimum version when the response included one. "Check again" SHALL clear the notice and reload
the current reads, so the notice returns if the build is still too old.

#### Scenario: A typed call is rejected

- **WHEN** a read on any screen receives a 426
- **THEN** the update notice covers the app and its button opens the store page for the device's platform

#### Scenario: A stream is rejected

- **WHEN** a room stream or a chat turn receives a 426
- **THEN** the same update notice shows

#### Scenario: Check again on a still-old build

- **WHEN** the user taps "Check again" and the next read receives a 426
- **THEN** the notice shows again

#### Scenario: Check again after the minimum is lowered

- **WHEN** the user taps "Check again" and the next read succeeds
- **THEN** the notice is gone and the screen shows its data

### Requirement: The Account screen shows the app version

The app's Account screen SHALL show the app version and native build, and the loaded update's identifier when one is
loaded, in a muted line at the end of the screen. The web has no such line, and `apps/mobile/parity.md` records the
platform reason.

#### Scenario: A store build shows its version

- **WHEN** a user opens Account on a build with version 1.2.0 and build 34
- **THEN** the screen ends with a line naming 1.2.0 and 34

#### Scenario: An update is loaded

- **WHEN** an EAS Update is running
- **THEN** the line also names the update's identifier
