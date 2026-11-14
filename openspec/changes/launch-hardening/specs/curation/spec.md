## ADDED Requirements

### Requirement: A filtered Finding leaves a row that the next Scan reads

As the filter that closes a Scan deletes a Finding, it SHALL write a `filtered_findings` row keyed by Topic and
Resource, in the same transaction. The row SHALL hold the Topic context hash and the content hash that the page was
scored against, its score, its personal source bonus, and the time, and SHALL hold no relevance explanation or other
text. A Finding with no reviewed context hash SHALL leave no row. A later Scan SHALL skip a rediscovered page while
its row still holds.

#### Scenario: A page that the limit removed is not scored again

- **GIVEN** a Topic at its `max_results` whose last Scan's filter removed fourteen Findings
- **WHEN** the next Scan rediscovers those fourteen pages with the Topic's context and their content unchanged
- **THEN** none of the fourteen is fetched or scored, and the Scan's paid section goes to pages it has not judged

#### Scenario: The row holds hashes and numbers only

- **WHEN** the filter removes a Finding that had a private annotation
- **THEN** its row holds the two hashes, the score, and the bonus, and no text

#### Scenario: A retried review writes the same rows

- **GIVEN** a review whose first attempt removed Findings and wrote their rows before its worker died
- **WHEN** the next attempt's filter runs
- **THEN** each Topic and Resource still has one row, and none is doubled

### Requirement: A filtered row holds only while what it was scored against still stands

A `filtered_findings` row SHALL hold only if its Topic context hash equals the Scan's, its content hash equals the
Resource's, its personal source bonus is at least the bonus that this Scan requires, and no chapter of the Topic
holds a rating that waits for the page's next Finding. A page whose row no longer holds SHALL be reviewed as a page
with no Finding is. A url Source's own page SHALL be read on every Scan whatever its row says. A row SHALL be
deleted once its page is sent to the model.

#### Scenario: An edited Topic context sends the page back to the model

- **GIVEN** a page with a filtered row
- **WHEN** the owner edits the Topic's prompt and a Scan rediscovers the page
- **THEN** the page is fetched and scored again

#### Scenario: Changed content sends the page back to the model

- **WHEN** a rediscovered page's stored content hash differs from the hash in its filtered row
- **THEN** the page is scored again against the current Topic context

#### Scenario: A stronger personal source bonus sends the page back to the model

- **GIVEN** a page filtered with no personal source bonus
- **WHEN** a sender deliberately sends its link to the Topic and the next Scan runs
- **THEN** the page is scored again with the bonus

#### Scenario: A url Source's own page is read on every Scan

- **GIVEN** a url Source whose page's Finding the filter removed
- **WHEN** the next Scan runs
- **THEN** the page is scored again

#### Scenario: A rated chapter keeps its page in the review

- **GIVEN** a chapter that a user rated after its Finding was filtered out
- **WHEN** a Scan rediscovers the chapter's page
- **THEN** the page is scored, its new Finding takes the chapter's rating, and the chapter's own rating is cleared

### Requirement: An open place is filled from the pages filtered before

Before the paid stage, the review SHALL rank the Topic's Findings together with the held rows of this Scan's
rediscovered pages, in the filter's own order, and SHALL send back to the model each held page that ranks inside
`max_results`, best first, one page per open place. A held row SHALL rank as the oldest, so a tie stays with the
Finding that the Topic keeps. A page judged again that ends with no Finding SHALL leave no row, so it holds no place
on a later Scan.

#### Scenario: A raised limit is filled from the best held pages

- **GIVEN** a Topic with ten Findings whose owner raises `max_results` from 10 to 15, and twelve held pages that a
  Scan rediscovers
- **WHEN** the Scan reviews
- **THEN** the five best-scored of the twelve go back to the model, and the other seven are skipped

#### Scenario: A newly exempt Finding opens one place

- **GIVEN** a full Topic on which a user bookmarks one kept Finding, and held pages that a Scan rediscovers
- **WHEN** the Scan reviews
- **THEN** the one best-scored held page goes back to the model

#### Scenario: A full Topic judges nothing again

