# podcast-feeds Specification

## Purpose
TBD - created by archiving change coffee-break-podcast. Update Purpose after archive.
## Requirements
### Requirement: Every Topic with Podcast Episodes has an RSS podcast feed

Every Topic with a published Podcast Episode SHALL have an RSS 2.0 podcast feed with the iTunes and Podcasting 2.0
namespaces. The channel SHALL include the Topic's name with "Coffee Break podcast with Carl and Vienna", Carl and Vienna
as hosts, the Topic's prompt as its description, the show's cover, a category, and the language. Each item SHALL include
the Podcast Episode's own cover, its title, description, season, episode number, duration, publish date, a GUID made
from the Podcast Episode's id that never changes, an enclosure with the audio's url, byte size, and type, a Podcasting
2.0 chapters file in which each chapter links to its Finding's source, and an HTML transcript built from the Podcast
Episode's script.

#### Scenario: A feed validates

- **WHEN** a public Topic's podcast feed is checked against the tags that Apple Podcasts requires and the Podcasting 2.0
  namespace
- **THEN** the channel has a title, description, image, language, category, and explicit flag, and every item has a
  title, an enclosure with a url, length, and type, and a guid

#### Scenario: An item names its season and number

- **WHEN** the feed lists season 2026, podcast episode 14
- **THEN** its item includes `itunes:season` 2026 and `itunes:episode` 14, and a duration in seconds

#### Scenario: A GUID survives a rename

- **WHEN** a Topic is renamed
- **THEN** every item's guid in its feed is unchanged

#### Scenario: A removed Podcast Episode leaves the feed

- **WHEN** a Topic's owner removes a Podcast Episode and a podcast app fetches the Topic's feed again
- **THEN** the feed has no item for that Podcast Episode, and the item's enclosure, chapters, and transcript urls
  respond as missing

#### Scenario: Chapters link their sources

- **WHEN** a podcast app fetches an item's chapters file
- **THEN** each chapter has a start time, a title, and the url of its Finding's source

### Requirement: Every show and every Podcast Episode has a cover drawn on the cover illustration

Every cover SHALL be a 3000 by 3000 pixel RGB JPEG under 512 KB, drawn by the preview cards' satori and
resvg pipeline over the illustration at `docs/design/podcast/cover-base.png`, whose top 18 percent is an empty band and
whose bottom 25 percent is empty table. The top band SHALL read "Coffee Break podcast", centered across and down the
band, in Architects Daughter, with "Coffee Break" in `#f09050` and "podcast" in `#f3e9db`.

A Topic's show cover SHALL show the Topic's name in the bottom band in Architects Daughter, `#332a22`, left-aligned, and
SHALL be the channel's `itunes:image`. Each Podcast Episode SHALL have its own cover, set as its item's `itunes:image`,
whose bottom band shows the Podcast Episode's title the same way, with no label over it. A title SHALL step down in size
as it gets longer, SHALL wrap, and SHALL stop at three lines with an ellipsis. All text SHALL stay inside a 10 percent
safe margin at the cover's sides and a 5 percent margin at its bottom, and a title SHALL sit below the newspaper on the
table.

A cover SHALL be served at 3000 pixels for feeds and at 600 pixels for email. A cover's url SHALL be unguessable and
SHALL work without a session. Its path includes a key that only the app can compute, made from the cover's Topic or
Podcast Episode and its title. A public Topic's covers SHALL be served with the edge headers that the preview cards get.
A cover SHALL be drawn again when its title changes, at a new url.

#### Scenario: The show cover names the Topic

- **WHEN** a podcast app fetches a feed's channel image
- **THEN** it gets a 3000 by 3000 RGB image under 512 KB with "Coffee Break podcast" across the top band and the Topic's
  name in the bottom band

#### Scenario: A Podcast Episode has its own cover

- **WHEN** a podcast app fetches an item's `itunes:image`
- **THEN** the image's bottom band shows that Podcast Episode's title, with no label over it

#### Scenario: A long title stops at three lines

