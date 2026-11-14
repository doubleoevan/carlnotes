## ADDED Requirements

### Requirement: A chat turn sends its response headers before retrieval

A chat turn's response SHALL send its headers before the turn's retrieval starts, so a slow query embedding shows as a
slow first word and never as a request that sent nothing. The checks that reject a turn, its session, its budget, and
the chat cutoff, SHALL still run before the headers and SHALL still answer with their own status.

#### Scenario: A slow embedding delays the first word alone

- **WHEN** the embedding of a turn's question takes 20 seconds
- **THEN** the response's headers reached the client before retrieval began, and the reply streams once retrieval ends

#### Scenario: A rejected turn keeps its status

- **WHEN** a turn is rejected because the user's budget is spent
- **THEN** the response is that rejection with its own status, and no stream opens
