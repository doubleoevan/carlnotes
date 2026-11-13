# topic-posts Specification

## Purpose
A Topic's owner and its team members publish long-form Topic Posts on the Topic, which customer copy calls Open Mic.
Each Topic Post has a draft, a page of its own, a generated image, and a summary, and it joins the Topic's Scan context.

## Requirements

### Requirement: Only a Topic's editors write Topic Posts on it

Only a user who may edit a Topic SHALL create, save, publish, or regenerate a Topic Post on it: the Topic's owner and
the active members of a Team that holds it. A request from anyone else SHALL be rejected and SHALL change nothing.
Topic Post writes SHALL count toward the daily social write limit.

#### Scenario: A team member publishes

- **WHEN** an active member of a Team that holds the Topic publishes a Topic Post of 300 words
- **THEN** the Topic Post is published under that member's name

#### Scenario: A follower cannot publish

- **WHEN** a user who follows the Topic and may not edit it sends a publish request
- **THEN** it is rejected and no Topic Post is stored

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

### Requirement: Publishing needs a title and 300 words

Publishing SHALL need a title of 1 to 120 characters and a body of at least 300 words, counted over the body's text. A
publish below either SHALL be rejected and SHALL keep the draft. The editor SHALL show the word count and SHALL keep
Publish disabled until the draft holds 300 words. A published Topic Post SHALL show at once, with no approval step.

#### Scenario: A short draft cannot publish

- **WHEN** an author's draft holds 240 words
- **THEN** Publish is disabled beside the count, and a publish request sent anyway is rejected

#### Scenario: A post publishes at once

- **WHEN** an author publishes a draft of 320 words
- **THEN** the Topic Post is the first card of the Topic's section on the next read

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

### Requirement: A Topic Post's text is classified before it publishes

The title and the body's text SHALL pass the user text classification at publish and at each edit of a published Topic
Post, as a Note's body does at a save. A text the classification flags SHALL be rejected with the response other
flagged content gets, and the draft SHALL be kept. The whole text SHALL be classified, in pieces if it is longer than
one classification reads. A publish SHALL publish only the version that was classified.

#### Scenario: A flagged post stays a draft

- **WHEN** an author publishes a draft the classification flags
- **THEN** the publish is rejected and the draft keeps its words

#### Scenario: A long post is classified to its end

- **WHEN** an author publishes a draft whose text is flagged only after its first 8,000 characters
- **THEN** the publish is rejected and the draft keeps its words

#### Scenario: A draft saved during the classification is not published

- **GIVEN** a publish whose text is being classified
- **WHEN** the author saves the draft again before the classification returns
- **THEN** the publish is rejected as a conflict and the post stays a draft

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

### Requirement: A Topic Post is readable by whoever may open its Topic

A published Topic Post SHALL be readable by exactly the people who may open its Topic, a visitor included on a public
Topic, checked at each read. A Topic Post on a Topic the caller may not open SHALL be answered as one that does not
exist. Only a public Topic's Topic Posts SHALL appear to anyone but a person who may open the Topic.

#### Scenario: A private Topic's post is private

- **WHEN** a visitor requests the page of a Topic Post on a private Topic
- **THEN** the response is the same as for a Topic Post that does not exist

#### Scenario: A Topic turning private hides its posts

- **WHEN** a public Topic with three Topic Posts turns private
- **THEN** a visitor's next read of any of them is answered as not found, with nothing written to the posts

### Requirement: The Topic page shows its Topic Posts below its comment thread

The Topic page and the mobile Topic screen SHALL show a collapsible section titled "Open Mic" right below the Topic's
comment thread, holding the Topic's published Topic Posts as cards, newest first, six a page, with every card in the
server's HTML. An author SHALL see their own drafts first, each marked Draft. A user who may publish SHALL see the
button that starts a draft. The button and the cards SHALL sit inside one card, as the comment thread's do, and the
page buttons SHALL sit under that card, as the scan history's do. The section SHALL be absent for a reader who may not
publish if it has no card.

#### Scenario: A visitor sees the section on a public Topic

- **WHEN** a visitor opens a public Topic that has two Topic Posts
- **THEN** the section shows both cards below the comment thread, newest first, and no button

#### Scenario: An empty section is absent for a follower

