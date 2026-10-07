## MODIFIED Requirements

### Requirement: One "Add to AI" option in the page header action menu
The search bar's actions menu SHALL show on every page with one option labeled "Add to AI", including a public Topic
page seen by a visitor. The label SHALL never change. A page MAY set the server it installs. A page that sets none
installs the server at `/mcp`. The Topic page SHALL set its topic-bound server at `/mcp/t/<topicId>` with a name that
includes the Topic's name.

#### Scenario: The option appears for a visitor on a public Topic
- **WHEN** a visitor opens the action menu on a public Topic page
- **THEN** it shows the Add to AI option, and the dialog it opens names that Topic's server

#### Scenario: An app page installs the server at `/mcp`
- **WHEN** a user opens the action menu on the home page
- **THEN** the Add to AI option's dialog offers the `/mcp` url

#### Scenario: A page that registers no actions still has the menu
- **WHEN** a user opens the actions menu on the plans page
- **THEN** it shows the Add to AI option
