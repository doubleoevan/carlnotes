# Spec Delta

## Purpose

Let signed-in users read their Topic Feeds and act on Findings on iOS and Android, including opening their last loaded Feed without a network connection.

## ADDED Requirements

### Requirement: Home shows the existing Feed sections

Home SHALL read the same API as web and show Yours, Subscribed, Featured, and Popular using the web's section labels and delivered Topic order. Each Topic SHALL show its name, unread count, and delivered Findings under the shared sort. The list SHALL support variable card heights and long feeds without rendering every Finding at once.

#### Scenario: A Topic heading matches the web

- **WHEN** a Topic has attribution, tags, and unread Findings
- **THEN** its linked title sits above the team-or-owner "Brewed by" link and plain "N new" text with a separate share icon, followed by secondary tag badges; section counts include "topic" or "topics"

#### Scenario: A user opens a byline or shares a Topic

- **WHEN** the user presses a team or username byline or the share icon
- **THEN** the byline opens its existing web page in the in-app browser, or the share icon opens the Topic sharing options; native Share is one option, and private Topics retain their access restrictions

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

Tapping the details sheet's linked title or source preview SHALL record the Finding open through the existing API and open its HTTP or HTTPS URL in an in-app browser. The open SHALL mark it consumed through the shared handler. A recording failure SHALL restore tentative read state and SHALL NOT prevent the browser from opening. Opening details alone SHALL leave read state and view count unchanged. This change SHALL add no native Finding screen.

#### Scenario: A source opens while recording fails

- **WHEN** the browser can open but the Finding-open request fails
- **THEN** the source opens once and the saved read state is restored without blocking navigation

### Requirement: Authenticated screens share the branded header

Home, Settings, and Topic screens SHALL use the compact web header's hero band, coffee mug, display wordmark, YouTube tutorial button, and secondary menu. The menu SHALL match web order, dividers, actions, and light/dark control. Native tabs and back gestures SHALL remain available, with no visible Topic Back button.

#### Scenario: Appearance has a saved preference

- **WHEN** the app loads a saved light or dark preference
- **THEN** it uses that preference, with system detection as an invisible fallback when no preference exists

#### Scenario: The logo is pressed on search results

- **WHEN** a user presses the search header's logo
- **THEN** the app clears search and returns Home

#### Scenario: The logo is pressed on Home

- **WHEN** a user presses the Home header's logo
- **THEN** the shared reheat reloads the Feed once

#### Scenario: The logo is pressed on a Topic

- **WHEN** a user presses the Topic header's logo
- **THEN** the app returns to retained search results when present, or Home otherwise, without disabling native back gestures

### Requirement: The tutorial plays in the app and reports its opener

The header and Settings SHALL offer the same Topic tutorial video as web. It SHALL play through an embedded YouTube player in a bottom sheet. The first actual play per opening SHALL report `visit_video_played` with the shared video's id and the mobile header or Settings opener. Closing the sheet SHALL stop playback. Disabled analytics SHALL send nothing.

#### Scenario: Opening a tutorial is not a play

- **WHEN** the user opens the tutorial from Settings and closes it without playing
- **THEN** no video-play event is recorded

#### Scenario: A tutorial starts playing

- **WHEN** the embedded player first reports playing after a header or Settings opening
- **THEN** one event names the video and that opener; pause and resume during the same opening do not duplicate it

### Requirement: Loading and empty states retain the web's voice

Initial loading, empty sections, an empty filtered Feed, and failed reads SHALL have usable states. Existing matching web copy, including Carl's lines, SHALL be reused. Cached content SHALL remain visible during background loading and network failures. Mobile SHALL show the requested New Topic and unfinished workflow controls as explicit web handoffs, and SHALL show delivered Topic settings as read-only content.

#### Scenario: A user has no Topics

- **WHEN** Yours is empty
- **THEN** its empty state uses the web's matching line without offering an unavailable Topic creation or chat action

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

The share icon SHALL open a native sheet containing the web’s social and send destinations, native Share, page-link copy, public RSS copy, and an explicit reporting handoff. Only owners of non-private Topics SHALL receive the invite action. Opening the menu SHALL create no invite and change no visibility.

#### Scenario: A private Topic opens its share menu

- **WHEN** a user opens sharing for a private Topic
- **THEN** posting, sending, native Share, and RSS copying are disabled while the page link remains copyable without granting access

#### Scenario: The installed client lacks native clipboard support

- **WHEN** a user chooses Copy page link or an available Copy RSS action
- **THEN** the sheet offers selectable link text without crashing or claiming the copy succeeded
