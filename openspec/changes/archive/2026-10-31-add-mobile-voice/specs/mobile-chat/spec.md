# mobile-chat Specification

## MODIFIED Requirements

### Requirement: Deferred media stays outside native text chat

This capability SHALL leave voice input, spoken answers, and the podcast question controls to the `mobile-voice`
capability. Existing attachments in history SHALL render as named chips. Unsupported media SHALL NOT prevent reading
or continuing a supported conversation.

#### Scenario: History includes attachments or spoken content
- **WHEN** that conversation opens on mobile
- **THEN** available message text remains readable and attachment names appear as chips
- **AND** a spoken turn reads as text with the answering host's play button
