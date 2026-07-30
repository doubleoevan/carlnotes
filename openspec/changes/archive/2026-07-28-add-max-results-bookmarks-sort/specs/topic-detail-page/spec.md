## ADDED Requirements

### Requirement: The info card shows the Max results row
The topic info card SHALL show a "Max results" row rendering "Carl's top {max_results}" through the same shared info component its other rows use, with wording identical to the edit-topic modal's select.

#### Scenario: The row reflects the stored value
- **WHEN** a topic with `max_results` 15 renders its info card
- **THEN** a "Max results" row reads "Carl's top 15"

### Requirement: The topic page carries the same filter and sort as the feed
The topic page SHALL honor the same All / Unread / Bookmarked view — set through the shared search bar's Filters menu — and offer the same "Sort" menu (relevant / newest / trending) as the homepage feed, with the pinned bookmark group above the auto-kept Findings in every mode.

#### Scenario: The topic page sorts and filters like the feed
- **WHEN** a user switches the sort or filter on a topic page
- **THEN** the findings section behaves exactly as the homepage feed does for that mode
