## RENAMED Requirements

- FROM: `### Requirement: An admin reads a person's stored opener`
- TO: `### Requirement: An admin reads a person's opener`

## MODIFIED Requirements

### Requirement: An admin reads a person's opener

`GET /api/profiles/:userId/opener` SHALL return the opener the person's home shows today, or null, to a signed-in
admin, and a 403 to anyone else. If the day has no opener yet, it SHALL write one as the home does: on the person's
budget, stored for the person's home, with no Finding marked read. The news on that person's profile SHALL show the
opener to the admin in the user view, read only.

#### Scenario: The person already has an opener today

- **WHEN** an admin opens the profile of a person whose home showed the day's opener
- **THEN** the admin's news card shows that opener, and no model call runs

#### Scenario: The person has no opener today

- **WHEN** an admin opens the profile of a person who has not opened the home today and has unread Findings
- **THEN** Carl writes the day's opener on the person's budget, the admin's news card shows it, and the person's home
  shows the same opener that day

#### Scenario: The person has an unconverted private Topic

- **WHEN** an admin opens the profile of a person whose private Topic still has Personal sources text to convert
- **THEN** the route returns null, no model call runs, and the news card shows the news alone

#### Scenario: A non-admin asks

- **WHEN** a signed-in user who is not an admin asks for another person's opener
- **THEN** the route returns 403
