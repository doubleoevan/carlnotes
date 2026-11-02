# Docs Site Spec Delta

## ADDED Requirements

### Requirement: Add to AI is a complete public MCP connection guide

The existing `/docs/account/add-to-ai/` page SHALL provide self-contained setup for Claude, ChatGPT, and coding agents using `https://carlnotes.com/mcp`. It SHALL explain OAuth sign-in and consent, public visitor access, connected-account permissions, disconnecting, and client availability restrictions. It SHALL remain public, searchable, and visible in the Account sidebar as the listing's documentation URL.

#### Scenario: A reader connects Claude or ChatGPT

- **WHEN** the reader follows either product's section
- **THEN** it names the product's current custom MCP connection flow, the server URL, authentication choice, and how to complete CarlNotes consent
- **AND** it links to official client instructions and explains that workspace settings can restrict access
- **AND** it does not require an approved CarlNotes directory listing

#### Scenario: A reader connects a coding agent

- **WHEN** the reader follows the coding-agent section
- **THEN** it provides executable Claude Code and Codex HTTP setup examples with their sign-in steps
- **AND** it retains the existing Cursor and VS Code Add to AI install guidance
- **AND** it requires no manually pasted access token or copied password

#### Scenario: A reader checks scope and disconnects

- **WHEN** the reader reviews sign-in and disconnection instructions
- **THEN** it distinguishes public reads from account actions and describes existing permission limits
- **AND** it links to the MCP privacy section and accurately states token revocation limits
- **AND** it identifies the Topic-bound endpoint as an optional existing endpoint without replacing the common install URL

#### Scenario: The page ships through the normal docs build

- **WHEN** the docs are built and served
- **THEN** the existing URL, Account sidebar entry, search entry, and internal links work
- **AND** the page remains eligible for the existing docs embedding sync

### Requirement: The MCP guide documents every advertised tool

The guide SHALL name each advertised tool and describe its purpose, required identity, permission restrictions, and relevant side effects. It SHALL explain pagination and limits, edit confirmations, and the search, topic, and findings cards with text fallback. Its tool inventory SHALL match the server without implying access to an assistant's history, memory, or uploaded files.

#### Scenario: A reader compares the guide with tools list

- **WHEN** a client lists the server's tools
- **THEN** the guide covers `list_topics`, `read_topic_feed`, `search_topic_findings`, `search`, `mark_finding_consumed`, `rate_finding`, `bookmark_finding`, `follow_topic`, `edit_topic`, `suggest_sources`, and `create_topic`
- **AND** it identifies allowance consumption, Topic creation's first Scan, and edits that need confirmation

#### Scenario: A client renders no MCP card

- **WHEN** a reader uses a client without MCP Apps support
- **THEN** the guide explains that tool text and structured results still work
- **AND** it does not promise identical card support across clients
