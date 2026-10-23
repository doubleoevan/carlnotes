# site-search Specification

## Purpose
TBD - created by archiving change add-unified-search-and-mcp-cards. Update Purpose after archive.
## Requirements
### Requirement: One search function returns every kind of result

The api SHALL hold one search function that takes the caller, a query, the result kinds, a sort, a page, and a page
size, and returns that page of rows with the row count, the page, the page count, and the page size. The kinds SHALL be
the Filters menu's `topics`, `podcastEpisodes`, `findings`, `teams`, and `users`, all of them if none are named, and a
`users` row SHALL be a profile. The sort SHALL be one of the sort menu's `relevant`, `newest`, and `trending`,
`relevant` if none is named. The page SHALL count from 1, and the page size SHALL be one of the table's page sizes, 10
if none is named. The view `unread` or `bookmarked` SHALL search Findings alone, the one kind with either mark, and tags
a result must have SHALL leave out teams and profiles, which have none. A query shorter than `SEARCH_MIN_CHARS` SHALL
return no rows, and one shorter than three characters SHALL find no Finding, since the title index narrows nothing
shorter. `GET /api/search` SHALL serve it, and the search bar, the `/search` page, and the MCP `search` tool SHALL each
call it, with no other search route for these kinds.

#### Scenario: Every kind is searched by default

- **GIVEN** a public Topic, a published Podcast Episode, a Finding, a public team, and a user, each with "orbit" in its
  name
- **WHEN** a visitor searches "orbit" with no kinds named
- **THEN** the page holds all five rows, each with its kind

#### Scenario: A kind filter narrows the rows

- **WHEN** a visitor searches "orbit" with the kinds `teams` and `users`
- **THEN** the page holds only team and profile rows, and no Topic, Podcast Episode, or Finding is read

#### Scenario: A finding view searches findings alone

- **WHEN** a signed-in user searches "orbit" with the view `unread` or `bookmarked`
- **THEN** the page holds only Finding rows, since only a Finding can be unread or bookmarked, and no Topic, Podcast
  Episode, team, or profile is read, and an empty page says the view searches findings only

#### Scenario: A short query returns nothing

- **WHEN** a caller searches one character
- **THEN** the result has no rows and a row count of 0

#### Scenario: The page, the bar, and the tool agree

- **WHEN** the search bar, the `/search` page, and the MCP `search` tool search the same query, kinds, sort, page, and
  page size for the same caller
- **THEN** all three receive the same rows in the same order

### Requirement: The search reads every kind under that kind's view rules

Each kind SHALL be read under the rule its pages apply: a Topic through the topic view filter, a Podcast Episode
through the podcast episode view rules, a Finding only on a Topic the caller may view and, on an invite Topic, only
from the caller's subscription's activation on, a team if it is public or the caller is an active member, and a profile
by its public username. An admin SHALL find every Topic, Podcast Episode, and Finding. A visitor SHALL find only public
results. `GET /api/search` SHALL sit behind `searchRateLimiter`.

#### Scenario: A visitor finds only public results

- **GIVEN** Topics named "orbit" that are public, invite, and private, each with a Finding titled "orbit" and a
  published Podcast Episode titled "orbit", and a private team named "orbit"
- **WHEN** a visitor searches "orbit"
- **THEN** only the public Topic, its Finding, and its Podcast Episode are listed

#### Scenario: A member finds their own private team

- **WHEN** an active member of a private team named "orbit" searches "orbit"
- **THEN** that team is listed, and it is not listed for any other user

#### Scenario: An invite subscriber finds only the later findings

- **GIVEN** an invite Topic with one Finding titled "orbit" from before a user's subscription activated and one from
  after
- **WHEN** that user searches "orbit"
- **THEN** only the later Finding is listed

#### Scenario: A search past the limit is rejected

- **WHEN** one caller sends more searches in a minute than `searchRateLimiter` allows
- **THEN** the requests past it are rejected with 429 and read nothing

### Requirement: Findings are searched on the server by title

A Finding SHALL match if its Resource's title, or its url if it has no title, contains the query, case-insensitively,
with the query's characters escaped so none acts as a wildcard. The match SHALL read a trigram GIN index on the
lowercased title or url, bounded by the per-kind limit. A Resource found on two Topics SHALL be two rows, each naming
its Topic.

