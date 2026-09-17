# topic-creation-chat Specification

## Purpose
TBD - created by archiving change chat-topic-creation. Update Purpose after archive.
## Requirements
### Requirement: A private conversation bound to no Topic makes one
The api SHALL serve a private chat conversation bound to no Topic and no Team at `GET`, `DELETE`, and `POST /api/chat/new-topic`, for a signed-in user. Its chat turns SHALL be saved in `chat_turns` with no Topic and no Team, metered against the user's monthly spend budget, kept when the gate grants `chat:persist` or a Topic Tool fired, and cleared the way a Topic conversation is. The `POST` route SHALL sit under the per-caller rate limit. The conversation payload SHALL say whether the user owns no Topic yet.

#### Scenario: A visitor is sent to sign up
- **WHEN** a request with no session reaches the new-topic chat
- **THEN** the conversation returns sign-up required and no chat turn spends

#### Scenario: A turn is saved against the user alone
- **WHEN** a signed-in user sends a turn to the new-topic chat
- **THEN** a `chat_turns` row is written for the user with no Topic and no Team, and the spend meter counts it

#### Scenario: The conversation says whether this is the first Topic
- **WHEN** a user who owns no Topic loads the conversation
- **THEN** the payload's `isFirstTopic` is true, and it is false once they own one

### Requirement: The plan's topic limit is said up front
The new-topic conversation payload SHALL include how many more Topics the user's plan holds and the plan's limit, and each turn's prompt SHALL tell Carl the same. When the plan holds no more, the panel SHALL show the limit with a link to the plans page in place of the draft card, and Carl SHALL say so before anything else instead of running the wizard. An admin SHALL read as unlimited.

#### Scenario: A user at the limit hears it first
- **WHEN** a user who holds as many Topics as their plan allows opens the new-topic chat
- **THEN** the panel shows the limit with the plans link, and Carl's first reply says no Topic can be made until they pick up more room or drop one

#### Scenario: A user with room is told when it runs low
- **WHEN** a user with one Topic left on their plan asks Carl for a Topic
- **THEN** Carl mentions it is their last one and runs the wizard

### Requirement: Carl runs the wizard in words and fills the Topic Draft
The new-topic chat's reply SHALL be built from a versioned `chat-new-topic.md` prompt with the docs block and no Topic material, with the web search tool, `suggestSources`, and `createTopic` on. The prompt SHALL tell Carl to ask what the user wants to follow, to propose a title and a prompt in the user's words, to call `suggestSources` with them and offer what comes back, to ask whether anyone should read along by email and whether any file is worth attaching as optional steps, to write each settled answer into the draft with `draftTopic`, and to say exactly what he would create and wait for a yes before calling `createTopic`. It SHALL include the rule that only a tool call in this turn is a save. A user who answers several questions at once SHALL be taken ahead, and one who changes an answer SHALL be taken back.

#### Scenario: Carl proposes before he creates
- **WHEN** a user says what they want to follow
- **THEN** Carl answers with a title, a prompt, and the Sources the suggestion flow verified, asks about invites, and creates nothing until the user says yes

#### Scenario: A user skips the invites
- **WHEN** a user says nobody, or says yes to the Topic without naming anyone
- **THEN** the Topic is created with no invites

#### Scenario: An app question still gets an answer
- **WHEN** a user asks what a brew is mid-wizard
- **THEN** Carl answers from the glossary and the docs block and returns to the wizard

### Requirement: A created Topic lands the user on it
When `createTopicFromDraft` saves from the new-topic chat, the tool calls the reply stream ends with SHALL name the created Topic, the chat SHALL toast the save, or an error toast naming what stopped a rejected create, the app SHALL navigate to the new Topic's page while the panel stays open on the new-topic chat, and the browser SHALL upload each file in the draft through the topic attachment upload route, reloading the page when they land and toasting a rejected upload's reason.

#### Scenario: The first Topic opens
- **WHEN** Carl creates a Topic in the new-topic chat
- **THEN** a toast names it, the app is on `/topics/<id>`, and the panel still shows the new-topic chat, open and unchanged

#### Scenario: A rejected create says why
- **WHEN** the plan holds all the topics it allows, or the draft holds more sources than a Topic can
- **THEN** an error toast names the reason, and the draft card stays for the next turn

#### Scenario: The draft's files become the Topic's attachments
- **WHEN** the draft held two files at the save
- **THEN** both upload to the new Topic and the page shows them once they land

#### Scenario: A rejected create stays in the wizard
- **WHEN** the create path returns a quota, a daily-frequency limit, or a rejected invitee
- **THEN** nothing is written, no navigation happens, and Carl says why and offers the next step

### Requirement: The homepage welcomes a first Topic
The homepage SHALL register a chat page context for a signed-in user once the feed has loaded, saying whether the user's feed is empty: no Topic of their own and none followed. When it is empty, the panel SHALL open itself on the new-topic chat once per page load, and a panel the user closed SHALL stay closed until the next load. The composer placeholder SHALL read "Let's make your first topic. You know the one." while the user owns no Topic, and "Let's make a topic. You know the one." once they own one. A user whose feed holds anything SHALL find the panel closed until they open it.

