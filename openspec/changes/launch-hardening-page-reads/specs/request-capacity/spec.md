## ADDED Requirements

### Requirement: A visitor cannot pass as a page render

A request that reaches the api with a forwarded header that names an internal address, another address, or nothing SHALL
be counted under its sender's own address, because the ingress appends the sender to whatever the sender wrote. A
request sent straight to a service's own hostname SHALL be counted the same way. Only a request with no session and no
external address in its forwarded chain SHALL read as a page render's.

#### Scenario: A forged internal address is counted under the sender

- **WHEN** a visitor sends a request with `X-Forwarded-For: 10.0.0.5`, through Cloudflare or to the origin directly
- **THEN** the request is counted under the visitor's own address, and a limiter that skips a page render counts it

#### Scenario: A request relayed through a Worker is counted

- **WHEN** a Cloudflare Worker relays a request to the site
- **THEN** its client address resolves to the Workers address that `cf-connecting-ip` names, the request is counted
  under that address, and it never reads as a page render's

#### Scenario: The page limit counts each visitor under their own address

- **WHEN** two visitors at different addresses request pages that the web service renders
- **THEN** the page limit counts each under their own address, never both under one shared address

### Requirement: The shown check stops counting at the Finding minimum

The check that a public Topic holds the Finding minimum SHALL read at most that many of the Topic's Findings, never
count them all, and SHALL keep the set of Topics it lets through. Every read that asks whether a Topic is public and
shown SHALL use that one check: the home's id reads, the feed's sections, the Topic view rule, the sitemap, the MCP
topic lists, the related reads, and the search.

#### Scenario: A busy Topic costs three rows

- **WHEN** the home's id read checks a public Topic that holds 78 Findings
- **THEN** the check reads three Findings of that Topic through an index led by the Topic, and no more

#### Scenario: The same Topics are shown

- **WHEN** the bounded check and the full count are run over the same Topics
- **THEN** both let the same Topics through, and a Finding rated thumbs down counts toward neither

### Requirement: The home's newest podcast episode and film reads use an index on the publish time

`episodes` SHALL have a partial index on `published_at`, newest first, over its published rows, so the home's reads of
the week's new Podcast Episodes and films read by index instead of scanning and sorting the table. The index SHALL be
built by hand before the release whose migration declares it, so no write waits on the build.

#### Scenario: The week's new podcast episodes read by index

- **WHEN** the home's cached ids are rebuilt on a database seeded to launch scale
- **THEN** the reads of the newest Podcast Episodes and the newest films plan through `episodes_published_at_idx`

#### Scenario: The migration finds the index built

- **WHEN** the release's migration reaches the index
- **THEN** the index already exists and is valid, and the migration skips it without a lock on the table's writes

### Requirement: A page's reads of a growing table are held to an index by a plan check

Every query that the home, topic, profile, team, Topic Post, podcast episode, and Dashboard pages send against a table
that grows SHALL plan through an index on a database seeded to launch scale. Those reads SHALL join the plan smoke
check, so a later change that turns one into a sequential scan fails the check. The seeded database SHALL be a branch of
its own and never the dev database, where the worker would scan the seeded Topics.

#### Scenario: A sequential scan fails the check

- **WHEN** a change makes one of those reads scan a growing table from end to end
- **THEN** the plan smoke check fails and names the read

#### Scenario: The seed never reaches the dev worker

- **WHEN** the plans are read at launch scale
- **THEN** the seeded rows live in a database branch that no worker scans, and the dev database holds none of them

## MODIFIED Requirements

### Requirement: A page render's own api calls are never limited

The general, topic feed, link preview, search, social read, and Dashboard read limits, and the search's count of a
visitor's query embeddings, SHALL skip a request with no session and no address the trusted proxies resolve as external,
which is what a page render's own call to the api is, over loopback or from another service over the private network,
because a render's fetch sends no cookie and no forwarded header. Every limiter on a route that a page render reads
SHALL skip that request, and the server's api client SHALL set no forwarding header. A request with a signed-in user
SHALL still be counted under that user.

