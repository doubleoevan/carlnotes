## MODIFIED Requirements

### Requirement: A poll reload of the topic page is served from a two-second cache

The topic page's reload while a Scan runs SHALL mark itself as a poll, and only a request marked as a poll SHALL be
served from the Redis store's read-through cache, keyed by the Topic and by the user, or by one key every visitor
shares, for two seconds. Two seconds is under the poll's shortest delay of three seconds, so one tab never reads the
same cached page twice and a second tab of the same user on the same Topic shares one page build. The web's poll while a
Scan runs SHALL read the Scan's status, as the status-reads capability states, and SHALL send the reload marked as a
poll once, if that status leaves in progress. A released app's poll SHALL keep reloading the page on its own interval. A
visitor's poll reload SHALL be sent with a three-second edge lifetime, as the edge-caching capability states. A reload
the page makes after the user's own edit SHALL NOT be marked as a poll and SHALL never be served from the cache, so a
save is never followed by a page from before the save. While Redis is unreachable every reload SHALL build the page
fresh.

#### Scenario: Two tabs share one build

- **WHEN** a user watches one Topic's scan in two tabs and both poll inside two seconds
- **THEN** the page is built once and both tabs receive it

#### Scenario: A save reloads fresh

- **WHEN** a user edits the Topic and the page reloads
- **THEN** the reload is not marked as a poll, is built fresh, and shows the edit

#### Scenario: A visitor's poll never serves a user's page

- **WHEN** a signed-out visitor and a signed-in user poll the same Topic inside two seconds
- **THEN** each receives the page built for them, because the cache is keyed by who asked

#### Scenario: The web's poll reads the Scan's status

- **WHEN** a user watches a Scan on the web until it finishes
- **THEN** each poll reads the Scan's status and no page, and the page reloads once, marked as a poll, after the status
  leaves running

## ADDED Requirements

### Requirement: The topic page arrives in one page read

`GET /api/topics/:id/page` SHALL return the topic page's head with the page, the head built from rows the page already
loads. A visitor's read SHALL be served from the Topic's 30-second copy, head included, as the page-reads capability
states. `GET /api/topics/:id` SHALL stay as it is, with no head in it, for a released app and for a poll reload.

#### Scenario: A topic render is one request

- **WHEN** the server renders a public topic page
- **THEN** its loader sends the page read alone, where it sent the head and the page as two

#### Scenario: A warm render costs no query

- **WHEN** the server renders one public topic page twice inside 30 seconds
- **THEN** the second render's read sends no query, where the head alone sent eight

#### Scenario: A poll and a released app read no head

- **WHEN** a released app or a poll reload reads `GET /api/topics/:id`
- **THEN** the response holds the page as before and no head

#### Scenario: A gated Topic still has its card

- **WHEN** a visitor's page read names a private or an invite Topic
- **THEN** the response holds the head that the gated page has, the Topic's card with no Finding, recap, or prompt in
  it, beside the gated answer, whose content still names no private Topic

### Requirement: A reload that changes nothing keeps the shown Topic

On the web, a reload of the topic page whose payload equals the Topic shown SHALL keep the shown Topic as it is, so
nothing on the page renders again, and a reload that changes one part SHALL replace that part alone. The mobile app
SHALL keep doing the same through its query cache.

#### Scenario: An unchanged reload renders nothing

- **WHEN** a reload returns the payload the page already shows
- **THEN** the page keeps the Topic it holds, and no section renders again

#### Scenario: A changed part is replaced alone

- **WHEN** a reload returns a new Scan row and the same Findings
- **THEN** the Scan's row changes, and the Findings list keeps the objects it held
