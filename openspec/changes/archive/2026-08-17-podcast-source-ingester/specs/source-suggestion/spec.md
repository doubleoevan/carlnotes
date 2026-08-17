## MODIFIED Requirements

### Requirement: Every suggestion is verified before it is offered

The route SHALL confirm that each candidate is real and readable before returning it, using the same readers the ingesters use, so a verified suggestion means the ingester that will later read it can read it today:

- an `rss` candidate SHALL be fetched and parsed as a feed
- a `youtube` candidate SHALL be resolved to its channel or playlist Atom feed and parsed
- a `reddit` candidate SHALL be fetched through the subreddit's keyless `.rss`
- a `podcast` candidate SHALL be looked up in iTunes by the show name the model proposed
- a `url` candidate SHALL be fetched
- the built-in web search needs no verification, since it names no external address

A candidate that fails SHALL be dropped without comment and without failing the request. The reader is offered fewer suggestions, never a broken one. Verification failures SHALL NOT be reported as errors, because a model proposing a feed that does not exist is the expected case this rule exists to absorb.

Verification SHALL also be where a candidate whose proposed value is not what its Source stores is resolved into one that is. A `podcast` candidate is proposed as a show name, because a podcast id is a number a model would invent rather than know; the iTunes lookup SHALL replace that name with the matched show's id, and a candidate that resolves to no show, or to a show that publishes no feed, SHALL be dropped. A candidate needing resolution SHALL be dropped whenever its lookup fails, including when the failure is the host declining to answer, since there is no stored value to fall back on.

Candidates SHALL be verified concurrently, so the request costs one round trip rather than one per candidate.

#### Scenario: An invented feed never reaches the reader

- **WHEN** the model proposes an rss url that returns 404 or does not parse as a feed
- **THEN** that candidate is dropped and the remaining suggestions are still returned

#### Scenario: A verified suggestion is one the ingester can read

- **WHEN** a subreddit suggestion is returned
- **THEN** it was confirmed through the same keyless `.rss` path the reddit ingester falls back to

#### Scenario: A show name becomes the id its Source stores

- **WHEN** the model proposes a `podcast` candidate named by its show name and iTunes matches a show that publishes a feed
- **THEN** the suggestion returned to the editor carries that show's podcast id rather than the name, so staging it writes a Source the ingester can read

#### Scenario: An invented show never reaches the reader

- **WHEN** a `podcast` candidate's name matches no show in iTunes, or matches one that publishes no feed
- **THEN** that candidate is dropped rather than offered under a name no Source could store

#### Scenario: An unresolved show is dropped even when iTunes only declined

- **WHEN** the iTunes lookup for a `podcast` candidate times out or is rate limited
- **THEN** that candidate is dropped, because unlike a feed or a subreddit it has no verified value to stage

#### Scenario: Every candidate failing returns an empty list

- **WHEN** none of the candidates verifies
- **THEN** the route returns an empty list and succeeds, rather than erroring

#### Scenario: A resolved channel is verified as the channel it resolved to

- **WHEN** a `youtube` candidate named by handle or url has been resolved to an id
- **THEN** the Atom feed fetched to verify it is the one for that id, so what is verified is what will be stored

#### Scenario: A publisher Google News does not carry is dropped

- **WHEN** the model proposes a `googleNews` source whose publisher feed comes back empty
- **THEN** it is dropped rather than offered as a Source that would find nothing

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
### Requirement: A suggestion is never something the Topic already has

The request SHALL include every Source the editor currently holds — the stored ones, the ones staged but unsaved, and the ones derived from urls written into the prompt. The route SHALL filter candidates against that list server-side, so a repeat click proposes something new instead of what is already on screen.

Filtering SHALL compare Sources the way the Scan does, so a feed proposed under a url that differs only in tracking parameters, case, or a trailing slash is recognized as one the Topic already has.

Because a candidate needing resolution is proposed under a value that is not yet the one its Source stores, resolution SHALL run before the filter, so the filter compares the values Sources actually store. One pass SHALL compare each resolved candidate against both the Sources the Topic already holds and the candidates already kept in the same reply: a show proposed by name that resolves onto a Topic's existing podcast Source, or onto a show an earlier candidate in the same reply already took, SHALL be dropped.

The route SHALL return at most the number of suggestions the caller asks for, so a Topic near its Source cap is never offered more than it can hold.

#### Scenario: Clicking twice proposes something new

- **WHEN** a reader accepts the first suggestions and asks again, sending them among the excluded Sources
- **THEN** none of the new suggestions repeats one already staged

#### Scenario: A resolved show the Topic already follows is dropped

- **WHEN** a `podcast` candidate proposed by name resolves to the podcast id of a podcast Source the Topic already holds
- **THEN** it is dropped after resolution, even though its name did not match anything in the excluded list

#### Scenario: Two names for one show collapse

- **WHEN** two `podcast` candidates in one reply resolve to the same podcast id
- **THEN** only the first is offered

#### Scenario: A differently written duplicate is still a duplicate

- **WHEN** a candidate names a feed the Topic already holds under a url carrying a tracking parameter
- **THEN** it is filtered out

#### Scenario: The reply respects the requested count

- **WHEN** the caller asks for one suggestion
- **THEN** at most one is returned, however many verified

#### Scenario: A publisher is one Source however it is followed

- **WHEN** a Topic already holds a publisher's own rss feed and the model proposes that publisher as a `googleNews` source
- **THEN** the candidate is filtered out, and the same holds the other way around
