## MODIFIED Requirements

### Requirement: Carl answers only when addressed

Carl reads every message and SHALL respond only to an @carl mention, the room-wide @all, or a reply to one of his own
messages. He SHALL never answer a message aimed at one other person, so the bill tracks intent.

An unaddressed message defaults to @all: the composer prefixes it, every member is notified, and Carl answers. The
composer's chip SHALL always name who the next message goes to — @all by default, the member whose reply the viewer is
answering while that exchange is the newest message, or whoever the viewer picked from the chip's own picker — and the
placeholder SHALL follow that target in the shape of "@all, penny for your thoughts…".

A reply is a real mechanism: a message MAY reference a prior message, and replying to one of Carl's messages continues
the exchange without a fresh mention. A reply reaching past the message directly above it SHALL render a clipped quote
of what it answers, and activating the quote scrolls to the original. The transcript Carl reads includes the same reply
references, so a pronoun in a reply binds to its quoted message instead of to the newest lines.

A spoken message SHALL be prefixed with @carl in place of @all, so it addresses Carl as a typed mention does and no
other member is notified for a question meant for him.

#### Scenario: A mention wakes him

- **WHEN** a member posts a message mentioning @carl
- **THEN** Carl completes once, into the room

#### Scenario: A reply continues without a mention

- **WHEN** a member replies to one of Carl's messages with no mention in the text
- **THEN** Carl answers it as a continuation

#### Scenario: Everything else is read in silence

- **WHEN** members mention each other or reply to one another directly
- **THEN** Carl posts nothing

#### Scenario: A spoken message wakes him
- **WHEN** a member sends a spoken message
- **THEN** it posts with @carl in front, Carl answers it, and no other member is notified

### Requirement: Messages render phone-shaped, through one component, in a wider panel

Every message SHALL render with the author's avatar beside the bubble and their display name above it, in both the solo
Coffee talk and the team room, never collapsed on consecutive messages from the same author — one component serves both
rooms with no participant-count branching, and no bubble's author is ever inferred from position. Carl's avatar SHALL be
the raccoon, the same art as the social avatar, bundled under the application source and imported by the component so
the bundler hashes and caches it — never fetched per message or read from object storage. His display name is Carl.

A message whose first url has a stored preview SHALL render that card below the bubble and above the shared files,
showing the page's title, description, and proxied image. The card is an addition and never a replacement: the url SHALL
stay in the message text exactly as it was written, so a reader always sees where a link actually goes. A message with
no url, or one whose url has no stored preview, renders as it did before.

The Coffee talk panel SHALL keep its docked width, with the expand toggle as the large-view control and the message
column limited so a line of text stays in a comfortable reading range. A substantially wider docked panel was tried and
rejected for covering too much of the page.

No message SHALL show a mic mark, whether a member spoke it or Carl did. Every Carl message SHALL show a play button
that speaks it from the start and becomes stop while it plays, through the same component in both rooms.

#### Scenario: Consecutive messages keep their author

- **WHEN** one member posts three messages in a row in either room
- **THEN** each shows the avatar and display name

#### Scenario: Carl's face is bundled

- **WHEN** Carl's messages render
- **THEN** his raccoon avatar loads as a hashed bundled asset with no per-message fetch

#### Scenario: A link renders a card without losing the url

- **WHEN** a message holding a previewed url renders
- **THEN** the card shows below the bubble with the page's title, description, and an image served from this origin, and
  the message text still shows the url as written

#### Scenario: Wide screens read comfortably

- **WHEN** the panel opens at a large viewport
- **THEN** the panel keeps its docked width with the expand toggle available, the message column stays limited, and
  small viewports render as before

#### Scenario: A spoken exchange shows no mark
- **WHEN** a spoken message and Carl's reply to it render
- **THEN** neither shows a mic icon, and Carl's bubble shows play

### Requirement: The mentioner pays, checked before the completion, rejected in private

A Carl completion SHALL be billed to the person who mentioned him — never the Topic creator and never the Team, which
holds no wallet. The mentioner's budget SHALL be checked before the completion starts, not after it returns. If the
budget is empty, Carl's rejection SHALL be delivered privately to the mentioner and never posted to the room.

Each completion SHALL write exactly one chat turn row, the same spend row a private chat turn writes, naming the
mentioner, the Topic, the room message it answered, tokens, and cost, so the monthly budget, the spend meter, and any
later per-team spend view all read one table.

A spoken message's transcription and Carl's spoken answer SHALL be billed to the asker, as chat spend rows on the
asker's key beside the completion's row, and a member who taps play on a Carl message SHALL spend on their own key. The
budget gate SHALL run before the transcription, so a spent member's recording is never transcribed.

#### Scenario: The budget gate runs first

- **WHEN** a mentioner's monthly budget is spent
- **THEN** no completion starts, no chat turn row is written, and the rejection reaches only the mentioner

#### Scenario: One completion, one chat turn row

- **WHEN** Carl completes in the room
- **THEN** exactly one chat turn row exists for it, attributed to the mentioner and referencing the room message

#### Scenario: A replay bills the listener
- **WHEN** a teammate taps play on Carl's reply
- **THEN** the speech spend row names the teammate, not the asker
