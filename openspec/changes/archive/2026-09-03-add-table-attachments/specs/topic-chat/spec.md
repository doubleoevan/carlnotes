## MODIFIED Requirements

### Requirement: A turn carries attachments to the model, and its images are stored

A turn MAY include a bounded number of attachments: an image, a pdf, or a document — a Word file or a
workbook — as a data url, or text, a text file or a long paste, as raw text, each kind held to its own
limited payload field under its own media type. A pdf and a document SHALL each resolve into extracted
text at the api before generation, read through the media type the data url itself declares, so only
their words reach the model, and an unreadable one SHALL reject the turn in words. Attachments SHALL
reach the model on that turn only — images as image parts, text folded under the question by name — and
SHALL never ride stored history; the stored question SHALL include a note naming what was attached, so
the transcript and the live bubble read identically. Unsupported file types SHALL be rejected with an
explanation at the composer, and the api SHALL bound the request body.

The composer's file picker SHALL offer exactly the types this path takes, and a test SHALL hold the two
in step, so widening the picker can never offer a file the turn then rejects.

Every image a turn includes SHALL be stored against that turn, whether or not the reader kept it, so the question can show it again later. An image the reader did not keep SHALL be stored with no generated summary and SHALL NOT reach the model on any later turn, so an unkept image costs no tokens beyond the turn that sent it. A pdf or text attachment the reader did not keep SHALL NOT be stored. Storing SHALL be best-effort and SHALL NOT block or fail the turn that included the attachment.

#### Scenario: An image reaches the model and is stored against its turn
- **WHEN** a turn sends with an attached image
- **THEN** the model receives the image as its own message part, the stored question includes a note naming the attachment, and the image is stored against that turn

#### Scenario: An unkept image never reaches a later turn
- **WHEN** a reader sends an image with keep off and then takes another turn on the same topic
- **THEN** the later turn's context includes nothing derived from that image

#### Scenario: An unkept pdf leaves nothing stored
- **WHEN** a turn sends with a pdf attached and keep off
- **THEN** the pdf's words reach the model on that turn and no pdf bytes are stored

#### Scenario: A turn that stores no text stores no unkept image
- **WHEN** a reader whose turns do not persist sends a question with an unkept image
- **THEN** the turn records its spend, stores no question text, and stores no image

#### Scenario: Text attachments fold under the question
- **WHEN** a turn sends with a text file or folded paste attached
- **THEN** the model receives the text under the attachment's name within the question's message, clipped to the contract's limit

#### Scenario: A mismatched attachment payload is rejected
- **WHEN** a request smuggles text in an image attachment or a data url in a text one
- **THEN** the api rejects the payload

#### Scenario: A Word file's words reach the model

- **WHEN** a reader attaches a `.docx` or `.xlsx` to a chat turn
- **THEN** its text is extracted at the api and folded under the question, and the file itself never reaches the model

#### Scenario: An unreadable document rejects the turn

- **WHEN** a document attachment cannot be read
- **THEN** the turn is rejected in words instead of being sent without it

### Requirement: A reader can keep a chat attachment as durable per-topic memory

A signed-in reader's chat attachments SHALL default to kept, with a per-chip toggle to make any of them
ride the turn only — remembering is the expectation attaching sets, so opting out is the deliberate act,
not opting in. A kept attachment SHALL persist independently of that turn and of conversation history:
its original content stored (encrypted for text, object storage for image, pdf, document, and video), and
a compact summary generated once — except a video, whose stored context SHALL be a fixed line naming the
file, since there is nothing to read or describe. That summary SHALL ride into every future turn the same
reader takes on the same topic, scoped to that (reader, topic) pair only — never shared into another
reader's conversation, and never gated by topic ownership. Persistence SHALL be best-effort and SHALL NOT
block or fail the turn it was attached to.

#### Scenario: A kept attachment survives conversation compaction
- **WHEN** a reader keeps an attachment and the conversation later grows well past the verbatim memory window
- **THEN** the kept attachment's summary still rides into the reader's next turn, unaffected by history compaction

#### Scenario: A non-owner's kept attachment is scoped to them alone
- **WHEN** a signed-in reader who does not own the topic keeps an attachment
- **THEN** it feeds only that reader's own future turns on the topic, and neither the owner's nor any other reader's turns include it

#### Scenario: A kept item's ongoing cost stays bounded
- **WHEN** a large document is kept
- **THEN** future turns include its one-time-generated summary, never the original document's full text

#### Scenario: A kept video stores its bytes and a fixed line
- **WHEN** a reader keeps a video
- **THEN** its bytes store by object key and download back, its context is a fixed line naming the file, and no description model call runs

#### Scenario: A kept document summarizes once

- **WHEN** a reader keeps a Word file or workbook attached to a chat turn
- **THEN** its extracted words are screened and summarized once, and that summary rides their later turns on the topic