- **WHEN** a follower opens a Topic with no Topic Post
- **THEN** the page shows no Open Mic section

#### Scenario: An author sees their draft

- **WHEN** an author with one draft opens the Topic
- **THEN** the section shows the draft's card first, marked Draft, and nobody else's read holds it

#### Scenario: The page buttons sit under the card

- **WHEN** a visitor opens a Topic with seven Topic Posts
- **THEN** six cards show inside the section's card, and the page buttons sit under it

### Requirement: A Topic Post has a page nested in its Topic's route

A published Topic Post SHALL have a page at `/topics/<topicId>/<topicSlug>/posts/<topicPostId>/<postSlug>`, the slug
being its title as url-safe words. The id alone SHALL resolve it, and a url with a missing or stale slug SHALL redirect
to the current one. The page SHALL show, in order, the image, the title, the author's byline with the reactions, the
details line with the date, the discussion card, the body, and the comment thread. It SHALL hold no chat of its own.

#### Scenario: The discussion card sits above the body

- **WHEN** a reader opens a published Topic Post that has a discussion
- **THEN** the discussion card shows under the header and above the body, the comment thread shows under the body,
  and no chat panel shows on the page

#### Scenario: A renamed post redirects

- **WHEN** a request names a Topic Post's id with the slug of its earlier title
- **THEN** the response redirects to the url with the current slug

#### Scenario: A draft's url shows its author the editor

- **WHEN** an author opens their draft's url, and then another user opens it
- **THEN** the author sees the editor, and the other user is answered as for a Topic Post that does not exist

### Requirement: The Topic Post page renders on the server with share and article data

A public Topic's Topic Post page SHALL render on the server with the body and the first page of its thread in the HTML.
Its head SHALL hold the title, a description from the summary, a canonical url, a share image, and `BlogPosting`
structured data with the headline, the author, the publish and edit times, and the image. The sitemap SHALL list it.

#### Scenario: A crawler reads the post

- **WHEN** a request with no session fetches a public Topic's Topic Post page
- **THEN** the HTML holds the body's text, the newest Comments, and a `BlogPosting` naming the author and the dates

#### Scenario: An invite Topic's post stays out of the sitemap

- **WHEN** the sitemap is built
- **THEN** it lists the Topic Posts of public Topics and none of an invite or a private Topic

### Requirement: Every published Topic Post gets a generated image

Publishing SHALL draw the Topic Post an image as a Topic's is drawn: a scene written from the post's fenced text, the
house style, and the same sizes. Until the image is stored, a card and the page SHALL show the image's empty frame
pulsing, still if the user asked for reduced motion. An image url SHALL be immutable and gated by the Topic's
visibility.

#### Scenario: A new post's card gains its image

- **WHEN** an author publishes a Topic Post
- **THEN** its card shows the empty frame pulsing at once and the generated image once the render stores it

### Requirement: A Topic Post's image is regenerated under the Topic image limit

The Topic Post's author, the Topic's owner, the active members of a Team that holds the Topic, and an admin SHALL
regenerate a Topic Post's image through the image editor a Topic's image has, and nobody else SHALL. A regeneration
SHALL count toward that user's one monthly image regeneration limit, the same count a Topic's regenerations use, and
SHALL be rejected at the limit. An admin SHALL have no limit.

#### Scenario: Post and Topic regenerations share a count

- **WHEN** a Plus user regenerates a Topic's image 14 times and a Topic Post's image once in one month
- **THEN** the editor reads 15 of 15 used this month and shows no Regenerate button for either image

#### Scenario: A team member regenerates another member's post image

- **WHEN** a member of the Team that holds the Topic regenerates the image of a Topic Post another member wrote
- **THEN** the render runs and counts toward the member's own monthly limit

#### Scenario: An admin is never limited

- **WHEN** an admin regenerates a Topic Post's image past any plan's limit
- **THEN** the render runs and the editor shows no count

#### Scenario: A follower may not regenerate

- **WHEN** a follower who is neither the author nor one of the Topic's editors asks to regenerate a Topic Post's image
- **THEN** the request is rejected and the image is unchanged

### Requirement: The same people upload their own image over a Topic Post's

