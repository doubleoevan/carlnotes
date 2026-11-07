# Spec Delta

## ADDED Requirements

### Requirement: The findings MCP view shows a Finding's reactions

The findings MCP view SHALL show, in a Finding's expanded details, the same reaction row the web shows: the six
types, each with its count, and the caller's own marked. A press on a type SHALL call `save_reaction` through the
host, and the row SHALL show the result. The view SHALL mount no comment thread. The view SHALL have a story with
reactions and one with none.

#### Scenario: A Finding's reactions show in the view

- **WHEN** a host renders the findings MCP view from a feed result whose Finding has reactions
- **THEN** the expanded Finding shows the counts

#### Scenario: A press on a type calls the tool

- **WHEN** a connected user presses a type in the view
- **THEN** the view calls `save_reaction` with that Finding and type, and the count rises by one

#### Scenario: A visitor's press opens the site

- **WHEN** a user with no connected account presses a type in the view
- **THEN** the view opens the site's sign-up link through the host and saves nothing
