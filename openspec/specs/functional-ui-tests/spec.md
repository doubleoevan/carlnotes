# functional-ui-tests Specification

## Purpose
Prove that the critical user flows work end to end on web, native, and MCP cards, against state that each run creates
and throws away, and keep the evidence when one breaks.

## Requirements

### Requirement: The flows run against a disposable local stack

The functional flows SHALL run against a stack that the run starts on its own runner:

- Postgres with pgvector and pg_trgm, reached through a WebSocket proxy as the app's driver expects
- Redis
- the api, serving the built web app on port 3000

The stack's settings SHALL come from a committed file of non-secret values. The stack SHALL NOT migrate, seed,
or start if its database url names a host other than the runner itself.

#### Scenario: A remote database url is rejected

- **WHEN** the stack's database url names a Neon host
- **THEN** the stack will not start, and nothing is migrated or seeded

#### Scenario: The stack needs no secret

- **WHEN** the functional job starts the stack in CI
- **THEN** it reads no repository secret and no Doppler config

### Requirement: Production database settings are unchanged by the test stack

The app's database driver SHALL reach a WebSocket proxy on the runner only if a test-only environment variable names
that proxy. No production or development config SHALL set the variable. Without it, the driver SHALL connect exactly as
it does today.

#### Scenario: Production connects as before

- **WHEN** the api starts with production settings
- **THEN** its database driver uses its default secure WebSocket connection to Neon

### Requirement: Each run seeds its own users and data

Each run SHALL migrate the empty database with the repo's migrations, then seed users with password sign-in, Topics,
Sources, Scans, Findings, and Podcast Episodes from the repo's existing seed builders. Every id, email, and username a
run creates SHALL include the run's own id. No flow SHALL sign up through the Turnstile challenge.

#### Scenario: Two flows never share a user

- **WHEN** the topic flow and the session flow run in parallel
- **THEN** each signs in as its own seeded user, and neither sees the other's writes

### Requirement: A Topic can be created, edited, saved, and reopened

The topic flow SHALL sign in as a seeded user and create a Topic through the editor. It SHALL then save, reopen,
edit, save again, and reload. It SHALL assert that the page and the database row hold the edited name, prompt, Sources,
and visibility.

#### Scenario: An edit survives a reload

- **WHEN** the flow renames a Topic, saves, and reloads its page
- **THEN** the page shows the new name, and the Topic's row in the database holds it

### Requirement: Follow, rating, bookmark, and mark read keep their state

The finding state flow SHALL Follow a seeded Topic and rate one Finding up, bookmark it, and mark it read. It SHALL
rate a second Finding down. After a reload it SHALL assert that:

- the first Finding's controls show their new state
- the second Finding has left the feed and its counts
- the database holds each write

It SHALL then undo the Follow and each of the first Finding's changes, and assert the same after a reload.

#### Scenario: A bookmark survives a reload

- **WHEN** the flow bookmarks a Finding and reloads the Topic page
- **THEN** the Finding shows as bookmarked, and a bookmark row exists for the user and the Finding

#### Scenario: A thumbs down leaves the feed

- **WHEN** the flow rates the second Finding down and reloads
- **THEN** the Finding is gone from the feed and the feed's counts, and its rating is stored

#### Scenario: Unfollowing removes the subscription

- **WHEN** the flow unfollows the Topic
- **THEN** the button shows Follow after a reload, and the user's subscription row is gone

### Requirement: Search, filters, sort, and paging return the seeded results

The search flow SHALL search for a term that matches known seeded Topics and Findings, apply each filter and sort the
search page offers, and move between result pages. It SHALL assert the exact results, their order, the counts, and
the url state on each step. It SHALL also assert the same for a Topic feed's filters, sort, and paging.

#### Scenario: A sort orders the seeded Findings

- **WHEN** the flow sorts a Topic's Findings by newest
- **THEN** the seeded Findings appear in their known date order

#### Scenario: Paging keeps the filter

- **WHEN** the flow applies a filter and moves to page 2
- **THEN** page 2 holds the next seeded results that match the filter, and the url keeps the filter

### Requirement: Sessions, guarded routes, deep links, and offline behavior hold

The session flow SHALL cover each of these:

- sign-in with a password, and sign-out
- a signed-in page that sends a visitor to log in and returns them to it after sign-in
- a deep link to a Topic that opens it
- a session that survives a reload and a new browser context with the same storage
- a Finding write made offline, which is rejected without changing the control and succeeds once the network returns

#### Scenario: A guarded deep link returns after sign-in

- **WHEN** a visitor opens `/activity` and signs in
- **THEN** the browser opens `/activity` as the user

#### Scenario: An offline write changes nothing

- **WHEN** the browser goes offline and the user bookmarks a Finding
- **THEN** the bookmark control keeps its state, and after the network returns the same click saves the bookmark

#### Scenario: Sign-out ends the session

- **WHEN** the user signs out and reloads
- **THEN** the header shows the visitor's controls and the guarded url sends them to sign-in

### Requirement: MCP card flows reach the real MCP server

The MCP card flow SHALL load each card in the card test host. It SHALL pass the card's tool calls to the local MCP
server and return the results to the card, as a seeded user with an access token from the same OAuth flow that the MCP
smoke test uses. It SHALL assert that each action's result renders, and that a reload of the card's data, or a database
read, shows the write.

#### Scenario: Following from a card is a real subscription

- **WHEN** the flow clicks Follow in the findings card
- **THEN** the host calls `follow_topic` on the local MCP server, the button shows Following, and the subscription row
  exists

### Requirement: Native flows cover the same areas on Android and iOS

Maestro flows SHALL cover topics, finding state, search, and sessions on the Android emulator and the iOS simulator.
They SHALL run against the same disposable stack, through the development build. Any flow the mobile app does not
offer, and any check a platform cannot automate, SHALL be listed in the guide with its reason. Offline on the iOS
simulator is one such check.

#### Scenario: A bookmark from Android survives a relaunch

- **WHEN** the Android flow bookmarks a Finding, stops the app, and launches it again
- **THEN** the Finding shows as bookmarked

#### Scenario: An unsupported check is listed, not passed

- **WHEN** the iOS run reaches the offline check
- **THEN** the report lists it as not automated on the iOS simulator, and never as passed

### Requirement: A failed flow keeps its evidence

A failed web or MCP flow SHALL keep its Playwright trace, video, and failure screenshot, the browser console, and the
api log. A failed native flow SHALL keep its Maestro output, screenshots, the device log, the api log, and the Metro
log.

#### Scenario: A broken Follow handler is diagnosable

- **WHEN** a commit breaks the Follow button's handler and the finding state flow fails
- **THEN** the failure names the assertion, and the trace shows the click and the missing request

### Requirement: A smoke subset runs on each push and every flow runs nightly

A push run SHALL run a smoke subset on web and in the card host:

- sign-in with session restore
- create, save, and reopen a Topic
- Follow and rate a Finding
- one filtered search
- one card action

Nightly and dispatched runs SHALL run every web, MCP, and native flow.

#### Scenario: A push runs the smoke subset

- **WHEN** a commit is pushed to main
- **THEN** the smoke flows run, and the native flows wait for the nightly run
