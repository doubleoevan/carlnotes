## RENAMED Requirements

- FROM: `### Requirement: Thirteen tools name an MCP view through the MCP Apps extension`
- TO: `### Requirement: Twenty-two tools name an MCP view through the MCP Apps extension`

## MODIFIED Requirements

### Requirement: Twenty-two tools name an MCP view through the MCP Apps extension

The MCP server SHALL register sixteen MCP view kinds through `@modelcontextprotocol/ext-apps`, each of type
`text/html;profile=mcp-app`: `search`, `topic`, `findings`, `suggest-topics`, `updates`, `scan`, `news`,
`topic-posts`, `topic-post`, `dashboard`, `note`, `team`, `profile`, `activity`, `account`, and `topics`, each at
`ui://carlnotes/<view>.html`. `search` SHALL name the search MCP view; `edit_topic`, `create_topic`, `send_to_topic`,
and `set_topic_image` the topic MCP view; `read_topic_feed` and `search_topic_findings` the findings MCP view;
`suggest_topics` the suggestion MCP view; `read_updates` the updates MCP view; `start_scan` and `read_scan_status` the
scan MCP view; `read_news` the news MCP view; `read_topic_posts` the topic posts MCP view; `read_topic_post` the topic
post MCP view; `read_dashboard` the dashboard MCP view; `read_notes` and `save_note` the note MCP view; `read_team` the
team MCP view; `read_profile` the profile MCP view; `read_activity` the activity MCP view; `read_account` the account
MCP view; and `list_topics` the topics MCP view, in `_meta.ui.resourceUri`. No other tool SHALL name an MCP view.
Preferred UI resource URIs append the current `?v=` version, twelve. Unversioned aliases and versions two through
eleven remain readable for cached connections, and each stored version stays readable from its own bundle. Every tool,
with an MCP view or without, SHALL return its full structured result and a readable text summary, so a client that
renders no MCP view reads the same result it reads today.

#### Scenario: A client lists the UI resources

- **WHEN** a client lists the server's resources
- **THEN** it receives the sixteen preferred versioned UI resources, their unversioned aliases, and each stored
  version, each of type `text/html;profile=mcp-app`

#### Scenario: A tool names its MCP view

- **WHEN** a client lists tools
- **THEN** each of the twenty-two tools above names its MCP view at `?v=12`, and no other tool names one

#### Scenario: A client without MCP views reads the same result

- **WHEN** a client that renders no MCP view calls each tool that names an MCP view
- **THEN** each result has its structured content and its text summary, the same with or without the UI resource
  registered

### Requirement: The findings view's podcast player links to the film

If the Podcast Episode in the findings MCP view's podcast player has a film, the player SHALL play the film in the
host while film playback is switched on, from carlnotes.com with a signed play token, with its captions, and SHALL
show a link that reads "Watch on CarlNotes" while it is switched off. The link SHALL ask the host to open that Podcast
Episode's page on carlnotes.com at its film player. A Podcast Episode with no film SHALL show neither. The audio
player SHALL behave the same with the switch on or off.

#### Scenario: Watch on CarlNotes opens the film on the site

- **GIVEN** film playback is switched off
- **WHEN** a user presses "Watch on CarlNotes" in the findings view's podcast player
- **THEN** the host is asked to open the Podcast Episode's page at `#film`

#### Scenario: No film, no link

- **WHEN** the findings view's Podcast Episode has no film
- **THEN** the player shows no "Watch on CarlNotes" link and no film player

#### Scenario: The film plays in the host

- **GIVEN** film playback is switched on
- **WHEN** a user presses play on the film in the findings view
- **THEN** the film plays inside the view from carlnotes.com with its captions, and no link to the site is shown

#### Scenario: The switch leaves the audio alone

- **WHEN** film playback is switched off
- **THEN** the findings view's audio player still plays the Podcast Episode's audio in the host

## ADDED Requirements

### Requirement: A new MCP view renders the component its page renders

The note, team, profile, activity, account, topics, and dashboard MCP views SHALL each render the shared component
that the matching web page and mobile screen render, given the MCP platform's elements, and SHALL show what that page
shows the same caller. A view SHALL differ from its page only where the host cannot do what the page does, and each
difference SHALL be listed in the view's story description.

#### Scenario: The profile view matches the profile page

- **WHEN** the profile MCP view renders a person's profile for another user
- **THEN** it shows the same header, news, featured sections, and tables the profile page shows that user, with public
  items only

#### Scenario: A host limit is listed

- **WHEN** the team MCP view renders a member's room without a live stream
- **THEN** its story description names the room's missing live updates as the view's difference from the team page

### Requirement: The note MCP view shows one note's saved html

The note MCP view SHALL show the notes `read_notes` returns as the team and topic pages list them, and one note's name,
author, visibility, and saved html as the note's page shows it. Editing SHALL happen through `save_note`, and the view
SHALL offer no editor.

#### Scenario: A note renders its html

- **WHEN** the note MCP view opens a note with headings and a list in its html
- **THEN** the view shows the headings and the list as the note's page does

### Requirement: The team MCP view shows members, topics, notes, and the room

The team MCP view SHALL show the team's header, members, topics, notes, and, for a member, the room's recent messages
with a control that loads earlier messages through `read_team`. Posting SHALL happen through `post_to_team_room`.

#### Scenario: A member loads earlier messages

- **WHEN** a member presses the control for earlier messages in the team view
- **THEN** the view calls `read_team` with the room cursor and shows the earlier messages above the recent ones

### Requirement: The profile, activity, and account MCP views show their pages

The profile MCP view SHALL show the profile page's header, news, featured topics, podcast episodes, films, and Topic
Posts, and its topics and teams tables. The activity MCP view SHALL show the followed topics and the received and sent
invites. The account MCP view SHALL show the plan, the spend meter with its cutoffs, the day's scans, and the
regenerations left, and its plan and billing actions SHALL open carlnotes.com.

#### Scenario: The account view links out to change a plan

- **WHEN** a user presses the plan action in the account MCP view
- **THEN** the host is asked to open the plans page on carlnotes.com and nothing is bought in the view

### Requirement: The topics MCP view shows a section's topics as cards

The topics MCP view SHALL show the topics `list_topics` returns as the topic cards the home page shows, under the
section's title, and similar topics as the similar topics table the topic page shows. Opening a topic SHALL take the
view's one hop to the findings view.

#### Scenario: A topic card opens its findings

- **WHEN** a user presses a topic card in the topics MCP view
- **THEN** the view opens that topic's findings view

### Requirement: The dashboard MCP view shows the five charts with their controls

The dashboard MCP view SHALL show the Dashboard's header, summary strip, Carl's paragraph, and the bar, pie, word
cloud, trend, and map charts with the same selection controls the web Dashboard has, reading the same series. A
selection change SHALL call `read_dashboard` with the new selection.

#### Scenario: A selection change reads the tool

- **WHEN** a user picks podcast plays in the dashboard MCP view's selection control
- **THEN** the view calls `read_dashboard` with that selection and redraws the five charts from its result

### Requirement: The six new MCP views have stories and smoke sections

The note, team, profile, activity, account, and topics MCP views SHALL each have a story for a user, and for a
visitor wherever the tool returns a visitor an MCP view, under the MCP views section of the component browser, with the
fetch guard on, and a section in the MCP view smoke tests that renders it from a fixture tool result and asserts each of
its actions through the test host.

#### Scenario: The new stories render with no api request

- **WHEN** the component browser builds
- **THEN** the six views each render for a visitor and for a user with no `/api` request
