## RENAMED Requirements

- FROM: `### Requirement: The count is one cached read and is never polled`
- TO: `### Requirement: The count is one cached read that the badges poll includes`

## MODIFIED Requirements

### Requirement: The count is one cached read that the badges poll includes

The unseen mentions SHALL come from one read per signed-in user, cached on the server per user. The client SHALL read
it with the badges read, as the layout loads and on the badges poll, and by its own route as a later page or screen
loads and after the user's own Comment write. It SHALL have no timer of its own. A Comment write that mentions the
user, a Comment's delete, a seen mark, a block change, a Topic's visibility change, and a removal from a team SHALL
clear that user's cached entry.

#### Scenario: A Topic that turns private stops badging

- **GIVEN** a user with an unseen mention on a public Topic they do not follow
- **WHEN** the Topic's owner makes it private
- **THEN** the user's next page load counts no mention from it

#### Scenario: A page load refreshes the badges

- **WHEN** a user is mentioned while reading a page and then opens another page
- **THEN** the badges count the new mention after the second page loads, or after a badges poll that runs first

#### Scenario: A second page load is served from the cache

- **WHEN** a user opens two pages with no mention written, seen, or deleted in between
- **THEN** the second read runs no query

#### Scenario: The badges poll counts a new mention

- **WHEN** a user is mentioned while reading a page and stays on it
- **THEN** the badges count the mention after the next badges poll, at most 45 seconds later in a visible tab

#### Scenario: A poll with nothing new runs no query

- **WHEN** the badges poll runs with no mention written, seen, or deleted after the user's last read
- **THEN** the unseen mentions come from the cache and run no query