#### Scenario: A burst of renders calls the api freely

- **WHEN** page renders send 5,000 requests to `/api/topic-feed` and other `/api` routes inside a minute, over loopback
  or over the private network
- **THEN** none gets a 429

#### Scenario: Topic Post renders no longer share the social read limit

- **WHEN** visitors' renders of 200 different Topic Post pages each read their Topic Post over loopback or over the
  private network inside a minute
- **THEN** every read succeeds, where today the 121st gets a 429 from the shared bucket

#### Scenario: Dashboard page renders skip the Dashboard read limit

- **WHEN** visitors' renders of 200 different Dashboard pages each read their Dashboard inside a minute
- **THEN** every read succeeds, and none counts against the Dashboard read limit

#### Scenario: A render's search spends no visitor's embedding count

- **WHEN** renders of 30 visitors' search pages each embed a new query inside a minute
- **THEN** none is turned away by the count of a visitor's query embeddings, which a request the search limit skips
  never joins

#### Scenario: The server's client sets no forwarding header

- **WHEN** a page render's loader calls the api
- **THEN** the request carries no cookie, no `x-forwarded-for`, and no other forwarding header

### Requirement: Visitors share one copy of what every visitor sees

The signed-out feed SHALL be served from one Redis copy per view, all or unread, for 30 seconds across every replica, so
a copy is built only by the requests that miss it. A visitor's topic page read SHALL be served from one Redis copy per
Topic for 30 seconds, its Similar topics included, and the Topic's page read SHALL be served the same way with its head
in the copy. Every edit or delete of a Topic, every Source added to or removed from it, and every team attach or detach
of it SHALL drop its page copy. Each SHALL drop it through the clear by Topic that the page-reads capability states,
which the pipeline's writes run too, so a published podcast episode, a removed one, and a film's swap drop the page copy
and never wait out its 30 seconds. A save from the topic editor, a Topic Tool edit, and a delete SHALL also drop the
visitors' feed copies with the shared featured and popular topic id lists if the Topic was or is public or the change
released a feature order. A Topic made private SHALL leave those copies once its save returns, with two limits, each no
longer than a copy's 30 seconds: a read already loading when the save returns MAY write its copy once more, for at most
the copy's 30 seconds, and another Topic's page copy MAY still list the Topic among its Similar topics until that copy's
30 seconds end. A featuring change SHALL drop the feed copies with the featured and popular topic id lists. A poll
reload SHALL keep its own two-second copy, and on the Topic's released route a signed-in user's topic page SHALL be read
fresh. A signed-in reader's page read SHALL follow the page-reads capability, which reads it fresh for the owner, an
editor, an admin, and any reader of a Topic that is not public. While Redis is unreachable each request SHALL build its
own.

#### Scenario: A thousand visitors cost a handful of feed builds

- **WHEN** a thousand visitors load the homepage within half a minute across two replicas
- **THEN** the feed is built only by the requests that found no copy, not once per visitor

#### Scenario: A listing change reaches visitors

- **WHEN** an admin changes a featured Topic's order
- **THEN** the next visitor's feed is built fresh

#### Scenario: A topic made private leaves the visitors' copies

- **GIVEN** a public Topic that no visitor's read is loading
- **WHEN** its owner makes it private
- **THEN** the next request for its page is served from the database, and the next visitor's feed is built fresh

#### Scenario: A read loading during the save writes its copy once more

- **WHEN** a visitor's read of a public Topic's page is loading as its owner makes the Topic private
- **THEN** the copy that read writes is served for at most 30 seconds, and a request after that is served from the
  database

#### Scenario: A worker's write drops the page copy

- **WHEN** a Topic's podcast episode publishes, or a film of the Topic becomes ready
- **THEN** the Topic's page copy is dropped by the activity that made the write, and the next visitor's read is built
  fresh
