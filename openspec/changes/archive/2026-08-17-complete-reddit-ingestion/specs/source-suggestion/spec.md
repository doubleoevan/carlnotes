## MODIFIED Requirements

### Requirement: Every suggestion is verified before it is offered

The route SHALL confirm that each candidate is real and readable before returning it, using the same readers the ingesters use, so a verified suggestion means the ingester that will later read it can read it today:

- an `rss` candidate SHALL be fetched and parsed as a feed
- a `youtube` candidate SHALL be resolved to its channel or playlist Atom feed and parsed
- a `reddit` candidate SHALL be read through the reddit ingester's own keyless feed reader, not a second copy of that address, so the User-Agent, the host, and the feed path can never drift apart from what a Scan sends
- a `url` candidate SHALL be fetched
- the built-in web search needs no verification, since it names no external address

A `reddit` candidate SHALL first have its written name resolved by the ingester's own subreddit rule, which drops a leading `r/` and accepts only names reddit itself would accept. A candidate whose name that rule rejects SHALL be dropped without a fetch, since no Source built from it could ever ingest. The same rule SHALL decide the identity a `reddit` candidate is deduped by, so what a suggestion offers and what a Scan will read never disagree.

A candidate that fails SHALL be dropped without comment and without failing the request. The reader is offered fewer suggestions, never a broken one. Verification failures SHALL NOT be reported as errors, because a model proposing a feed that does not exist is the expected case this rule exists to absorb.

Candidates SHALL be verified concurrently, so the request costs one round trip rather than one per candidate. Verification SHALL NOT be paced by the reddit ingester's request queue: suggestion answers a request someone is waiting on, and it runs in the api process while ingestion runs in the worker, so that queue would never space a verification against a live Scan and would only add its keyless gap to the reply. A host that answers `429` is therefore still read as "not now" rather than "no such source".

A `403` from reddit SHALL also be read as "not now" for a `reddit` candidate, because reddit answers `403` to every request from an address range it blocks — so where the deployment is blocked, reading it as "no such subreddit" would drop every subreddit suggestion silently, leaving the reader to conclude Carl knows no subreddits. A subreddit that does not exist answers `404` instead, so an invented one is still dropped. For every other source kind a `403` SHALL keep its plain meaning and drop the candidate.

#### Scenario: An invented feed never reaches the reader

- **WHEN** the model proposes an rss url that returns 404 or does not parse as a feed
- **THEN** it is dropped, the remaining suggestions are still returned, and the request succeeds

#### Scenario: Every candidate failing returns an empty list

- **WHEN** none of the candidates verifies
- **THEN** the route returns an empty list and succeeds, rather than erroring

#### Scenario: A verified suggestion is one the ingester can read

- **WHEN** a subreddit suggestion is returned
- **THEN** it was confirmed through the same keyless `.rss` path the reddit ingester falls back to, by calling that ingester's own reader

#### Scenario: A blocked deployment still suggests subreddits

- **WHEN** reddit answers `403` to the deployment's address range for a subreddit that exists
- **THEN** the candidate is kept and offered, rather than every subreddit suggestion disappearing with nothing said

#### Scenario: An invented subreddit is still dropped from a blocked deployment

- **WHEN** reddit answers `404` for a subreddit the model invented
- **THEN** the candidate is dropped, since a missing subreddit and a blocked host answer differently

#### Scenario: A subreddit name reddit would not accept is dropped without a fetch

- **WHEN** the model proposes a `reddit` candidate whose value is not a name reddit would accept, such as a phrase with spaces
- **THEN** it is dropped before any request is made, rather than being fetched and possibly kept because a throttled host would not answer

#### Scenario: A written subreddit is offered once however the model spells it

- **WHEN** the model proposes `r/LocalLLaMA` for a Topic that already follows `localllama`
- **THEN** the two resolve to the same identity through the ingester's rule and the suggestion is dropped as one the Topic already has

#### Scenario: A resolved channel is verified as the channel it resolved to

- **WHEN** a `youtube` candidate named by handle or url has been resolved to an id
- **THEN** the Atom feed fetched to verify it is the one for that id, so what is verified is what will be stored

#### Scenario: A publisher Google News does not carry is dropped

- **WHEN** the model proposes a `googleNews` source whose publisher feed comes back empty
- **THEN** it is dropped rather than offered as a Source that would find nothing
