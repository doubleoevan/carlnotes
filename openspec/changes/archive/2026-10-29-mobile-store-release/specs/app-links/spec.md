# Spec Delta

## Purpose

Opens a tapped `https://carlnotes.com` link in the installed app for the pages the app implements, keeps the rest on
the web, and lets the web point a phone at the store.

## ADDED Requirements

### Requirement: The domain association files are served from one path list

The api SHALL serve `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` as JSON with an hour
of caching, built from the app identity, the configured Apple team id and Android signing fingerprints, and the one
list of path patterns the app implements. When a configured value is unset the file SHALL answer 404. Tests SHALL
validate each file's shape.

#### Scenario: The files are served in production

- **WHEN** the team id and fingerprints are configured and a client requests either file
- **THEN** the response is JSON with the app id, the path list, and an hour of caching

#### Scenario: A value is unset

- **WHEN** no fingerprint is configured
- **THEN** `/.well-known/assetlinks.json` answers 404

### Requirement: The app claims the implemented paths and no other

The app SHALL declare the associated domain and the Android intent filters with automatic verification for the paths in
the list: Home, Topic, Note, Podcast Episode, invite, search, profile, Activity, Teams, a Team, the chat rooms, Account,
and the read-only Plans. Terms, Privacy, docs, releases, blog, admin, MCP consent, sign-in, sign-up, and password reset
SHALL stay with the web and SHALL NOT be listed.

#### Scenario: A Topic link opens the app

- **WHEN** a phone with the app installed taps a Topic link in Mail or Messages
- **THEN** the app opens on that Topic

#### Scenario: A Terms link stays on the web

- **WHEN** the same phone taps the Terms link
- **THEN** the browser opens the web page

#### Scenario: The app is not installed

- **WHEN** a phone without the app taps a Topic link
- **THEN** the web page opens

### Requirement: A linked web url maps to its native route with its context

A linked url SHALL map through the same web-to-native path mapping the in-app links use, keeping the Topic slug's
destination, the query, and the section context, and a listed path that has no native route SHALL open in the
browser sheet. A test SHALL assert every listed pattern reaches a native route or the browser fallback.

#### Scenario: A slugged Topic url

- **WHEN** the app receives `https://carlnotes.com/topics/<id>/<slug>?season=2`
- **THEN** the Topic screen opens with its season context

#### Scenario: A Podcast Episode url

- **WHEN** the app receives a Podcast Episode url with its season and number
- **THEN** the Podcast Episode screen opens

#### Scenario: A listed path without a route

- **WHEN** the app receives a listed path the native router cannot match
- **THEN** the url opens in the browser sheet and the app returns Home

### Requirement: A visitor's link survives sign-in

A visitor who follows a link to a signed-in page SHALL be sent to sign-in with the page remembered and SHALL open
that page after signing in or up, on a cold start and a warm one.

#### Scenario: A cold start on a Topic chat link

- **WHEN** a signed-out phone opens an `https` Topic chat link with the app closed
- **THEN** the app starts, asks for sign-in, and opens the chat after it

#### Scenario: A warm start on Activity

- **WHEN** a signed-out phone opens the Activity link with the app in the background
- **THEN** the app comes forward, asks for sign-in, and opens Activity after it

### Requirement: The web shows the App Store banner once the store id is known

The web's pages SHALL include the App Store smart banner meta, with the current url as the app argument, once the App
Store id is set, and SHALL NOT include it before.

#### Scenario: The id is set

- **WHEN** Safari on an iPhone opens a Topic page after the id is set
- **THEN** the banner offers the app and opens the same Topic in it

#### Scenario: The id is unset

- **WHEN** the id is not set
- **THEN** no banner meta is emitted