#### Scenario: A fresh signup lands in the chat
- **WHEN** a user who has just signed up is sent to the homepage
- **THEN** the panel is open on the new-topic chat with the first-topic placeholder, and stays closed after they close it until the next page load

#### Scenario: A user with a feed is left alone
- **WHEN** a user who owns or follows a Topic loads the homepage
- **THEN** the panel stays as they left it

#### Scenario: An invited reader is not welcomed
- **WHEN** a user who signed up through a Topic invite visits the homepage
- **THEN** the panel stays closed, since their feed holds the Topic they were invited to

### Requirement: The new-topic chat is one turn away everywhere
The chat menu SHALL offer a "Give Carl a topic. You know the one." row to a signed-in user on every page, opening the new-topic chat. A signed-in user with no chat room and no page Topic or Team SHALL open the panel on the new-topic chat instead of a call to action. A visitor SHALL keep the sign-up call to action.

#### Scenario: A user with no chat room opens the panel
- **WHEN** a signed-in user with no Team opens the panel on their profile page
- **THEN** it shows the new-topic chat

#### Scenario: A Topic page reaches it through the menu
- **WHEN** a user on a Topic page picks "Give Carl a topic. You know the one." in the chat menu
- **THEN** the panel shows the new-topic chat, and the Topic's own chats stay in the menu

### Requirement: The wizard asks who should see the Topic
The `chat-new-topic.md` prompt SHALL tell Carl to ask, after the Sources and before the invites, whether the Topic is for everyone, for people the user invites, or for the user alone, and to write the answer into the draft with `draftTopic` as `public`, `invite`, or `private`. The Topic Draft SHALL hold a `visibility` that defaults to `invite`, the draft card SHALL show it, and `createTopicFromDraft` SHALL create the Topic with it.

#### Scenario: A public Topic is asked for
- **WHEN** a user says anyone should be able to read it
- **THEN** the card reads Public, and the created Topic's visibility is `public`

#### Scenario: The visibility is skipped
- **WHEN** a user says yes to the Topic without answering who should see it
- **THEN** the Topic is created shared by invite

### Requirement: The New Topic button offers the chat
The New Topic button on the home, activity, and profile pages SHALL open a dialog with two choices, making the Topic in the form or making it with Carl, and the second SHALL open the panel on the new-topic chat. The team page's Add Topic SHALL keep opening the form, since the chat cannot put a Topic on a team.

#### Scenario: A user chooses Carl
- **WHEN** a signed-in user presses New Topic on the home page and picks making it with Carl
- **THEN** the dialog closes and the panel opens on the new-topic chat

#### Scenario: A user chooses the form
- **WHEN** a signed-in user presses New Topic and picks making it themselves
- **THEN** the create form opens in place of the dialog

### Requirement: The wizard asks which team the Topic joins
The `chat-new-topic.md` prompt SHALL list the teams the user leads, and SHALL tell Carl to ask, after the visibility step, whether the Topic should join one of them, writing the pick into the draft's `team` field, `{ teamId, name }`, with `draftTopic`, skipping the question when the user leads no team or the draft already names one. The Topic Draft SHALL hold a `team` that defaults to none, the draft card SHALL show its name, and `createTopicFromDraft` SHALL add the created Topic to it through the leader-only add-to-team path, reporting a rejected add beside the created Topic.

#### Scenario: A leader team is picked
- **WHEN** a user who leads a team says the topic is for that team
- **THEN** the card shows the team, and the created Topic is on it

#### Scenario: The user leads no team
- **WHEN** a user on no team, or a member of teams they do not lead, makes a Topic with Carl
- **THEN** Carl does not ask about teams, and the Topic is created on none

#### Scenario: The add is rejected at the save
- **WHEN** the draft names a team the user no longer leads
- **THEN** the Topic is created, an error toast says it was not added to the team, and Carl says so

### Requirement: The team page's New topic option offers the chat
The New topic option at the end of the team page's Add Topic picker SHALL open the chooser, its form choice SHALL open the create form with the team preset as today, and its Build with Carl choice SHALL open the new-topic chat with that team already on the draft, so Carl keeps it without asking.

#### Scenario: Carl is chosen from a team page
- **WHEN** a leader picks New topic in the team's Add Topic picker and then Build with Carl
- **THEN** the panel opens on the new-topic chat with the team on the draft card, and the yes creates the Topic on that team

### Requirement: The draft takes the topic's settings
The Topic Draft SHALL hold `tags`, `frequency`, and `maxTopicFindings`, defaulting to none, weekly, and ten, which `draftTopic` writes, the card shows, and `createTopicFromDraft` saves. The `chat-new-topic.md` prompt SHALL offer the three once, as optional, before the read-back.

#### Scenario: A reader asks for daily
- **WHEN** a reader says the topic should brew every day and keep twenty
- **THEN** the card reads daily and twenty, and the created Topic has that frequency and results count

#### Scenario: The settings are skipped
- **WHEN** a reader says nothing about them
- **THEN** the Topic is created weekly with ten results and no tags

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

