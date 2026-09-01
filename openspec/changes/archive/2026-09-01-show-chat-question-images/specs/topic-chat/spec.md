## ADDED Requirements

### Requirement: A turn carries attachments to the model, and its images are stored

A turn MAY include a bounded number of attachments: an image or a pdf as a data url, or text — a text file or a long paste — as raw text, each kind held to its own limited payload field under its own media type. A pdf SHALL resolve into its extracted text at the api before generation, so only its words reach the model, and an unreadable pdf SHALL reject the turn in words. Attachments SHALL reach the model on that turn only — images as image parts, text folded under the question by name — and SHALL never ride stored history; the stored question SHALL include a note naming what was attached, so the transcript and the live bubble read identically. Unsupported file types SHALL be rejected with an explanation at the composer, and the api SHALL bound the request body.

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

### Requirement: A stored question shows the images it was sent with

A stored question SHALL show every image sent with it, in its own bubble, read from the reader's stored copy instead of from the browser that sent it. The images SHALL appear on a fresh page load and on any other device the same reader signs in from. Each image SHALL be shown at a size that keeps the bubble readable and SHALL link to the full file, opened away from the app so the client router never claims the api path as one of its own routes. An attachment of any other kind SHALL NOT be shown in place, since the stored question already names it.

The conversation load SHALL return each stored turn's attachments as an id, a kind, and a name, the same shape a room message has, ordered as they were stored. A turn that included nothing SHALL return an empty list.

#### Scenario: An image reappears after a full reload
- **WHEN** a reader sends a question with an image and later reloads the topic page
- **THEN** the question's bubble shows that image, and clicking it opens the full file away from the app

#### Scenario: The conversation reads the same on another device
- **WHEN** the same reader opens that topic's conversation signed in on another device
- **THEN** the question's bubble shows the same image

#### Scenario: A pdf sent with a question is named, not shown
- **WHEN** a reader sends a question with a pdf attached
- **THEN** the question's note names the pdf and the bubble shows no image for it

#### Scenario: A turn that carried nothing shows nothing
- **WHEN** a stored turn carried no attachments
- **THEN** its bubble shows the question and no attachment of any kind

### Requirement: A chat attachment downloads to the reader who sent it, kept or not

The chat attachment download route SHALL serve a stored attachment to the signed-in reader who sent it, whether or not they kept it, and SHALL answer not found to every other reader. An image of a media type a browser renders safely SHALL be served in place, so a question's bubble can show it. Every other stored file, SVG included, SHALL be served as a download.

#### Scenario: An unkept image serves to its sender
- **WHEN** the reader who sent an image they did not keep requests it
- **THEN** the file is served in place

#### Scenario: Another reader is refused
- **WHEN** a different signed-in reader requests that attachment by its id
- **THEN** the api answers not found and serves no bytes

#### Scenario: An SVG is never served in place
- **WHEN** a stored attachment's media type is SVG
- **THEN** it is served as a download instead of shown in place

## MODIFIED Requirements

### Requirement: Kept attachments are capped and bounded per reader per topic

A reader MAY hold at most a fixed number of kept attachments per topic. The composer SHALL reject the keep toggle at the limit and say why, so the bookmark never promises a memory that will not persist — never evicting an existing kept attachment to make room, since silently forgetting something deliberately kept is worse than rejecting something new. The server SHALL enforce the same limit as a backstop, without blocking or erroring the turn that included the attempt. Only kept attachments SHALL count against the limit; an image stored for a question's bubble alone SHALL NOT take a slot.

#### Scenario: The keep toggle rejects at the cap with a reason
- **WHEN** a reader at the limit tries to mark another attachment to keep
- **THEN** the toggle does not flip and a message says the topic's kept memory is full

#### Scenario: At the cap, a new attachment falls back to this turn only
- **WHEN** a reader at the limit attaches something new
- **THEN** it attaches with keep off and a message says it rides this turn only

#### Scenario: A cap-exceeding keep that reaches the server is skipped, never evicting
- **WHEN** a keep past the limit arrives at the server anyway
- **THEN** the turn completes normally, no existing kept attachment is removed, and the new attachment is not kept — stored against its turn if it is an image, and stored not at all otherwise

#### Scenario: Images stored for the transcript leave the cap alone
- **WHEN** a reader sends many unkept images on one topic
- **THEN** their kept attachment count is unchanged and the keep toggle still accepts

## REMOVED Requirements

### Requirement: A turn can carry attachments to the model without storing them

**Reason**: Its central claim, that an attachment never persists unless the reader keeps it, is what this change reverses for images. A question that sent an image now stores it so the bubble can show it again. Keeping the old name would leave the spec describing behavior the code no longer has.

**Migration**: Replaced by "A turn carries attachments to the model, and its images are stored", which restates every still-true part — the bounded payload kinds, pdf resolution at the api, the rejection of an unreadable pdf, images as message parts, text folded under the question, the attachment note on the stored question, composer rejection of unsupported types, and the request body bound — and adds what storing an image now means.