- **WHEN** a cover is drawn for a title too long for three lines at the smallest size
- **THEN** the title wraps to three lines, the third ends with an ellipsis, and no text crosses the safe margin

#### Scenario: A renamed Topic gets a new show cover

- **WHEN** an owner renames a Topic and its feed is fetched again
- **THEN** the channel image's url has changed and the image shows the new name

#### Scenario: A private Topic's cover loads without a session

- **WHEN** an email client with no session requests a private Topic's podcast episode cover at the url that the digest
  gave it
- **THEN** the cover is served

#### Scenario: A guessed cover url is missing

- **WHEN** a client requests a cover with the right Podcast Episode id and a key it made up
- **THEN** the response is not found

#### Scenario: The email size is 600 pixels

- **WHEN** a cover is requested at its email size
- **THEN** the image is 600 by 600 pixels

#### Scenario: A public cover is cached at the edge

- **WHEN** a public Topic's cover is requested
- **THEN** the response has the edge headers that a preview card has

### Requirement: A public Topic's feed is public, at its topic url

A public Topic with a published Podcast Episode SHALL have one public podcast feed at `/topics/<id>/podcast.xml`, beside
its existing `feed.xml`. The url SHALL use the Topic's id alone, so a rename keeps it. A Topic that is not public SHALL
have no feed at that url.

#### Scenario: A public feed is served

- **WHEN** a client requests a public Topic's `/podcast.xml`
- **THEN** it receives the feed as RSS

#### Scenario: A private Topic has no public feed

- **WHEN** a client requests `/podcast.xml` for a private or invite Topic
- **THEN** the response is not found

#### Scenario: A public Topic without Podcast Episodes has no feed

- **WHEN** a client requests `/podcast.xml` for a public Topic with no published Podcast Episode
- **THEN** the response is not found

### Requirement: A private or invite Topic's feed is per listener, with a token

A private or invite Topic SHALL have a podcast feed per listener, at a url that includes that listener's token. The feed
SHALL be marked `itunes:block` and SHALL be served with a noindex header, so no directory or search engine lists it. The
token alone SHALL authorize the request, since podcast apps fetch feeds from their own servers. A token SHALL work only
while its listener can still see the Topic. Losing access or unsubscribing SHALL delete the token, and a listener SHALL
be able to reset their token, which makes the old url stop working. On an invite Topic the feed SHALL list only Podcast
Episodes published after the listener joined.

#### Scenario: A per-listener feed is blocked from directories

- **WHEN** a client requests a per-listener feed
- **THEN** the channel includes `<itunes:block>Yes</itunes:block>` and the response has `X-Robots-Tag: noindex`

#### Scenario: Unsubscribing deletes the token

- **GIVEN** a subscriber of an invite Topic with a feed url in their podcast app
- **WHEN** they unsubscribe
- **THEN** the next request for that url responds as not found, and so does its audio

#### Scenario: A deleted invite deletes the token

- **WHEN** the owner deletes a listener's invite
- **THEN** that listener's feed url responds as not found

#### Scenario: A listener resets their token

- **WHEN** a listener resets their feed link
- **THEN** the old url responds as not found and the podcast feed dialog shows a new one

#### Scenario: A token never works for another Topic

- **WHEN** a listener's token for one Topic is used in another Topic's audio url
- **THEN** the response is not found

### Requirement: Enclosures are stable urls that redirect to a short-lived presigned URL

An item's enclosure SHALL point at a stable CarlNotes url, at a path after `/api/`. A GET SHALL redirect to a short-lived presigned
object storage URL that supports range requests, so a podcast app can download and resume. A HEAD SHALL respond directly
with the audio's length and type and with `Accept-Ranges: bytes`, without a redirect. A public Topic's enclosure SHALL
need no token, and a private or invite Topic's SHALL include the listener's token.

#### Scenario: A GET redirects

- **WHEN** a podcast app requests an enclosure url
- **THEN** it is redirected to a presigned URL, and the audio downloads from object storage

#### Scenario: A resumed download works

