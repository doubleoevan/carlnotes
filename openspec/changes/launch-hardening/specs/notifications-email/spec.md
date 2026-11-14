## MODIFIED Requirements

### Requirement: A person gets at most one notifications email a day, and none on a quiet day

The sweep SHALL send each person at most one notifications email per UTC day, after a fixed UTC hour. It SHALL send one
only if that person has something to read since their last notifications email, or in the last 24 hours for a first one.
A person with nothing to read SHALL get no email. The sweep SHALL record that quiet day for the person, so no later
sweep that day reads them again, and what happens later that day SHALL be in the next day's email. A quiet day's record
SHALL NOT count as a notifications email: the next email SHALL cover everything after the last one that was sent.

#### Scenario: Two reactions make one email

- **WHEN** two users react to a Finding on a person's Topic during one day
- **THEN** that person gets one notifications email that names both

#### Scenario: A quiet day sends nothing

- **WHEN** nobody reacts to, comments on, replies to, or mentions a person for a day
- **THEN** no notifications email is sent to them

#### Scenario: A second sweep the same day sends nothing

- **WHEN** the sweep runs again after sending a person's email that day
- **THEN** it sends them nothing more, and what happens later that day is in the next day's email

#### Scenario: A failed send is retried

- **WHEN** the mailer rejects a person's notifications email
- **THEN** the next sweep that day sends it, with nothing left out

#### Scenario: A quiet person is read once that day

- **GIVEN** a person with nothing to read at the day's first sweep after the fixed hour
- **WHEN** later sweeps run that day
- **THEN** none of them reads that person's reactions, comments, replies, or mentions again

#### Scenario: A late reaction waits for the next day's email

- **GIVEN** a person recorded as quiet at 15:00 UTC who gets a reaction at 18:00 UTC
- **WHEN** the next day's sweep runs after the fixed hour
- **THEN** their email names that reaction, and nothing after their last sent email is left out
