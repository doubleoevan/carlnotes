## MODIFIED Requirements

### Requirement: The body is rich text cleaned on the server

A Topic Post's body SHALL be rich text held to the Tasting Notes editor's tag set, plus the post's own body images with
their places, a code block's language, and a block's left, center, or right alignment. Every save SHALL pass the body
through the sanitizer on the server, so markup outside that set is dropped whether it was typed or pasted. A Tasting
Note's body SHALL keep the editor's tag set alone. The editor SHALL be the Tasting Notes editor without its comment
thread.

#### Scenario: Pasted markup is cleaned

- **WHEN** an author pastes text holding a script tag and a styled table and saves
- **THEN** the stored body holds neither, and the words inside them that the tag set allows remain

#### Scenario: The editor has no comment thread

- **WHEN** an author opens the Topic Post editor on the web or in the mobile app
- **THEN** it shows the toolbar and the body, and no comment thread control

#### Scenario: A Tasting Note keeps no image

- **WHEN** a Tasting Note's body is saved holding an `img` with a url to a Topic Post's body image
- **THEN** the stored note body holds no `img`

### Requirement: The author, the Topic's owner, and an admin delete a Topic Post

A Topic Post SHALL be deletable by its author, by its Topic's owner, and by an admin, at any time, after a
confirmation. Nobody else SHALL delete it. Deleting it SHALL delete its Comments, reactions, discussions, image files,
body images, and audio. A Topic Post SHALL also be deleted with its Topic and with its author's account.

#### Scenario: The Topic's owner deletes a member's post

- **WHEN** a Topic's owner confirms Delete on a team member's published Topic Post
- **THEN** the Topic Post, its thread, its image, and its discussion's audio are gone for everyone

#### Scenario: Another member cannot delete it

- **WHEN** a team member who is neither the author nor the Topic's owner sends the delete
- **THEN** it is rejected and the Topic Post stays

#### Scenario: Deleting a post deletes its body images

- **WHEN** an author deletes a Topic Post whose body holds three images, and another image they uploaded but never saved
- **THEN** the files of all four images are queued for deletion and their urls stop serving

### Requirement: An AI summary shows in the Topic Post's info popup

Publishing SHALL write a summary of the Topic Post of at most 400 characters, from the post's text fenced as untrusted,
billed to the publisher. An edit that changes the text SHALL write it again, once for the edits saved within 30
seconds, at any time after the publish. The card's and the page's info popup SHALL show it, and the popup SHALL say
that there are no notes yet while there is none.

#### Scenario: Quick edits share one rewrite

- **WHEN** an author's editor saves a published post three times within 30 seconds
- **THEN** the summary is written once from the last saved text

#### Scenario: An edit of the formatting alone writes no summary

- **WHEN** an author makes a published post's sentence bold and changes no word
- **THEN** the summary stays as it is

#### Scenario: The popup shows the summary

- **WHEN** a reader opens the info popup of a published Topic Post
- **THEN** it shows the summary under Carl's Notes

#### Scenario: A failed summary blocks nothing

- **WHEN** the summary call fails or the publisher's budget is spent
- **THEN** the Topic Post stays published and its popup says that there are no notes yet

### Requirement: A Topic Post starts as a draft that only its author reads

A new Topic Post SHALL be a draft, unpublished and readable by its author alone. A draft SHALL be saved with the
version its editor opened at, and a save against a newer version SHALL be rejected as a conflict that names the version.
Only the author edits a Topic Post, so the editor SHALL then save its words again once at the named version, with no
notice. A draft SHALL appear in no list, count, news, or model context.

#### Scenario: A draft survives a second device

- **WHEN** an author saves a draft on the web and opens the Topic in the mobile app
- **THEN** the draft shows there, to the author alone, with the saved words

#### Scenario: The Topic's owner cannot read a member's draft

- **WHEN** the Topic's owner asks for a team member's draft
- **THEN** the request is answered as for a Topic Post that does not exist

#### Scenario: A stale save is a conflict

- **WHEN** an author saves a draft from a tab that opened it before another save
- **THEN** the api rejects the save as a conflict, and the editor saves its words again at the newer version and shows
  no notice

## REMOVED Requirements

