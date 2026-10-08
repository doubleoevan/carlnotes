## ADDED Requirements

### Requirement: updateTopicFields turns a Topic's podcast on and off on any plan

The `updateTopicFields` Topic Tool SHALL take an optional podcast setting beside the Topic's other settings, check edit
rights through the same gate, and write it with the other named fields. The chat adapter and the MCP adapter SHALL offer
it through the same tool, so the chat proposes it on the same card, the user confirms it, and the same toast reports the
save, with no flow of its own. The edit topic modal's podcast switch SHALL save through the same tool.

Turning the podcast on or off SHALL be allowed on every plan for a user who may edit the Topic. If the speech model is
set empty, the tool SHALL NOT offer the setting.

#### Scenario: Carl turns a Topic's podcast off

- **WHEN** an owner asks Carl in chat to turn the Topic's podcast off and confirms the proposal
- **THEN** the setting is saved, the toast reports it, and the Topic's next Scan records no Podcast Episode

#### Scenario: The MCP server changes the same setting

- **WHEN** an MCP client calls the settings tool with the podcast setting for a Topic that its user may edit
- **THEN** the setting is saved through the same tool, and the result names the Topic

#### Scenario: A free Topic with a Podcast Episode turns its podcast on

- **GIVEN** a Topic on the free plan with one published short Podcast Episode and its podcast off
- **WHEN** the owner asks to turn the podcast on
- **THEN** the setting is saved, and the Topic's next Scan records a short Podcast Episode that replaces the published
  one

#### Scenario: A member without edit rights

- **WHEN** a user who may not edit the Topic calls the tool with the podcast setting
- **THEN** the gate rejects it and nothing is written

#### Scenario: No speech model, no setting

- **WHEN** the tool's fields are listed on an instance with the speech model set empty
- **THEN** the podcast setting is not among them

## REMOVED Requirements

### Requirement: updateTopicFields turns a Topic's podcast on and off

**Reason**: The free plan no longer runs out of Podcast Episodes, so turning the podcast on has no plan rejection.

**Migration**: See "updateTopicFields turns a Topic's podcast on and off on any plan". The tool's `podcastPlan` result
and the api's 402 response for it are removed.
