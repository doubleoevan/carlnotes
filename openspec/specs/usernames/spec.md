# usernames Specification

## Purpose
TBD - created by archiving change social-profiles-and-sharing. Update Purpose after archive.
## Requirements
### Requirement: Every account holds a username assigned at signup

Every user SHALL hold a username, assigned during signup without requiring the user to supply one. The username SHALL be shaped `Adjective-Noun`, drawn from two hand-picked word lists, with four random digits appended only when needed to break a collision — so a username reads as a name instead of a serial number.

The name SHALL be drawn inside the insert that creates the user, not written afterwards, so no row ever exists without one and both `users.username` and `users.username_normalized` can be NOT NULL. Signup SHALL check a batch of proposed names against the usernames already taken in a single query and take a free one; the unique index on `users.username_normalized` remains the tiebreaker if two signups draw the same name at the same moment.

#### Scenario: A new account is given a username without asking

- **WHEN** a user completes signup by any path
- **THEN** their account holds a username, and they were never blocked on supplying one

#### Scenario: A nameless row cannot be written

- **WHEN** a user row is inserted without a username
- **THEN** the database rejects it

#### Scenario: Proposed names are checked in one query

- **WHEN** a batch of proposed usernames is generated
- **THEN** the taken ones are eliminated by a single query against existing usernames, not one query per name

#### Scenario: Digits appear only on collision

- **WHEN** a generated `Adjective-Noun` pair is not already taken
- **THEN** it is offered with no digits appended

#### Scenario: A custom username can be typed instead

- **WHEN** a user wants a name other than the one they were assigned
- **THEN** they can type their own on the account page, subject to the same uniqueness and blocklist rules

#### Scenario: Candidates are checked in one query

- **WHEN** a batch of candidate usernames is generated
- **THEN** the taken ones are eliminated by a single query against existing usernames, not one query per candidate

### Requirement: The word lists are large enough that digits are the exception

Each word list SHALL be large enough that the digit suffix is the exception rather than the rule on a typical username. Both lists SHALL keep the coffee-and-reading vocabulary and SHALL be profanity-filtered.

A combination space small enough that most usernames need digits SHALL NOT ship. At that size the digits carry the identity, near-duplicates are the norm, and the username stops reading as a name — which defeats the reason for generating one at all.

#### Scenario: The lists are sized before launch

- **WHEN** the username generator is used at launch
- **THEN** each word list holds roughly forty entries, so the great majority of assigned usernames carry no digits

#### Scenario: Both lists are filtered

- **WHEN** a word is added to either list
- **THEN** it is checked against a profanity filter and fits the coffee-and-reading vocabulary

### Requirement: Usernames are case-insensitively unique and exclude a reserved blocklist

A username SHALL be unique without regard to case across users — enforced at the database level through the unique index on `users.username_normalized` instead of only in application code. Registering a username SHALL be rejected when its normalized form matches any existing username or any reserved slug.

The reserved list SHALL cover the names that would pass someone off as the site or its staff and every root route slug, as the usernames capability enumerates, so a username can never shadow a route. The list is enforced at registration: an existing user whose name matches a newly reserved word keeps their username, and only new registrations are rejected.

#### Scenario: Case does not create a second username

- **WHEN** a username differing from an existing one only by case is requested
- **THEN** it is rejected as taken

#### Scenario: A reserved word is rejected

- **WHEN** a user requests any reserved slug — a staff-impersonating name or a route slug — as their username
- **THEN** it is rejected

#### Scenario: A new root route joins the list before it ships

- **WHEN** a new root-level route is added to the app
- **THEN** its slug is added to the reserved list in the same change, and existing matching usernames are grandfathered instead of renamed

#### Scenario: A new top-level route needs no reservation

- **WHEN** a new top-level route is added to the app
- **THEN** the blocklist is unchanged, since no username addresses a route

#### Scenario: A reserved word is refused

- **WHEN** a user requests `admin`, `carl`, `support`, or `notesofcarl` as their username
- **THEN** it is refused

### Requirement: A username can be changed freely

A username is display only: a profile is addressed by user id, so no link points at a name. A user SHALL be able to change theirs as often as they like, with no history kept, no hold, and no limit. Every change SHALL be held to the same uniqueness and blocklist rules as an assigned name.

#### Scenario: A name can be changed repeatedly

- **WHEN** a user changes their username several times
- **THEN** each change is accepted, subject only to uniqueness and the blocklist

#### Scenario: A rename breaks no link

- **WHEN** a user changes their username
- **THEN** every link to their profile still resolves, because it addresses their user id

