## ADDED Requirements

### Requirement: A suggested Source is resolved to what its ingester stores

Before a candidate is deduped or verified, the route SHALL resolve its value into the form its ingester stores, and SHALL return that resolved value rather than what the model wrote. What the route returns is staged by the editor and saved as the Source's config verbatim, so a value the ingester cannot read would be stored as a broken Source rather than caught.

A `youtube` candidate SHALL be resolved to a channel or playlist id, accepting every way a channel is named:

- a raw channel or playlist id, which is already what the feed reads
- a channel url or a playlist url, each of which carries an id that would otherwise be discarded for being wrapped in a url
- a channel handle, written bare or as a url, which names no id at all and SHALL be looked up against the channel page

A handle SHALL be resolved by reading the channel page's canonical link, because the page also names other channels and any of those would resolve to the wrong channel. A candidate that resolves to no channel or playlist SHALL be dropped, the same as one that fails verification.

Resolution SHALL run before the duplicate filter, not inside verification. A stored Source is identified by its id, so a channel proposed by handle would otherwise be compared as a handle against an id and offered as new when the Topic already follows it.

Every other Source kind is already written the way its ingester reads it and SHALL pass through resolution unchanged.

#### Scenario: A channel named by its handle is stored as its id

- **WHEN** the model proposes a `youtube` source as `@veritasium`
- **THEN** the suggestion returned carries that channel's id, so the editor stages a Source its ingester can read

#### Scenario: An id wrapped in a url is not thrown away

- **WHEN** the model proposes a channel url or a playlist url
- **THEN** the id inside it is read out and returned, rather than the candidate being dropped for not being a bare id

#### Scenario: A handle resolves to its own channel and no other

- **WHEN** a channel page is read to resolve a handle
- **THEN** the id comes from the page's canonical link, not from the first channel the page happens to mention

#### Scenario: A channel already followed is not proposed again under its handle

- **WHEN** the Topic already follows a channel by its id and the model proposes that same channel by its handle
- **THEN** the candidate is recognized as a duplicate and filtered out

#### Scenario: A value naming no channel is dropped

- **WHEN** the model proposes a `youtube` source as a channel's display name, or as a handle nobody holds
- **THEN** it is dropped without failing the request, and the reader is offered one fewer suggestion

## MODIFIED Requirements

### Requirement: Every suggestion is verified before it is offered

The route SHALL confirm that each candidate is real and readable before returning it, using the same readers the ingesters use, so a verified suggestion means the ingester that will later read it can read it today:

- an `rss` candidate SHALL be fetched and parsed as a feed
- a `youtube` candidate SHALL be verified through the Atom feed of the channel or playlist id it resolved to, and parsed
- a `reddit` candidate SHALL be fetched through the subreddit's keyless `.rss`
- a `url` candidate SHALL be fetched
- the built-in web search needs no verification, since it names no external address

A candidate that fails SHALL be dropped without comment and without failing the request. The reader is offered fewer suggestions, never a broken one. Verification failures SHALL NOT be reported as errors, because a model proposing a feed that does not exist is the expected case this rule exists to absorb.

Candidates SHALL be verified concurrently, so the request costs one round trip rather than one per candidate.

#### Scenario: An invented feed never reaches the reader

- **WHEN** the model proposes an rss url that returns 404 or does not parse as a feed
- **THEN** it is dropped, the remaining suggestions are still returned, and the request succeeds

#### Scenario: Every candidate failing returns an empty list

- **WHEN** none of the candidates verifies
- **THEN** the route returns an empty list and succeeds, rather than erroring

#### Scenario: A verified suggestion is one the ingester can read

- **WHEN** a subreddit suggestion is returned
- **THEN** it was confirmed through the same keyless `.rss` path the reddit ingester falls back to

#### Scenario: A resolved channel is verified as the channel it resolved to

- **WHEN** a `youtube` candidate named by handle or url has been resolved to an id
- **THEN** the Atom feed fetched to verify it is the one for that id, so what is verified is what will be stored
