## MODIFIED Requirements

### Requirement: The page's own tags are the preview

The preview SHALL be read from the page's meta tags with Bun's `HTMLRewriter`, adding no html-parsing dependency. `og:title`, `og:description`, and `og:image` SHALL be preferred where the page published them, with `<title>` and `<meta name="description">` standing in where it did not. A meta tag naming no content SHALL be ignored.

Title and description SHALL have their html entities read as the characters they stand for, since neither path the parser offers decodes them: a `<title>`'s text arrives as the page's own bytes, and an attribute is handed back as written. A title holding an apostrophe would otherwise be stored and rendered as `a topic&#39;s findings`. Both the numeric forms and the named entities a page is likely to write SHALL be decoded, and a sequence that names no entity SHALL be left as the page wrote it.

Title and description SHALL have their whitespace collapsed and their length limited, so one page cannot store an essay against every room that links it. A page offering neither a title nor a description SHALL be recorded as a failure instead of stored as an empty card.

An `og:image` written relative to its page SHALL be resolved against the page it was named on.

#### Scenario: OpenGraph tags win where the page set them

- **WHEN** a page publishes both `og:title` and a plain `<title>`
- **THEN** the card shows the OpenGraph value

#### Scenario: A page with no OpenGraph tags still gets a card

- **WHEN** a page publishes only `<title>` and `<meta name="description">`
- **THEN** the card shows those, with no image

#### Scenario: An entity is read as the character it names

- **WHEN** a page's title or description holds an html entity, in either the OpenGraph attribute or the plain `<title>`
- **THEN** the stored value holds the character it names rather than its markup

#### Scenario: A page offering nothing is a failure, not an empty card

- **WHEN** a page has neither a title nor a description
- **THEN** a failure is recorded and no card renders

#### Scenario: A page that is not html has nothing to read

- **WHEN** a previewed url answers with a content type other than html
- **THEN** the fetch fails closed and no card renders
