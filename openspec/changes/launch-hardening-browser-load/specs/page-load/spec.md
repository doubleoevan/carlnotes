## Purpose

What a full page load paints first and fetches first on the web: the signed-in face before the session read returns,
the images that load first, the dialogs and libraries that load on intent, analytics after hydration, and a play press
that starts inside the press.

## ADDED Requirements

### Requirement: The session cookie picks the signed-in face before the session read returns

On a full page load whose request brought a session cookie, the header's links and menu and the home's first section
SHALL show the signed-in face from the first paint, before the session read returns. If the session read then returns
no session, they SHALL fall back to the visitor's face without an error. A request with no session cookie SHALL get
the visitor's face in the server's HTML, as before.

#### Scenario: A signed-in load never shows the visitor's header

- **WHEN** a signed-in user loads any page
- **THEN** the header shows none of the visitor's Topics, Plans, Log in, or Sign up links at any moment of the load,
  and a placeholder the size of the avatar holds the user menu's place until the session names the user

#### Scenario: A signed-in home never shows the visitor's steps

- **WHEN** a signed-in user loads `/`
- **THEN** the place of the news card never shows the visitor's how it works steps

#### Scenario: A stale cookie falls back to the visitor's face

- **GIVEN** a browser that sends a session cookie whose session has ended
- **WHEN** it loads `/` and the session read returns no session
- **THEN** the header and the home show the visitor's face, and no error is shown or reported

#### Scenario: The home's view event waits for the session

- **WHEN** a browser with a stale session cookie loads `/`
- **THEN** one `home_view` event is sent after the session read returns, with `face` set to visitor

#### Scenario: A visitor's HTML keeps its links

- **WHEN** a request with no session cookie fetches a server-rendered page
- **THEN** the HTML holds the visitor's Topics, Plans, Log in, and Sign up links, as before

### Requirement: The home's reads start at mount if the session cookie is set

If the page request brought a session cookie, the home's reads SHALL start as the home mounts, without waiting for
the session read: the home read, the news, and the day's opener. Each SHALL be sent once: the session read's return
SHALL NOT send any of them again.

#### Scenario: The home's reads start beside the session read

- **WHEN** a signed-in user loads `/`
- **THEN** the home read and the opener read are sent before the session read returns, the news arrives in the home
  read or in a read of its own sent beside it, and none is sent again once the session read returns

#### Scenario: A stale cookie's early reads end in the visitor's home

- **WHEN** a browser with a stale session cookie loads `/`
- **THEN** the home read returns the visitor's home, and the page shows the visitor's face with no error once the
  session read returns no session

### Requirement: A signed-in load paints a pending shell from the HTML

The layout route SHALL have a pending component that the server renders for a request that brings a session cookie,
so that request's HTML holds the page's shell and never an empty body. The pending component SHALL have no minimum
display time: the page SHALL replace it as soon as the page renders.

#### Scenario: A signed-in load's HTML holds the shell

- **WHEN** a request for a public route brings a session cookie
- **THEN** the HTML's body holds the layout's pending shell, and the browser paints it before any script runs

#### Scenario: The shell leaves as soon as the page renders

- **WHEN** the page is ready to render 100 ms after hydration starts
- **THEN** the page replaces the shell then, and no fixed wait keeps the shell on screen

### Requirement: The first images load eagerly at high priority and the rest lazily

The header image of a topic page, a podcast episode page, and a Topic Post's page, the film player's poster on a
topic page, the first three cards of the home's first card section, and a Topic Post's first body image SHALL load
eagerly at high fetch priority. Every other Topic, Podcast Episode, Topic Post, film, and body image, and every
avatar, SHALL load lazily and decode off the main thread.

#### Scenario: A topic page's header image loads first

- **WHEN** a visitor opens a topic page
- **THEN** the header image is requested eagerly at high priority, and the browser's preload scanner finds it in the
  HTML

#### Scenario: The home's fourth card is lazy

- **WHEN** a visitor opens the home
- **THEN** the images of the first three cards of the first card section load eagerly at high priority, and the image
  of the fourth card and of every later card loads lazily

#### Scenario: A phone's topic page with a film

- **WHEN** a phone opens a topic page whose latest Podcast Episode has a ready film
- **THEN** the film player's poster loads eagerly at high priority

#### Scenario: A lazy image is decoded off the main thread

- **WHEN** a card below the first screen scrolls near the screen
- **THEN** its image loads then, with asynchronous decoding

### Requirement: A dialog or a panel loads on intent and opens without a wait

The Edit topic dialog, the rank dialogs, the Video dialog with its film player, both chat panels, the Add to AI
dialog, and the Report issue dialog SHALL NOT be in a page's first scripts. Each SHALL start loading on hover, focus,
or touch start of the control that leads to it, or as the menu that offers it opens, so a press opens it without a
wait. A page that shows a film section SHALL still load the film player with the page.

#### Scenario: A page load fetches no dialog script

- **WHEN** the home loads and no control is hovered, focused, or touched
- **THEN** no script of those dialogs or panels is requested, the film player's included

#### Scenario: A hover loads the dialog before the press

