# topic-feed-state Specification

## Purpose
Keep web and mobile Feed reads, ordering, filters, refreshes, and Finding actions consistent through one platform-independent state implementation.

## Requirements

### Requirement: Both apps use one universal Feed state implementation

Web and mobile SHALL share the Feed query, finding filter, sort, Resource-kind selection, tag selection and match mode, bookmark scope, refresh state, and Finding handlers. The shared implementation SHALL import no app, router, DOM, native platform, server package, or platform runtime global. Each app SHALL supply its navigation and presentation behavior.

#### Scenario: The universal boundary holds

- **WHEN** the shared Feed state and both adapters pass the package boundary check
- **THEN** the shared implementation has no platform-specific import or global, and both apps use that implementation

### Requirement: Feed queries remain isolated by signed-in identity

A Feed read SHALL include consumed Findings and SHALL be keyed by the requesting user's identity. A visitor's server-loaded Feed SHALL seed only the visitor query. A user SHALL never receive another identity's cached Feed or visitor loader data as their initial Feed.

#### Scenario: A visitor's page hydrates

- **WHEN** a visitor opens a server-rendered homepage
- **THEN** the first browser render shows the same Feed and skips the immediate redundant refetch for 60 seconds

#### Scenario: Signing in changes the cache identity

- **WHEN** the session changes from visitor to user A or from user A to user B
- **THEN** the active Feed query uses the new identity and never seeds itself from the previous identity's data

### Requirement: Filters and sorts retain the existing Feed rules

The default view SHALL be All, relevance sort, all Resource kinds, no selected tags, Any tag matching, and Mine bookmark scope. Shared rules SHALL preserve unread filtering, bookmark pinning, deterministic ordering, Featured order, trending Topic order, and exclusion of thumbs-down Findings. Tag modes and the empty Resource-kind selection reset SHALL retain their web behavior.

#### Scenario: The same Findings have the same order

- **WHEN** web Home, mobile Home, and a Topic screen show the same Findings under the same sort
- **THEN** their common Findings have the same relative order, with the user's bookmarks pinned first

#### Scenario: Resource-kind and tag behavior survives extraction

- **WHEN** the user toggles the last selected Resource kind off or changes a tag match mode
- **THEN** kinds reset to all, and Any, All, Exclude, and Off produce the web's existing results without fetching

#### Scenario: The app reports a navigation reset

- **WHEN** an app reports a navigation reset to its Home and Topic Feed state
- **THEN** that Feed's filters and sort return to their defaults without the shared state reading a router; retained Search filters remain independent

#### Scenario: Opening a search result preserves Search selections

- **WHEN** a user opens a Topic from Search and returns through the logo
- **THEN** Search retains its query, sort, and filters; pressing the logo from Search clears that state and returns Home

### Requirement: Reheat reports a completed refresh

A reheat SHALL expose its pending state and reload the Feed. A mobile Topic refresh SHALL also reload that Topic's page payload. The refresh generation SHALL advance only after the required reads succeed, and pending state SHALL clear after success or failure. A failed refresh SHALL retain the last successfully loaded data.

#### Scenario: Refresh succeeds

- **WHEN** a reheat completes successfully
- **THEN** the new data replaces the prior data, the refresh generation advances once, and pending state clears

#### Scenario: Refresh fails with cached data

- **WHEN** a required refresh read fails
- **THEN** pending state clears, the generation stays unchanged, and the previous data remains available

### Requirement: Shared Finding handlers support reversible optimistic actions

Mobile rating, bookmark, consumed, and open actions SHALL use the shared handlers. Mobile SHALL show an immediate tentative change and remove it on request failure. Successful actions SHALL reconcile both the home Feed and the affected Topic. A failure SHALL be observable to the shared handler, and existing callers of the client helpers SHALL retain their default error behavior.

#### Scenario: An action fails

- **WHEN** a mobile user bookmarks, consumes, or rates a Finding and the request rejects or returns an unsuccessful status
- **THEN** the tentative change disappears, the saved state returns, and the existing failed-save message is shown

#### Scenario: Independent actions settle out of order

- **WHEN** actions on different Findings overlap and one fails
- **THEN** rollback affects only the failed action and preserves the other Finding's successful change

#### Scenario: A down rating is tentative until saved

- **WHEN** a mobile user rates a Finding down
- **THEN** it immediately leaves the visible Feed and its counts, and returns if saving fails

### Requirement: Extracting shared state preserves web behavior

The web adapter SHALL preserve server hydration, pathname resets, the provider's existing consumers, reheat presentation, header behavior, filter and sort labels, and Finding actions. Mobile's optimistic presentation SHALL be configurable without changing the web's current action timing or adding mobile controls to web pages.

#### Scenario: Existing web interactions run after extraction

- **WHEN** a visitor or user opens Home or a Topic, changes filters and sort, reheats, or acts on a Finding
- **THEN** the web retains its prior markup, navigation, authorization, ordering, and action behavior
