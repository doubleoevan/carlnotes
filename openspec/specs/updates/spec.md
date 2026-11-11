# updates Specification

## Purpose
Define the updates list: the unread Findings a signed-in user should read next, ranked and trimmed to a reading
budget, with one opener in Carl's voice, in the `read_updates` tool and its MCP view.

## Requirements

### Requirement: One function builds the list

One api function SHALL build the list for the `read_updates` tool. Every plan SHALL have it. It SHALL need an account.

#### Scenario: A free user reads a list

- **WHEN** a signed-in user on the free plan asks for a list
- **THEN** the list returns under the same rules as every paid plan

#### Scenario: A visitor calls the tool

- **WHEN** an unconnected client calls `read_updates`
- **THEN** the result says an account is needed, no consumption is written, and no model call runs

### Requirement: A list ranks unread Findings with a recency boost

The list SHALL gather the unread Findings the user may read across the Topics they follow, under the same visibility
rules as the Feed. It SHALL rank them by relevance score, with a fixed boost for a Finding that arrived after the
user's last read time, and settle ties newest first, then by a stable key.

#### Scenario: A new Finding passes an older one of equal score

- **GIVEN** two unread Findings with one score, one that arrived after the user's last read time and one before it
- **WHEN** the user asks for a list
- **THEN** the newer Finding ranks first

#### Scenario: A consumed Finding stays out

- **WHEN** a Finding is already marked read
- **THEN** it does not enter the list

#### Scenario: A Topic the user may no longer read stays out

- **WHEN** a followed Topic turned private, an invite has not activated, or a private Topic another user owns still
  needs its Personal sources conversion
- **THEN** its Findings do not enter the list

### Requirement: The last read time sets the recency boost

The last read time SHALL be the newest time the user marked a Finding read, on any Topic, or on the one Topic of a
scoped list. The last read time SHALL set only the recency boost. Unread Findings that arrived before it SHALL stay
ranked, so a trimmed Finding reaches a later list.

#### Scenario: An older unread Finding returns later

- **GIVEN** a Finding that a list left out, and a newer read time after it
- **WHEN** the user asks for another list
- **THEN** that Finding can still rank in it

#### Scenario: A user with no consumptions

- **WHEN** a user who has marked nothing read asks for a list
- **THEN** no Finding gets the boost, and every unread Finding ranks by score

### Requirement: A list fits a reading budget

A list SHALL hold 15 minutes of reading by default, or 5 or 30 when asked. A read Finding SHALL count about 250 words a
minute from its stored size, and a watch or listen Finding SHALL count its stored duration. A Resource missing either
SHALL count a fixed estimate for its kind. Every other length SHALL be rejected as invalid input.

#### Scenario: Budget trims the ranked list

- **GIVEN** unread Findings worth forty minutes
- **WHEN** the user asks for a list with no length
- **THEN** the list holds Findings in ranked order up to 15 minutes

#### Scenario: A long Finding does not end the list

- **GIVEN** a ranked Finding too long for what remains of the budget and a shorter one after it
- **WHEN** the list is built
- **THEN** the shorter Finding joins the list and the long one counts toward what did not fit

#### Scenario: One long Finding still shows

- **WHEN** the top ranked Finding alone exceeds the budget
- **THEN** the list holds that one Finding

### Requirement: What does not fit collapses into one link

In the MCP view, unread Findings outside the list SHALL collapse into one "and N more" link to the Topics page, or
to the Topic's page in a scoped list. They SHALL stay unread.

#### Scenario: More remains

- **WHEN** the list leaves twelve unread Findings out
- **THEN** the MCP view shows one link for twelve more, which opens the Topics page on carlnotes.com, and those
  Findings stay unread

### Requirement: Shown Findings count as read

Building a list SHALL mark every Finding in it read for that user, in one write, before the list returns, so the next
list never repeats them. The write SHALL match a single consumption in what it stores and tracks.

#### Scenario: The next list moves on

- **WHEN** a user asks for two lists in a row
- **THEN** no Finding appears in both

#### Scenario: A list's rows are not muted

- **WHEN** the MCP view shows a list
- **THEN** its Findings render as unread rows, though the Feed now shows them read, and a row fades once the user marks
  it read

### Requirement: A list can cover one Topic

