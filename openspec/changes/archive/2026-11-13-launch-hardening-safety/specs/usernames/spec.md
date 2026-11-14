## MODIFIED Requirements

### Requirement: Usernames are case-insensitively unique and exclude a reserved blocklist

A username SHALL be unique without regard to case across users — enforced at the database level through the unique
index on `users.username_normalized` instead of only in application code. Registering a username SHALL be rejected
when its normalized form matches any existing username or any reserved slug.

The reserved list SHALL cover the names that would pass someone off as the site or its staff, the podcast's second
host and the words official, staff, and moderator among them, and every root route slug, as the usernames capability
enumerates, so a username can never shadow a route. The list is enforced at registration: an existing user whose name
matches a newly reserved word keeps their username, and only new registrations are rejected.

#### Scenario: Case does not create a second username

- **WHEN** a username differing from an existing one only by case is requested
- **THEN** it is rejected as taken

#### Scenario: A reserved word is rejected

- **WHEN** a user requests any reserved slug — a staff-impersonating name or a route slug — as their username
- **THEN** it is rejected

#### Scenario: A new root route joins the list before it ships

- **WHEN** a new root-level route is added to the app
- **THEN** its slug is added to the reserved list in the same change, and existing matching usernames are
  grandfathered instead of renamed

#### Scenario: A new top-level route needs no reservation

- **WHEN** a new top-level route is added to the app
- **THEN** the blocklist is unchanged, since no username addresses a route

#### Scenario: A reserved word is refused

- **WHEN** a user requests `admin`, `carl`, `support`, or `notesofcarl` as their username
- **THEN** it is refused

#### Scenario: The second host's name and the staff words are rejected

- **WHEN** a user requests `vienna`, `official`, `staff`, or `moderator` as their username
- **THEN** it is rejected, and a user who already holds one of those names keeps it
