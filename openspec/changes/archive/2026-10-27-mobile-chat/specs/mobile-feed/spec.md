# Spec Delta

## MODIFIED Requirements

### Requirement: Loading and empty states retain the web's voice

Initial loading, empty sections, an empty filtered Feed, and failed reads SHALL have usable states. Existing matching web copy, including Carl's lines, SHALL be reused. Cached content SHALL remain visible during background loading and network failures. New Topic and permitted Topic settings SHALL open native forms. Deferred workflows SHALL identify their web destination before opening it.

#### Scenario: A user has no Topics

- **WHEN** Yours is empty
- **THEN** its empty state uses the web's matching line and offers native Topic creation; deferred new-topic chat is not presented as an available native action

#### Scenario: A refresh fails after data loaded

- **WHEN** a read fails after the app has usable cached data
- **THEN** that data stays visible and a retry is available

### Requirement: Mobile menu pages reuse web behavior and shared components

Profile, Teams, Team details, Activity, Account, and Plans SHALL render natively with the web terminology, actions, icons, permissions, and Nightshift appearance. Portable composition, table columns, validation, and API clients SHALL be shared. Platform adapters SHALL supply native controls, routing, safe areas, and system interactions.

#### Scenario: A user opens a menu destination

- **WHEN** a signed-in user chooses Profile, Teams, Activity, Account, or Plans
- **THEN** the app opens the native page with the matching web actions and shared footer
- **AND** the header logo returns Home without a separate bottom Home/Settings bar

#### Scenario: A wide table is read on a phone

- **WHEN** a domain table exceeds the available width
- **THEN** the first column stays fixed while the remaining columns scroll horizontally
- **AND** an orange indicator reveals overflow, pagination has bottom padding, and Rows uses an anchored dropdown

#### Scenario: A destination requires its existing browser flow

- **WHEN** a user opens Admin, hosted checkout, document links, podcast playback, or an explicitly deferred chat workflow
- **THEN** the app opens the existing web destination explicitly

#### Scenario: A supported text conversation is opened

- **WHEN** a user opens the global chat pill from any signed-in page
- **THEN** the app opens its native conversation screen with the shared web behavior
- **AND** deferred new-topic chat, voice, and attachment management do not prevent reading or sending supported text
