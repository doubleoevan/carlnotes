## ADDED Requirements

### Requirement: A url fetch failure is reported by its cause

A url attachment's fetch SHALL turn only a host rejection, a response the page's host answered with an error status,
into an `AttachmentValidationError` naming the url, which the api responds to with a 400 that tells the owner the page
could not be read. Any other failure, a missing `FIRECRAWL_API_KEY`, a network error, or a fault inside the fetch
itself, SHALL be rethrown unchanged, so the api reports a server error and the fault is logged as the app's own, never
shown to the owner as a problem with their url.

#### Scenario: A host that refuses the page is the owner's to see

- **WHEN** the page's host answers the fetch with an error status
- **THEN** ingestion fails with an `AttachmentValidationError` naming the url, nothing is stored, and the api responds
  400 saying the page could not be read

#### Scenario: An infrastructure fault is rethrown

- **WHEN** the fetch fails because `FIRECRAWL_API_KEY` is unset or the network is down
- **THEN** the original error is rethrown unchanged, nothing is stored, and the api responds with a server error instead
  of a 400 that names the owner's url
