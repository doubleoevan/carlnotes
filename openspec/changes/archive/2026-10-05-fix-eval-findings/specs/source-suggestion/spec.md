## MODIFIED Requirements

### Requirement: A suggested Source is resolved to what its ingester stores

Before a candidate is deduped or verified, the route SHALL resolve its value into the form its ingester stores, and SHALL return that resolved value rather than what the model wrote. What the route returns is staged by the editor and saved as the Source's config verbatim, so a value the ingester cannot read would be stored as a broken Source rather than caught.

Every candidate's value SHALL first lose its own option written in front of it, as in `googleNews:example.com` or `x:cycling`, compared without case. Another option's name in front of a value SHALL stay, since it is not this candidate's option.

A `youtube` candidate SHALL be resolved to a channel or playlist id, accepting every way a channel is named:

- a raw channel or playlist id, which is already what the feed reads
- a channel url or a playlist url, each of which carries an id that would otherwise be discarded for being wrapped in a url
- a channel handle, written bare or as a url, which names no id at all and SHALL be looked up against the channel page

A handle SHALL be resolved by reading the channel page's canonical link, because the page also names other channels and any of those would resolve to the wrong channel. A candidate that resolves to no channel or playlist SHALL be dropped, the same as one that fails verification.

A `podcast` candidate SHALL be resolved to the iTunes id of a show whose name matches the candidate's, ignoring case, spacing, and punctuation: a show of the exact name first, or else the first show whose name holds the candidate's or is held by it. A candidate whose name finds no such show that publishes a feed SHALL be dropped, even when iTunes returned other shows.

A `googleNews` candidate SHALL be named by its publisher's bare domain, so a value written as a url becomes its domain.

An `rss` or `url` candidate written without a scheme SHALL be read over https. An `rss` candidate that is an html page SHALL resolve to the first rss or atom feed that the page's link tags advertise, resolved against the page's address. A page that advertises no feed, or cannot be read, SHALL keep its value and be left to verification.

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

#### Scenario: A value loses its own option written in front of it

- **WHEN** the model proposes a `googleNews` source as `googleNews:cyclingweekly.com`
- **THEN** the suggestion returned is `cyclingweekly.com`

#### Scenario: A podcast of another name is not taken

- **WHEN** the model proposes a show iTunes does not have, and iTunes returns a show of another name
- **THEN** the candidate is dropped instead of resolving to that other show

#### Scenario: A blog proposed as a feed resolves to its feed

- **WHEN** the model proposes `example.com` as an `rss` source, and the page at `https://example.com` advertises
  `/feed.xml` in its link tags
- **THEN** the suggestion returned is `https://example.com/feed.xml`, which verification then reads as a feed

### Requirement: A news publisher is suggested as a Google News source

The prompt SHALL direct the model to propose a news publisher as a `googleNews` source named by the publisher's bare domain, rather than guessing at an RSS url the publisher may not offer. It SHALL reserve `rss` for a feed address the model actually knows. It SHALL direct the model to propose a `googleNews` source only for a site whose main work is publishing news or articles, and never for a shop, a brand's own site, a code host, a documentation site, a forum, or a personal blog.

#### Scenario: A publisher is named by its domain

- **WHEN** the model proposes a newspaper, a magazine, or a news site
- **THEN** it returns a `googleNews` source whose value is that publisher's domain, not an article url and not the publisher's name

#### Scenario: A shop is not a news publisher

- **WHEN** the web search for a gear topic returns shop pages
- **THEN** the prompt directs the model to skip them instead of proposing a shop's domain as a `googleNews` source
