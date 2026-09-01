## MODIFIED Requirements

### Requirement: A turn can carry attachments to the model without storing them
A turn MAY include a bounded number of attachments: an image, a pdf, or a video as a data url, or text — a text file or a long paste — as raw text, each kind held to its own limited payload field under its own media type, with video's limit sized to fit the request body limit. A pdf SHALL resolve into its extracted text at the api before generation, so only its words reach the model, and an unreadable pdf SHALL reject the turn in words. A video SHALL resolve into a fixed line saying it cannot be watched, so the model knows a clip was attached without pretending to have seen it. Attachments SHALL ride to the model on that turn only — images as image parts, text folded under the question by name — and SHALL never persist or ride stored history; the stored question SHALL instead include a note naming what was attached, so the transcript and the live bubble read identically. A sent video SHALL play in place under the question bubble for the life of the session, from the sent bytes, with the note alone surviving a reload. A too-large clip SHALL be rejected at the composer with a toast before any of it uploads. Unsupported file types SHALL be rejected with an explanation at the composer, and the api SHALL bound the request body.

#### Scenario: An image reaches the model and leaves only a note
- **WHEN** a turn sends with an attached image
- **THEN** the model receives the image as its own message part, and the stored question includes a note naming the attachment while no image bytes persist

#### Scenario: Text attachments fold under the question
- **WHEN** a turn sends with a text file or folded paste attached
- **THEN** the model receives the text under the attachment's name within the question's message, clipped to the contract's limit

#### Scenario: A video plays in the bubble and the model reads only a line
- **WHEN** a turn sends with an mp4 attached
- **THEN** the question bubble plays the clip in place, the model receives a fixed line saying the video cannot be watched, and after a reload the stored question's note alone names the file

#### Scenario: A too-large clip never uploads
- **WHEN** a clip past the video size limit is picked, dropped, or pasted
- **THEN** a toast names the limit and nothing is sent

#### Scenario: A mismatched attachment payload is rejected
- **WHEN** a request smuggles text in an image attachment or a data url in a text one
- **THEN** the api rejects the payload

### Requirement: A reader can keep a chat attachment as durable per-topic memory

A signed-in reader's chat attachments SHALL default to kept, with a per-chip toggle to make any of them ride the turn only — remembering is the expectation attaching sets, so opting out is the deliberate act, not opting in. A kept attachment SHALL persist independently of that turn and of conversation history: its original content stored (encrypted for text, object storage for image, PDF, and video), and a compact summary generated once — except a video, whose stored context SHALL be a fixed line naming the file, since there is nothing to read or describe. That summary SHALL ride into every future turn the same reader takes on the same topic, scoped to that (reader, topic) pair only — never shared into another reader's conversation, and never gated by topic ownership. Persistence SHALL be best-effort and SHALL NOT block or fail the turn it was attached to.

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
