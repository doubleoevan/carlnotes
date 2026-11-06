## MODIFIED Requirements

### Requirement: The MCP guide documents every advertised tool

The guide SHALL name each advertised tool and describe its purpose, required identity, permission restrictions, and
relevant side effects. It SHALL give a table of example phrases for each tool, addressed to Carl or CarlNotes. It SHALL
explain pagination and limits, edit confirmations, and each MCP view with text fallback. Its tool inventory SHALL match
the server without implying access to an assistant's history, memory, or uploaded files.

#### Scenario: A reader compares the guide with tools list

- **WHEN** a client lists the server's tools
- **THEN** the guide covers `list_topics`, `read_topic_feed`, `search_topic_findings`, `search`,
  `mark_finding_consumed`, `rate_finding`, `send_finding_feedback`, `bookmark_finding`, `follow_topic`, `edit_topic`,
  `suggest_sources`, `create_topic`, `send_to_topic`, `suggest_topics`, `read_updates`, `start_scan`,
  `read_scan_status`, `stop_scan`, and `read_topic_context`
- **AND** it identifies allowance consumption, Topic creation's first Scan, a Scan's report and Podcast Episode, an
  updates list's consumptions, and edits that need confirmation

#### Scenario: A client renders no MCP view

- **WHEN** a reader uses a client without MCP Apps support
- **THEN** the guide explains that tool text and structured results still work
- **AND** it does not promise identical MCP Apps support across clients

#### Scenario: A reader looks for what to say

- **WHEN** a reader opens the tool section
- **THEN** every tool has at least one example phrase addressed to Carl or CarlNotes, such as "Carl, what's new" or
  "CarlNotes, brew this topic now"
