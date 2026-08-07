# source-suggestion Specification

## Purpose
TBD - created by archiving change suggest-sources-and-source-cap. Update Purpose after archive.
## Requirements
### Requirement: A Topic's own words propose its Sources

`POST /api/topics/suggest-sources` SHALL take `{ name, prompt, excludeSources }` and return Sources the Topic could add. Taking the Topic's text in the body rather than reading it from a stored Topic SHALL be deliberate, so the route serves a Topic that has never been saved and reflects what the editor holds right now rather than what was last written.

The route SHALL require a signed-in caller. It SHALL NOT draw on the daily scan quota, the monthly spend budget, or any metered allowance, because suggesting is not scanning and a reader setting a Topic up has not asked for a Scan.

A cheap-tier model SHALL generate the candidates from a versioned prompt under `worker/prompts`, with structured output, so what comes back is a typed list rather than prose to parse. The Topic's name and prompt SHALL be interpolated as untrusted data, as every model-facing prompt already requires.

The prompt SHALL prefer Sources that keep producing: rss feeds, youtube channels, and subreddits. It SHALL propose a `url` Source only for a page that collects material and offers no feed to follow instead. It MAY propose the built-in web search when the Topic does not currently have it.

#### Scenario: An unsaved Topic gets suggestions

- **WHEN** the modal is creating a Topic that has never been saved and asks for suggestions
- **THEN** the route answers from the name and prompt in the request body, with no stored Topic involved

#### Scenario: Suggestions cost the caller nothing

- **WHEN** a signed-in reader asks for suggestions
- **THEN** no daily scan quota is drawn down, no spend is metered against them, and their remaining scans are unchanged

#### Scenario: A signed-out caller is rejected

- **WHEN** a request arrives with no session
- **THEN** it is rejected and no model call is made

#### Scenario: The Topic's words reach the model as data

- **WHEN** the prompt is written for a Topic whose prompt text contains an instruction
- **THEN** that text is interpolated as untrusted data and described rather than obeyed

### Requirement: Every suggestion is verified before it is offered

The route SHALL confirm that each candidate is real and readable before returning it, using the same readers the ingesters use, so a verified suggestion means the ingester that will later read it can read it today:

- an `rss` candidate SHALL be fetched and parsed as a feed
- a `youtube` candidate SHALL be resolved to its channel or playlist Atom feed and parsed
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

### Requirement: A suggestion is never something the Topic already has

The request SHALL include every Source the editor currently holds — the stored ones, the ones staged but unsaved, and the ones derived from urls written into the prompt. The route SHALL filter candidates against that list server-side, so a repeat click proposes something new instead of what is already on screen.

Filtering SHALL compare Sources the way the Scan does, so a feed proposed under a url that differs only in tracking parameters, case, or a trailing slash is recognized as one the Topic already has.

The route SHALL return at most the number of suggestions the caller asks for, so a Topic near its Source cap is never offered more than it can hold.

#### Scenario: Clicking twice proposes something new

- **WHEN** a reader accepts the first suggestions and asks again, sending them among the excluded Sources
- **THEN** none of the new suggestions repeats one already staged

#### Scenario: A differently written duplicate is still a duplicate

- **WHEN** a candidate names a feed the Topic already holds under a url carrying a tracking parameter
- **THEN** it is filtered out

#### Scenario: The reply respects the requested count

- **WHEN** the caller asks for one suggestion
- **THEN** at most one is returned, however many verified

