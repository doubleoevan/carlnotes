## ADDED Requirements

### Requirement: A scan prunes the topic to its max results, sparing bookmarks
After a scan writes its Findings, curation SHALL keep only the topic's top `max_results` Findings by relevance score and delete the rest, except Findings bookmarked by any user, which are never pruned. A lowered `max_results` takes effect at the next scan; editing the value never deletes rows on its own.

#### Scenario: The prune keeps the top of the ranking
- **WHEN** a scan finishes on a topic with more unbookmarked Findings than its `max_results`
- **THEN** only the top `max_results` by relevance score remain, plus every bookmarked Finding

#### Scenario: Editing max results does not delete rows
- **WHEN** an owner lowers a topic's `max_results`
- **THEN** no Finding is deleted until the topic's next scan prunes to the new value
