## RENAMED Requirements

- FROM: `### Requirement: Carl writes one opener a day`
- TO: `### Requirement: Carl writes one recap a day`
- FROM: `### Requirement: An opener never blocks a list`
- TO: `### Requirement: A recap never blocks a list`
- FROM: `### Requirement: The home reads the day's opener without building a list`
- TO: `### Requirement: The home reads the day's recap without building a list`
- FROM: `### Requirement: An admin reads a person's opener`
- TO: `### Requirement: An admin reads a person's recap`

## MODIFIED Requirements

### Requirement: Carl writes one recap a day

One `scoreModel` call SHALL write the list's recap in Carl's voice, cached per user per UTC day, and per Topic for a
scoped list. The prompt SHALL keep the recap true for any list that day, so it names no single Finding or count.
Findings' text SHALL reach the model fenced as untrusted.

#### Scenario: The second list of the day

- **WHEN** a user asks for a second list on the same day
- **THEN** it shows the cached recap and no model call runs

#### Scenario: A scoped list has its own opener

- **WHEN** a user asks for a list on one Topic after a list across Topics on the same day
- **THEN** one model call writes that Topic's recap

#### Scenario: Carl never reports what the reader missed

- **WHEN** the recap prompt is evaluated
- **THEN** no generated recap says the reader missed anything, guilt-trips them, or asks them to come back

### Requirement: A recap never blocks a list

The recap SHALL reserve its largest cost before the call and SHALL bill the user's own LiteLLM key. A spent budget or a
failed call SHALL return the list without a recap. A list SHALL wait at most 5 seconds for its recap, and a slower
call SHALL still store its recap for the next list. A list with no Findings SHALL show the empty state and run no
model call.

#### Scenario: The budget is spent

- **WHEN** the reservation is rejected
- **THEN** the list returns its Findings with no recap, and the Findings count as read

#### Scenario: The opener is slow

- **WHEN** the model call takes longer than 5 seconds
- **THEN** the list returns with no recap, and the next list that day reads the recap the call stored

#### Scenario: Nothing is unread

- **WHEN** the user has no unread Findings
- **THEN** the MCP view shows the empty state and no model call runs

### Requirement: The tool result fits the page budget and reads as text

The `read_updates` result SHALL fit the MCP page budget. A Finding that would overflow it SHALL join what did not
fit and stay unread. The text result SHALL hold the recap, each Finding's title, Topic, link, and explanation, and the
more link, so a host without UI gets the whole list.

#### Scenario: A host without UI

- **WHEN** a client that renders no MCP view calls `read_updates`
- **THEN** its text and structured content hold the whole list

#### Scenario: Long explanations

- **WHEN** a 30-minute list's Findings would pass the page budget
- **THEN** the result ends at a whole Finding, the rest count toward more, and they stay unread

### Requirement: The home reads the day's recap without building a list

A signed-in user's home, and the news on their own profile page, SHALL read the day's recap on its own: the recap a
list would show, from the same cache, prompt, wait, and budget rule, with no Finding marked read. A user with no
unread Finding SHALL keep the recap the day already stored, and no model call SHALL run for them. A missing recap
SHALL leave the card with its news alone. `GET /api/updates/recap` SHALL return it as `recap`, and
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

### Requirement: An admin reads a person's recap

`GET /api/profiles/:userId/recap` SHALL return the recap the person's home shows today, or null, to a signed-in
admin, and a 403 to anyone else. If the day has no recap yet, it SHALL write one as the home does: on the person's
budget, stored for the person's home, with no Finding marked read. The news on that person's profile SHALL show the
recap to the admin in the user view, read only.

#### Scenario: The person already has an opener today

- **WHEN** an admin opens the profile of a person whose home showed the day's recap
- **THEN** the admin's news card shows that recap, and no model call runs

#### Scenario: The person has no opener today

- **WHEN** an admin opens the profile of a person who has not opened the home today and has unread Findings
- **THEN** Carl writes the day's recap on the person's budget, the admin's news card shows it, and the person's home
  shows the same recap that day

#### Scenario: The person has an unconverted private Topic

- **WHEN** an admin opens the profile of a person whose private Topic still has Personal sources text to convert
- **THEN** the route returns null, no model call runs, and the news card shows the news alone

#### Scenario: A non-admin asks

- **WHEN** a signed-in user who is not an admin asks for another person's recap
- **THEN** the route returns 403