### Requirement: A published Topic Post is editable by its author for 15 minutes

**Reason**: Locking a post 15 minutes after its publish kept authors from fixing a typo or adding to a post later.
The requirement added below lets the author edit at any time.

**Migration**: The write failure's `locked` status is gone, and the read's `isEditable` now equals `isAuthor`. A
released mobile app keeps reading `isEditable`, which stays in the response.

## ADDED Requirements

### Requirement: A published Topic Post is editable by its author at any time

A published Topic Post's title and body SHALL be editable by its author at any time after its publish. An edit SHALL
keep the 300 word minimum. A read SHALL tell the client whether the caller wrote the Topic Post and whether they may
edit it. An edit SHALL count toward no daily write limit.

#### Scenario: A published post's editor saves ten seconds after the last change

- **WHEN** an author stops typing in a published post
- **THEN** the editor saves ten seconds later, or at once if the page is left, and a draft still saves after one second

#### Scenario: An edit soon after the publish is saved

- **WHEN** an author corrects a sentence ten minutes after publishing
- **THEN** the page shows the corrected body

#### Scenario: An edit a month later is saved

- **WHEN** an author corrects a sentence a month after publishing
- **THEN** the page shows the corrected body, and its details say edited

#### Scenario: Edit is never disabled for the author

- **WHEN** the author opens the menu of their Topic Post a day after publishing, on the web or in the mobile app
- **THEN** Edit post is enabled and opens the editor

### Requirement: An author moves a body image on the web

The web editor SHALL let an author drag a body image to another place in the body. The image SHALL show on its own
line there, and the save SHALL store it at its new place.

#### Scenario: A drag of the image moves it

- **WHEN** an author drags an image by its body and drops it after a later paragraph's text on the web
- **THEN** the image moves there, shows on its own line, and the save stores it at its new place

### Requirement: An author resizes a body image on the web

The web editor SHALL show a resize handle, never cut off, at a hovered, selected, or focused image's corner. A drag of
it and the arrow keys on it SHALL change the image's width at its shape, from 48 pixels to the column's width, and the
save SHALL store the whole-number width and height. Readers SHALL see the stored size, no wider than their column. The
mobile editor SHALL keep the stored size and show no handle.

#### Scenario: A drag narrows the image

- **WHEN** an author drags a 400 by 300 image's handle 100 pixels to the left
- **THEN** the image shows at 300 by 225, and the saved body holds `width="300" height="225"`

#### Scenario: A drag stops at the column

- **WHEN** an author drags an image's handle far past the editor's right edge
- **THEN** the image stops at the column's width and keeps its shape

#### Scenario: The arrow keys resize it

- **WHEN** an author focuses an image's handle and presses the right arrow
- **THEN** the image grows by a tenth of its width

#### Scenario: A reader sees the stored size

- **WHEN** a reader opens a post whose author narrowed an image to 300 pixels
- **THEN** the image shows 300 pixels wide on a wide screen and no wider than the column on a phone

### Requirement: An author adds a body image at the cursor

The Topic Post editor SHALL add an image at the cursor from an Image button in its toolbar and when an image is pasted,
on the web and in the mobile app. On the web an image file dropped on the body SHALL go in at the drop point. The file
SHALL upload before it is inserted. While it uploads the editor SHALL show
the image loading. The editor SHALL then insert the stored image's url with its width and height, never a local or
`blob:` url, or SHALL drop the image and show the upload's error.

#### Scenario: A pasted screenshot becomes a stored image

- **WHEN** an author pastes a screenshot into a Topic Post's body on the web
- **THEN** the editor shows it loading, uploads it, and inserts an `img` whose src is the stored image's url

#### Scenario: A dropped image goes where it was dropped

- **WHEN** an author drags an image file from their desktop onto the start of a paragraph on the web
- **THEN** the editor uploads it and inserts the stored image at the start of that paragraph

#### Scenario: A rejected upload leaves no image

- **WHEN** an author picks a file with the Image button and the upload is rejected
- **THEN** no image is inserted, the body is unchanged, and the editor shows the rejection's reason

#### Scenario: Carl draws no body image

- **WHEN** an author opens the Image button's choices
- **THEN** it offers an upload alone, and no generated image

