# Proposal

## Why

Carl's Scans are separate snapshots, so later scores and discussions can miss what the topic has already learned. A Journal lets readers see those takeaways and gives owners and team leads a way to correct them.

## What Changes

- Update takeaways from public Finding evidence after successful Scans and provide a bounded historical backfill.
- Use ranked Topic Memories in review, Coffee Break scripts, and Topic Post Discussions.
- Add a paginated 📙 Journal to the Brew diary on web and Expo. Authorized raters can confirm, reject, or send Carl a correction.
- Expose the same authorized read to MCP.

## Capabilities

### New Capabilities

- `topic-memories` — Topic Memory creation, retrieval, and feedback.

### Modified Capabilities

- `scan-history` — count entries and takeaways. Place the Journal beside the counts.
- `mcp-server` — register the read-only Topic Memory tool.

## Impact

The change adds tables and a migration, Temporal work, prompt inputs, an API and MCP read, a feedback write, and a shared client flow with Nightshift adapters.
