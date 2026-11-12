## ADDED Requirements

### Requirement: A topic's own CarlNotes pages are never its Findings

The review SHALL drop every discovered Resource whose url is the topic's own page on CarlNotes, or a page after it: on
carlnotes.com, www.carlnotes.com, or the app's configured host, at `/topics/<the topic's id>` or a path after it. The
drop SHALL happen before any stage that is paid for. Other CarlNotes pages, such as the docs, the release notes, and
another topic's pages, SHALL be reviewed like any other page.

#### Scenario: A topic's own podcast episode page is dropped

- **WHEN** a Scan of a topic discovers that topic's podcast episode page on carlnotes.com
- **THEN** the page is not reviewed, scored, or kept as a Finding

#### Scenario: The docs are still reviewed

- **WHEN** a Scan discovers a CarlNotes docs page or the release notes
- **THEN** the page is reviewed like any other page

#### Scenario: Another topic's page is still reviewed

- **WHEN** a Scan of one topic discovers another topic's page on carlnotes.com
- **THEN** the page is reviewed like any other page
