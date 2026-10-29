# mobile-feed Specification

## Purpose
Let signed-in users read their Topic Feeds and act on Findings on iOS and Android, including opening their last loaded Feed without a network connection.

## Requirements

### Requirement: Home shows the existing Feed sections

Home SHALL read the same API as web and show Yours, Subscribed, Featured, and Popular using the web's section labels and delivered Topic order. Each Topic SHALL show its name, unread count, and delivered Findings under the shared sort. The list SHALL support variable card heights and long feeds without rendering every Finding at once.

#### Scenario: A Topic heading matches the web

- **WHEN** a Topic has attribution, tags, and unread Findings
- **THEN** its linked title sits above the team-or-owner "Brewed by" link and plain "N new" text with a separate share icon, followed by secondary tag badges; section counts include "topic" or "topics"

#### Scenario: A user opens a byline or shares a Topic

- **WHEN** the user presses a team or username byline or the share icon
- **THEN** the byline opens the native Team or Profile page, or the share icon opens the Topic sharing options; native Share is one option, and private Topics retain their access restrictions

#### Scenario: A user opens Home

- **WHEN** the Feed loads for a signed-in user
- **THEN** Home shows the delivered sections, Topics, and Findings with the requesting user's read and bookmark state

#### Scenario: The initial section follows the web

- **WHEN** a user owns no Topics and follows at least one
- **THEN** Subscribed opens first; a user who owns Topics initially sees Yours open

#### Scenario: A long Feed scrolls

- **WHEN** a user scrolls a Feed with many variable-height cards
- **THEN** offscreen Finding cards are recycled without carrying another Topic's control state or Finding image

### Requirement: The Topic note opens from the web's notebook icon

A Topic title SHALL have the web's notebook tile beside it. Pressing it SHALL open a dismissible native sheet titled "Topic roast". The sheet SHALL preserve the web's section order and delivered content: owner, podcast episode, prompt, recap and numbered Findings, attachments, Sources, visibility, and counts. Long content SHALL remain readable by scrolling.

#### Scenario: A user opens a Topic note

- **WHEN** the user presses the notebook tile
- **THEN** the Topic roast opens without navigating away, and dismissal returns to the same Feed position

### Requirement: Finding lists expand and collapse in place

Home and Topic lists SHALL initially show up to five Findings. When more are available, the web's `+ N more ▾` control SHALL expand all delivered Findings in place and change to `show less ▴`. Collapsing SHALL restore the first five Findings. Both controls SHALL retain the arrows and SHALL NOT append the word "findings" or navigate to another screen. Expansion SHALL survive row recycling and SHALL NOT expand another Topic or section.

#### Scenario: A user browses beyond the first five Findings

- **WHEN** the user presses `+ N more ▾` and then `show less ▴`
- **THEN** the current list expands and collapses without leaving the page or changing the order of its Findings

### Requirement: A Topic opens a screen with its own payload

Tapping a Topic SHALL open that Topic's screen and read the existing Topic-page API. The screen SHALL show the Topic's name and Findings, including Findings beyond the Home preview. A gated, missing, or failed Topic read SHALL have a distinct state and SHALL never render another Topic's payload.

#### Scenario: A Topic is absent from the cached Home Feed

- **WHEN** the user opens a visible Topic by its id
- **THEN** the Topic screen loads its page independently and does not require a matching Home preview

#### Scenario: Access has changed

- **WHEN** an online Topic read reports gated or missing
- **THEN** the app removes its previously visible payload from the displayed and persisted Topic cache and shows the corresponding state

### Requirement: Feed controls use the shared rules

Home and the Topic screen SHALL offer sort and finding-filter choices in dismissible bottom sheets. Labels SHALL match the web. The choices SHALL include Relevance, Newest, Trending, All, Unread, and Bookmarked, including the web's My and Team bookmark choices where applicable. The controls SHALL also expose Read, Watch, Listen, tag selection, and Any Match, All Match, Exclude Tags, and Off using the shared filter state.

#### Scenario: Sorting or filtering changes the displayed Findings

- **WHEN** the user selects a sort or finding filter
- **THEN** the shared state changes the displayed Findings without another read, and the active choice is announced accessibly

#### Scenario: A team member selects Team bookmarks

