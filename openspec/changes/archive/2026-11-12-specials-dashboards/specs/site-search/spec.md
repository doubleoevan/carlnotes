## MODIFIED Requirements

### Requirement: The search page lists its results as the feed lists its findings

The page SHALL start with the home page's row of the Tags picker and the New Topic button, then a title naming how many
results the search found, such as 25 search results for "test", then the results as numbered rows in the feed's list
card, numbered across pages, with the numbered pages under them. Each row SHALL show its kind and link to its page on
the site: a Topic with its viewers and followers, the viewers labeled visitors, a Podcast Episode with its Topic, how
long ago it was published, and its listeners, a team with its topics and members, and a profile. A Topic row with a
published Podcast Episode, and a Podcast Episode row, SHALL have the play pill the feed uses. A Finding row SHALL be the
feed's own row, with its Topic after its age, and a click on it SHALL open the Finding's note, with Carl's notes, the
link to its page, and the rating, bookmark, and read controls the Finding's Topic allows the user, each change shown on
the row at once. While a new search loads, the page SHALL show skeleton rows; while another page of the same search
loads, the title's count and the page row SHALL stay, and the list SHALL show one skeleton row per result that page
holds. A search with no rows SHALL say so and name the kinds turned off. At 375 pixels wide the list SHALL fit with no
sideways scroll.

#### Scenario: A row links to its page

- **WHEN** a visitor clicks a team row on the search page
- **THEN** the team's page opens

#### Scenario: A finding opens its note

- **WHEN** a signed-in user who owns a Finding's Topic clicks the Finding's row and then Bookmark in its note
- **THEN** the note shows Carl's notes and the link to the Finding's page, and the row shows the bookmark at once

#### Scenario: The next page keeps the count

- **WHEN** a user on the first page of 14 results opens page 2
- **THEN** the title still says 14 search results while 4 skeleton rows show, and the rows are numbered 11 to 14

#### Scenario: A tag narrows the results

- **WHEN** a user picks a tag in the page's Tags picker
- **THEN** the url's tags hold it, the page starts at 1, and the results are on Topics with that tag

#### Scenario: An empty search says so

- **WHEN** a visitor opens `/search?q=zzzz&kinds=teams`
- **THEN** the page says nothing matched and that Topics, Podcasts, Findings, and Profiles are turned off

#### Scenario: The list fits a phone

- **WHEN** the search page renders at 375 pixels wide
- **THEN** the page has no horizontal scroll, and each row shows its name and kind

#### Scenario: A Topic row counts visitors

- **WHEN** a search returns a public Topic with 9 viewers and 2 followers
- **THEN** its row reads "9 visitors · 2 followers"