### Requirement: A body image upload accepts only real raster images

A body image upload SHALL accept a JPEG, a PNG, a WebP, or a GIF, judged by the file's own bytes and never by its name
or its declared type. It SHALL reject an SVG and every other file. Only the Topic Post's author SHALL upload to it.

#### Scenario: An SVG is rejected

- **WHEN** an author uploads an SVG file as a body image
- **THEN** the upload is rejected as an unsupported type and nothing is stored

#### Scenario: Bytes that disagree with the declared type are judged by the bytes

- **WHEN** an author uploads an HTML file named `photo.png` with the declared type `image/png`
- **THEN** the upload is rejected as an unsupported type

#### Scenario: Another editor cannot upload into the post

- **WHEN** an editor of the Topic who is not the post's author uploads a body image to it
- **THEN** the upload is rejected as not found

### Requirement: A body image upload refuses an image too large to decode

A body image upload SHALL reject an image whose pixel count, summed over every frame, passes a fixed limit, before it
decodes, so a small file cannot expand into a huge bitmap.

#### Scenario: A decompression bomb is rejected

- **WHEN** an author uploads a small PNG that declares 50,000 by 50,000 pixels
- **THEN** the upload is rejected as too large and the server decodes no bitmap of that size

#### Scenario: A long animation is counted by its frames

- **WHEN** an author uploads a GIF whose frames together pass the pixel limit
- **THEN** the upload is rejected as too large

### Requirement: A body image is re-encoded without its metadata

Every body image upload SHALL be re-encoded, which drops its EXIF and every other piece of metadata. The server SHALL
store one copy, sized for the post's reading column at twice its width and never enlarged past the image's own pixels,
and readers SHALL load it. An animated GIF SHALL stay animated.

#### Scenario: A phone photo loses its location

- **WHEN** an author uploads a JPEG from a phone that holds GPS coordinates in its EXIF
- **THEN** the stored file holds no EXIF or GPS data

#### Scenario: An animated GIF keeps moving

- **WHEN** an author uploads an animated GIF within the limits
- **THEN** the stored copies are animated

### Requirement: A body image's moderation fails closed

Every body image upload SHALL pass the image moderation the cover upload uses, on every frame it screens. An image the
moderation finds objectionable SHALL be rejected as a cover upload is. A moderation check that fails or cannot run
SHALL reject the upload with a message to try again, and SHALL never let it through.

#### Scenario: An objectionable image is rejected

- **WHEN** the image moderation finds an uploaded body image objectionable
- **THEN** the upload is rejected and nothing is stored

#### Scenario: A failed check rejects the upload

- **WHEN** the image moderation errors while it checks a body image
- **THEN** the upload is rejected with a message to try again, and nothing is stored

### Requirement: Body images are limited by plan

Each plan SHALL set how many images one Topic Post's body may hold and the most bytes one body image file may hold. The
image count SHALL be checked at upload, counting the post's saved and unsaved images, and again at save. The upload
route SHALL be rate limited per user.

#### Scenario: The upload past the post's limit is rejected

- **WHEN** an author on a plan that allows five body images uploads a sixth to a post that holds five
- **THEN** the upload is rejected with the limit, and nothing is stored

#### Scenario: A save past the limit is rejected

- **WHEN** a save names more body images than the author's plan allows
- **THEN** the save is rejected with the limit and the stored body is unchanged

#### Scenario: A file past the plan's size is rejected

- **WHEN** an author uploads a body image larger than their plan's file size
- **THEN** the upload is rejected as too large

### Requirement: The sanitizer admits only the post's own body images

The sanitizer SHALL keep an `img` on a Topic Post's body only if its src parses as a url on our own site whose path
names one of that post's own body images, compared after parsing and never by a string prefix. It SHALL keep only `src`,
`alt`, and whole-number `width` and `height` inside a fixed range, and SHALL store the src without any signature. Every
other `img` SHALL be dropped.

#### Scenario: An image on another origin is dropped

- **WHEN** a save holds an `img` whose src is on another site
- **THEN** the stored body holds no such `img`

#### Scenario: Another post's image is dropped

- **WHEN** a save holds an `img` whose src names another Topic Post's body image
- **THEN** the stored body holds no such `img`