- **GIVEN** a Topic at its `max_results` with no place open
- **WHEN** a Scan rediscovers only held pages
- **THEN** no held page goes back to the model

#### Scenario: A tie stays with the kept Finding

- **GIVEN** a held page whose score equals the lowest kept Finding's
- **WHEN** the Scan ranks them
- **THEN** the kept Finding keeps its place, and the held page is skipped

#### Scenario: A page judged again with no Finding gives its place back

- **GIVEN** a held page that was sent back to the model and found unsafe
- **WHEN** the Scan ends
- **THEN** the page has no Finding and no row, and the next Scan's open place goes to the next-best held page

### Requirement: A Scan that rediscovers only judged pages reviews nothing

A Scan whose discovered pages each hold a Finding that still matches or a filtered row that still holds, with no
place open, SHALL score nothing, SHALL write no recap, and SHALL succeed with a kept count of zero. The filter SHALL
still run, and SHALL delete no Finding that a user bookmarked, rated, or commented on.

#### Scenario: A quiet feed costs nothing to review

- **GIVEN** a full Topic whose Sources return only pages that it already judged
- **WHEN** a scheduled Scan runs
- **THEN** no page is fetched or scored, the Scan succeeds with no recap, and its email says there is nothing new

### Requirement: A filtered Finding's Resource and images are kept

The filter SHALL delete the Finding alone. Its Resource, the Resource's stored content and embedding, and its
Resource Images SHALL be kept, because a film narrates a Resource and a later Scan may judge the page again. A
filtered row SHALL be deleted with its Topic and with its Resource.

#### Scenario: A film still shows a removed page's images

- **GIVEN** a published Podcast Episode whose chapter narrates a page whose Finding the filter later removed
- **WHEN** its film is rendered again
- **THEN** the chapter shows the Resource's stored images

### Requirement: A Firecrawl rate limit or server error is retried before the snippet is scored

A Firecrawl fetch that gets a 429 or a 5xx SHALL be tried again with a backoff, inside the review attempt's model
call wait deadline, before the fetch counts as failed. A spent Firecrawl credit SHALL NOT be retried, and SHALL be
reported once a sweep as a threshold crossing, never once a page. A Finding scored on its snippet after its
Firecrawl fetch failed SHALL be written with no reviewed context hash, so the next Scan that rediscovers the page
reads it again.

#### Scenario: A rate-limited fetch succeeds on a later attempt

- **WHEN** a page's Firecrawl fetch gets a 429 and its next attempt succeeds
- **THEN** the page is scored on its fetched text, and nothing is reported

#### Scenario: A failed fetch is read again by the next Scan

- **GIVEN** a page scored on its snippet because its Firecrawl fetch failed on every attempt
- **WHEN** the Topic's next Scan rediscovers the page
- **THEN** the page is fetched and scored again, though the Topic's context and the page's content are unchanged

#### Scenario: A spent credit is reported once a sweep

- **GIVEN** Firecrawl credits that run out while thirty Scans review
- **WHEN** the sweep runs
- **THEN** one threshold crossing reports the spent credit, and each page is scored on its snippet

## MODIFIED Requirements

### Requirement: Curation runs after ingestion within the same Scan

`runTopicScan` SHALL run curation after it upserts the Scan's Resources and before it closes the Scan: the Scan stays
`running` through curation and is closed exactly once, recording curation's outputs alongside ingestion's. The review
SHALL process a discovered Resource if it has neither a Finding for the Topic nor a `filtered_findings` row that still
holds, if its Finding was reviewed against a different Topic context than the current one, or if its Finding was
reviewed against different Resource content than the Resource now holds. A Resource whose Finding was reviewed against
the same context and the same content SHALL be left untouched, so an unchanged Topic spends nothing re-deriving what it
already knows. A Resource whose removed Finding left a `filtered_findings` row that still holds SHALL be left unscored
the same way, unless a place is open for it, as the requirements on filtered Findings state. A curation failure SHALL
finalize the Scan as `failed` with the error recorded, never leaving it stuck `running`.

#### Scenario: Curation runs before the Scan closes

