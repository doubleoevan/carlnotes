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
version its editor opened at, and a save against a newer version SHALL be rejected as a conflict that names the version
and keeps the editor's words. A draft SHALL appear in no list, count, news, or model context.

#### Scenario: A draft survives a second device

- **WHEN** an author saves a draft on the web and opens the Topic in the mobile app
- **THEN** the draft shows there, to the author alone, with the saved words

#### Scenario: The Topic's owner cannot read a member's draft

- **WHEN** the Topic's owner asks for a team member's draft
- **THEN** the request is answered as for a Topic Post that does not exist

#### Scenario: A stale save is a conflict

- **WHEN** an author saves a draft from a tab that opened it before another save
- **THEN** the save is rejected as a conflict, and the editor keeps the words and offers a reload

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

A Topic Post's body SHALL be rich text held to the Tasting Notes editor's tag set. Every save SHALL pass the body
through the same sanitizer a Note's body passes, on the server, so markup outside that set is dropped whether it was
typed or pasted. The editor SHALL be the Tasting Notes editor without its comment thread.

#### Scenario: Pasted markup is cleaned

- **WHEN** an author pastes text holding a script tag and a styled table and saves
- **THEN** the stored body holds neither, and the words inside them that the tag set allows remain

#### Scenario: The editor has no comment thread

- **WHEN** an author opens the Topic Post editor on the web or in the mobile app
- **THEN** it shows the toolbar and the body, and no comment thread control

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

### Requirement: A published Topic Post is editable by its author for 15 minutes

A published Topic Post's title and body SHALL be editable by its author for 15 minutes from its publishing, and an edit
SHALL NOT extend that time. An edit SHALL keep the 300 word minimum. An edit after the time SHALL be rejected as a
conflict. A read SHALL tell the client whether the caller wrote the Topic Post and whether it is still editable. An
edit inside the time SHALL count toward no daily write limit.

#### Scenario: A published post's editor saves ten seconds after the last change

- **WHEN** an author stops typing in a published post
- **THEN** the editor saves ten seconds later, or at once if the page is left, and a draft still saves after one second

#### Scenario: An edit inside the time is saved

- **WHEN** an author corrects a sentence ten minutes after publishing
- **THEN** the page shows the corrected body

#### Scenario: An edit after the time is rejected

- **WHEN** an author sends an edit 16 minutes after publishing
- **THEN** it is rejected as a conflict and the body is unchanged

#### Scenario: Edit stays visible past the edit time

- **WHEN** the author opens their Topic Post past its edit time
- **THEN** its Edit shows disabled, with a tooltip on the web and a dialog on tap in the mobile app that gives the limit

### Requirement: The author, the Topic's owner, and an admin delete a Topic Post

A Topic Post SHALL be deletable by its author, by its Topic's owner, and by an admin, at any time, after a
confirmation. Nobody else SHALL delete it. Deleting it SHALL delete its Comments, reactions, discussions, image files,
and audio. A Topic Post SHALL also be deleted with its Topic and with its author's account.

#### Scenario: The Topic's owner deletes a member's post

- **WHEN** a Topic's owner confirms Delete on a team member's published Topic Post
- **THEN** the Topic Post, its thread, its image, and its discussion's audio are gone for everyone

#### Scenario: Another member cannot delete it

- **WHEN** a team member who is neither the author nor the Topic's owner sends the delete
- **THEN** it is rejected and the Topic Post stays

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
seconds, and once more when the edit time ends if the post changed. The card's and the page's info popup SHALL show
it, and the popup SHALL say that there are no notes yet while there is none.

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
