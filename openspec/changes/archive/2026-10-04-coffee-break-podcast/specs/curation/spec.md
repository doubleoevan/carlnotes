## MODIFIED Requirements

### Requirement: Tiered LLM scoring produces Findings with relevance explanations

Curation SHALL score each fetched survivor against the topic's effective context with a cheap-tier model routed through LiteLLM. A survivor whose first-pass score is at or above the promotion threshold SHALL be re-scored by a premium-tier model that also writes a substantive relevance explanation: several sentences of plain prose that first summarize what the content actually says (its specific claims, findings, numbers, names, or events) and then explain how it relates to the topic context — enough substance that the reader gets the gist without opening the source. A single-line note does not satisfy this. Curation SHALL upsert one Finding per `(topic, resource)` carrying the `relevance_score`, the `relevance_explanation`, the `scan_id`, the hash of the topic context it was reviewed against, and the content hash of the Resource as reviewed. Only curation writes Findings; ingesters never do.

Both tiers SHALL judge a Resource by what it says about the topic and not by the form it arrives in. A forum thread, a question with its answers, a personal account, and a published article are scored on the same footing, and a Resource that addresses the topic directly SHALL NOT score below one that only touches it but reads more like a published article. Content that says nothing about the topic scores low whatever its form, so this standard separates substance from chatter instead of raising every score. The standard SHALL be stated in the prompt's shared instruction instead of its premium-tier span, because the cheap tier's first pass decides promotion and a standard the cheap tier cannot read would stop a forum post before the premium tier ever scored it.

A Finding whose Resource a custom Source found, a Source that the user added to the Topic, SHALL get a bonus of 0.05 on
its relevance score, limited to 1. The Finding SHALL record that a custom Source found it, and every later re-score SHALL
keep the bonus, even if only the web search finds the Resource that time. The promotion threshold SHALL read the score
before the bonus.

The topic context that both tiers score against SHALL end with up to ten pages that the Topic's users liked or
bookmarked, the bookmarked ones first by newest bookmark, then up to ten pages that they rated thumbs down, best-scored
first, each by its title and host. Only a bookmark whose user still has access to the Topic SHALL count, the same
bookmarks that keep a Finding from being filtered out, and a thumbs down outweighs a bookmark. The prompt SHALL tell both
tiers that content close to the liked and bookmarked pages scores higher, that content close to the pages rated down
scores lower, and that both lists are examples, never the whole topic. The example pages SHALL stay out of the reviewed
context hash, so a new rating or bookmark makes no Finding score again. A Finding rated thumbs down SHALL never be scored
again, even if the Topic's context changes.

A re-score SHALL leave what the user put on the Finding untouched: its rating, who cast that rating and the role they held, its view count, its bookmarks, its read state, and its feedback all survive being reviewed again. The prune that closes the Scan is a separate step and still removes a Finding past `max_results` that no user bookmarked or rated, so surviving a re-score is not the same as surviving the Scan.

#### Scenario: A relevant Resource becomes a scored Finding with a relevance explanation

- **WHEN** a survivor scores at or above the promotion threshold and is re-scored by the premium tier
- **THEN** a Finding is written for `(topic, resource)` with the premium `relevance_score`, a substantive multi-sentence `relevance_explanation`, the current `scan_id`, the reviewed context hash, and the reviewed content hash

#### Scenario: Only promoted Resources reach the premium tier

- **WHEN** a survivor's cheap-tier score is below the promotion threshold
- **THEN** it is not re-scored by the premium tier, consumes no premium-tier spend, and its Finding carries an empty `relevance_explanation`

#### Scenario: A forum post is scored on what it says

- **WHEN** a first-person forum post addresses the topic directly and a published article only touches it
- **THEN** the forum post does not score below the article for arriving as a forum post, and its score reflects what it says about the topic

#### Scenario: A forum post with nothing to say still scores low

- **WHEN** a forum post has no substance about the topic
- **THEN** it scores low, the same as any other content that says nothing about the topic

#### Scenario: The cheap tier applies the same standard

- **WHEN** the cheap tier makes its first pass over a forum post
- **THEN** it judges the post by what it says instead of its form, so a substantive post reaches the promotion threshold instead of being dropped before the premium tier scores it

#### Scenario: Writing a Finding is idempotent per (topic, resource)

- **WHEN** a Finding is written for a `(topic, resource)` that already has one
- **THEN** the existing row is updated via the `(topic_id, resource_id)` unique constraint instead of duplicated, so a Finding is never doubled

#### Scenario: A re-score keeps what the user put on a Finding

- **WHEN** a Finding with a rating, a view count, a bookmark, and feedback is re-scored
- **THEN** its relevance score, explanation, scan id, reviewed hash, and reviewed content hash are updated, and its rating, rater, rater role, view count, bookmark, read state, and feedback are unchanged

#### Scenario: A custom Source's Finding scores a little higher

- **WHEN** the model scores a Resource that a custom Source found at 0.7, and one that only the web search found at 0.7
- **THEN** the first Finding's relevance score is 0.75, and the second Finding's is 0.7

#### Scenario: Liked, bookmarked, and rated down pages guide the score

- **GIVEN** a Topic whose owner bookmarked two Findings and rated one thumbs down
- **WHEN** a Scan scores a new Resource
- **THEN** the topic context in the score prompt lists the two bookmarked pages to score higher and the page rated down
  to score lower, by title and host, and the Topic's other Findings are not scored again because of them

#### Scenario: A Finding rated down never scores again

- **GIVEN** a Finding rated thumbs down
- **WHEN** the owner edits the Topic's prompt and a Scan finds that Finding's Resource again
- **THEN** the Scan does not score it, and it keeps its rating

#### Scenario: The bonus survives a re-score

- **GIVEN** a Finding whose Resource a custom Source found in an earlier Scan
- **WHEN** a later Scan re-scores it after only the web search found the Resource
- **THEN** the Finding keeps the bonus

## ADDED Requirements

### Requirement: A url Source's own page reaches the scoring model

The page a url Source names SHALL pass the relevance gate whatever its similarity, and SHALL skip both dedupe stages, so
the scoring model reads every page that a user added as a Source. Its title is often only its url's last path segment,
which says little to the embedding and matches the same segment on another page. Its score and the Topic's max findings
then decide whether its Finding stays, the same as for any other Resource. A url Source's saved url SHALL be compared in
its canonical form, so a saved url with a trailing slash still matches the page that the url ingester stored.

#### Scenario: A source page below the bar is still scored

- **GIVEN** a url Source whose page measures below its kind's relevance threshold
- **WHEN** a Scan reviews the page
- **THEN** the page is fetched and scored instead of being filtered at the gate

#### Scenario: Two source pages with the same title both reach the model

- **GIVEN** two url Sources whose pages have the same title, read from their urls
- **WHEN** a Scan dedupes its candidates
- **THEN** both pages are scored, and neither is dropped as a duplicate of the other
