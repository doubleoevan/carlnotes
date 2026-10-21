## ADDED Requirements

### Requirement: A composer never sends during an IME composition

The private chat composer and the room composer SHALL send on Enter only if no input method editor composition is
active, read from the keyboard event's `isComposing`. An Enter that confirms a composition candidate SHALL leave the
confirmed text in the draft and send nothing, so a reader typing Japanese, Chinese, or Korean never posts half a word.

#### Scenario: Enter during a composition keeps the draft

- **WHEN** a reader typing with an input method editor presses Enter to confirm a candidate
- **THEN** the composer sends nothing and the confirmed text stays in the draft

#### Scenario: Enter after the composition sends

- **WHEN** the same reader presses Enter with no composition active
- **THEN** the composer sends the draft

### Requirement: A rejected link preview read ends the loading cards

The chat room's link preview poll SHALL read a failed or rejected link preview response as no cards, and SHALL end the
loading cards of the chat messages it polled, so no card loads forever and no rejection goes unhandled.

#### Scenario: A failed read leaves no loading card

- **WHEN** the link preview read fails or responds with an error
- **THEN** it reads as no cards, the polled chat messages' loading cards end, and no unhandled rejection reaches the
  console

#### Scenario: A successful read still merges its cards

- **WHEN** the read returns cards for a chat message
- **THEN** the cards merge into that chat message and its loading card ends

### Requirement: The spoken questions pause reads the plan through the plan helper

What a mic does past the spoken questions cutoff SHALL be decided through the shared plan helper `isPremiumPlan`,
never by comparing the plan string at the call site. A reader on premium, which has no plan above it, SHALL see a toast
that speaking comes back on the 1st, and a reader on every other plan SHALL be sent to the plans page with the mic's
call to action.

#### Scenario: A premium reader's mic toasts

- **WHEN** a reader whose plan the helper reads as premium taps a mic past the spoken questions cutoff
- **THEN** a toast says speaking comes back on the 1st, and the reader stays on the page

#### Scenario: Another plan opens the plans page

- **WHEN** a reader on any other plan taps a mic past the spoken questions cutoff
- **THEN** the plans page opens with the mic's call to action

#### Scenario: The call site compares no plan string

- **WHEN** the single-gate test greps the web app for a plan comparison
- **THEN** the spoken questions pause matches nothing, since it calls the helper

## MODIFIED Requirements

### Requirement: The edit chat changes the topic's settings

The edit chat's `proposeTopicEdit` SHALL take the settings fields beside the prompt and the Sources, the private
chat's edit block prompt SHALL name them, and an agreed settings change SHALL be applied through `updateTopicFields`
and SHALL toast like the prompt's save. The topic chat prompt's settings section SHALL say that a settings change goes
through `proposeTopicEdit`, the preview flow the edit block describes, and SHALL name no tool the chat does not have.

#### Scenario: Carl changes the tags on a yes

- **WHEN** an editor agrees to tags Carl previewed
- **THEN** the server writes them through `updateTopicFields`, a toast says the settings were saved, and the page
  reloads with them

#### Scenario: The prompt names the preview flow for a settings change

- **WHEN** the topic chat prompt is built for a reader who may edit the Topic
- **THEN** its settings section names `proposeTopicEdit` as the way a settings change is proposed, and names no other
  tool

### Requirement: A reader can delete their own kept attachments

The composer SHALL offer a manage control, present only when the reader keeps at least one attachment for the topic,
listing their kept attachments by name with a per-item delete. Deleting SHALL remove the row and its stored object,
free a slot under the limit, and SHALL be scoped to the keeper — one reader can never delete another reader's kept
attachment. A delete naming a kept attachment the reader does not own, or an id no kept attachment has, SHALL respond
404, so the route never confirms that another reader's attachment exists.

#### Scenario: Deleting a kept attachment frees its slot
- **WHEN** a reader at the limit deletes a kept attachment and marks a new one to keep
- **THEN** the delete succeeds, the keep toggle accepts, and the new attachment persists

#### Scenario: The manage control hides with nothing to manage
- **WHEN** a reader keeps nothing for the topic
- **THEN** the composer shows no manage control

#### Scenario: A delete is scoped to its keeper
- **WHEN** a request tries to delete a kept attachment belonging to another reader
- **THEN** the api responds 404 and the attachment remains

#### Scenario: An unknown id responds 404
- **WHEN** a request tries to delete an id no kept attachment has
- **THEN** the api responds 404, the same as for another reader's attachment
