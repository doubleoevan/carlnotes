## MODIFIED Requirements

### Requirement: removeTopicSource is scoped to the Topic and idempotent
`removeTopicSource` SHALL delete a Source only when the row belongs to the Topic, SHALL return saved for a row already
gone, and SHALL return missing for a source id that belongs to another Topic. It SHALL keep the Topic's web search,
which only the topic editor turns off, and return `webSearch` for it. It SHALL keep a Topic's last Source and return
`lastSource`, counting the Topic's Sources under a lock on the Topic row, so two removals at once never leave the Topic
with none. The chat, the MCP `remove_source` tool, and the topic page's remove route SHALL each say which rule kept the
Source.

#### Scenario: Another Topic's source cannot be removed through this one
- **WHEN** `removeTopicSource` names a source id held by a different Topic
- **THEN** it returns missing and that Source still exists

#### Scenario: removeTopicSource keeps web search
- **WHEN** `removeTopicSource` names a Topic's web search Source
- **THEN** it returns `webSearch`, the Source still exists, and the topic editor can still turn web search off
- **AND** a chat removal's toast reads "Carl couldn't remove web search."

#### Scenario: A Topic keeps its last Source
- **GIVEN** a Topic with one Source
- **WHEN** `removeTopicSource` names that Source
- **THEN** it returns `lastSource` and the Source still exists

#### Scenario: Two removals at once leave one Source
- **GIVEN** a Topic with two Sources
- **WHEN** two removals of different Sources run at once
- **THEN** one removes its Source and the other returns `lastSource`

#### Scenario: Two removals of the same Source both return saved
- **GIVEN** a Topic with two Sources
- **WHEN** two removals of the same Source run at once
- **THEN** one deletes it, the other finds the row gone under the Topic row's lock and returns saved, and the Topic
  keeps its other Source
