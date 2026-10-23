## MODIFIED Requirements

### Requirement: The search bar finds podcast episodes by title and by meaning

The search bar SHALL offer Podcasts as a result type in its filters, on by default like the others. Each Podcasts row
SHALL show the Podcast Episode's title and its Topic's name, and SHALL link to the Podcast Episode's page. Podcast
Episodes SHALL be found through the one site search, behind the search bar's debounce, only for a query of at least the
search bar's minimum length, with no route of their own. The site search SHALL read up to its per-kind limit of
published Podcast Episodes the caller may see: the Podcast Episodes whose title matches the query first, then those
whose description matches, then the nearest by meaning, with no Podcast Episode listed twice, and SHALL rank them among
the other kinds, a title match by its match tier and a description or meaning match in the last tier. A query under
three characters SHALL get its title and description matches alone, with no embedding.

#### Scenario: A title match comes before a description match

- **GIVEN** a published Podcast Episode whose description contains "agents" and another whose title contains it
- **WHEN** a user searches "agents"
- **THEN** the title match is listed first, then the description match

#### Scenario: A word in no title finds an episode by its subject

- **GIVEN** a published Podcast Episode about language models whose title and description never say "LLM"
- **WHEN** a user searches "LLM"
- **THEN** the Podcast Episode is listed as a Podcasts row, found by meaning

#### Scenario: A two-character query matches text alone

- **WHEN** a user searches "ai"
- **THEN** the search returns the Podcast Episodes whose title or description contains "ai", and embeds nothing

#### Scenario: A short query searches nothing

- **WHEN** a user types one character
- **THEN** no search is sent
