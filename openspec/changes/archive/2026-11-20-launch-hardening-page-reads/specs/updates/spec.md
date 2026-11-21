## MODIFIED Requirements

### Requirement: The home reads the day's recap without building a list

A signed-in user's home, and the news on their own profile page, SHALL read the day's recap on its own: the recap a
list would show, from the same cache, prompt, wait, and budget rule, with no Finding marked read. A user with no
unread Finding SHALL keep the recap the day already stored, and no model call SHALL run for them. A read that ends with
no recap, because nothing is unread, the budget is spent, or the call failed, SHALL store that under the recap's own
key for 60 seconds, so a reload inside the minute repeats no unread read, no reservation, and no model call, and a list
built inside that minute shows no recap. A recap that a slower call stores SHALL replace it. A missing recap SHALL
leave the card with its news alone. `GET /api/updates/recap` SHALL return it as `recap`, and
`GET /api/updates/opener` SHALL return the same recap as `opener` for the 0.1.0 mobile app until that release retires.
Customer copy SHALL call it the AI recap.

#### Scenario: The 0.1.0 app reads the recap under its first route

- **WHEN** the 0.1.0 mobile app asks `GET /api/updates/opener`
- **THEN** it receives the day's recap as `opener`

#### Scenario: The home's opener is the list's opener

- **WHEN** a user opens the home and then asks an AI app for a list on the same day
- **THEN** both show the same recap, and one model call wrote it

#### Scenario: Reading the opener marks nothing read

- **WHEN** a user with twelve unread Findings opens the home
- **THEN** the twelve stay unread

#### Scenario: The day's opener stays after the last Finding is read

- **WHEN** a user's home showed the day's recap and the user then reads every Finding
- **THEN** the home still shows that recap for the rest of the day, and no model call runs

#### Scenario: A spent budget shows the news alone

- **WHEN** the recap's reservation is rejected
- **THEN** the home's card shows the news with nothing in the recap's place

#### Scenario: An empty read is remembered for a minute

- **WHEN** a user with nothing unread loads the home twice inside a minute
- **THEN** the second load reads the stored marker and sends no read of the user's unread Findings

#### Scenario: A failing model is not called on every load

- **WHEN** the recap's call fails and the user reloads the home inside a minute
- **THEN** no second call runs, no second reservation is made, and no second error is reported

#### Scenario: The marker ends after a minute

- **WHEN** a Scan keeps new Findings for a user whose last read stored the marker
- **THEN** the first read after the marker's minute writes the day's recap
