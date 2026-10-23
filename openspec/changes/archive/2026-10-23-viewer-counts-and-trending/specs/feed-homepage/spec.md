## MODIFIED Requirements

### Requirement: The feed bar offers three sort modes

The feed bar SHALL offer a "Sort"-labelled menu with three modes: relevant (the default, by relevance score), newest (by
resource recency), and trending (by unique viewers). Sorting SHALL be pure read-side ranking over the delivered Topics
and Findings, and the chosen mode SHALL be a UI concern, never persisted.

Relevant sort SHALL settle equal scores by resource recency, and any remaining tie by a stable per-Finding key, so the
ordering is total. Relevance scores bunch at the top of the scale and most of a first page ties outright, which leaves
the tiebreak — not the score — deciding what a reader actually sees first. An ordering that instead falls through to the
order rows arrived in is not reproducible: the homepage and the topic page build a topic's list from separately queried
rows, so the same Findings under the same sort would present in two different orders.

Trending SHALL order Findings by their unique viewer count, then by resource recency, then by the stable per-Finding
key, with bookmarked Findings pinned above the rest in each mode. Trending SHALL order the Topics in the Yours,
Subscribed, and Popular sections by their viewer count, then their follower count, then the time of their newest Finding
or, with none, their creation time, then by Topic id. The Featured section SHALL keep its hand-set order under every
mode, and relevant and newest SHALL keep every section's Topic order as it is delivered.

#### Scenario: Newest reorders by recency
- **WHEN** the user switches the sort to newest
- **THEN** Findings order by resource recency without any new data being fetched

#### Scenario: Trending falls back to newest without a signal
- **WHEN** the user switches to trending on a feed where several Findings share a viewer count, including Findings
  nobody opened
- **THEN** each group with the same viewer count orders newest first, behind every Finding with more viewers

#### Scenario: Equally relevant Findings order by recency
- **WHEN** several Findings share the same relevance score
- **THEN** they order among themselves newest first, instead of in the order they were delivered

#### Scenario: One topic sorts identically wherever it is rendered
- **WHEN** the same Findings are sorted by relevance on the homepage and on the topic page
- **THEN** the Findings common to both appear in the same relative order on each

#### Scenario: A bookmarked Finding stays pinned under trending
- **WHEN** the user switches to trending and a bookmarked Finding has fewer viewers than an unbookmarked one
- **THEN** the bookmarked Finding still shows above it, in the pinned group

#### Scenario: Trending orders Topics by viewers
- **WHEN** the user switches to trending and the Popular section holds Topics with different viewer counts
- **THEN** the Topic with the most viewers shows first, without any new data being fetched

#### Scenario: A tie on viewers falls to followers, then to recency
- **WHEN** two Topics in one section have the same viewer count, and two others the same viewer and follower counts
- **THEN** the first pair orders by follower count, and the second by the time of their newest Finding

#### Scenario: Featured keeps its order
- **WHEN** the user switches to trending
- **THEN** the Featured section keeps the order an admin set
