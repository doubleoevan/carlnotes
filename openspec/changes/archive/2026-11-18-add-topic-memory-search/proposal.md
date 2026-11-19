## Why

A brew can follow a public lead from an earlier Finding while preserving all five searches based on the Topic brief. Readers also need an open Topic page to reflect films becoming available and episodes they remove.

## What Changes

- Offer one extra public web search. Use saved rating notes to choose among source-backed options.
- Show a newly published film on the open Topic page and reserve the title space during loading.
- Dismiss the episode confirmation and hide both season rows as soon as the reader confirms removal.

## Capabilities

### Modified Capabilities

- `source-ingestion` covers the sixth search and its evidence boundary.
- `topic-video-player` covers publication during viewing and the loading card.
- `podcast-episode-pages` covers removal feedback.

## Impact

The worker uses the existing Exa and LiteLLM connections. Web and Expo share the film loading and removal behavior. A Scan-scoped database row records paid search results for retries. The API contracts stay the same.
