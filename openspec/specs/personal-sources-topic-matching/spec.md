# personal-sources-topic-matching Specification

## Purpose
Define how a sent item ranks a user's editable Topics, so a Topic's name and prompt lead the match and attachment
context supports it, on every Personal sources path that routes content.

## Requirements

### Requirement: A Topic's name and prompt lead its match

The matcher SHALL score content against a Topic's name and prompt as one text, and against its ready attachment context
as another. A Topic's relevance SHALL be its name and prompt score, plus the attachment score weight times how far its
attachment score exceeds it. An attachment score at or below the name and prompt score SHALL add nothing.

#### Scenario: A Topic with no attachment

- **WHEN** a Topic has no ready attachment context
- **THEN** its relevance is its name and prompt score

#### Scenario: A weak attachment never lowers a Topic

- **WHEN** a Topic's attachment context scores below its name and prompt
- **THEN** its relevance is its name and prompt score

### Requirement: A long attachment cannot outweigh a Topic's purpose

Attachment context SHALL support a Topic without replacing its purpose. An attachment SHALL raise a Topic by the
attachment score weight times how far its score passes the Topic's own name and prompt score, whatever the attachment's
length. The labeled ranking cases SHALL rank a Topic whose own name and prompt match the content above a Topic only its
attachment matches.

#### Scenario: A development chat routes to the documentation Topic

- **GIVEN** "CarlNotes Documentation", and "How do I use NachoNacho", whose prompt concerns SaaS discounts and whose
  long attachment describes the CarlNotes architecture
- **WHEN** a CarlNotes development chat asks for routing suggestions
- **THEN** "CarlNotes Documentation" ranks first

#### Scenario: An unrelated long attachment

- **GIVEN** a marathon training Topic with a long Kubernetes attachment, and a Kubernetes Topic with none
- **WHEN** content about Kubernetes upgrades is matched
- **THEN** the Kubernetes Topic ranks first

### Requirement: An attachment that clarifies a Topic still helps

Attachment context SHALL raise a Topic whose name and prompt are vague and whose attachment states what it covers.

#### Scenario: A vague project Topic

- **GIVEN** a Topic named "Project Atlas" with a short prompt and an attachment describing its subject
- **WHEN** content on that subject is matched against it and against an unrelated Topic
- **THEN** "Project Atlas" ranks first

### Requirement: Every routing path shares one ranking

`suggest_topics` and email filing SHALL read the same relevance. Name hints SHALL keep their boost over that relevance,
and a hint SHALL NOT help a Topic clear the minimum suggested relevance.

#### Scenario: A picker and an email agree

- **WHEN** the same content is matched for the picker and for an email
- **THEN** both list editable Topics in one order, apart from an email's name hints

#### Scenario: A hint does not force a Topic

- **WHEN** an email names a Topic in its subject and the content does not relate to it
- **THEN** the Topic does not clear the minimum filing relevance

### Requirement: Labeled evidence sets the attachment score weight and the minimum relevances

A labeled ranking eval SHALL report the top match rate, each Topic's clearance of the minimum relevances, and the best
score of a no-match case. The attachment score weight, the minimum suggested relevance, and the minimum filing relevance
SHALL each hold a value that this eval measured, and a change to any of them SHALL rerun it.

#### Scenario: A weight changes

- **WHEN** a change edits the attachment score weight or a minimum relevance
- **THEN** the eval's report in that change shows the top match rate and the no-match bound for the new value

### Requirement: Matching keeps its permissions, paging, and privacy

Only the matching score SHALL change. Matching SHALL still consider editable Topics alone, page by a stable cursor,
filter by literal name search, recheck each result before it returns, and store no sent text or vector. Personal sources
content SHALL stay out of Topic evidence. The picker and the numbered text list SHALL look and behave as they did.

#### Scenario: Attachment text changes during a match

- **WHEN** a Topic's prompt or attachment context changes between the read and the final recheck
- **THEN** the match returns unavailable

#### Scenario: Following grants no destination

- **WHEN** a user follows a public Topic they cannot edit
- **THEN** that Topic is not a candidate

#### Scenario: A later page is stable

- **WHEN** a client follows a cursor through a ranked picker
- **THEN** each Topic appears exactly once, and only the first page marks best matches
