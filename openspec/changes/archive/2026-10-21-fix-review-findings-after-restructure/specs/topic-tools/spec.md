## ADDED Requirements

### Requirement: A tool description speaks to the client and names no internal identifier

Every MCP tool description SHALL be written for the program and the person reading the tool list: it SHALL address the
caller as "you" and SHALL include no identifier from the code, no variable, type, or parameter name such as
`toolCaller`. The `list_topics` description SHALL say the topics you may read: the public ones for everyone, plus what a
connected account owns, follows, and holds through a team.

#### Scenario: The list_topics description names no identifier

- **WHEN** a client lists tools
- **THEN** the `list_topics` description says "you" where it names the caller, and no description includes `toolCaller`
  or another identifier from the code
