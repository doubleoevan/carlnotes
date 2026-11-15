## MODIFIED Requirements

### Requirement: The updates MCP view shows the list

The updates MCP view SHALL show the recap, each Finding with its Topic and reading time, and the more link in one card,
from the `read_updates` result. Each Finding SHALL be a row of the findings table, with its favicon, source, date,
chapter pill, notes, and controls. The rows' Topics and podcast episodes SHALL reach the MCP view in its data. The more
link SHALL open on the site. An empty list SHALL show the empty state.

#### Scenario: The list renders

- **WHEN** a host renders a `read_updates` result
- **THEN** the MCP view shows the recap, the rows in ranked order, and the more link, and makes no tool call on load

#### Scenario: A list with no opener

- **WHEN** the result has no recap
- **THEN** the rows render with nothing in the recap's place
