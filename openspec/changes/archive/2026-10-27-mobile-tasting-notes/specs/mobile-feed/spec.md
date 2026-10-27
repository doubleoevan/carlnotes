# Spec Delta

## MODIFIED Requirements

### Requirement: Opening a card records the open and opens its source

Tapping the details sheet's linked title or source preview SHALL record the Finding open through the existing API and
open its HTTP or HTTPS URL in an in-app browser. The open SHALL mark it consumed through the shared handler.
Starting actual inline video playback SHALL use the same Finding-open handler once per player opening; preparing a
preview, opening the sheet, pausing, and resuming SHALL NOT count as another open. A recording failure SHALL restore
tentative read state and SHALL NOT prevent the browser or playback from opening. Opening details alone SHALL leave
read state and view count unchanged. This change SHALL add no native Finding screen.

#### Scenario: A source opens while recording fails

- **WHEN** the browser can open but the Finding-open request fails
- **THEN** the source opens once and the saved read state is restored without blocking navigation

#### Scenario: Inspecting a Finding is not opening its source

- **WHEN** a user opens a Finding sheet, scrolls its notes, changes a bookmark, or shares Markdown
- **THEN** none of those actions records a source-open event

#### Scenario: Inline playback records its first actual play

- **WHEN** a Finding's embedded player first reports playing
- **THEN** the shared handler records one open and subsequent pause/resume events do not duplicate it
- **AND** closing the sheet or backgrounding the app stops playback

## ADDED Requirements

### Requirement: Finding Markdown can use native sharing

A Finding's notes scrollbox SHALL offer native sharing of the same Markdown that its web copy action produces. The existing copy action SHALL remain available. Opening, completing, cancelling, or failing the system share sheet SHALL preserve the Finding sheet, its position, and its unsaved feedback. Sharing SHALL not navigate to the source or alter permissions, read state, ratings, or bookmarks.

#### Scenario: Sharing exports the Finding text

- **WHEN** a user chooses Share Markdown for AI
- **THEN** the system share sheet receives the Finding's linked title and explanation in the shared Markdown format
- **AND** the current Topic context uses the same canonical URL construction as web

#### Scenario: Sharing returns to the Finding

- **WHEN** the user completes or cancels sharing, or the system cannot open the share sheet
- **THEN** the Finding remains open at the same position with the same feedback text
- **AND** failure is explained without reporting a successful share

### Requirement: The latest recap keeps the delivered web placement

The Topic screen SHALL keep Findings before the Topic information card containing the latest recap. The notebook action SHALL keep the recap in Topic roast, after the prompt and before attachments and Sources. Long recaps SHALL retain the bounded scrollbox and expansion controls used by web. No second collapsed recap SHALL be added above Findings.

#### Scenario: The latest recap appears once in the page layout

- **WHEN** a user opens a Topic with a succeeded Scan and scrolls its content
- **THEN** Findings precede the Topic information card, and its recap expands in place without adding a duplicate above Findings

#### Scenario: The notebook opens the same reading content

- **WHEN** the user opens Topic roast or a Scan's diary entry
- **THEN** the relevant recap and numbered Findings retain the current web order and shared composition
- **AND** the diary retains Source footnotes and permitted time/cost details


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

- **WHEN** a user opens Admin, hosted checkout, document links, podcast playback, or chat
- **THEN** the app opens the existing web destination explicitly

### Requirement: Native forms preserve web action semantics

Topic, Team, invitation, reporting, and Account actions SHALL use the existing permissions, validation, and endpoints. Native dialogs SHALL preserve entered data after rejection and retain accepted partial writes for retry. Team name checks SHALL ignore obsolete responses. Attachment context SHALL offer read and edit modes. Owner file downloads SHALL use the native authenticated session.

#### Scenario: A team name changes before its lookup completes

- **WHEN** a name availability response arrives after the user changes the input
- **THEN** it does not reject the new name or block its save

