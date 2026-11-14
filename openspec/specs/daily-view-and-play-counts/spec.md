# daily-view-and-play-counts Specification

## Purpose
Daily view and play counts give every counted open and play a UTC day and a place, kept as daily totals per item and
place, so dashboards can chart audiences over time and on a map without storing an address or an individual event.

## Requirements

### Requirement: Views of topics, findings, and posts count once per person a day

A topic page visit, a finding open, and a Topic Post page visit SHALL each count as one view of that item, at most
once per person, item, and UTC day, for users and visitors alike, in the day's total for the request's place. A
crawler, a link unfurler, and a sender the counters cannot tell apart SHALL count nothing.

#### Scenario: A reload counts once

- **WHEN** a visitor opens a Topic Post page five times in one UTC day
- **THEN** that post's view total for the day rises by one

#### Scenario: The next day counts again

- **WHEN** the same visitor opens the post again the next UTC day
- **THEN** that day's total rises by one

### Requirement: Plays count by podcast episode, format, day, and place

Every accepted start of a podcast episode, as audio or as a film, from the web, the mobile app, MCP, a file download,
or a podcast feed SHALL count as one play in its format in the day's total for the request's place, finished or not.
A start retried by a podcast app within five minutes SHALL count once per person, podcast episode, and format.

#### Scenario: A film play counts as video

- **WHEN** a listener starts a podcast episode's film
- **THEN** that podcast episode's video play total for the day and place rises by one

#### Scenario: A retried download counts once

- **WHEN** a podcast app downloads one podcast episode three times within two minutes
- **THEN** the podcast episode's audio play total rises by one

### Requirement: Daily counts count distinct people as well as totals

Each day's total for an item, a format, and a place SHALL also count the distinct people behind it, so distinct
people can be counted across days, places, and items without storing who they were.

#### Scenario: One person over three days counts once in a range

- **WHEN** one visitor opens the same topic on three days of a week
- **THEN** the topic has three views and one visitor over that week

### Requirement: A place is read only from a trusted Cloudflare hop

The place SHALL be the country, region, city, postal code, metro code, latitude, and longitude in Cloudflare's
geolocation headers, read only if the request arrived through a trusted Cloudflare hop. The postal code, the metro
code, latitude, and longitude SHALL be stored exactly as sent, and a code that does not match its pattern SHALL be
dropped. Two postal codes in one city SHALL count as two places. A request with no trusted place SHALL count under an
unknown place, which counts in totals and gets no pin.

#### Scenario: A forged header is ignored

- **WHEN** a request sent straight to the origin has a `cf-ipcity` header
- **THEN** its view counts under the unknown place

#### Scenario: The mobile app's requests have places

- **WHEN** the mobile app opens a topic through carlnotes.com
- **THEN** the view counts under the city and postal code Cloudflare reported

### Requirement: No address or individual event is stored

The daily counts SHALL store daily totals and their distinct-people counts per item, format, place, and day only. No IP
address, raw header, user ID, or individual view or play SHALL be stored for them.

#### Scenario: The database holds no address

- **WHEN** a day of views from many networks has been counted
- **THEN** no table holds any of their IP addresses

#### Scenario: No user ID reaches a sketch

- **WHEN** a signed-in user views a topic
- **THEN** the view counts under a keyed hash of the user, and no Redis key, sketch, or daily count row holds their user
  ID

### Requirement: Daily counts are kept for 400 days

Daily count rows older than 400 days SHALL be deleted by the nightly run.

#### Scenario: An old day is deleted

- **WHEN** the nightly run finishes on a day 401 days after a counted day
- **THEN** that counted day's rows are gone

### Requirement: The all-time counters stay the visitor number

The existing all-time viewer and listener counters SHALL stay the source of the Visitors and Listeners counts on
topic, Topic Post, podcast episode, profile, and team pages. The daily counts SHALL not change them. A Dashboard page's
summary strip and charts count from the daily counts over their own ranges.

#### Scenario: Counters are unchanged by daily counts

- **WHEN** the daily counts start counting
- **THEN** every topic's Visitors count keeps rising from its existing value

### Requirement: Every place shows as its own pin

Each place SHALL show on the map as its own pin for an item and format, with any number of distinct people, one
included, at its finest known level: its postal code, then its city, then its country. A place SHALL sit at
Cloudflare's coordinates if it has them, else at its country's center. No place SHALL roll into its country.

#### Scenario: One visitor in a small town is pinned

- **WHEN** one person in a small town opens a public topic
- **THEN** the map shows a pin for the town's postal code with one visitor

#### Scenario: Two postal codes in one city count apart

- **WHEN** a city has 12 people in one postal code and 3 in another
- **THEN** the map's data holds a place with 12 and a place with 3, and no country place