#### Scenario: A url that only starts with the post's path is dropped

- **WHEN** a save holds an `img` whose src starts with the post's body image path but resolves elsewhere, through `..`
  segments, an encoded slash, or a different host after the prefix
- **THEN** the stored body holds no such `img`

#### Scenario: Unsafe attributes are dropped

- **WHEN** a save holds the post's own body image with `srcset`, `style`, and an `onerror` handler
- **THEN** the stored `img` keeps its src, alt, width, and height alone

#### Scenario: A missing or out-of-range size drops the image

- **WHEN** a save holds the post's own body image with no width, or a height of 0, or a width past the range
- **THEN** the stored body holds no such `img`

#### Scenario: A signed url is stored plain

- **WHEN** a save holds the post's own body image whose src includes a read signature
- **THEN** the stored src holds the image's path without the signature

### Requirement: Unsaved and removed body images are deleted

A body image the post never saves SHALL be deleted after a short grace period, so the storage is never free hosting. An
image the body held SHALL be queued for deletion once the post saves without it.

#### Scenario: An unsaved upload is deleted

- **WHEN** an author uploads a body image and the post is never saved holding it
- **THEN** its files are deleted once the grace period passes, and its url stops serving

#### Scenario: A removed image is queued for deletion

- **WHEN** an author removes an image from the body and saves
- **THEN** the image's files are queued for deletion, and its url stops serving

### Requirement: Body images show wherever the post is read

A Topic Post's page, its MCP view, and the mobile app's Topic Post screen SHALL show the body's images where the body
holds them, each on its own line with the text around it above and below, as the editors show it too. Each SHALL be
no wider than the reading column and SHALL keep its shape. Its alt text SHALL be the
author's, or the post's title if the author wrote none. The MCP view SHALL load them from our own site, and its content
security policy SHALL allow no other origin for them.

#### Scenario: An image sits on its own line

- **WHEN** a reader opens a post whose stored paragraph reads "Hello", an image, then "body"
- **THEN** "Hello" shows above the image and "body" below it, on the web, in the MCP view, and in the mobile app

#### Scenario: A wide image fits the column

- **WHEN** a reader opens a post whose body holds a 3000 by 1000 pixel image on a phone
- **THEN** the image fills the column's width at a 3:1 shape

#### Scenario: An image with no alt text reads the title

- **WHEN** a screen reader reaches a body image whose author wrote no alt text
- **THEN** it reads the post's title

#### Scenario: The MCP view shows the images

- **WHEN** the topic post MCP view opens a post whose body holds an image
- **THEN** the image loads from our own site and the view's content security policy names no new origin

### Requirement: A body image has its post's visibility

A body image SHALL be readable by exactly those who may read its Topic Post, which follows its Topic's visibility. A
non-public Topic's image SHALL be served to a session that may open the Topic, or for a url with a valid, unexpired
signature. A read of a non-public Topic's post SHALL return its image urls signed for that reader, so the mobile app and
the MCP view load them without a session cookie.

#### Scenario: A signed url loads on mobile

- **WHEN** a team member opens a team Topic's post in the mobile app
- **THEN** the body's images load through their signed urls

#### Scenario: An unsigned url of a private image is not found

- **WHEN** a visitor with no session requests a non-public Topic's body image without a signature, or with an expired or
  altered one
- **THEN** the response is not found

### Requirement: Body image files are served safely

A body image file SHALL be served with its true content type, `X-Content-Type-Options: nosniff`, and a long cache
lifetime at a url that never names another image's file. A non-public Topic's file SHALL never be cached at the edge.

#### Scenario: A public file is cached and typed

- **WHEN** a reader loads a public Topic's body image
- **THEN** the response has the stored file's content type, nosniff, and a long immutable cache lifetime

### Requirement: Text readers skip body images

The Topic Post's card, its summary, the home order, its discussion script, its word count, and Carl's retrieval SHALL
read the body's text and skip its images.

#### Scenario: An image adds no words

- **WHEN** an author adds an image to a body of 300 words and saves
- **THEN** the word count stays 300 and the summary, the discussion script, and retrieval read the same text as before

### Requirement: An author sets a code block's language