- **WHEN** a Scan's Sources have returned Resources and ingestion has upserted them
- **THEN** curation runs over the Resources that need reviewing and the Scan is closed once, after curation, with its
  curation outputs recorded

#### Scenario: Already-scored Resources are skipped

- **WHEN** a discovered Resource has a Finding whose reviewed context hash and reviewed content hash both match the
  current ones
- **THEN** curation does not re-score it, no model call is spent on it, and its Finding stands

#### Scenario: An edited Topic context reviews again its Findings

- **WHEN** the owner edits the Topic's prompt, or adds or removes an attachment, and the Topic scans
- **THEN** every discovered Resource whose Finding was reviewed against the previous context is re-scored, and its
  Finding is updated in place rather than duplicated

#### Scenario: Changed Resource content is reviewed again

- **WHEN** a discovered Resource's stored content hash differs from the hash its Finding was reviewed against
- **THEN** curation re-scores it against the current Topic context

#### Scenario: A Finding the Scan never rediscovered is reviewed again

- **WHEN** the Topic's context has changed and it holds a Finding whose Resource no Source returned on this Scan
- **THEN** curation re-scores that Finding anyway, so a bookmarked or rated Finding is not frozen by its feed moving on

#### Scenario: A Finding that predates the hash is reviewed once

- **WHEN** a discovered Resource has a Finding with no reviewed context hash
- **THEN** curation treats it as reviewed against an unknown context and re-scores it, so the Finding records the
  context it was reviewed against from then on

#### Scenario: A curation failure fails the Scan

- **WHEN** curation throws an unrecoverable error
- **THEN** the Scan is marked `failed`, the error is recorded, and it is not left `running`

#### Scenario: A page whose filtered row still holds is skipped

- **WHEN** a discovered Resource has no Finding, its `filtered_findings` row matches the current context hash and
  content hash, and no place is open for it
- **THEN** the review does not score it, and no fetch or model call is spent on it

### Requirement: Content-hash dedupe drops content-level duplicates