#### Scenario: A finding on a topic the page did not load is found

- **WHEN** a user on the homepage searches the title of a Finding on a Topic they follow but that the page did not load
- **THEN** the Finding is listed with its Topic's name

#### Scenario: The finding match plans through the trigram index

- **WHEN** the finding match is planned with sequential and plain index scans off
- **THEN** the plan scans `resources_title_or_url_lower_trgm`

### Requirement: With the Relevance sort, kinds rank by how the name matches

Each row SHALL take a match tier from its name and the query, both lowercased: 1 if the name is the query, 2 if it
starts with the query, 3 if a word in it starts with the query, 4 if it contains the query, and 5 for a row matched
another way, a Podcast Episode by its description or meaning or a Finding by its url. A name SHALL be a Topic's or a
team's name, a Podcast Episode's title, a Finding's title, and a username. Rows SHALL order by tier, then by kind in the
order topics, podcasts, findings, teams, users, then by the shorter name, then by id.

#### Scenario: An exact team name beats a topic that contains it

- **GIVEN** a public team named "Orbit" and a public Topic named "Orbit Debris Watch"
- **WHEN** a visitor searches "orbit"
- **THEN** the team is listed before the Topic

#### Scenario: Ties break by kind

- **GIVEN** a public Topic and a public team both named "Orbit Watch"
- **WHEN** a visitor searches "orbit"
- **THEN** the Topic is listed before the team

#### Scenario: A meaning match ranks last

- **GIVEN** a Podcast Episode found only by meaning, and a public team whose name contains the query
- **WHEN** a visitor searches the query
- **THEN** the team is listed before the Podcast Episode

### Requirement: Newest and Trending sort by each kind's own value

The `newest` sort SHALL order by a Topic's creation, a Podcast Episode's publish date, and a Finding's publish date,
else its fetch date. The `trending` sort SHALL order by a Topic's viewer count, a Podcast Episode's listener count,
and a Finding's view count. Teams and profiles SHALL follow the dated or counted rows under both sorts, in relevance
order, and ties SHALL fall back to relevance order.

#### Scenario: Newest puts the latest first

- **WHEN** a visitor searches with the `newest` sort
- **THEN** the dated rows read newest first, and the team and profile rows follow them

#### Scenario: Trending puts the most viewed first

- **GIVEN** two public Topics matching a query, one with more viewers
- **WHEN** a visitor searches with the `trending` sort
- **THEN** the Topic with more viewers is listed first

### Requirement: The search pages over a bounded union of the kinds

The search SHALL read each requested kind up to 50 rows, rank and sort the union, and return the page the page number
and page size name, with the row count and page count of the union. A page past the last SHALL return no rows and the
union's counts.

#### Scenario: The second page continues the first

- **GIVEN** a query with 23 matching rows
- **WHEN** a caller searches it with page size 10, pages 1, 2, and 3
- **THEN** the pages hold 10, 10, and 3 rows in one order with none repeated, and each says 23 rows over 3 pages

#### Scenario: A page past the end is empty

- **WHEN** a caller asks for page 9 of a search with 3 pages
- **THEN** the result has no rows and still says 3 pages

### Requirement: Enter opens one result or the search page

The search bar SHALL send one debounced search per query, show the first page of 10 rows in rank order with each kind's
row, and end the list with a See all results row if the search has more rows than it shows. Enter SHALL open the
highlighted row; else, if the search returned exactly one row, that row; else, for a query of at least
`SEARCH_MIN_CHARS`, the `/search` page with the query, the bar's kinds, and the Relevance sort. A search still pending
SHALL count as more than one row.

#### Scenario: Enter opens the only result

- **WHEN** a user types a query whose search returns one Topic and presses Enter with nothing highlighted
- **THEN** that Topic's page opens

#### Scenario: Enter with several results opens the search page

- **WHEN** a user types "orbit", whose search returns four rows, and presses Enter with nothing highlighted
- **THEN** `/search?q=orbit` opens with the bar's kinds

#### Scenario: Enter opens the highlighted row

- **WHEN** a user arrows to the third row and presses Enter
- **THEN** that row's page opens, however many rows there are

### Requirement: The search page keeps its search in the url

