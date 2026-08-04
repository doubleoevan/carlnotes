## MODIFIED Requirements

### Requirement: The feed bar offers three sort modes

The feed bar SHALL offer a "Sort"-labelled menu with three modes: relevant (the default, by relevance score), newest (by resource recency), and trending (by the Resource's captured engagement signal, degrading to newest where the signal is null). Sorting SHALL be pure read-side ranking over the delivered Findings, and the chosen mode SHALL be a UI concern, never persisted.

Relevant sort SHALL settle equal scores by resource recency, and any remaining tie by a stable per-Finding key, so the ordering is total. Relevance scores bunch at the top of the scale and most of a first page ties outright, which leaves the tiebreak — not the score — deciding what a reader actually sees first. An ordering that instead falls through to the order rows arrived in is not reproducible: the homepage and the topic page build a topic's list from separately queried rows, so the same Findings under the same sort would present in two different orders.

#### Scenario: Newest reorders by recency
- **WHEN** the user switches the sort to newest
- **THEN** Findings order by resource recency without any new data being fetched

#### Scenario: Trending falls back to newest without a signal
- **WHEN** the user switches to trending on a feed where some Findings carry no engagement signal
- **THEN** Findings with a signal rank by it and the rest fall back to recency order behind them

#### Scenario: Equally relevant Findings order by recency
- **WHEN** several Findings share the same relevance score
- **THEN** they order among themselves newest first, rather than in the order they were delivered

#### Scenario: One topic sorts identically wherever it is rendered
- **WHEN** the same Findings are sorted by relevance on the homepage and on the topic page
- **THEN** the Findings common to both appear in the same relative order on each