The tool SHALL accept an optional Topic, which scopes the list to that Topic's unread Findings and its own last read
time. A scoped list SHALL need only read access to the Topic. On a Topic-bound MCP route the list SHALL cover the bound
Topic, and naming another Topic SHALL be rejected.

#### Scenario: What's new on a Topic

- **WHEN** a signed-in user asks what's new on a public Topic they do not follow
- **THEN** the list covers that Topic's unread Findings, with the boost measured from their last consumption on it

#### Scenario: A bound route names another Topic

- **WHEN** a call on `/mcp/t/<topicId>` names a different Topic
- **THEN** the request is rejected without reading that other Topic

### Requirement: Carl writes one opener a day

One `scoreModel` call SHALL write the list's opener in Carl's voice, cached per user per UTC day, and per Topic for a
scoped list. The prompt SHALL keep the opener true for any list that day, so it names no single Finding or count.
Findings' text SHALL reach the model fenced as untrusted.

#### Scenario: The second list of the day

- **WHEN** a user asks for a second list on the same day
- **THEN** it shows the cached opener and no model call runs

#### Scenario: A scoped list has its own opener

- **WHEN** a user asks for a list on one Topic after a list across Topics on the same day
- **THEN** one model call writes that Topic's opener

#### Scenario: Carl never reports what the reader missed

- **WHEN** the opener prompt is evaluated
- **THEN** no generated opener says the reader missed anything, guilt-trips them, or asks them to come back

### Requirement: An opener never blocks a list

The opener SHALL reserve its largest cost before the call and SHALL bill the user's own LiteLLM key. A spent budget or a
failed call SHALL return the list without an opener. A list SHALL wait at most 5 seconds for its opener, and a slower
call SHALL still store its opener for the next list. A list with no Findings SHALL show the empty state and run no
model call.

#### Scenario: The budget is spent

- **WHEN** the reservation is rejected
- **THEN** the list returns its Findings with no opener, and the Findings count as read

#### Scenario: The opener is slow

- **WHEN** the model call takes longer than 5 seconds
- **THEN** the list returns with no opener, and the next list that day reads the opener the call stored

#### Scenario: Nothing is unread

- **WHEN** the user has no unread Findings
- **THEN** the MCP view shows the empty state and no model call runs

### Requirement: The tool result fits the page budget and reads as text

The `read_updates` result SHALL fit the MCP page budget. A Finding that would overflow it SHALL join what did not
fit and stay unread. The text result SHALL hold the opener, each Finding's title, Topic, link, and explanation, and the
more link, so a host without UI gets the whole list.

#### Scenario: A host without UI

- **WHEN** a client that renders no MCP view calls `read_updates`
- **THEN** its text and structured content hold the whole list

#### Scenario: Long explanations

- **WHEN** a 30-minute list's Findings would pass the page budget
- **THEN** the result ends at a whole Finding, the rest count toward more, and they stay unread

### Requirement: The home reads the day's opener without building a list

A signed-in user's home, and the news on their own profile page, SHALL read the day's opener on its own: the opener a
list would show, from the same cache, prompt, wait, and budget rule, with no Finding marked read. A user with no
unread Finding SHALL keep the opener the day already stored, and no model call SHALL run for them. A missing opener
SHALL leave the card with its news alone.

#### Scenario: The home's opener is the list's opener

- **WHEN** a user opens the home and then asks an AI app for a list on the same day
- **THEN** both show the same opener, and one model call wrote it

#### Scenario: Reading the opener marks nothing read

- **WHEN** a user with twelve unread Findings opens the home
- **THEN** the twelve stay unread

#### Scenario: The day's opener stays after the last Finding is read

- **WHEN** a user's home showed the day's opener and the user then reads every Finding
- **THEN** the home still shows that opener for the rest of the day, and no model call runs

#### Scenario: A spent budget shows the news alone

- **WHEN** the opener's reservation is rejected
- **THEN** the home's card shows the news with nothing in the opener's place

### Requirement: The updates MCP view is titled Brew Updates

The updates MCP view's heading SHALL read "Brew Updates". Only the news SHALL be titled Brews News, on the home, on a
profile page, and in its own MCP view.

#### Scenario: The two views read apart

- **WHEN** a host renders a `read_updates` result and a `read_news` result
- **THEN** the first is headed "Brew Updates" and the second "Brews News"
