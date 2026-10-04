## ADDED Requirements

### Requirement: updateTopicFields turns a Topic's podcast on and off

The `updateTopicFields` Topic Tool SHALL take an optional podcast setting beside the Topic's other settings, check edit
rights through the same gate, and write it with the other named fields. The chat adapter and the MCP adapter SHALL offer
it through the same tool, so the chat proposes it on the same card, the user confirms it, and the same toast reports the
save, with no flow of its own. The edit topic modal's podcast switch SHALL save through the same tool.

Turning the podcast off SHALL always be allowed for a user who may edit the Topic. Turning it on SHALL ask the gate
whether the Topic may render a Podcast Episode. On a Topic on the free plan that has used its one Podcast Episode, the
tool SHALL write nothing and SHALL return a plan rejection, the kind of result it already returns for a daily frequency
that the plan cannot hold. If the speech model is set empty, the tool SHALL NOT offer the setting.

#### Scenario: Carl turns a Topic's podcast off

- **WHEN** an owner asks Carl in chat to turn the Topic's podcast off and confirms the proposal
- **THEN** the setting is saved, the toast reports it, and the Topic's next Scan renders no Podcast Episode

#### Scenario: The MCP server changes the same setting

- **WHEN** an MCP client calls the settings tool with the podcast setting for a Topic that its user may edit
- **THEN** the setting is saved through the same tool, and the result names the Topic

#### Scenario: A Topic on the free plan that used its Podcast Episode cannot turn it on

- **GIVEN** a Topic on the free plan with one published Podcast Episode and its podcast off
- **WHEN** the owner asks to turn the podcast on
- **THEN** nothing is written and the result is the plan rejection

#### Scenario: A member without edit rights

- **WHEN** a user who may not edit the Topic calls the tool with the podcast setting
- **THEN** the gate rejects it and nothing is written

#### Scenario: No speech model, no setting

- **WHEN** the tool's fields are listed on an instance with the speech model set empty
- **THEN** the podcast setting is not among them

### Requirement: A topic draft holds the podcast setting

The topic draft SHALL hold whether the new Topic's podcast is on. On an instance with a speech model, the new-topic
chat's draft tool SHALL start it on and SHALL take it as a field, so Carl can turn a new Topic's podcast off before the
Topic exists. The MCP create tool SHALL take the same field, and the create SHALL save it, with a Topic whose draft left
it out starting with its podcast on. The card that shows a new Topic's draft and the card that previews a change to a
saved Topic SHALL both read the podcast setting from the draft they show. If the speech model is set empty, the draft
tool SHALL NOT offer the setting and neither card SHALL show it.

#### Scenario: Carl turns a new Topic's podcast off

- **WHEN** a user asks Carl in the new-topic chat for a Topic without a podcast
- **THEN** the draft's card shows the podcast off, and the Topic it creates has its podcast off

#### Scenario: A new Topic's podcast starts on

- **WHEN** Carl writes a new Topic's draft on an instance with a speech model
- **THEN** the draft's card shows the podcast on

#### Scenario: No speech model, no podcast in the draft

- **WHEN** Carl writes a new Topic's draft on an instance with the speech model set empty
- **THEN** the draft has no podcast setting, and its card shows none
