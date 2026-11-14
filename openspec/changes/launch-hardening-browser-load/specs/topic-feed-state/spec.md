## ADDED Requirements

### Requirement: The Feed query runs only while it is enabled

The shared Feed state SHALL take an enabled option that is on by default, so the mobile app reads the Feed as before.
While the option is off the Feed query SHALL send no read and SHALL report itself as loading, and the filters, the
handlers, and the reload SHALL keep working. Only a reader of the Feed's data SHALL branch on that loading state. The
web turns the option on as the `layout-requests` capability states.

#### Scenario: The mobile app is unchanged

- **WHEN** the mobile app mounts the Feed state without the option
- **THEN** the Feed is read as before

#### Scenario: A disabled query sends nothing

- **WHEN** the web mounts the Feed state on a page with no reader of the Feed's data
- **THEN** no Feed read is sent, and the page's filters and Finding handlers work

#### Scenario: A page that does not read the Feed shows no loading state for it

- **WHEN** a topic page renders while the Feed query is disabled
- **THEN** nothing on the page shows a loading state or an empty state for the Feed

## MODIFIED Requirements

### Requirement: Feed queries remain isolated by signed-in identity

A Feed read SHALL include consumed Findings and SHALL be keyed by the requesting user's identity. A visitor's
server-loaded Feed SHALL seed only the visitor query. A user SHALL never receive another identity's cached Feed or
visitor loader data as their initial Feed. The web SHALL start no Feed read before the session is known, so a
signed-in page load never reads the Feed under the visitor's identity.

#### Scenario: A visitor's page hydrates

- **WHEN** a visitor opens the server-rendered Topics page, whose loader read the Feed
- **THEN** the first browser render shows the same Feed and skips the immediate redundant refetch for 60 seconds

#### Scenario: Signing in changes the cache identity

- **WHEN** the session changes from visitor to user A or from user A to user B
- **THEN** the active Feed query uses the new identity and never seeds itself from the previous identity's data

#### Scenario: A signed-in page load reads under one identity

- **WHEN** a signed-in user opens the Topics page on a full page load
- **THEN** no Feed read runs before the session is known, and one runs under the user's identity once it is known

### Requirement: Reheat reports a completed refresh

A reheat SHALL expose its pending state and reload the Feed. A mobile Topic refresh SHALL also reload that Topic's page
payload. The refresh generation SHALL advance only after the required reads succeed, and pending state SHALL clear after
success or failure. A failed refresh SHALL retain the last successfully loaded data. While the Feed query is disabled
a reload SHALL mark the Feed stale and send no read, the Feed SHALL NOT be one of the required reads, and the Feed
SHALL be read fresh once a reader enables the query.

#### Scenario: Refresh succeeds

- **WHEN** a reheat completes successfully
- **THEN** the new data replaces the prior data, the refresh generation advances once, and pending state clears

#### Scenario: Refresh fails with cached data

- **WHEN** a required refresh read fails
- **THEN** pending state clears, the generation stays unchanged, and the previous data remains available

#### Scenario: A reload with no reader mounted fetches nothing

- **WHEN** a user saves an edit on a topic page, where no reader of the Feed is mounted, and the page reloads the Feed
- **THEN** no Feed read is sent, the Feed is marked stale, and the Topics page reads it fresh as it next opens

#### Scenario: A reheat with no reader mounted still completes

- **WHEN** a user presses the logo on the home, where no reader of the Feed is mounted
- **THEN** no Feed read is sent, the refresh generation advances once, and pending state clears

### Requirement: Extracting shared state preserves web behavior

The web adapter SHALL preserve server hydration, pathname resets, the provider's existing consumers, reheat
presentation, header behavior, filter and sort labels, and Finding actions. Mobile's optimistic presentation SHALL be
configurable without changing the web's current action timing or adding mobile controls to web pages. A consumer that
reads only the filters, the handlers, or the reload SHALL behave the same whether the Feed query is enabled or not.

#### Scenario: Existing web interactions run after extraction

- **WHEN** a visitor or user opens Home or a Topic, changes filters and sort, reheats, or acts on a Finding
- **THEN** the web retains its prior markup, navigation, authorization, ordering, and action behavior

#### Scenario: A Finding action works on a page with no reader

- **WHEN** a user rates, bookmarks, or marks read a Finding on a topic page, where the Feed query is disabled
- **THEN** the action saves and the page shows it as before, and no Feed read is sent