Curation SHALL compute a content hash (SHA-256 over the Resource's normalized title and native snippet) and persist it
to `resources.content_hash`. A Resource whose content hash matches that of an already-admitted Resource SHALL be dropped
as a filtered duplicate and SHALL NOT be scored. An already-admitted Resource is one that this Topic judged in an
earlier Scan, which it holds a Finding or a `filtered_findings` row for, or one admitted earlier in this Scan. A
Resource that only another Topic's Scan stored SHALL drop nothing. The stored-Resource comparison SHALL exclude this
Scan's own candidate ids, for the same reason as embedding dedupe: a candidate must not be dropped against a sibling
that has not yet been admitted. This content-level dedupe is distinct from the canonical-URL dedupe ingestion already
performs.

The hash SHALL be taken in the dedupe stage, over the title and snippet as they stand there. The fetch stage runs after
it and may replace a title that was read off the url with the page's own, and SHALL leave the hash as the dedupe stage
wrote it. A Resource's stored hash therefore describes the title it had when it was deduped, not always the title it
carries now, and the two SHALL NOT be assumed equal.

Leaving the hash alone is what the re-review selector depends on: a Finding stores the hash its Resource was reviewed
against, and a Resource is reviewed again only when the two stop matching. Refreshing the hash on a retitle would part
them for every retitled Resource and send each one back through the paid scoring stage to say the same thing under a
better name.

#### Scenario: Content-identical Resource at a different URL is dropped

- **WHEN** a Resource's content hash equals that of an already-admitted Resource with a different canonical URL
- **THEN** the duplicate is dropped as filtered, produces no Finding, and the original stands

#### Scenario: The content hash is persisted

- **WHEN** curation processes a Resource
- **THEN** its `content_hash` is written so later Scans can dedupe against it

#### Scenario: Sibling candidates sharing a hash leave one survivor

- **WHEN** two candidates in the same Scan share a content hash
- **THEN** the first-ranked one is admitted and the second is dropped, never both

#### Scenario: A retitled Resource keeps the hash it was deduped under

- **WHEN** the fetch stage replaces a Resource's url-read title with the page's own title
- **THEN** `resources.content_hash` is left as the dedupe stage wrote it, the Resource still matches its Finding's
  `reviewed_content_hash`, and no later Scan scores it again for the new title

#### Scenario: Another Topic's stored copy drops nothing

- **GIVEN** a story that another Topic's Scan stored from one outlet
- **WHEN** this Topic's Scan finds the same story, with the same title and description, at another outlet's url
- **THEN** the page is not dropped as a duplicate, and it is scored for this Topic

### Requirement: Embedding dedupe drops near-duplicates

The review SHALL drop, as a filtered duplicate, a Resource whose embedding is within a cosine near-duplicate threshold
of an already-admitted Resource's embedding. An already-admitted Resource is one that this Topic judged in an earlier
Scan, which it holds a Finding or a `filtered_findings` row for, or a candidate already admitted earlier in this Scan. A
Resource that is not within the threshold of any such embedding SHALL proceed.

The stored-Resource lookup SHALL read only the Resources that this Topic has judged, and SHALL push the near-duplicate
threshold into SQL as a distance predicate, so the database prunes at the gate instead of ranking the corpus and
filtering in application code. The Topic's judged Resources SHALL NOT be picked out by a SQL filter over an approximate
index scan of every Resource, because such a filter can consume the whole index walk and report no duplicate for a
Resource that has one. The caller SHALL drop this Scan's own candidate ids from the result. Within one Scan, this leaves
exactly one member of a near-duplicate set standing rather than dropping every member.

The lookup MAY be **approximate**: if it walks an index, the walk MAY miss a true nearest neighbour, so an occasional
duplicate MAY be admitted. This is accepted for a duplicate gate at this threshold, because the content-hash stage and
the in-memory sibling check run first, and the gate is a quality measure, not a correctness invariant.

#### Scenario: A near-duplicate is dropped

- **WHEN** a Resource's embedding is within the near-duplicate threshold of an already-admitted Resource's embedding
- **THEN** the Resource is dropped as filtered and produces no Finding

#### Scenario: A distinct Resource proceeds

- **WHEN** a Resource's embedding is outside the near-duplicate threshold of every already-admitted embedding
- **THEN** the Resource proceeds to the embed-filter

#### Scenario: Sibling candidates do not mutually annihilate

- **WHEN** two candidates in the same Scan are near-duplicates of each other and both have persisted embeddings
- **THEN** this Scan's candidates are dropped from the neighbour result, so the first-ranked one is admitted and only
  the second is dropped

#### Scenario: The threshold is applied by the database

- **WHEN** the stored-Resource lookup runs
- **THEN** the query reads only the Topic's judged Resources and carries the distance threshold as a predicate, so no
  full corpus sort is performed and no other Topic's Resource is compared

#### Scenario: Another Topic's near-duplicate drops nothing

- **GIVEN** a page that only another Topic's Scan stored, within the near-duplicate threshold of this Scan's candidate
- **WHEN** this Topic's Scan dedupes its candidates
- **THEN** the candidate is not dropped, and it proceeds to the embed-filter

### Requirement: Same-Scan dedupe leaves exactly one survivor, the highest-similarity one

Curation's two dedupe stages SHALL remain inside the ranked pass and SHALL distinguish "already stored" from "already
admitted in this Scan". For each candidate, the content-hash check and the near-duplicate check SHALL compare against
both:

- the stored Resources that this Topic has judged, **excluding this Scan's own candidate ids**, and
- the content hashes and embeddings of candidates already admitted earlier in this Scan, held in memory.

For any set of duplicate or near-duplicate candidates within one Scan, exactly one SHALL survive, and because the pass
is ranked, the survivor SHALL be the highest-similarity member. Curation SHALL NOT drop every member of a duplicate set.

Pass 1 SHALL still embed and persist an embedding for every candidate, including ones later deferred, because embeddings
are global to the Resource and a deferred Resource must not need re-embedding on the next Scan. Persisting an embedding
SHALL NOT by itself mark a candidate as admitted.

#### Scenario: Two near-identical candidates in one Scan leave one survivor

- **WHEN** two candidates in the same Scan are within the near-duplicate threshold of each other
- **THEN** exactly one is admitted and the other is dropped as filtered — never both dropped

#### Scenario: The surviving member is the higher-scoring one

- **WHEN** two near-duplicate candidates in the same Scan have different similarities to the topic context
- **THEN** the higher-similarity candidate is the one admitted

#### Scenario: A candidate is not treated as its own stored duplicate

- **WHEN** pass 1 has persisted embeddings for every candidate and the ranked pass then checks a candidate for
  near-duplicates
- **THEN** the stored-Resource comparison excludes this Scan's candidate ids, so a candidate is not dropped against its
  own persisted row or against a not-yet-admitted sibling

#### Scenario: A deferred candidate keeps its embedding

- **WHEN** a candidate is embedded in pass 1 and then deferred by a per-Scan limit
- **THEN** its embedding is persisted and a later Scan reuses it rather than re-embedding it

### Requirement: A scan prunes the topic to its max results, sparing bookmarked and rated Findings
After a scan writes its Findings, a scan SHALL keep only the topic's top `max_results` Findings by relevance score and
delete the rest, except Findings a user bookmarked or rated, which are never pruned. Each deleted Finding that
holds a reviewed context hash SHALL leave a `filtered_findings` row, as the requirement on filtered Findings states,
and its Resource SHALL be kept. A Finding is
spared if a user with access bookmarked it or if it has a rating. A view SHALL NOT spare a Finding: opening one is
incidental, and sparing every opened Finding would leave an actively read topic unable to prune at all. User feedback
SHALL NOT be read here either, since feedback stays record-only and never reaches the ranking path. A lowered
`max_results` takes effect at the next scan; editing the value never deletes rows on its own. A raised `max_results`
takes effect at the next scan too, which fills the open places from new pages and from the best pages filtered before.

Sparing a rating alongside a bookmark matters because a re-score can lower a Finding's relevance score. Without it,
editing a topic's prompt would silently delete the rating attached to whatever the new context scores lower.

A Finding SHALL also be spared if it has a Comment, so a re-score never deletes what a person wrote. A Reaction SHALL
NOT spare a Finding, because its author is not shown and the Topic's owner cannot remove it. A Comment from an author
under an admin block, or in a block with the Topic's owner, SHALL NOT spare a Finding.

#### Scenario: The prune keeps the top of the ranking
- **WHEN** a scan finishes on a topic with more Findings nobody bookmarked or rated than its `max_results`
- **THEN** only the top `max_results` by relevance score remain, plus every bookmarked or rated Finding

#### Scenario: Editing max results does not delete rows
- **WHEN** an owner lowers a topic's `max_results`
- **THEN** no Finding is deleted until the topic's next scan prunes to the new value

#### Scenario: A re-score that lowers a score keeps a rated Finding
- **WHEN** an edited topic context re-scores a rated Finding below its topic's `max_results` cut
- **THEN** the Finding remains with its updated score and explanation, and its rating is intact

#### Scenario: Being read does not spare a Finding from the limit
- **WHEN** an unrated, unbookmarked Finding the user has opened falls past the topic's `max_results` cut
- **THEN** it is pruned like any other, so reading a topic never stops it pruning

#### Scenario: A Finding with a Comment is spared
- **WHEN** a Finding that holds a Comment falls past the topic's `max_results` cut
- **THEN** the Finding and its Comment remain

#### Scenario: A Reaction does not spare a Finding
- **WHEN** a Finding that holds Reactions and no Comment falls past the topic's `max_results` cut
- **THEN** it is pruned, and its Reactions are deleted with it

#### Scenario: Deleting the Comment lets the Finding prune
- **WHEN** a Topic's owner deletes the one Comment on a Finding past the cut
- **THEN** the next scan prunes that Finding

#### Scenario: A removed Finding leaves a filtered row
- **WHEN** a scan's filter deletes a Finding past the topic's `max_results` cut
- **THEN** a `filtered_findings` row for its Topic and Resource is written in the same transaction, and the Resource
  stays

#### Scenario: A raised max results fills at the next scan
- **WHEN** an owner raises a topic's `max_results` and the topic's next scan rediscovers pages filtered before
- **THEN** the best of those pages are judged again, one for each open place, and no Finding is written before that scan
