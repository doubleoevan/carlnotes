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

### Requirement: A Bluesky account is suggestible and verified like any other Source

The suggestion flow SHALL offer `bluesky` accounts alongside the other editable source kinds, and its prompt SHALL state what a Bluesky value is — an account handle, which is a domain name — and that what the Source reads is the articles the account links to rather than its posts, so an account that mostly shares links is worth proposing and one that mostly talks is not.

A suggested account SHALL be verified before it is offered, through the same credential-free appview read its ingester uses, asking for a single post rather than a scan's worth. An account the appview refuses SHALL be dropped, since a model inventing a plausible-sounding handle is the failure this catches. A refusal that is a rate limit or a server error SHALL keep the suggestion, as it already does for every other kind, because that is the host declining to answer rather than saying the account is not there.

#### Scenario: A real account is offered

- **WHEN** the model proposes a `bluesky` account that exists
- **THEN** the appview serves its posts and the account is offered to the owner

#### Scenario: An invented handle is dropped

- **WHEN** the model proposes a plausible-sounding handle for an account that does not exist
- **THEN** the appview refuses it and the suggestion is dropped rather than offered

#### Scenario: A throttled check keeps the suggestion

- **WHEN** verifying a suggested account is rate limited or meets a server error
- **THEN** the suggestion is kept, the same as for every other source kind

### Requirement: A Bluesky account and a feed on the same domain are different Sources

Suggestion identity SHALL key a `bluesky` account on its handle, lowercased and without any leading `@`, so the same account written differently is one Source. It SHALL NOT key an account by its host the way a feed is keyed: a handle is usually the publication's own domain, so keying both the same way would read a Topic that follows a site's feed as already following its account, and suppress a suggestion that is genuinely a different thing to read.

#### Scenario: One account however its handle was written

- **WHEN** the same account is written with a leading `@`, or in different case
- **THEN** both resolve to one identity, so it is never suggested to a Topic that already has it

#### Scenario: An account is not its website's feed

- **WHEN** a Topic already follows a publication's rss feed and the model proposes that publication's Bluesky account
- **THEN** the two hold different identities and the account is still offered

