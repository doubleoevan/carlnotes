## ADDED Requirements

### Requirement: An admin reads a person's stored opener

`GET /api/profiles/:userId/opener` SHALL return the person's stored opener for today, or null, to a signed-in
admin, and a 403 to anyone else. It SHALL read the cache alone: no Finding is read or marked read, no model call runs,
and no budget is reserved. The news on that person's profile SHALL show the opener to the admin in the user view,
read only.

#### Scenario: The person already has an opener today

- **WHEN** an admin opens the profile of a person whose home showed the day's opener
- **THEN** the admin's news card shows that opener

#### Scenario: The person has no opener today

- **WHEN** an admin opens the profile of a person who has not opened the home today
- **THEN** the news card shows the news alone, and no model call runs

#### Scenario: The person has an unconverted private Topic

- **WHEN** an admin opens the profile of a person whose private Topic still has Personal sources text to convert
- **THEN** the route returns null, and the news card shows the news alone

#### Scenario: A non-admin asks

- **WHEN** a signed-in user who is not an admin asks for another person's opener
- **THEN** the route returns 403
