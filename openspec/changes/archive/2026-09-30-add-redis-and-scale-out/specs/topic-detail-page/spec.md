## ADDED Requirements

### Requirement: A poll reload of the topic page is served from a two-second cache

The topic page's reload while a Scan runs SHALL mark itself as a poll, and only a request marked as a poll SHALL be served from the Redis store's read-through cache, keyed by the Topic and by the user, or by one key every visitor shares, for two seconds. Two seconds is under the poll's shortest delay of three seconds, so one tab never reads the same cached page twice and a second tab of the same user on the same Topic shares one page build. A reload the page makes after the user's own edit SHALL NOT be marked as a poll and SHALL never be served from the cache, so a save is never followed by a page from before the save. While Redis is unreachable every reload SHALL build the page fresh.

#### Scenario: Two tabs share one build

- **WHEN** a user watches one Topic's scan in two tabs and both poll inside two seconds
- **THEN** the page is built once and both tabs receive it

#### Scenario: A save reloads fresh

- **WHEN** a user edits the Topic and the page reloads
- **THEN** the reload is not marked as a poll, is built fresh, and shows the edit

#### Scenario: A visitor's poll never serves a user's page

- **WHEN** a signed-out visitor and a signed-in user poll the same Topic inside two seconds
- **THEN** each receives the page built for them, since the cache is keyed by who asked
