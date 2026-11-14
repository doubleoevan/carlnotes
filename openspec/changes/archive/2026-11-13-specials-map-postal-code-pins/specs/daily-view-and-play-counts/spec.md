## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: A city shows only with ten distinct people

**Reason**: Every place shows on the map as its own pin with any number of people.

**Migration**: The next nightly build, or a Dashboard rebuild, replaces each snapshot's country pins with a pin per
place.

## ADDED Requirements

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