- **WHEN** an eligible member chooses Team bookmarked on a Team's Topic
- **THEN** the view includes their own bookmarks and the active teammates' bookmarks, with only their own pinned

### Requirement: Pull to refresh reheats the current Feed

Home and the Topic screen SHALL support pull to refresh through the shared reheat. A Topic refresh SHALL reload both its page and the home Feed. An unsuccessful refresh SHALL stop its indicator, retain cached content, and expose a retry path.

#### Scenario: A refresh fails offline

- **WHEN** the user pulls to refresh without a network connection
- **THEN** the indicator stops and the last loaded content stays readable

### Requirement: Finding rows match the web's compact list

A compact row SHALL show its rank or own-bookmark mark, title or URL fallback, source, read/watch/listen icon, and age. Consecutive rows SHALL share one card background, border, rounded outline, and Nightshift shadow. Individual rows SHALL have no shadow. Read Findings SHALL be muted. Images SHALL have a fallback when absent or unsuccessful.

#### Scenario: Optional metadata is absent

- **WHEN** the title, source, publication date, or image is absent
- **THEN** the row retains its title fallback, shows the source and publication age only when delivered, skips absent decorations, and keeps its details reachable; Fetched remains available in details

### Requirement: Finding details use a native sheet

Tapping a row SHALL open a details sheet without recording an open or launching the source. The sheet SHALL show full plain-text Carl's notes, Fetched, Views, an on-demand source preview, and permitted actions. Optional feedback SHALL acknowledge only a confirmed save and retain failed text for retry.

#### Scenario: A Finding contains formatted review text

- **WHEN** the review contains links, emphasis, headings, or lists
- **THEN** the details sheet shows their complete words without markdown syntax or active HTML and remains scrollable

### Requirement: Finding controls respect existing permissions

A details sheet SHALL offer rating only when the Topic permits rating. It SHALL offer bookmarking to an owner or eligible Team member and allow removal of an existing own bookmark. A signed-in user SHALL be able to mark a visible Finding read or unread. Bookmark and consumed state SHALL remain independent, and an action control SHALL never also open the source.

#### Scenario: A user reads a public Topic they do not own or follow

- **WHEN** the Topic does not permit rating or bookmarking
- **THEN** the sheet offers the allowed read action and hides the unavailable rating and add-bookmark controls

#### Scenario: An eligible user changes a Finding

- **WHEN** the user rates, bookmarks, or marks a Finding consumed
- **THEN** shared handlers update the display optimistically, reconcile on success, and roll back on failure

### Requirement: Opening a card records the open and opens its source

The details sheet's linked title or source preview SHALL record a Finding open through the shared handler and open
its HTTP(S) URL in the in-app browser. Actual inline playback SHALL use the same handler once per player opening.
Recording SHALL mark the Finding consumed, with rollback on failure, without blocking browser or playback access.
Inspecting details alone SHALL leave read state and views unchanged. Findings SHALL remain in sheets.

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

#### Scenario: A preview does not start playback

- **WHEN** a source preview loads without the player reporting actual playback
- **THEN** no Finding-open event is recorded

#### Scenario: Playback starts while recording fails

- **WHEN** the player can play but the Finding-open request fails
- **THEN** playback continues and tentative read state is restored

### Requirement: Authenticated screens share the branded header

Reading and menu pages SHALL use the compact web header's hero band, coffee mug, display wordmark, YouTube tutorial button, and secondary menu. The menu SHALL match web order, dividers, actions, and light/dark control, and SHALL offer the way back to the system appearance while a palette is saved. The menu button SHALL show the web's one summed update badge of unread chat mentions, unread note changes, and waiting topic invitations, and the Profile, Teams, and Activity items SHALL show the web's per-item counts. Native back gestures SHALL remain available. The Home/Settings bottom navigation SHALL remain hidden, with no visible Topic Back button.

#### Scenario: Appearance has a saved preference

- **WHEN** the app loads a saved light or dark preference
- **THEN** it uses that preference, and the menu offers "System appearance" to follow the device again

#### Scenario: The logo is pressed on search results

- **WHEN** a user presses the search header's logo
- **THEN** the app clears search and returns Home

#### Scenario: The logo is pressed on Home

- **WHEN** a user presses the Home header's logo
- **THEN** the shared reheat reloads the Feed once