Whoever may regenerate a Topic Post's image SHALL be able to upload their own over it. The upload SHALL go through
the upload path a Topic's and a Podcast Episode's image use, so it SHALL pass the same size, type, and image
moderation checks and SHALL be stored at the same sizes. A rejected upload SHALL leave the image unchanged. An upload
SHALL count toward no limit, and SHALL replace the generated image until someone regenerates.

#### Scenario: An author uploads over the generated image

- **WHEN** an author uploads a png over their published Topic Post's generated image
- **THEN** the upload passes the Topic image checks, is cropped, and becomes the post's image

#### Scenario: A file of the wrong type or size is rejected

- **WHEN** an author uploads a gif, or a jpeg over the Topic image upload size
- **THEN** the upload is rejected with the reason a Topic image upload gives, and the post's image is unchanged

#### Scenario: An objectionable upload is rejected

- **WHEN** the image moderation finds an uploaded image objectionable
- **THEN** the upload is rejected as a Topic image upload is, and the post's image is unchanged

### Requirement: A new image replaces the old one everywhere

A regenerated or uploaded image SHALL replace the Topic Post's old image on its card, on its page, and in its share
image. Storing it SHALL purge the Topic Post page's cache at the edge, and the old image's url SHALL stop being the
post's current one.

#### Scenario: A regenerated image reaches the card, the page, and the share image

- **WHEN** an author regenerates their Topic Post's image and the render stores it
- **THEN** the card, the page, and the share image show the new image, and the post page's cached copy is purged

### Requirement: A Topic Post's image is reportable and an admin regenerates it

A signed-in user who may open a Topic Post SHALL be able to report its image, and SHALL no longer see that image until
it changes. The admin console's Reports view SHALL show the image on such a report and SHALL offer Regenerate beside
Clear and Block. Regenerate SHALL delete an upload, generate the image again on the platform's budget, and resolve the
report as removed, as it does for a Topic's image.

#### Scenario: An admin regenerates a reported upload

- **WHEN** an admin presses Regenerate on a report of a Topic Post's uploaded image
- **THEN** a fresh generated image replaces the upload, the upload is scheduled for deletion, and the report resolves
  as removed

#### Scenario: A Topic Post that is gone leaves nothing to regenerate

- **WHEN** an admin presses Regenerate on an image report whose Topic Post was deleted
- **THEN** no render starts, and the report resolves as removed

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

### Requirement: The info popup follows the Topic's popup

A Topic Post's info popup SHALL show, in order: the title, a Written by section with the author's link, the
reactions, and Share at the row's right, a Topic section with the Topic's image and link, the post's image at full
width, a Coffee Break Discussion section with the play button, then the recording's date, length, and hosts, and
Carl's Notes with the summary and a copy button. It SHALL leave out a missing image and an unfinished recording.

#### Scenario: A published post shows every section

- **WHEN** a reader opens the popup of a published Topic Post with an image, a recording, and a summary
- **THEN** the popup shows the author with the reactions and Share, the Topic, the image, the discussion, and the notes

#### Scenario: A draft shows what it has

- **WHEN** an author opens the popup of their draft
- **THEN** the popup shows the author and the Topic, with no reactions, no Share, no discussion, and no notes yet

### Requirement: Share opens the Topic's share options for a published Topic Post

The info popup and the post page's actions menu SHALL each hold Share on a published Topic Post. A press SHALL open
the share options a Topic has, with the post shared in the Topic's place: its page link, its title, and its preview
card. The options SHALL leave out the Topic's RSS feed and its report options. The actions menu SHALL hold no separate
Copy link. A draft SHALL show no Share, and an MCP view's popup SHALL show none.

#### Scenario: The popup's Share opens the share options

- **WHEN** a reader presses Share in the popup of a published post of a public Topic
- **THEN** the options post the post's page link under the post's title, and Copy page link copies that link

#### Scenario: The page's actions menu holds one Share

- **WHEN** a reader opens the actions menu on a published post's page, on the web and in the mobile app
- **THEN** the menu holds Share, which opens the same options in a dialog on the web and a sheet in the app, and no
  Copy link

#### Scenario: A Topic that is not public disables posting its post

- **WHEN** a reader opens the share options of a post of an invite Topic
- **THEN** the platform options are disabled with the Topic's own reason, and the send options and Copy page link work

### Requirement: A published Topic Post has a preview card