`/search` SHALL read every value of the search from its url: the query `q`, the kinds `kinds`, the Filters menu's
resource kinds `resourceKinds`, view `view`, and tag match `tagMatch`, the tags `tags`, the sort `sort`, the page
`page`, and the page size `size`, so the same url always opens the same search. The search bar on that page SHALL show
and change them: the input the query, the Filters menu the kinds, resource kinds, view, and tag match, and the Sort menu
the sort, and the page's Tags picker SHALL change the tags. A change to any of them but the page SHALL start at page 1,
and every change SHALL add a history entry, so the back button returns to the search before it. A url value the
contract rejects SHALL fall back to its default.

#### Scenario: A shared url opens the same page

- **WHEN** a visitor opens `/search?q=orbit&kinds=topics,podcastEpisodes&sort=newest&page=2`
- **THEN** the page shows the second page of Topics and Podcast Episodes matching "orbit", newest first, and the bar
  shows "orbit", only Topics and Podcasts on, and Newest

#### Scenario: A shared url keeps its filters and tags

- **WHEN** a visitor opens `/search?q=orbit&resourceKinds=read,listen&view=unread&tags=ai,space&tagMatch=all`
- **THEN** the search reads those resource kinds, that view, and both tags matched all at once

#### Scenario: Back returns to the last search

- **WHEN** a user on `/search?q=orbit` turns Teams off and then presses back
- **THEN** the url and the results are the search with Teams on again

#### Scenario: Sorting starts at page one

- **WHEN** a user on page 3 picks Trending in the Sort menu
- **THEN** the url's sort is `trending` and its page is 1

### Requirement: The search page lists its results as the feed lists its findings

The page SHALL start with the home page's row of the Tags picker and the New Topic button, then a title naming how many
results the search found, such as 25 search results for "test", then the results as numbered rows in the feed's list
card, numbered across pages, with the numbered pages under them. Each row SHALL show its kind and link to its page on
the site: a Topic with its viewers and followers, a Podcast Episode with its Topic, how long ago it was published, and
its listeners, a team with its topics and members, and a profile. A Topic row with a published Podcast Episode, and a
Podcast Episode row, SHALL have the play pill the feed uses. A Finding row SHALL be the feed's own row, with its Topic
after its age, and a click on it SHALL open the Finding's note, with Carl's notes, the link to its page, and the rating,
bookmark, and read controls the Finding's Topic allows the user, each change shown on the row at once. While a new
search loads, the page SHALL show skeleton rows; while another page of the same search loads, the title's count and the
page row SHALL stay, and the list SHALL show one skeleton row per result that page holds. A search with no rows SHALL
say so and name the kinds turned off. At 375 pixels wide the list SHALL fit with no sideways scroll.

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

### Requirement: The logo opens the bar's search, and leaves the search page with an empty bar

The search bar SHALL show the search page's query while the search page is open, and SHALL keep its text when the user
leaves the search page any way but the logo. On any other page, while the bar holds text long enough to search, the
header's logo SHALL open the search page for that text, and with no such text the home page. On the search page the logo
SHALL empty the bar and open the home page. While the typeahead's first rows load, its dropdown SHALL show the loading
mug.

#### Scenario: The logo clears the search

- **WHEN** a user on the search page for "speed" clicks the logo
- **THEN** the home page opens with an empty search bar

#### Scenario: The logo returns to the search

- **WHEN** a user on a topic page with "speed" in the search bar clicks the logo
- **THEN** the search page for "speed" opens

#### Scenario: A result keeps the search

- **WHEN** a user on the search page for "speed" opens a topic row
- **THEN** the topic page opens with "speed" still in the search bar

### Requirement: The search page renders for a visitor and is never indexed

`/search` SHALL render on the server for a request without a session cookie, over the results a visitor may see, and in
the browser for a signed-in user, as the other public routes do. It SHALL declare `noindex, follow` and SHALL NOT be
listed in the sitemap, `llms.txt`, or `llms-full.txt`.

#### Scenario: A visitor's search renders on the server

- **WHEN** a visitor's browser without JavaScript opens `/search?q=orbit`
- **THEN** the html holds the public results

#### Scenario: The search page is not indexed

- **WHEN** a crawler fetches `/search?q=orbit`
- **THEN** the page declares `noindex, follow`, and neither the sitemap nor the llms files name any `/search` url

