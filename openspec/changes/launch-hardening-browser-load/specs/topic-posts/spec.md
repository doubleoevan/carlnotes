## ADDED Requirements

### Requirement: A Topic Post's body is the same html on the server and in the browser

The post's page SHALL render the stored body through one transform on the server and in the browser, so the server's
HTML holds the body as a reader sees it, with its headings, lists, images, and code blocks. The browser SHALL NOT swap
the article after the page loads, and reading a post SHALL load no editor package. The editor SHALL keep loading its
package as an author opens it.

#### Scenario: The server's HTML holds the whole body

- **WHEN** a request with no session fetches a public Topic's post whose body holds a heading, a list, an image, and
  a code block
- **THEN** the HTML's article holds each of them, the image with its stored width and height

#### Scenario: The body is styled before any script runs

- **WHEN** a browser without JavaScript opens a public Topic's post
- **THEN** the body's headings, lists, images, and code blocks show in the reader's own style

#### Scenario: Hydration swaps nothing

- **WHEN** a visitor's browser hydrates a server-rendered post's page
- **THEN** the article's markup and its height are unchanged, and the comment thread below it does not move

#### Scenario: A reader loads no editor package

- **WHEN** a reader opens a post's page
- **THEN** no script of the editor package is requested

#### Scenario: An author's editor still loads its package

- **WHEN** the post's author opens its editor
- **THEN** the editor package loads then

#### Scenario: The transform matches the editor package's reader

- **WHEN** the transform's test renders its stored bodies
- **THEN** each output matches what the editor package's reader renders for that body

### Requirement: A stored body is sanitized again as it is read

The api SHALL pass a Topic Post's stored html through its own sanitizer again as it reads the post for a reader,
because the post's page no longer runs the editor package's sanitizer. Markup outside the body's tag set SHALL never
reach a reader, whichever write stored it. A body that a save stored SHALL lose nothing as it is read.

#### Scenario: Markup that reached storage is dropped on read

- **GIVEN** a stored body that holds a script tag and an `onerror` attribute, written by a path other than a save
- **WHEN** a reader opens the post
- **THEN** the page's HTML holds neither

#### Scenario: A saved body loses nothing

- **WHEN** a reader opens a post whose body a save stored with body images, a code block's language, and an alignment
- **THEN** the page shows every image, the code block in its language, and the alignment

## MODIFIED Requirements

### Requirement: Body images show wherever the post is read

A Topic Post's page, its MCP view, and the mobile app's Topic Post screen SHALL show the body's images where the body
holds them, each on its own line with the text around it above and below, as the editors show it too. Each SHALL be
no wider than the reading column and SHALL keep its shape. On the post's page each SHALL be drawn from the
column-sized copy at its stored width and height, so its box has its size before the file loads and nothing below it
moves. The first SHALL load eagerly at high priority, and the rest lazily and decoded off the main thread. Its alt
text SHALL be the author's, or the post's title if the author wrote none. The MCP view SHALL load them from our own
site, and its content security policy SHALL allow no other origin for them.

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

#### Scenario: Nothing moves as an image loads

- **WHEN** a reader opens a post whose body holds three images on a slow connection
- **THEN** each image's box has its final size before its file arrives, and the text and the comment thread below
  never move as the images load

#### Scenario: The first image loads first

- **WHEN** a reader opens a post whose body holds three images
- **THEN** the first is requested eagerly at high priority, and the second and the third load lazily