A published Topic Post SHALL serve a preview card at `/api/topic-posts/<id>/preview.png`, cached under a key that
changes with what it draws, and its page head SHALL name that card at its version. A public Topic's post card SHALL
show the post's image, or the Topic's until it is drawn, the title, the author, and the Topic's name. A private or
invite Topic's post card SHALL show the Topic's image and owner with the post's title. A draft SHALL serve none.

#### Scenario: A public Topic's post card shows the post

- **WHEN** a platform fetches the card of a published post of a public Topic
- **THEN** the card shows the post's own image, its title, its author's avatar and username, and the Topic's name

#### Scenario: An invite Topic's post card shows what its Topic's card shows

- **WHEN** a platform fetches the card of a published post of an invite or a private Topic
- **THEN** the card shows the Topic's image, the Topic's owner, the Topic's name, and the post's title, and neither the
  post's own image nor its author

#### Scenario: A new title names a new card url

- **WHEN** a post's title or image changes
- **THEN** its page head names the card at a new version, and the old url serves the current card for a minute

#### Scenario: A draft has no card

- **WHEN** a request fetches the card of a draft
- **THEN** the response is not found

### Requirement: An invite link shared from a Topic Post opens the post

The owner's invite option in a Topic Post's share options SHALL create a Topic invite link that names the post, apart
from the Topic's own link. The post SHALL be a published post of that Topic. Accepting the link SHALL subscribe the
accepter to the Topic as any Topic invite does and return the post, and the web and the mobile app SHALL then open the
post's page. An invite whose post was deleted SHALL open the Topic.

#### Scenario: The owner shares an invite Topic's post

- **WHEN** the owner of an invite Topic presses the invite option in a published post's share options
- **THEN** a link is created that names the post, and a second press returns the same link, not the Topic's own

#### Scenario: A draft or another Topic's post is rejected

- **WHEN** an invite link is requested for a draft, or for a post of another Topic
- **THEN** the request is answered as not found, and no invite is written

#### Scenario: The accepter follows the Topic and opens the post

- **WHEN** a signed-in user opens the invite link
- **THEN** the user follows the Topic, and the post's page opens in place of the Topic's, on the web and in the app

#### Scenario: A deleted post leaves the Topic

- **WHEN** the post is deleted and a user then opens the invite link
- **THEN** the user follows the Topic, and the Topic's page opens

### Requirement: An invite link shared from a Topic Post previews as the post

The join page's head and card of an invite link that names a published Topic Post SHALL show the post's preview card
and the post's title, under the privacy rule the post's own card follows. Once the post is gone, they SHALL show the
Topic's card and name, as any Topic invite's do.

#### Scenario: A pasted invite link shows the post's card

- **WHEN** a platform previews an invite link that was shared from a published post
- **THEN** the title reads the post's title, and the image is the post's preview card

#### Scenario: A deleted post's invite link shows the Topic's card

- **WHEN** the post is deleted and a platform previews the same invite link
- **THEN** the title and the image are the Topic's

### Requirement: The info popup loads its post when it opens

The popup SHALL open from a post's id and title, on a card, a page, and a row. It SHALL read the post when it opens,
show the loading placeholder until the read ends, and show one line for a post that is gone or that the reader may not
open. A page that already holds the post SHALL pass it, and the popup SHALL read nothing. In an MCP view the read
SHALL go through the `read_topic_post` tool.

#### Scenario: A card's popup reads its post

- **WHEN** a reader opens the popup on a Topic Post's card
- **THEN** the popup shows the loading placeholder, then the post's sections

#### Scenario: A post that is gone shows one line

- **WHEN** a reader opens the popup of a post that was deleted since the list loaded
- **THEN** the popup shows the title and one line that says the post's note could not be opened

#### Scenario: An MCP view reads through the tool

- **WHEN** a user opens the popup on a card in the topic posts MCP view
- **THEN** the view calls `read_topic_post` with the post's id and shows the post it returned

### Requirement: A Topic Post has a comment thread and takes reactions

A published Topic Post SHALL be a social target: its thread is the comment thread every social target has, and it takes
reactions from a signed-in user who may open it. A draft SHALL be no social target. A Comment's and a reaction's
analytics events SHALL name the target as a Topic Post.

