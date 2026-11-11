# Spec Delta

## ADDED Requirements

### Requirement: The news MCP view shows the list

The news MCP view SHALL show the shared news component from a `read_news` result: the caller's unseen Comment Mentions
first, then the rows with the Week, Day, Hour picker and the toggle for more. Choosing a window SHALL call `read_news`
with it. A row SHALL open its page on the site through the host. The view SHALL mark no mention seen.

#### Scenario: The list renders

- **WHEN** a host renders a `read_news` result
- **THEN** the MCP view shows the mentions, then the rows in the news' order, and makes no tool call on load

#### Scenario: A window change is a tool call

- **WHEN** a user chooses Day in the MCP view
- **THEN** the view calls `read_news` with the day and shows that result

### Requirement: The topic posts MCP view shows a Topic's cards

The topic posts MCP view SHALL show the shared Topic Post card for each post of a `read_topic_posts` result, newest
first, under the Topic's header. A card SHALL open the topic post MCP view for its post, one hop. An empty result SHALL
show the empty state and no publish button.

#### Scenario: A card opens its post

- **WHEN** a user presses a card in the topic posts MCP view
- **THEN** the view calls `read_topic_post` and shows that post

### Requirement: The topic post MCP view shows the post with its discussion and thread

The topic post MCP view SHALL show the shared Topic Post page component from a `read_topic_post` result: the image, the
title with its author and date, the body, the summary in the info popup, the discussion's player, and the comment
thread. It SHALL show no editor, no Regenerate control, and no chat. The thread SHALL read and post through the hot
take tools, and the audio SHALL play through the audio route with a signed play token, as podcast audio does.

#### Scenario: The post renders with its player

- **WHEN** a host renders a `read_topic_post` result for a post with a discussion
- **THEN** the MCP view shows the image, the body, and the Coffee Break Discussion player, and makes no tool call on
  load

#### Scenario: A Comment posts through the tool

- **WHEN** a signed-in user posts a Comment in the MCP view
- **THEN** the view calls `post_hot_take` with the post as its target and shows the new Comment

### Requirement: The three new MCP views have stories and smoke sections

The news, topic posts, and topic post MCP views SHALL each have a story for a visitor and for a user under the MCP
views section of the component browser, with the fetch guard on, and a section in the MCP view smoke tests that renders
it from a fixture tool result and asserts each of its actions through the test host.

#### Scenario: The stories render with no api request

- **WHEN** the component browser builds
- **THEN** the three views each render for a visitor and for a user with no `/api` request

## RENAMED Requirements

- FROM: `### Requirement: Ten tools name an MCP view through the MCP Apps extension`
- TO: `### Requirement: Thirteen tools name an MCP view through the MCP Apps extension`

## MODIFIED Requirements

### Requirement: Thirteen tools name an MCP view through the MCP Apps extension

The MCP server SHALL register nine MCP view kinds through `@modelcontextprotocol/ext-apps`, each of type
`text/html;profile=mcp-app`: `ui://carlnotes/search.html`, `ui://carlnotes/topic.html`, `ui://carlnotes/findings.html`,
`ui://carlnotes/suggest-topics.html`, `ui://carlnotes/updates.html`, `ui://carlnotes/scan.html`,
`ui://carlnotes/news.html`, `ui://carlnotes/topic-posts.html`, and `ui://carlnotes/topic-post.html`. `search` SHALL
name the search MCP view, `edit_topic`, `create_topic`, and `send_to_topic` the topic MCP view, `read_topic_feed` and
`search_topic_findings` the findings MCP view, `suggest_topics` the suggestion MCP view, `read_updates` the updates
MCP view, `start_scan` and `read_scan_status` the scan MCP view, `read_news` the news MCP view, `read_topic_posts` the
topic posts MCP view, and `read_topic_post` the topic post MCP view, in `_meta.ui.resourceUri`. No other tool SHALL name
an MCP view. Preferred UI resource URIs append the current `?v=` version. Unversioned aliases and versions two through
nine remain readable for cached connections, and each stored version stays readable from its own bundle. Every tool,
with an MCP view or without, SHALL return its full structured result and a readable text summary, so a client that
renders no MCP view reads the same result it reads today.

#### Scenario: A client lists the UI resources

- **WHEN** a client lists the server's resources
- **THEN** it receives the nine preferred versioned UI resources, their unversioned aliases, and each stored version,
  each of type `text/html;profile=mcp-app`

#### Scenario: A tool names its MCP view

- **WHEN** a client lists tools
- **THEN** `search` names `ui://carlnotes/search.html`, `edit_topic`, `create_topic`, and `send_to_topic` name
  `ui://carlnotes/topic.html`, `read_topic_feed` and `search_topic_findings` name `ui://carlnotes/findings.html`,
  `suggest_topics` names `ui://carlnotes/suggest-topics.html`, `read_updates` names `ui://carlnotes/updates.html`,
  `start_scan` and `read_scan_status` name `ui://carlnotes/scan.html`, `read_news` names `ui://carlnotes/news.html`,
  `read_topic_posts` names `ui://carlnotes/topic-posts.html`, and `read_topic_post` names
  `ui://carlnotes/topic-post.html`

#### Scenario: A client without MCP views reads the same result

- **WHEN** a client that renders no MCP view calls each tool that names an MCP view
- **THEN** each result has its structured content and its text summary, the same with or without the UI resource
  registered

### Requirement: Each MCP view opens at its own route

Each MCP view SHALL have one route in a memory router: `/search`, `/topic`, `/findings/:topicId`, `/send`,
`/updates`, `/brew/:topicId`, `/news`, `/posts/:topicId`, and `/post/:topicPostId`. The initial route SHALL come from
the MCP view name in the html and, where the route has a Topic or a Topic Post, from the tool result. Every version of a
UI resource SHALL open on these routes.

#### Scenario: The html picks the route

- **WHEN** a host loads `ui://carlnotes/findings.html` and sends a `read_topic_feed` result
- **THEN** the MCP view opens at `/findings/` with that result's Topic

#### Scenario: An older alias opens the current route

- **WHEN** a host reads an unversioned alias of a UI resource
- **THEN** the MCP view opens on the same route as the preferred version
