## ADDED Requirements

### Requirement: A suggestion names the source option it is added through

A suggested Source SHALL name the custom source **option** the editor adds it through rather than the Source kind it saves as, because an option is not always a kind: `googleNews` saves as `rss`. The request's excluded Sources SHALL speak the same vocabulary, so what the route filters against and what it returns are compared as the same thing.

The options a suggestion may name SHALL be exactly the ones the picker offers — `url`, `rss`, `googleNews`, `reddit`, and `youtube`. The built-in web search SHALL NOT be suggestible: it is a default Source that every new Topic already starts with, and the editor stages it from the default registry rather than as a custom row.

#### Scenario: A suggestion is staged through its own option

- **WHEN** the route returns a suggestion naming the `googleNews` option
- **THEN** the editor stages it through that option, which builds an `rss` Source whose config is the publisher's Google News feed

#### Scenario: The excluded Sources speak in options

- **WHEN** the editor sends what the Topic already holds
- **THEN** each one names the option it was added through, and a stored Source names the option whose kind it was saved as

#### Scenario: The web search is not suggested

- **WHEN** the model proposes sources for a Topic
- **THEN** the built-in web search is not among the options it may name

### Requirement: A news publisher is suggested as a Google News source

The prompt SHALL direct the model to propose a news publisher as a `googleNews` source named by the publisher's bare domain, rather than guessing at an RSS url the publisher may not offer. It SHALL reserve `rss` for a feed address the model actually knows.

#### Scenario: A publisher is named by its domain

- **WHEN** the model proposes a newspaper, a magazine, or a news site
- **THEN** it returns a `googleNews` source whose value is that publisher's domain, not an article url and not the publisher's name

## MODIFIED Requirements

### Requirement: Every suggestion is verified before it is offered

The route SHALL confirm that each candidate is real and readable before returning it, using the same readers the ingesters use, so a verified suggestion means the ingester that will later read it can read it today:

- an `rss` candidate SHALL be fetched and parsed as a feed
- a `googleNews` candidate SHALL have its publisher feed built and fetched, and SHALL be dropped when that feed carries no articles, since Google answers for a publisher it has never heard of with an empty feed
- a `youtube` candidate SHALL be resolved to its channel or playlist Atom feed and parsed
- a `reddit` candidate SHALL be fetched through the subreddit's keyless `.rss`
- a `url` candidate SHALL be fetched

A candidate that fails SHALL be dropped without comment and without failing the request. The reader is offered fewer suggestions, never a broken one. Verification failures SHALL NOT be reported as errors, because a model proposing a feed that does not exist is the expected case this rule exists to absorb.

Candidates SHALL be verified concurrently, so the request costs one round trip rather than one per candidate.

#### Scenario: An invented feed never reaches the reader

- **WHEN** the model proposes an rss url that returns 404 or does not parse as a feed
- **THEN** it is dropped, the remaining suggestions are still returned, and the request succeeds

#### Scenario: A publisher Google News does not carry is dropped

- **WHEN** the model proposes a `googleNews` source whose publisher feed comes back empty
- **THEN** it is dropped rather than offered as a Source that would find nothing

#### Scenario: Every candidate failing returns an empty list

- **WHEN** none of the candidates verifies
- **THEN** the route returns an empty list and succeeds, rather than erroring

#### Scenario: A verified suggestion is one the ingester can read

- **WHEN** a subreddit suggestion is returned
- **THEN** it was confirmed through the same keyless `.rss` path the reddit ingester falls back to

### Requirement: A suggestion is never something the Topic already has

The request SHALL include every Source the editor currently holds — the stored ones, the ones staged but unsaved, and the ones derived from urls written into the prompt. The route SHALL filter candidates against that list server-side, so a repeat click proposes something new instead of what is already on screen.

Filtering SHALL compare Sources the way the Scan does, so a feed proposed under a url that differs only in tracking parameters, case, or a trailing slash is recognized as one the Topic already has. A `googleNews` candidate SHALL be identified by the publisher it covers, so it is the same Source as that publisher's own feed and neither is offered when the Topic already holds the other.

The route SHALL return at most the number of suggestions the caller asks for, so a Topic near its Source cap is never offered more than it can hold.

#### Scenario: Clicking twice proposes something new

- **WHEN** a reader accepts the first suggestions and asks again, sending them among the excluded Sources
- **THEN** none of the new suggestions repeats one already staged

#### Scenario: A differently written duplicate is still a duplicate

- **WHEN** a candidate names a feed the Topic already holds under a url carrying a tracking parameter
- **THEN** it is filtered out

#### Scenario: A publisher is one Source however it is followed

- **WHEN** a Topic already holds a publisher's own rss feed and the model proposes that publisher as a `googleNews` source
- **THEN** the candidate is filtered out, and the same holds the other way around

#### Scenario: The reply respects the requested count

- **WHEN** the caller asks for one suggestion
- **THEN** at most one is returned, however many verified