#### Scenario: A reader comments on a post

- **WHEN** a signed-in follower posts a Comment on a public Topic's Topic Post
- **THEN** the Comment shows in that post's thread and nowhere else

#### Scenario: A draft has no thread

- **WHEN** a request reads the thread of a draft
- **THEN** it is rejected as for a social target that does not exist

### Requirement: Published Topic Posts join the Topic's Scan context

A Scan's review context SHALL include the Topic's published Topic Posts after its attachments, newest first, each under
its title and cut at the length an attachment is read to, with the cut marked. They SHALL sit inside the review
context's existing length limit and its untrusted data fence. A draft and a deleted Topic Post SHALL never be included.

#### Scenario: A post steers the next Scan

- **WHEN** a Topic's owner publishes a Topic Post and the Topic's next Scan scores a page
- **THEN** the scoring context holds the post's title and text inside the fence

#### Scenario: A long post is cut

- **WHEN** a Topic Post's text is longer than the attachment read length
- **THEN** the context holds its text up to that length and a mark that it was cut

### Requirement: One card and one page component render everywhere

The Topic Post card, page, and editor SHALL each be one shared component that the web and the mobile app render
through a platform adapter. The card SHALL show the image, the title, the author's byline, and the date, with the
reaction count at the right of that last row. The page SHALL show no notice, warning, or guideline text.

#### Scenario: The card is the same on the Topic and on the profile

- **WHEN** a Topic Post's card shows on its Topic's page and on its author's profile page, on the web and in the app
- **THEN** each is the one card component with the same image, title, byline, date, and reaction count

### Requirement: Topic Post writes are reported by id

The server SHALL send `social_topic_post_publish`, `social_topic_post_edit`, `social_topic_post_delete`,
`social_topic_post_image_regenerate`, and `social_topic_post_image_upload`, each with the Topic Post's id, its Topic's
id, and whether the actor owns the Topic. No event SHALL hold a title or any text.

#### Scenario: A publish is counted

- **WHEN** a team member publishes a Topic Post
- **THEN** one `social_topic_post_publish` event is sent with the two ids and `isOwner` false

### Requirement: The Topic Post page shows its details on their own line

A published Topic Post's page SHALL show its date, its reading time, the count of Comments and replies on its
thread, and whether it was edited, on a details line directly under the row of its byline and reactions, on the web
and in the mobile app. The count SHALL show only above zero, right after the reading time, and SHALL follow a Comment
posted or deleted on the page. Edited SHALL come last. The post's card and info popup SHALL keep their own lines.

#### Scenario: The details sit under the byline's row

- **WHEN** a reader opens a post published on November 10, 2026 that takes three minutes to read, was edited, and has
  four Comments and replies
- **THEN** the row reads "Written by" with the author, the Topic, and the reactions, and the line under it reads
  "Nov 10, 2026 · 3 min read · 4 hot takes · edited"

#### Scenario: A post with no Comment shows no count

- **WHEN** a reader opens a published post whose thread is empty
- **THEN** the details line reads the date and the reading time alone

#### Scenario: A posted Comment raises the count

- **WHEN** a user posts the first Comment on a post's page
- **THEN** the details line reads "1 hot take" after the reading time without a reload

### Requirement: The info popup shows its Topic's viewers and followers

The Topic Post info popup SHALL show its Topic's viewer count and follower count on a details line under the Topic's
name, beside the Topic's image, with the viewer count labeled visitors. Each SHALL be the count the Topic's own page
reads, for a reader who may view the Topic, and a count of zero SHALL be left out. The Topic Post's response SHALL
include both counts in one optional field, so the popup makes no second request.

#### Scenario: The Topic row counts its viewers and followers

- **WHEN** a reader opens the popup of a post whose Topic has 128 viewers and 14 followers
- **THEN** the Topic row reads the Topic's name, and "128 visitors · 14 followers" on the line under it

#### Scenario: A Topic with no follower shows its viewers alone

- **WHEN** a reader opens the popup of a post whose Topic has three viewers and no follower
- **THEN** the line under the Topic's name reads "3 visitors"

#### Scenario: A Topic with neither shows no line

- **WHEN** a reader opens the popup of a post whose Topic has no viewer and no follower
- **THEN** the Topic row shows the image and the name alone

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