- **GIVEN** a download that stopped half way after the presigned URL expired
- **WHEN** the app requests the enclosure url again with a `Range` header
- **THEN** it is redirected to a fresh presigned URL, which returns the requested range

#### Scenario: A HEAD responds without a redirect

- **WHEN** a podcast app sends HEAD to an enclosure url
- **THEN** the response is 200 with the audio's `Content-Length` and `Content-Type: audio/mpeg`

### Requirement: Feeds return 304 and are cached in Redis until something changes

Every feed SHALL send an `ETag` and a `Last-Modified`, and SHALL respond with 304 and no body to a request whose
validators still match. Each rendered feed and each token check SHALL be cached in Redis until a Podcast Episode of the
Topic publishes or is removed, the Topic's name changes, or the listener's access changes, a feed for 15 minutes at most
and a passing token check for one minute at most. A feed SHALL list every published Podcast Episode that the listener
may listen to, no matter how many there are. A feed that lists more than 100 Podcast Episodes SHALL NOT be stored in
Redis and SHALL be built for each request. If Redis cannot be reached, the feed SHALL still be served.

#### Scenario: An unchanged feed is a 304

- **GIVEN** a podcast app that fetched a feed and saved its `ETag`
- **WHEN** it requests the feed again with `If-None-Match` and no Podcast Episode has published since
- **THEN** the response is 304 with no body

#### Scenario: A new Podcast Episode changes the feed

- **WHEN** a Podcast Episode publishes and the app requests the feed with its old `ETag`
- **THEN** the response is 200 with the new item and a new `ETag`

#### Scenario: A long feed keeps every Podcast Episode and is not stored

- **GIVEN** a Topic with 101 published Podcast Episodes
- **WHEN** its feed is requested
- **THEN** the feed lists all 101 Podcast Episodes, and nothing is stored in Redis for it

#### Scenario: A repeat request reads the cache

- **WHEN** the same feed is requested twice with no publish between
- **THEN** the second request reads no Podcast Episode rows from the database

#### Scenario: A deleted token is not served from the cache

- **WHEN** a listener unsubscribes and their feed url is requested again at once
- **THEN** the response is not found

### Requirement: The Subscribe button opens the listener's podcast app

The player's Subscribe button SHALL open the podcast feed dialog. On an iPhone or iPad it SHALL offer a `podcast://`
link, the scheme that Apple Podcasts registers for a feed, built from the feed url without its `https` scheme. On
Android it SHALL offer a `pcast://` link, the scheme that podcast apps register for a feed. Every device SHALL get "Copy
feed link" as the fallback, with a line naming apps that accept a pasted feed. Spotify SHALL NOT be offered, since it
accepts no private feed. For a private or invite Topic the dialog SHALL use the listener's own feed url, creating their
token the first time, and SHALL offer the reset. A signed-out visitor on a public Topic SHALL get the public feed.

#### Scenario: An iPhone gets the Apple Podcasts link

- **WHEN** a listener opens the dialog on an iPhone
- **THEN** it offers a `podcast://` link whose address is the feed url without `https://`

#### Scenario: Android gets the pcast link

- **WHEN** a listener opens the dialog on an Android phone
- **THEN** it offers a `pcast://` link for the feed

#### Scenario: Every device can copy the link

- **WHEN** a listener opens the dialog on a laptop
- **THEN** it offers "Copy feed link" and names apps that accept a pasted feed

#### Scenario: A private Topic's dialog shows the listener's own url

- **WHEN** a subscriber of an invite Topic opens the dialog
- **THEN** the link includes their token, and the dialog offers to reset it

### Requirement: Every feed says the hosts are AI voices

The feed's channel description, each item's description, and each transcript SHALL say that Carl and Vienna are AI
voices, as Apple's guidelines require of a show with AI hosts.

#### Scenario: The channel discloses AI voices

- **WHEN** a feed is fetched
- **THEN** its channel description says the hosts are AI voices

#### Scenario: Each item discloses AI voices

- **WHEN** a feed is fetched
- **THEN** every item's description says the hosts are AI voices

