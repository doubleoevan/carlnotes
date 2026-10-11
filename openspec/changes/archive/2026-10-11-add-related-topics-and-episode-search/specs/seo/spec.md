## MODIFIED Requirements

### Requirement: A paged list holds up to fifty rows for a reader without JavaScript

A server-rendered public page SHALL hold up to fifty rows of each of its paged tables and lists in its HTML, and show a
browser the page size the component chooses, hiding the rest with JavaScript: the homepage's Featured and Popular
sections, a public topic page's findings, scan history, podcast episodes, and Similar topics, a public podcast episode
page's Other episodes and Similar podcasts, the topic table of a public team page and of a profile page, a team page's
members, and a page's notes. The server and the browser SHALL render the same markup,
so the page a crawler indexes is the page a visitor sees, and no reader SHALL be told apart by its user agent.

#### Scenario: A reader without JavaScript sees a topic's findings whole

- **GIVEN** a public Topic with twenty Findings
- **WHEN** a client with no JavaScript fetches its page
- **THEN** all twenty Findings are in the HTML, and a browser sees five with an expander

#### Scenario: A browser keeps its page sizes

- **WHEN** a browser fetches the same page
- **THEN** each table shows the component's own page size, with page links for the rest