#### Scenario: The logo is pressed on a Topic

- **WHEN** a user presses the Topic header's logo
- **THEN** the app returns to retained search results when present, or Home otherwise, without disabling native back gestures

#### Scenario: Updates wait while the menu is closed

- **WHEN** a user has one unread chat mention, two unread note changes, and one waiting topic invitation
- **THEN** the menu button shows 4, its accessible name reads the count and each waiting group, and a long press lists
  the groups under their own headings

### Requirement: The tutorial plays in the app and reports its opener

The header and Settings SHALL offer the same Topic tutorial video as web. It SHALL play through an embedded YouTube player in a bottom sheet. The first actual play per opening SHALL report `visit_video_played` with the shared video's id and the mobile header or Settings opener. Closing the sheet SHALL stop playback. Disabled analytics SHALL send nothing.

#### Scenario: Opening a tutorial is not a play

- **WHEN** the user opens the tutorial from Settings and closes it without playing
- **THEN** no video-play event is recorded

#### Scenario: A tutorial starts playing

- **WHEN** the embedded player first reports playing after a header or Settings opening
- **THEN** one event names the video and that opener; pause and resume during the same opening do not duplicate it

### Requirement: Loading and empty states retain the web's voice

Initial loading, empty sections, an empty filtered Feed, and failed reads SHALL have usable states. Existing matching web copy, including Carl's lines, SHALL be reused. Cached content SHALL remain visible during background loading and network failures. New Topic and permitted Topic settings SHALL open native forms. Deferred workflows SHALL identify their web destination before opening it.

#### Scenario: A user has no Topics

- **WHEN** Yours is empty
- **THEN** its empty state uses the web's matching line and offers native Topic creation; deferred new-topic chat is not presented as an available native action

#### Scenario: A refresh fails after data loaded

- **WHEN** a read fails after the app has usable cached data
- **THEN** that data stays visible and a retry is available

### Requirement: Saved Feed data belongs to one account and build

The app SHALL persist the signed-in user's successful home Feed and most recently loaded visible Topic page. The storage key SHALL include the user id. A changed app version, native build, runtime, or delivered application update SHALL reject older persisted data. Authentication data, gated responses, failed queries, and tentative mutations SHALL never enter this cache.

#### Scenario: The app starts without signal

- **WHEN** the current user and build have a saved Feed and the app restarts offline
- **THEN** the last loaded Feed is restored before its first read and remains readable without waiting for the network

#### Scenario: A different account signs in

- **WHEN** user B signs in after user A
- **THEN** no displayed query or persisted restore exposes user A's Feed or Topic page

#### Scenario: An application update changes the cache version

- **WHEN** a binary or delivered application update changes the build identity
- **THEN** the old snapshot is removed and the app starts its Feed from a fresh read

### Requirement: Session exit removes saved and live Feed data

Sign out, successful account deletion, a revoked session, and an account change SHALL cancel the old account's reads, stop persistence, and clear its live and saved Feed data. An old response or delayed persistence write SHALL never recreate it. A failed account deletion SHALL retain the current session and data.

#### Scenario: A write is delayed during sign out

- **WHEN** persistence or a Feed request is still pending as the session exits
- **THEN** it cannot restore the prior account's data after cleanup completes

#### Scenario: Account deletion succeeds before sign out finishes

- **WHEN** the account deletion API succeeds and the subsequent sign-out request fails
- **THEN** the deleted account's Feed cache is already cleared and its content is no longer displayed

### Requirement: Reads resume when the app can reach the API

After restoring saved queries, the app SHALL refresh stale Feed and Topic reads on network reconnection and foreground activation. Offline mutation attempts SHALL fail and roll back without entering a durable action queue. Restoring a cache SHALL never replay a rating, bookmark, consumed action, or open event.

#### Scenario: Connectivity returns

- **WHEN** an offline app regains a network connection
- **THEN** stale active Feed and Topic queries refresh and replace their saved data on success

#### Scenario: An offline action is attempted

- **WHEN** the user attempts a Finding write without signal
- **THEN** its tentative state rolls back and restarting or reconnecting does not replay the action

### Requirement: The reading pages preserve the web toolbar and Topic cards

