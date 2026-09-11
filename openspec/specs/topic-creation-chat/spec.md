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

### Requirement: The browser holds the Topic Draft and shows it as a card
The new-topic chat SHALL hold one Topic Draft, a name, a prompt, Sources as source option and value pairs, invite emails, and the files the user attached, send it with every turn, replace it with the draft a reply's tool calls bring back, and show it as a card above the composer with each field and each file, a file removable until the save. A file attached in the new-topic chat SHALL reach Carl for that turn and stay in the draft. Pasted text SHALL reach Carl and not the draft.

#### Scenario: The card fills in as Carl writes
- **WHEN** Carl calls `draftTopic` with a title and a prompt
- **THEN** the card shows them before his reply finishes streaming

#### Scenario: A file waits in the draft
- **WHEN** a user attaches a PDF while talking to Carl
- **THEN** Carl reads it in that turn, the card lists it, and no Topic attachment exists yet

#### Scenario: A reload forgets an unsaved draft
- **WHEN** the page reloads before the save
- **THEN** the card is empty, and Carl writes the draft again from the conversation on the next turn

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

