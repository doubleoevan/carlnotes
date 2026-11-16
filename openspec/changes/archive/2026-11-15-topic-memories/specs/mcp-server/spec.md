## ADDED Requirements

### Requirement: MCP can read a Topic's Journal

The server SHALL advertise `read_topic_memories` as a paginated read. It SHALL apply Topic visibility before reading takeaways.

#### Scenario: A visitor requests a private Topic's takeaways

- **WHEN** the visitor calls the tool for that Topic
- **THEN** the tool withholds its takeaways
