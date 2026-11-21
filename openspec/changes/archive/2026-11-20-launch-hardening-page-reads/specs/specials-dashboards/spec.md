## ADDED Requirements

### Requirement: A Dashboard page arrives in one page read

`GET /api/dashboards/:dashboardKind/:subjectId/page` SHALL return the page's head with the public summary and the
default selection's series. A visitor's read SHALL be served from the page's 60-second copy, as the page-reads
capability states, and the copy SHALL be cleared wherever the Dashboard's edge tag is purged. The browser SHALL draw the
default charts from the payload, and SHALL read any other selection on its own.

#### Scenario: A Dashboard page's render is one request, and the browser reads nothing again

- **WHEN** the server renders a person's Topic Dashboard and the visitor's browser hydrates it
- **THEN** the loader sent the page read alone, where it sent the head and the default selection as two, and the browser
  sends no read of the default selection

#### Scenario: Another selection is its own read

- **WHEN** a reader switches the charts from Topics to Posts
- **THEN** the page reads that selection from the Dashboard's data route, and the page read is not sent again

#### Scenario: A privacy change still takes effect at once

- **WHEN** an owner makes a public Topic private
- **THEN** the Dashboard's page copy is cleared with its edge tag, and the next page read no longer counts the Topic

#### Scenario: The owner's full data is never copied

- **WHEN** the owner reads their own Dashboard's page read
- **THEN** the full data is read from the database and stored in no copy, and the head is still built from the public
  dashboard

#### Scenario: A render skips the read limit

- **WHEN** visitors' renders of many Dashboard pages read their page reads inside a minute
- **THEN** none counts against the Dashboard read limit, as the request-capacity capability states