Home and Topic screens SHALL show the web search bar with Filters, Sort, and page actions. Home SHALL show Tags and New Topic. The Topic page SHALL preserve the web card order and Nightshift styling in one native scroll area. Unfinished native workflows SHALL state their web destination before opening it.

#### Scenario: A user searches from Home

- **WHEN** the user enters at least two characters and submits the search
- **THEN** the app searches the existing API with the active filters, shows loading/error/empty states, and opens Topic results natively

#### Scenario: A user browses a Topic page

- **WHEN** the user scrolls below the Findings
- **THEN** Topic roast, Artisanal Blend, available podcast episodes, Brew diary, Tasting Notes, and Similar topics remain available in the web’s order

### Requirement: Topic sharing preserves the web permission gates

The share icon SHALL open a native sheet containing the web’s social and send destinations, native Share, page-link copy, public RSS copy, and native issue reporting. Only owners of non-private Topics SHALL receive the invite action. Opening the menu SHALL create no invite and change no visibility.

#### Scenario: A private Topic opens its share menu

- **WHEN** a user opens sharing for a private Topic
- **THEN** posting, sending, native Share, and RSS copying are disabled while the page link remains copyable without granting access

#### Scenario: The installed client lacks native clipboard support

- **WHEN** a user chooses Copy page link or an available Copy RSS action
- **THEN** the sheet offers selectable link text without crashing or claiming the copy succeeded

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

- **WHEN** a user opens Admin, hosted checkout, document links, podcast playback, or an explicitly deferred chat workflow
- **THEN** the app opens the existing web destination explicitly

#### Scenario: A supported text conversation is opened

- **WHEN** a user opens the global chat pill from any signed-in page
- **THEN** the app opens its native conversation screen with the shared web behavior
- **AND** deferred new-topic chat, voice, and attachment management do not prevent reading or sending supported text

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

### Requirement: A visitor's Home shows the web hero

A visitor's Home SHALL open with the web hero above the Featured and Popular sections: the headline, Carl's image,
the call to action, the tagline, the pitch behind its button, and the tutorial video button reporting the `hero`
opener. A signed-in Home SHALL show no hero. The headline's reveal SHALL hold still under reduced motion.

#### Scenario: A visitor opens the app

- **WHEN** the app opens with no session
- **THEN** Home shows the hero with the web's headline and call to action, and the Featured section below it

#### Scenario: The hero's video button

- **WHEN** a visitor presses the hero's video button
- **THEN** the tutorial plays in the app and reports the `hero` opener

### Requirement: Plans opens to a visitor

The Plans screen SHALL open to a visitor as the web's Plans page does, with the recommended plan highlighted and each
plan's action leading to sign-up.

#### Scenario: A visitor opens Plans

- **WHEN** a visitor opens Plans from a link
- **THEN** the plans render and no sign-in is required to read them

### Requirement: An account action prompts a visitor in Carl's words and returns them

Every visitor action that needs an account SHALL open sign-up with the web's prompt for that action, in Carl's words,
and SHALL remember the visitor's screen so sign-in or sign-up returns there. The invite-only Topic gate SHALL offer
Log in and Sign up as the web gate does. Add Note SHALL prompt a visitor instead of hiding.

#### Scenario: A visitor follows a topic

- **WHEN** a visitor presses Follow on a public Topic
- **THEN** sign-up opens reading "Sign up to follow this topic", and after sign-up the same Topic shows

#### Scenario: A visitor adds a note

- **WHEN** a visitor presses Add Note on a Topic
- **THEN** sign-up opens reading "Sign up to add a note"

#### Scenario: A visitor meets an invite-only topic

- **WHEN** a visitor opens an invite-only Topic
- **THEN** the gate offers Log in and Sign up, and either returns to the Topic

#### Scenario: A visitor opens an account screen

- **WHEN** a visitor's link opens Account, Activity, or Teams
- **THEN** sign-in opens, and after sign-in that screen shows

### Requirement: The chat launcher shows a visitor the sign-up panel

The chat launcher SHALL show for a visitor and open the web's sign-up panel, "Sign up to begin the conversation".
Chat itself SHALL stay signed-in only.

#### Scenario: A visitor opens the launcher

- **WHEN** a visitor presses the chat launcher
- **THEN** the panel offers sign-up and sends no chat request
