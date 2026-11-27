## REMOVED Requirements

### Requirement: A new-topic suggestion answers Carl's step and decides nothing

**Reason**: The suggestion now suggests making a topic public instead of keeping it private.
**Migration**: See "A new-topic suggestion answers Carl's step and suggests public".

### Requirement: A proposal that would publish or invite gets no suggestion

**Reason**: A public proposal now gets a suggestion.
**Migration**: See "A proposal that would invite gets no suggestion".

## ADDED Requirements

### Requirement: A new-topic suggestion answers Carl's step and suggests public

In the new-topic chat, a Suggested Reply SHALL answer the step Carl just asked about in the user's voice. When Carl
asks who should see the topic, it SHALL suggest making it public. After a proposal it MAY suggest agreeing, such as
"Yes, create it", because accepting does not send. It SHALL never agree to invite anyone or to add a source nobody
discussed. When Carl asks about invites, it SHALL suggest skipping them.

#### Scenario: Each step gets a short answer

- **WHEN** Carl asks for the topic's name, what to watch for, which sources, or how often to scan
- **THEN** the suggestion is one short answer to that question, drawn from the conversation, or there is none

#### Scenario: A proposal may get a yes

- **WHEN** Carl proposes creating a public or private topic from the draft and asks whether to go ahead
- **THEN** the suggestion may be "Yes, create it", and accepting it sends nothing and creates nothing

#### Scenario: Invites suggest skipping

- **WHEN** Carl asks whom to invite
- **THEN** the suggestion is a line such as "Skip invites for now", never a name, an email, or a handle

#### Scenario: Visibility suggests public

- **WHEN** Carl asks who should see the topic
- **THEN** the suggestion is a line such as "Make it public", and accepting it sends nothing

#### Scenario: An undiscussed source is never added

- **WHEN** Carl offers to add a source the user never mentioned
- **THEN** the suggestion does not agree to add it

### Requirement: A proposal that would invite gets no suggestion

When the turn leaves a proposal standing whose topic would hold invites, the server SHALL make no suggestion call. A
public proposal SHALL get one. A turn that created the topic SHALL get none. The check-agreement prompt and the rule
that only the user's own next message agrees SHALL stay as they are.

#### Scenario: A public proposal gets one

- **WHEN** Carl proposes creating a topic whose draft is public
- **THEN** the suggestion call runs, and the composer may show "Yes, create it"

#### Scenario: A proposal with invites gets none

- **WHEN** Carl proposes creating a topic whose draft lists an invite email
- **THEN** no suggestion call runs

#### Scenario: A created topic gets none

- **WHEN** the user's message agrees and the turn creates the topic
- **THEN** no suggestion call runs and no suggestion shows when the conversation ends

#### Scenario: An accepted yes still agrees only once sent

- **WHEN** the user accepts "Yes, create it" and sends it
- **THEN** the agreement check reads it as the user's own message, as it reads a typed one
