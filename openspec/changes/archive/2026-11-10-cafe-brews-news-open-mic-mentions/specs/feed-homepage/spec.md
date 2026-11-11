# Spec Delta

## ADDED Requirements

### Requirement: The topic page counts its sections on a details line

The topic page SHALL show a details line directly under its byline and reactions, on the web and in the mobile app,
counting in order its films, podcast episodes, findings, Comments, Topic Posts, notes, and similar topics. Each count
SHALL be the number its section of the page lists for the reader: the latest season's films and podcast episodes,
the findings under the reader's feed filters, and the notes the reader may read. A count SHALL join the line once its
section loads.

#### Scenario: The line counts each section in order

- **WHEN** a user opens a topic with one film, 17 podcast episodes, 30 listed findings, four Comments and replies, two
  Topic Posts, five notes, and six similar topics
- **THEN** the line under the byline reads "1 film · 17 podcast episodes · 30 findings · 4 hot takes · 2 posts ·
  5 notes · 6 similar topics"

#### Scenario: An empty section is left out

- **WHEN** a visitor opens a public topic with no film, no Comment, and no similar topic
- **THEN** the line counts the podcast episodes, the findings, the Topic Posts, and the notes alone

#### Scenario: The findings count follows the feed filters

- **WHEN** a user whose feed filter shows unread findings opens a topic with 30 findings, seven of them unread
- **THEN** the line reads "7 findings", as the Topic findings section lists seven

#### Scenario: The notes join once they load

- **WHEN** a topic page opens before its notes load
- **THEN** the line shows its other counts, and the note count joins it once the notes section lists its notes
