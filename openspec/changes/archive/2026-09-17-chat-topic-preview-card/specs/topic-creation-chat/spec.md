## ADDED Requirements

### Requirement: The new-topic chat stores the Topic Draft and shows it as a card
The new-topic chat SHALL hold one Topic Draft, a name, a prompt, Sources as source option and value pairs, invite emails, the settings, and the files the user attached, send it with every turn, replace it with the draft a reply's tool calls bring back, and show it as a card above the composer with each field and each file, a file removable until the save. Every field except the files SHALL be stored for the user, one draft each, and read back when the conversation loads, so a reload does not lose what Carl wrote. The card SHALL show the app's loading in place of its fields while Carl owes the chat a reply, and each field Carl rewrites SHALL fade in when the reply ends. Its fields SHALL read in the edit modal's own order, so the card and the edit modal match. A file attached in the new-topic chat SHALL reach Carl for that turn and stay in the draft. Pasted text SHALL reach Carl and not the draft.

#### Scenario: The card shows the loading while Carl replies
- **WHEN** Carl owes the chat a reply
- **THEN** the card shows the app's loading in place of its fields, and the fields return when the reply ends

#### Scenario: The card fills in when Carl's reply ends
- **WHEN** Carl calls `draftTopic` with a title and a prompt
- **THEN** the card shows them once the reply ends, and only the fields he rewrote fade in

#### Scenario: A file waits in the draft
- **WHEN** a user attaches a PDF while talking to Carl
- **THEN** Carl reads it in that turn, the card lists it, and no Topic attachment exists yet

#### Scenario: A reload keeps an unsaved draft but not its files
- **WHEN** the page reloads before the save
- **THEN** the card shows the stored draft again, and the files the user attached are gone, since no Topic holds them yet

#### Scenario: A team alone is not a draft
- **WHEN** a reader opens the new-topic chat from a team page, creates a Topic, and the cleared draft holds only that team
- **THEN** the card is hidden, and the next topic still starts on that team

### Requirement: A created Topic ends the conversation that made it
Once `createTopic` returns and the reply finishes, the new-topic chat SHALL delete its stored Topic Draft and clear its
conversation, so the next topic starts from nothing instead of from the one just made. The reply announcing the create
SHALL stay on screen until the reader asks the next question, which SHALL then start the new conversation on screen as
well, sending none of the cleared one. The clear SHALL run after the turn is saved. A reader who stops the reply SHALL
keep the conversation, since a stop returns before the server has written that turn and the clear would race it.

#### Scenario: The next topic starts from nothing
- **WHEN** a reader creates a topic and then asks for another without reloading
- **THEN** Carl reads none of the created topic's conversation, the card is empty, and the screen shows the new question alone

#### Scenario: The create is still announced
- **WHEN** `createTopic` returns
- **THEN** Carl's reply naming the created topic stays on screen, and the topic's page opens

#### Scenario: A stopped reply keeps the conversation
- **WHEN** the reader presses stop while Carl is still writing the reply that created the topic
- **THEN** nothing is cleared, so the turn the server is still writing is not half removed

## REMOVED Requirements

### Requirement: The browser holds the Topic Draft and shows it as a card

**Reason**: Its two central claims are what this change reverses. The browser no longer holds the Topic Draft on its own — it is stored per user in `topic_drafts` and read back when the conversation loads — and the card no longer fills in mid-reply, so a reload no longer forgets what Carl wrote. Keeping the name would leave the spec describing behaviour the code no longer has.

**Migration**: Replaced by "The new-topic chat stores the Topic Draft and shows it as a card", which restates every still-true part — the draft's fields, sending it with every turn, replacing it from the reply's tool calls, the card above the composer with each field and each file, a file removable until the save, a file reaching Carl and staying in the draft, and pasted text reaching Carl but not the draft — and adds the stored row, the loading that replaces the fields while Carl owes a reply, the per-field fade when the reply ends, and the edit modal's field order.
