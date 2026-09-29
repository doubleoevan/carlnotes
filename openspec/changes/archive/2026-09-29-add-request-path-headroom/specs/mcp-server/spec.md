## MODIFIED Requirements

### Requirement: Results fit the client's limit, Findings whole or not at all
Every list result SHALL paginate with an opaque cursor and include a next cursor when more remains. A page SHALL be packed under a character budget well inside a client's result limit of about 30,000 tokens, adding Findings in order until the next would overflow and always including at least one. A Finding SHALL never be returned with a truncated relevance explanation. Trimming returns fewer Findings. Results SHALL include structured content beside their text.

#### Scenario: A large feed pages
- **WHEN** a Topic holds more Findings than fit one page
- **THEN** the first result holds as many whole Findings as fit and a next cursor, and following the cursor returns the rest

#### Scenario: Trimming moves a whole Finding to the next page
- **WHEN** the next Finding's full explanation would overflow the page's character budget
- **THEN** the page ends before it and that Finding leads the next page, intact

#### Scenario: A feed past the topic page's read limit still pages to its end
- **WHEN** a Topic has more Findings than the topic page's read limit
- **THEN** following the cursor returns every Finding