#### Scenario: A report is opened

- **WHEN** a user chooses Report issue
- **THEN** the sheet shows the web question, one bordered multiline input, Cancel, and Send report

#### Scenario: A report is cancelled or rejected

- **WHEN** the user cancels the report
- **THEN** no report request is sent
- **WHEN** the server rejects a report
- **THEN** the dialog keeps the entered text and explains the failure

#### Scenario: An owner opens an attachment

- **WHEN** a Topic owner opens a ready file attachment
- **THEN** the existing endpoint checks the app's signed-in session before returning bytes to the native viewer
- **AND** an access or transport failure is shown without opening its error response as a file

### Requirement: The footer is consistent across mobile pages

Scrolling pages and session screens SHALL use the shared footer copy, destinations, and compact grouping. Focused note editors and modal forms SHALL omit the footer. Privacy, Terms, License, documentation, Releases, Source Code, and Nightshift SHALL open their existing web destinations in the platform's in-app browser.

#### Scenario: A footer destination is closed

- **WHEN** a user closes the iOS browser sheet opened from a footer link
- **THEN** the underlying native page remains mounted in its prior position


### Requirement: Topic loading reserves the page layout

An initial Topic read SHALL show the shared skeleton section order in the available content area. Native adapters SHALL preserve the known title and omit a podcast placeholder when the cached Topic has no episode. Placeholder motion SHALL respect reduced motion. A background refresh SHALL retain loaded content, and a failed read SHALL offer retry instead of an indefinite skeleton.

#### Scenario: A Topic starts loading

- **WHEN** a Topic without a loaded page starts its first request
- **THEN** its title, player, Findings, information, and history placeholders occupy one scrolling content area
- **AND** a separate footer scrolling area does not reduce that space

#### Scenario: Existing Topic content refreshes

- **WHEN** a loaded Topic refreshes in the background
- **THEN** the current content remains visible instead of returning to placeholders

### Requirement: Web and mobile share page loading layouts

Profile, Teams, Activity, Account, and Team pages SHALL use shared skeleton composition for initial loading. Known page headings and actions SHALL remain available. Account settings SHALL remain usable while the budget loads. Decorative skeleton motion SHALL respect reduced motion.

#### Scenario: A menu page starts loading

- **WHEN** one of these pages has no loaded response
- **THEN** it reserves the identity, table, or budget layout appropriate to the page
- **AND** web and mobile use the same shared composition with platform elements

#### Scenario: Profile topics load after identity

- **WHEN** the Profile identity is visible while its owner topics are loading
- **THEN** only that table shows placeholders
- **AND** the identity and other loaded content remain visible

#### Scenario: A loaded page refreshes

- **WHEN** one of these pages refreshes its existing response
- **THEN** it retains loaded content instead of replacing it with skeletons
### Requirement: Native telemetry preserves shared event semantics and privacy
The mobile app SHALL use web visit event names for supported actions. Existing API handlers SHALL emit business events once, with bounded native platform and device metadata. Sentry SHALL capture native errors, route render failures, and sampled navigation.

#### Scenario: A native business action reaches analytics
- **WHEN** a signed-in native client submits a supported Topic, Team, or note mutation
- **THEN** the existing server event is attributed to mobile and its device platform, without a duplicate client business event

### Requirement: Native telemetry protects private content
Native visits SHALL disable person profiles, persistent identifiers, autocapture, and replay. Reports SHALL omit private route identities, query strings, fragments, request bodies, credentials, and navigation parameters. Device metadata SHALL never grant authorization.

#### Scenario: A private note screen is reported
- **WHEN** the native client opens a Topic or Team note
- **THEN** visit and navigation reports use route patterns rather than parent IDs, note IDs, or note text

#### Scenario: Delivery is checked before dashboard access
- **WHEN** the explicit development telemetry check sends its labeled events
- **THEN** each SDK's flush result is shown separately from later dashboard confirmation