While the cursor is in a code block, the Topic Post editor's toolbar SHALL offer a menu of Auto, the default, Plain
text, and a short list of common languages. Plain text and a language SHALL store as a `data-language` attribute on the
code block, and Auto SHALL store none. The sanitizer SHALL keep `data-language` only on a Topic Post's code block and
only for a value on the list or Plain text's.

#### Scenario: An author picks TypeScript

- **WHEN** an author puts the cursor in a code block, picks TypeScript, and saves
- **THEN** the stored code block holds `data-language="typescript"`

#### Scenario: A language off the list is dropped

- **WHEN** a save holds a code block whose `data-language` is not on the list
- **THEN** the stored code block holds no `data-language`

#### Scenario: Auto stores no language

- **WHEN** an author picks Auto for a code block that had a language and saves
- **THEN** the stored code block holds no `data-language`

#### Scenario: Plain text stores its own value

- **WHEN** an author picks Plain text for a code block and saves
- **THEN** the stored code block holds `data-language="plaintext"`

### Requirement: A code block with a language is colored when read

The post page, the MCP view, and the web editor SHALL color each code block but Plain text in Nightshift colors, the
editor as the author types. A block with no language SHALL color in a language guessed from its code, or stay plain if
none fits. Coloring SHALL never change a block's size or line breaks. The highlighter SHALL load only for a body with
such a block or a caret in one, and colored markup SHALL never reach a save.

#### Scenario: A TypeScript block is colored without moving

- **WHEN** a reader opens a server-rendered post holding a TypeScript code block
- **THEN** its keywords and strings take Nightshift colors once the highlighter loads, and the block's size and line
  breaks are unchanged

#### Scenario: Code text is escaped

- **WHEN** a code block holds `<script>alert(1)</script>` as its text
- **THEN** the colored block shows that text and runs no script

#### Scenario: The editor colors code as it is typed

- **WHEN** an author types `function pour() { return 42 }` into a TypeScript code block on the web
- **THEN** the keywords and the number take their colors at once, and the saved body holds the code with no color
  markup

#### Scenario: A block with no language colors in a guessed one

- **WHEN** a reader opens a post whose code block has no language and holds `SELECT id FROM topic_posts`
- **THEN** the block colors as SQL, and a block holding a sentence of prose stays plain

#### Scenario: A page with no colored block loads no highlighter

- **WHEN** a reader opens a post whose code blocks are all Plain text
- **THEN** the highlighter is never loaded

### Requirement: The mobile app keeps plain code blocks and their languages

The mobile app SHALL show code blocks plain, as today. An edit in the mobile app SHALL keep each code block's language
and each image's alt text, which the native editor does not hold.

#### Scenario: A mobile edit keeps the language

- **WHEN** an author edits the text of a post with a TypeScript code block in the mobile app and saves
- **THEN** the stored code block still holds `data-language="typescript"`

### Requirement: An author aligns text

The Topic Post editor SHALL offer Align left, Align center, and Align right on the web and in the mobile app. With the
caret in text they SHALL align the paragraphs at the caret, and a press on the active one SHALL return them to the
text's own direction. Readers SHALL show the stored alignment.

#### Scenario: A paragraph is centered

- **WHEN** an author puts the caret in a paragraph and presses Align center
- **THEN** the paragraph shows centered, and the saved body holds its `text-align: center`

### Requirement: An author places a body image on the web

With a body image selected in the web editor, the alignment buttons SHALL place it: at the left or the right with the
text beside it at up to half the column, or centered. A press on the active one SHALL return it to its own line. On a
phone's width an image at a side SHALL sit there on its own line. The mobile editor SHALL keep each image's place.

#### Scenario: Text wraps beside an image at the right

- **WHEN** an author selects an image on the web and presses Align right
- **THEN** the image floats at the right with the next paragraphs beside it, and the saved body holds
  `data-align="right"`

#### Scenario: A centered image sits in the middle

- **WHEN** an author selects an image on the web and presses Align center
- **THEN** the image shows on its own line in the middle of the column

#### Scenario: A phone edit keeps an image's place

- **WHEN** an author edits a post on the phone whose image the web placed at the left
- **THEN** the saved body still holds the image's `data-align="left"`
