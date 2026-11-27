## REMOVED Requirements

### Requirement: A new-topic suggestion answers Carl's step and suggests public

**Reason**: At a proposal the suggestion now says yes instead of only being allowed to.
**Migration**: See "A new-topic suggestion answers Carl's step and says yes to the proposal".

### Requirement: A proposal that would invite gets no suggestion

**Reason**: A proposal with invites now gets a suggestion too.
**Migration**: See "Every proposal gets a suggestion".

## ADDED Requirements

### Requirement: A new-topic suggestion answers Carl's step and says yes to the proposal

In the new-topic chat, a Suggested Reply SHALL answer the step Carl just asked about in the user's voice. When Carl
asks who should see the topic, it SHALL suggest making it public. When Carl proposes the topic and asks whether to go
ahead, it SHALL suggest "Yes, create it". It SHALL never name anyone to invite or agree to add a source nobody
discussed. When Carl asks about invites, it SHALL suggest skipping them.

#### Scenario: Each step gets a short answer

- **WHEN** Carl asks for the topic's name, what to watch for, which sources, or how often to scan
- **THEN** the suggestion is one short answer to that question, drawn from the conversation, or there is none

#### Scenario: A proposal gets a yes

- **WHEN** Carl proposes creating a topic from the draft and asks whether to go ahead
- **THEN** the suggestion is "Yes, create it", and accepting it puts it in the box without sending

#### Scenario: Invites suggest skipping

- **WHEN** Carl asks whom to invite
- **THEN** the suggestion is a line such as "Skip invites for now", never a name, an email, or a handle

#### Scenario: Visibility suggests public

- **WHEN** Carl asks who should see the topic
- **THEN** the suggestion is a line such as "Make it public", and accepting it sends nothing

#### Scenario: An undiscussed source is never added

- **WHEN** Carl offers to add a source the user never mentioned
- **THEN** the suggestion does not agree to add it

### Requirement: Every proposal gets a suggestion

The server SHALL make the suggestion call after every turn that leaves a proposal standing, whatever the draft's
visibility, invites, or team. A turn that created the topic SHALL get none. A sent yes SHALL create the topic in that
turn, through the agreement check that reads it as the user's own message.

#### Scenario: Public, inviting, and team proposals each get one

- **WHEN** Carl proposes a public topic on the user's team, an invite topic with an invite email, or a private topic
- **THEN** the suggestion call runs for each, and the composer can show "Yes, create it"

#### Scenario: A created topic gets none

- **WHEN** the user's message agrees and the turn creates the topic
- **THEN** no suggestion call runs and no suggestion shows when the conversation ends

#### Scenario: A sent yes creates the topic at once

- **WHEN** the user accepts "Yes, create it" and sends it
- **THEN** the agreement check reads it as agreeing, the topic is created in that turn, and Carl does not ask again
