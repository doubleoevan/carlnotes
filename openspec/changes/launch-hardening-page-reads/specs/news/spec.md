## MODIFIED Requirements

### Requirement: The news is read in numbered pages of five under a rate limit

A news read SHALL return one numbered page of five rows, the window's total, the Podcast Episodes its rows play, and the
window's cursor. A read of another page that passes the cursor back SHALL read the window as its first read fixed it,
SHALL take the window's total from the cursor, and SHALL NOT count the window again, so only a read with no cursor
counts it. Reads SHALL be limited to 120 a minute for a signed-in user, or for an address for a visitor, and a read past
the limit SHALL be rejected.

#### Scenario: A window is paged

- **WHEN** a week's news holds 12 rows
- **THEN** the first page returns 5 rows and a total of 12, and the second and third pages return the other 7

#### Scenario: A cursor with an impossible time is rejected

- **WHEN** a read passes back a cursor whose time is later than a day from now
- **THEN** the read is rejected as an invalid cursor, and nothing is read

#### Scenario: A scraper is slowed

- **WHEN** one address sends 121 news reads inside a minute
- **THEN** the 121st is rejected as rate limited

#### Scenario: A later page does not count the window again

- **WHEN** the second page of a week's news that holds 12 rows is read with the first page's cursor
- **THEN** the response's total is the 12 that the cursor holds, and the read sends no count of the window

## ADDED Requirements

### Requirement: A person's own first page of news is cached for a minute and cleared by their own writes

The first page of a signed-in person's own news, in each window, SHALL be served from a copy of that person's own for 60
seconds, never shared with another reader. That person's own Comment, reaction, Topic Post publish or delete, and follow
or unfollow SHALL clear it, and the client SHALL read its news again after the same writes, so a person sees their own
activity at once.

#### Scenario: A reload inside a minute reads no news rows

- **WHEN** a signed-in user loads their home twice inside a minute with no write between
- **THEN** the second read of the week's first page is served from their copy and reads no news row

#### Scenario: A person's own Comment shows at once

- **WHEN** a person posts a Comment and then reads their own news
- **THEN** the first page holds the Comment's event, in the session that posted it and after a reload

#### Scenario: Another reader never gets a person's copy

- **WHEN** a signed-in user reads the news on another person's profile
- **THEN** it is read for that reader with the reader's user blocks applied, never from the profile's person's copy

#### Scenario: A later page is read each time

- **WHEN** a person opens the second page of their news
- **THEN** it is read from the database, and no copy of it is stored

### Requirement: The own group finds its events through indexes and returns the same rows

The own group's reads of Comments, reactions, and Topic Posts SHALL find their candidate rows through indexes inside the
window, starting from the person's Topics, Topic Posts, and Comments, and SHALL NOT walk every Comment and reaction of
the window. Each kind SHALL keep the filter that decides a row, so the read SHALL return the rows it returned before,
each once.

#### Scenario: A row that fits two ways shows once

- **WHEN** someone replies to a person's Comment on that person's own Topic
- **THEN** the person's own group holds the reply once

#### Scenario: An event on someone else's Topic still shows

- **WHEN** someone reacts to a person's Comment on a Topic that the person does not own
- **THEN** the person's own group holds the reaction's row, as before

#### Scenario: A busy site costs a person their own rows

- **WHEN** a person's own group is read on a site whose week holds 50,000 Comments by other people on other Topics
- **THEN** the read's plan starts from the person's own Topics, Topic Posts, and Comments, and reads none of those other
  rows