- **WHEN** a user moves the pointer onto the New Topic button and then presses it
- **THEN** the Edit topic dialog's script was requested on the hover, and the dialog opens on the press

#### Scenario: A focus loads the panel

- **WHEN** a keyboard user tabs to the chat pill and presses Enter
- **THEN** the panel's script started loading at the focus, and the panel opens once the script has loaded

#### Scenario: A page's action menu loads its dialogs

- **WHEN** a user opens a page's action menu
- **THEN** the scripts of the rank dialogs, the Add to AI dialog, and the Report issue dialog that it offers start
  loading, and choosing one opens it without a wait

#### Scenario: A chat panel's messages load as a chat opens

- **WHEN** a user hovers the chat pill and never opens a chat
- **THEN** the panel's script loads, and the Markdown renderer of its messages does not

### Requirement: Chart, map, and highlighter code loads only on the pages that use it

The chart and map libraries SHALL load only on a Dashboard page, and the Topic Post code highlighter only for a body
with a colored block. None of them SHALL load from the layout, and a chat panel that loads on intent SHALL pull in
none of them.

#### Scenario: Opening a chat loads no chart code

- **WHEN** a user opens a chat panel on a topic page
- **THEN** no chart library, map, or Topic Post highlighter code is requested

#### Scenario: The built chunks are checked

- **WHEN** the built client's chunk graph is read after a build
- **THEN** the chart and map chunks are reachable only from the Dashboard page, and the highlighter chunk only from
  the Topic Post reader and editor

### Requirement: Analytics loads after hydration and still captures the first page view

The analytics library SHALL NOT be in the page's entry script and SHALL load after the page hydrates. A page view or
an event sent before the library starts SHALL be queued and sent in order once it starts, so the first page view and
the page's first events are captured.

#### Scenario: The first page view is captured

- **WHEN** a visitor opens a public page
- **THEN** one page view for that page is sent once analytics starts, with its path rewritten as on every later view

#### Scenario: An early event keeps its order

- **WHEN** a topic page sends `visit_topic_viewed` before analytics has started
- **THEN** the event is sent after the first page view, once analytics starts

#### Scenario: The entry script holds no analytics library

- **WHEN** the built client's entry chunk is read after a build
- **THEN** it holds no analytics library code

### Requirement: A play press starts playback inside the press

A press on a play control SHALL set the player's loading state and the media element's source in the press's own
handler, from the counted route that the podcast episode summary holds. It SHALL read the full Podcast Episode beside
that for the chapters and the saved progress. A source that is already set SHALL NOT be assigned again, because a
second assignment would request the counted route twice.

#### Scenario: A card's press shows loading at once

- **WHEN** a listener presses play on a podcast episode card
- **THEN** the control shows its loading state and the audio element's source is the Podcast Episode's counted audio
  route, both before any read returns

#### Scenario: The play is counted once

- **WHEN** the full Podcast Episode read returns after the press set the source
- **THEN** the source is not assigned again, the counted route was requested once, and one play is counted

#### Scenario: A film card's press starts the film

- **WHEN** a user presses the play button on a film card
- **THEN** the film element's source is set to the counted film route inside the press, and the film plays once it
  loads

#### Scenario: A resumed listener keeps their place

- **GIVEN** a listener who stopped a Podcast Episode at 12:40
- **WHEN** they press play on its card
- **THEN** playback continues from 12:40 once the full read returns their saved progress

#### Scenario: An MCP view plays its own url

- **WHEN** a play control is pressed in an MCP view
- **THEN** the view reads the Podcast Episode first, as before, and its media element loads the absolute url with the
  play token that the tool returned, never a bare route path

### Requirement: No page load fetches a counted audio or film route before a press

Loading a page, opening a section, a hover, a focus, and a touch start SHALL NOT request a Podcast Episode's counted
audio route or counted film route, so no play and no place is counted for a person who started no playback.

#### Scenario: A page load requests no media

- **WHEN** the home, a topic page with a film, a podcast episode page, or a Topic Post's page loads and nothing is
  pressed
- **THEN** no request for an `audio.mp3` or a `video.mp4` route is sent, and no play is counted

#### Scenario: The film section opens on its poster

- **WHEN** a topic page opens its film section on load
- **THEN** the section shows the film's poster, and no film bytes are requested

### Requirement: A play control's intent opens a connection to storage and fetches nothing

On hover, focus, or touch start of a play control the page SHALL open a connection to the storage origin that serves
the audio and the film, so a press plays sooner. The page SHALL learn that origin from one small public read on the
first intent. The intent SHALL request no audio, no film, and no counted route.

#### Scenario: A hover opens the connection

- **WHEN** a user moves the pointer onto a card's play button
- **THEN** the page opens a connection to the storage origin, and no media request and no counted route request is
  sent

#### Scenario: The origin is read once

- **WHEN** a user hovers several play controls on one page
- **THEN** the storage origin is read once, and the connection is opened once

#### Scenario: The origin read names the origin alone

- **WHEN** a visitor reads the storage origin
- **THEN** the response holds the origin and no key, signed url, or file path
