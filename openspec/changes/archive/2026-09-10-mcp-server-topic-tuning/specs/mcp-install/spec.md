## ADDED Requirements

### Requirement: One "Add to AI" option in the page header action menu
The page header's action menu SHALL show one option labeled "Add to AI" on every page that registers actions, including a public Topic page seen by a visitor. The label SHALL never change. A page MAY set the server it installs. A page that sets none installs the server at `/mcp`. The Topic page SHALL set its topic-bound server at `/mcp/t/<topicId>` with a name that includes the Topic's name.

#### Scenario: The option appears for a visitor on a public Topic
- **WHEN** a visitor opens the action menu on a public Topic page
- **THEN** it shows the Add to AI option, and the dialog it opens names that Topic's server

#### Scenario: An app page installs the server at `/mcp`
- **WHEN** a user opens the action menu on the home page
- **THEN** the Add to AI option's dialog offers the `/mcp` url

### Requirement: The option opens a dialog, never a nested menu
The option SHALL open a dialog listing Claude, ChatGPT, Gemini, Grok, Perplexity, DeepSeek, Cursor, VS Code, and Copy server URL, in that order, with no default action. Nothing SHALL open as a submenu.

#### Scenario: The providers read in order
- **WHEN** the dialog opens for the first time
- **THEN** it lists Claude, ChatGPT, Gemini, Grok, Perplexity, DeepSeek, Cursor, VS Code, and Copy server URL top to bottom and nothing is preselected

### Requirement: Cursor and VS Code install with one click from one function
Cursor and VS Code SHALL be one-click installs whose hrefs come from one function taking `{ name, url }`: `cursor://anysphere.cursor-deeplink/mcp/install?name=<name>&config=<base64 of {"url"}>` for Cursor and `vscode://mcp/install?<url-encoded {"name","url"} json>` for VS Code.

#### Scenario: The Cursor deeplink includes the server
- **WHEN** the function builds the Cursor link for a name and url
- **THEN** its `name` query is that name and decoding its `config` query yields json holding that url

#### Scenario: The VS Code deeplink includes the server
- **WHEN** the function builds the VS Code link for a name and url
- **THEN** decoding its query yields json holding that name and url

### Requirement: Claude and ChatGPT open paste instructions
Claude, ChatGPT, Gemini, Grok, Perplexity, and DeepSeek SHALL open short paste instructions with the server url and a copy control, and a provider with a terminal tool, Claude with Claude Code, SHALL add that tool's command in a box with its own copy control, named for the tool. Neither has a public install deeplink. Each instruction SHALL be a constant. A directory listing url replaces its steps once one is approved.

#### Scenario: Claude shows where to paste
- **WHEN** a reader picks Claude
- **THEN** the dialog shows the server url with a copy control, the steps to add a custom connector, and the Claude Code command with its own copy control

### Requirement: Copy server URL is always present and always last
Copy server URL SHALL always be in the dialog and always last, whatever was chosen before. Copying SHALL confirm with a toast.

#### Scenario: The copy option stays last after a remembered choice
- **WHEN** a reader chose Cursor on a previous visit and opens the dialog again
- **THEN** Cursor leads the list and Copy server URL is still last

### Requirement: The last choice is remembered and leads next time
The dialog SHALL remember the last chosen provider in the browser. On the next opening that provider SHALL lead and the others SHALL keep their order. The option label in the menu SHALL stay "Add to AI".

#### Scenario: A remembered provider leads
- **WHEN** a reader picked VS Code and later reopens the dialog
- **THEN** VS Code is the first option, Claude, ChatGPT, Gemini, Grok, Perplexity, DeepSeek, and Cursor follow in their order, and Copy server URL is last

### Requirement: Eyebrows stay plain and the body is Carl's
The menu option label and the provider names SHALL be plain labels, and the dialog title SHALL be the same display heading the Share topic dialog uses. The dialog's body line and the toasts MAY be in Carl's voice per the Persona and Voice page: short declaratives, no guilt, no sales.

#### Scenario: The voice is split by role
- **WHEN** the dialog renders
- **THEN** its title and provider options are plain labels and its one body line reads in Carl's voice
