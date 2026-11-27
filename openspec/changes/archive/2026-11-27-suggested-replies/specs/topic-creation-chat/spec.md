## ADDED Requirements

### Requirement: A new-topic suggestion answers Carl's step and decides nothing

In the new-topic chat, a Suggested Reply SHALL answer the step Carl just asked about in the user's voice. After a
proposal it MAY suggest agreeing, such as "Yes, create it", because accepting does not send. It SHALL never agree to make
a topic public, to invite anyone, or to add a source nobody discussed. When Carl asks about invites, it SHALL suggest
skipping them.

#### Scenario: Each step gets a short answer

- **WHEN** Carl asks for the topic's name, what to watch for, which sources, or how often to scan
- **THEN** the suggestion is one short answer to that question, drawn from the conversation, or there is none

#### Scenario: A proposal may get a yes

- **WHEN** Carl proposes creating a private topic from the draft and asks whether to go ahead
- **THEN** the suggestion may be "Yes, create it", and accepting it sends nothing and creates nothing

#### Scenario: Invites suggest skipping

- **WHEN** Carl asks whom to invite
- **THEN** the suggestion is a line such as "Skip invites for now", never a name, an email, or a handle

#### Scenario: Visibility is never agreed to

- **WHEN** Carl asks whether the topic should be public
- **THEN** the suggestion does not say yes to public

#### Scenario: An undiscussed source is never added

- **WHEN** Carl offers to add a source the user never mentioned
- **THEN** the suggestion does not agree to add it

### Requirement: A proposal that would publish or invite gets no suggestion

When the turn leaves a proposal standing whose topic would be public or would hold invites, the server SHALL make no
suggestion call. A turn that created the topic SHALL get none. The check-agreement prompt and the rule that only the
user's own next message agrees SHALL stay as they are.

#### Scenario: A public proposal gets none

- **WHEN** Carl proposes creating a topic whose draft is public
- **THEN** no suggestion call runs and the composer shows its usual placeholder

#### Scenario: A proposal with invites gets none

- **WHEN** Carl proposes creating a topic whose draft lists an invite email
- **THEN** no suggestion call runs

#### Scenario: A created topic gets none

- **WHEN** the user's message agrees and the turn creates the topic
- **THEN** no suggestion call runs and no suggestion shows when the conversation ends

#### Scenario: An accepted yes still agrees only once sent

- **WHEN** the user accepts "Yes, create it" and sends it
- **THEN** the agreement check reads it as the user's own message, as it reads a typed one

### Requirement: An empty new-topic chat suggests an example topic

An empty new-topic chat that can create a topic SHALL suggest one example topic from a short fixed list, with no model
call. The example SHALL stay the same until the page changes. A plan with no topics left, a visitor, and the `off`
rollout setting SHALL show no example.

#### Scenario: An empty chat shows an example

- **WHEN** a signed-in user with topics left opens an empty new-topic chat
- **THEN** the empty box shows one example topic from the list, and no model call is made

#### Scenario: A full plan shows none

- **WHEN** the user's plan holds no more topics
- **THEN** the box shows no example and the topic limit notice shows as it does today

#### Scenario: The examples are safe

- **WHEN** the example list is checked
- **THEN** no example holds an email, a url, or an account handle, and each fits the suggestion limit

### Requirement: The new-topic chat's suggestion counts are separable

The new-topic chat's shown and accepted counts SHALL be readable apart from every other chat kind's, so its acceptance rate can
be compared with the topic, team, and Topic Post private chats.

#### Scenario: Its counts are separable

- **WHEN** an operator reads the shown and accepted events
- **THEN** the new-topic chat's events can be told apart from every other chat kind's
