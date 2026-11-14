# content-moderation Specification

## Purpose
Every piece of user text that another user can read is classified before it posts, a confirmed violation is rejected
in Carl's voice with the draft kept, and a classification that cannot answer lets the post through and reports itself.

## Requirements

### Requirement: User text that others read is classified before it posts

A chat room message, a note's name and body, a note comment, a username, a Team's name and description, and an
invite or public Topic's name, prompt, and tags SHALL be classified before they are stored, by a verdict that names
whether the text is a violation and which category: harassment, hate, sexual, violence, self-harm, or child safety. A
private Topic's name, prompt, and tags SHALL be classified when the Topic becomes invite or public.

#### Scenario: A clean post is stored

- **WHEN** a user posts a room message the classification finds clean
- **THEN** the message is stored and delivered as before, with one classification call made

#### Scenario: A topic going public is checked then

- **WHEN** an owner changes a private Topic with an objectionable prompt to public
- **THEN** the visibility change is rejected in Carl's voice and the Topic stays private

#### Scenario: A username is checked at save

- **WHEN** a user saves a username the classification rejects
- **THEN** the username form shows the rejection and the previous username stays

#### Scenario: A public topic's tags are checked with its name and prompt

- **WHEN** an owner saves a public Topic whose tags hold a slur
- **THEN** the save is rejected in Carl's voice naming hate, and the Topic is not saved

### Requirement: A violation is rejected in Carl's voice and the draft is kept

A confirmed violation SHALL be rejected with a 422 naming the category, and both apps SHALL show the rejection in
Carl's voice next to the composer, with the draft text left in place for editing. The rejection copy SHALL be shared
by both apps and SHALL not quote the user's text back.

#### Scenario: A rejected message stays in the composer

- **WHEN** a room message is rejected as harassment
- **THEN** the composer keeps the text, shows Carl's rejection naming harassment, and nothing is stored or streamed

#### Scenario: A rejected comment keeps its thread open

- **WHEN** a note comment is rejected
- **THEN** the thread stays open with the draft in its box and the rejection under it

### Requirement: An unanswered classification lets the post through and reports itself

If the classification route is unset, unreachable, times out, errors, or returns a verdict outside the schema, the
text SHALL be treated as clean and stored, and the failure SHALL be logged and reported with the subject kind and id
and never the text. An unset route SHALL NOT be reported per call.

#### Scenario: A timed-out classification posts the text

- **WHEN** the classification exceeds its timeout on a room message
- **THEN** the message is stored, and the failure is reported naming the subject kind and the room without the text,
  since the check runs before the message has an id

#### Scenario: A verdict outside the schema posts the text

- **WHEN** the model returns a verdict the schema does not accept
- **THEN** the text is stored and the failure is reported

#### Scenario: Development runs without the route

- **WHEN** the classification route is unset in a development stack
- **THEN** every post is stored unclassified and no per-post report is sent

### Requirement: Classification is bounded in time and in spend

A classification SHALL finish inside a fixed timeout shorter than the posting request's own, SHALL send only the
text under review with no retrieval or history, SHALL be bounded per account by the rate limit of the posting route
it runs in, SHALL be billed to the operator's key and never the user's budget, and SHALL record no input or output
text in its trace.

#### Scenario: A long note body is classified once

- **WHEN** a note body at its size limit is saved
- **THEN** one classification runs over the body's text, with the html's markup stripped, inside the timeout

### Requirement: An image others see is moderated before it posts

An uploaded avatar and an image shared to a team room SHALL be moderated as an image before anything is stored, apart
from an unchecked image, which is stored for its uploader alone while its check waits. A flagged image SHALL get the
same 422 in Carl's voice that violating text gets, naming one of the six categories, and nothing SHALL be stored. The
check SHALL read only the image, SHALL cost the user nothing, and SHALL bill no budget.

#### Scenario: A flagged avatar is rejected

- **WHEN** a user uploads an avatar the moderation flags as sexual
- **THEN** the upload is rejected with Carl's rejection naming sexual, and the previous avatar stays

#### Scenario: A flagged room image rejects the post

- **WHEN** a member shares an image to a room that the moderation flags as graphic violence
- **THEN** the post is rejected with Carl's rejection naming violence, the composer keeps the draft, and nothing is
  stored

#### Scenario: A clean image posts

- **WHEN** a member shares a photo the moderation finds clean
- **THEN** the image is stored and posts as before

### Requirement: An unanswered image moderation saves a public-bound image as unchecked and reports itself

If the moderation key is unset, the image SHALL be treated as clean and stored. If the call is unreachable, times out,
is rate limited, errors on the service's side, or returns a response outside its schema, the check could not run: an
image shared to a team room, and the image of a private Topic, of its Podcast Episodes, of its films, and of its Topic
Posts, SHALL be treated as clean and stored, and a public-bound image SHALL be saved as unchecked instead of posted. A
rejection of the image itself SHALL reject the upload instead. A failure SHALL be logged and reported with the subject
kind and id, never the image. An unset key SHALL NOT be reported per call.

#### Scenario: A timed-out moderation posts the image

- **WHEN** the image moderation exceeds its timeout on an image shared to a team room
- **THEN** the image is stored and posts, and the failure is reported naming the subject kind without the image

#### Scenario: An image the moderation cannot read is not posted

- **WHEN** the moderation rejects an image itself, as it does a format it does not take
- **THEN** the upload or post is rejected as an unreadable file, nothing is stored, and the image never posts unchecked

#### Scenario: Development runs without the key

- **WHEN** the moderation key is unset in a development stack
- **THEN** every image posts unmoderated, and nothing is reported per image

#### Scenario: A timed-out moderation saves an avatar as unchecked

- **WHEN** the image moderation exceeds its timeout on an avatar upload
- **THEN** the avatar is saved as unchecked, every other user still sees the previous avatar, and the failure is
  reported naming the avatar subject without the image

#### Scenario: A rate-limited moderation saves a public Topic's image as unchecked

- **WHEN** the image moderation is rate limited on an image upload to a public Topic
- **THEN** the upload is saved as unchecked, the Topic's image stays as it was for everyone but the uploader, and the
  failure is reported

#### Scenario: An unset key saves nothing as unchecked

- **WHEN** the moderation key is unset and a user uploads an avatar
- **THEN** the avatar is stored and shows to everyone at once, and no image is saved as unchecked

### Requirement: A Comment is classified before it posts

A Comment's body SHALL be classified before it is stored, on a post, a reply, and an edit, by the verdict and
categories every other classified text uses. A confirmed violation SHALL be rejected with the same 422 and the same
rejection beside the composer, with the draft kept. An unanswered classification SHALL let the text through and
report itself as it does for a note comment. A Reaction SHALL make no classification call, and neither SHALL an edit
that changes nothing.

#### Scenario: A clean Comment is stored

- **WHEN** a user posts a Comment the classification finds clean
- **THEN** the Comment is stored and shown at once, with one classification call made

#### Scenario: A rejected reply keeps its draft

- **WHEN** a reply's body is rejected as harassment
- **THEN** the composer keeps the text and shows Carl's rejection naming harassment, and nothing is stored

#### Scenario: A press on a type is not classified

- **WHEN** a user presses a reaction type
- **THEN** the Reaction is saved and no classification call is made

#### Scenario: An edit that changes nothing is not classified

- **WHEN** an author saves an edit whose body is unchanged
- **THEN** no classification call is made

#### Scenario: A timed-out classification posts the Comment

- **WHEN** the classification exceeds its timeout on a Comment
- **THEN** the Comment is stored, and the failure is reported with the subject kind and without the text

### Requirement: A public-bound image whose check could not run is shown to its uploader alone

A public-bound image is a user avatar, a team avatar, or the image of an invite or public Topic or of one of its Podcast
Episodes, films, or Topic Posts. If its check could not run, the upload SHALL be stored and recorded as unchecked, and
the avatar or image everyone else sees SHALL stay what it was. The upload SHALL respond as a success in its released
shape, with an optional `isImageUnchecked`. A second upload while one is unchecked SHALL replace the unchecked one.

#### Scenario: An unchecked avatar leaves the previous avatar public

- **GIVEN** a user with an uploaded avatar
- **WHEN** the user uploads a new avatar and the image moderation times out
- **THEN** the new avatar is saved as unchecked, and every other user and every visitor still gets the previous avatar
  from the avatar route

#### Scenario: A first avatar that is unchecked leaves the initials public

- **GIVEN** a user on the generated avatar
- **WHEN** the user's first upload is saved as unchecked
- **THEN** every other user and every visitor still sees the user's initials

#### Scenario: An unchecked image on a public Topic leaves its cards alone

- **WHEN** an editor's image upload to a public Topic is saved as unchecked
- **THEN** the Topic's cards, its share card, and its page for every other user and visitor show the image the Topic
  had before

#### Scenario: An image set from a url is saved as unchecked the same way

- **WHEN** an editor sets an invite Topic's image from a url through the MCP server and the image moderation fails
- **THEN** the fetched image is saved as unchecked, and the Topic's image stays as it was for everyone but that editor

#### Scenario: The upload responds in its released shape

- **WHEN** an avatar upload and a Topic image upload are each saved as unchecked
- **THEN** the avatar upload responds `{ ok: true }` and the Topic image upload responds with its `image`, each with
  `isImageUnchecked` true, and a released mobile build reads both as a success

#### Scenario: A second upload replaces the unchecked one

- **GIVEN** an unchecked Topic image
- **WHEN** the same Topic gets another image upload that is saved as unchecked too
- **THEN** the Topic has one unchecked image, the newer one, and the earlier unchecked image's files are recorded as
  pending deletions and deleted

### Requirement: The uploader sees an unchecked image at once, with one line of copy

The uploader SHALL see an unchecked image at once: a user avatar wherever their own avatar is drawn, and any other
image in its editor and on its subject's own page. Beside it both apps SHALL show "Only you can see this image until
Carl finishes checking it.", or for an avatar "Only you can see this photo until Carl finishes checking it." A response
that shows an unchecked image SHALL be the uploader's own and never shared by a cache. Nobody else SHALL be able to read
its files.

#### Scenario: A user sees their unchecked avatar on every page

- **WHEN** a user whose avatar upload is unchecked opens any page
- **THEN** every copy of the user's own avatar shows the unchecked image, and the avatar picker shows the photo note

#### Scenario: The image editor shows the note

- **WHEN** an editor whose Topic image upload is unchecked opens the Topic's image editor
- **THEN** the editor shows the unchecked image and "Only you can see this image until Carl finishes checking it."

#### Scenario: A second account gets the published image

- **WHEN** another signed-in user or a visitor opens the uploader's profile or the Topic's page, or requests the
  unchecked file's url
- **THEN** they see the published avatar or image, a request for an unchecked Topic image's file is not found, and no
  unchecked file is served to them

#### Scenario: A card shows the previous image while the upload is unchecked

- **WHEN** the uploader of an unchecked Topic image opens the home or a search result that lists the Topic
- **THEN** the Topic's card shows the image the Topic had before

#### Scenario: A leader sees their unchecked team avatar on the team page

- **WHEN** a leader's team avatar upload is saved as unchecked
- **THEN** that leader's team page shows the unchecked avatar with the photo note, and every other member and visitor
  sees the team's previous avatar

#### Scenario: A released app build shows the previous avatar

- **WHEN** a released mobile build that does not read the unchecked avatar uploads an avatar that is saved as unchecked
- **THEN** the build shows the previous avatar with no note until the check passes, and nothing in it fails

### Requirement: The sweep checks unchecked images again until each passes or is rejected

Each sweep SHALL check unchecked images again and SHALL stop its batch at the first call that could not run. An image
that passes SHALL be published as an upload of its kind that passed is, so everyone sees it. An image the check flags or
cannot read SHALL be deleted, the previous image SHALL stay, and the uploader SHALL be told nothing more. An unchecked
image whose subject is gone SHALL be deleted. An image unchecked for over a day SHALL be reported once.

#### Scenario: An unchecked avatar is published once the check responds

- **GIVEN** an unchecked avatar and a moderation service that responds again
- **WHEN** the next sweep runs
- **THEN** the check passes, the avatar becomes the user's avatar for everyone, and the note is gone on the user's
  next page load

#### Scenario: A flagged unchecked image is deleted

- **WHEN** the sweep's check flags an unchecked Topic image
- **THEN** the unchecked image's files are recorded as pending deletions and deleted, the Topic keeps the image it had,
  and no notice reaches the uploader

#### Scenario: A failing service costs one call a sweep

- **GIVEN** three unchecked images and a moderation service that still times out
- **WHEN** a sweep runs
- **THEN** it makes one moderation call, raises the attempt count of the image it checked, and leaves all three
  unchecked

#### Scenario: An image unchecked for a day is reported once

- **GIVEN** an image unchecked for more than a day across two sweeps
- **WHEN** both sweeps run
- **THEN** one report names its subject kind and id without the image, and the second sweep sends no second report,
  whether or not the image's check could run

#### Scenario: An unchecked image whose Topic was deleted

- **WHEN** a sweep reaches an unchecked image whose Topic no longer exists
- **THEN** the unchecked image and its files are deleted, and no check is made for it

### Requirement: The sweep checks the fewest failed checks first, within a time limit

Each sweep SHALL check the unchecked images with the fewest failed checks first, then the earliest uploaded, reading
them a page at a time, and SHALL start no further check once its batch has run for about two minutes. A check that the
worker skips because it has no moderation key SHALL keep the image unchecked, and the batch SHALL go on to the next
image.

#### Scenario: An unchecked image whose check keeps failing no longer goes first

- **GIVEN** an unchecked image whose check could not run in three sweeps, and an unchecked image no sweep has checked
  yet
- **WHEN** the moderation service responds again and a sweep runs
- **THEN** the image no sweep has checked is checked first

#### Scenario: A batch stops when its time is up

- **GIVEN** more unchecked images than a sweep checks in two minutes
- **WHEN** a sweep runs
- **THEN** it starts no check after about two minutes, and a later sweep checks the images it did not reach

#### Scenario: A skipped check keeps the image unchecked

- **GIVEN** an unchecked avatar, an unchecked Topic image, and a worker with no moderation key
- **WHEN** a sweep runs
- **THEN** both stay unchecked, nothing is published, and no attempt is counted

### Requirement: The sweep acts only on the unchecked image it read

The sweep SHALL run an unchecked image's moderation with no lock held, and SHALL then publish, delete, or remove the
image under a lock on its subject, only if the unchecked image is still the one the sweep read. An unchecked image that
a newer upload replaced, or that a write dropped, while its check ran SHALL be left as it is. An upload's publish or
save as unchecked, a drop of an unchecked image, and the sweep's write SHALL run one at a time for one subject.

#### Scenario: An unchecked image replaced while its check ran is left alone

- **GIVEN** an unchecked Topic image whose check is running
- **WHEN** the uploader's newer upload is saved as unchecked for the same Topic before the check returns flagged
- **THEN** the sweep deletes nothing, and the newer upload stays unchecked with its files

#### Scenario: A replaced unchecked avatar is never published

- **GIVEN** an unchecked avatar whose check is running
- **WHEN** the user's newer avatar upload is saved as unchecked before the check returns clean
- **THEN** the earlier upload is not published, and the user's avatar and the newer unchecked avatar stay as they are

#### Scenario: An upload that passed is not overwritten by an older unchecked one

- **GIVEN** an unchecked Topic image
- **WHEN** the uploader's newer upload passes its check while a sweep publishes the unchecked one
- **THEN** the two writes run one after the other, and the newer upload ends as the Topic's image

### Requirement: A private Topic's unchecked image is published and checked in the background

If the check could not run on an upload of a private Topic's image, or of the image of one of its Podcast Episodes,
films, or Topic Posts, the image SHALL become the subject's image at once and SHALL be recorded for the sweep to check
again. If that check flags an image that is still its subject's image, the upload SHALL be removed before its record is
deleted, with no image drawn in its place, and no film drawn from it SHALL play until rebuilt. A team room's image SHALL
get no later check.

#### Scenario: A private Topic's upload shows at once

- **WHEN** an owner uploads an image to a private Topic and the image moderation times out
- **THEN** the upload is the Topic's image at once for everyone who may open the Topic, with no note

#### Scenario: A flagged private image is removed after its recheck

- **GIVEN** a private Topic's uploaded image whose check could not run
- **WHEN** a later sweep's check flags it
- **THEN** the upload is removed, the Topic shows its drawn covers, and no render starts on the platform key, whether
  or not the Topic has turned public meanwhile

#### Scenario: A film drawn from a flagged private image stops playing

- **GIVEN** a ready film whose intro and sign-off were drawn from a private Topic's unchecked upload
- **WHEN** a later sweep's check flags the upload
- **THEN** the film's Podcast Episode plays as audio from then on, and its film plays again once its intro and
  sign-off are rebuilt from the image it shows then

#### Scenario: A flagged private image that was replaced is left alone

- **GIVEN** a private Topic's unchecked upload that a render replaced
- **WHEN** a later sweep's check flags the upload
- **THEN** the Topic keeps the image the render drew, and the sweep checks the upload no more

#### Scenario: A clean recheck changes nothing

- **WHEN** a later sweep's check finds the private Topic's image clean
- **THEN** the image stays, and the sweep checks it no more

#### Scenario: A room image is checked once

- **WHEN** the image moderation times out on an image shared to a team room
- **THEN** the image posts, and no sweep checks it again

### Requirement: A film draws no unchecked image

A film's intro and sign-off SHALL draw no upload whose check has not run. While such an upload would be the image a
film shows, a ready film SHALL keep playing as it was rendered, and a film rendered then SHALL show the next image in
its order that is checked. Once the upload passes its check, the film's intro and sign-off SHALL be rebuilt from it.

#### Scenario: A ready film keeps its image while an upload is unchecked

- **GIVEN** a private Topic's ready film
- **WHEN** its owner uploads a film image and the image moderation times out
- **THEN** the film plays as it did before the upload, and no rebuild draws the upload

#### Scenario: A film shows the upload once its check passes

- **GIVEN** a private Topic's ready film whose uploaded image is published with its check still to run
- **WHEN** a later sweep's check passes the upload
- **THEN** the rebuild of the film's intro and sign-off starts, and the film shows the upload once it is rebuilt

#### Scenario: A film rendered meanwhile shows a checked image

- **GIVEN** a Podcast Episode whose film's own image is an upload with its check still to run
- **WHEN** the film is rendered
- **THEN** its intro and sign-off show the Podcast Episode's image, or else its Topic's, or else the podcast card

### Requirement: The record of an unchecked private image stays until the image is checked or replaced

The record of a private Topic's unchecked image SHALL stay until the sweep checks the image, another image replaces
it, or its Topic turns invite or public. The same bytes uploaded again unchecked SHALL keep it, and an editor's
regenerate SHALL keep it until its render replaces the image.

#### Scenario: The same bytes uploaded again keep the record

- **GIVEN** a private Topic's unchecked image
- **WHEN** its owner uploads the same file again and the image moderation still times out
- **THEN** the image stays the Topic's image, and the sweep still checks it

#### Scenario: A regenerate keeps the record until its render lands

- **GIVEN** a private Topic's unchecked image
- **WHEN** an editor regenerates the image and the render fails
- **THEN** the unchecked upload is still the Topic's image, and the sweep still checks it

#### Scenario: An upload that passes its check replaces the unchecked image

- **GIVEN** a private Topic's unchecked image
- **WHEN** its owner uploads an image that passes its check
- **THEN** the upload becomes the Topic's image, and the record of the unchecked image is dropped

### Requirement: A visibility change is never blocked by an unchecked image

A change of a Topic's visibility SHALL never be blocked, delayed, or rejected over an image. If a private Topic turns
invite or public, each published unchecked image under it, of any kind, SHALL go back to its uploader alone in the
transaction that writes the visibility: everyone else SHALL see no image there, no film drawn from it SHALL play until
rebuilt, and the sweep SHALL check it later. Its files SHALL stay, and a replaced image's record SHALL be deleted.

#### Scenario: A Topic's unchecked image goes back to its uploader

- **GIVEN** a private Topic whose uploaded image is published with its check still to run
- **WHEN** its owner makes the Topic public
- **THEN** the change is saved, the uploader sees the image with "Only you can see this image until Carl finishes
  checking it.", everyone else sees the Topic with no image, and no file is deleted

#### Scenario: A Podcast Episode's unchecked image goes back to its uploader

- **GIVEN** a private Topic's Podcast Episode whose uploaded image is published with its check still to run
- **WHEN** the Topic turns invite
- **THEN** the Podcast Episode shows no image of its own to everyone but the uploader, and its files stay

#### Scenario: A film's unchecked image goes back to its uploader

- **GIVEN** a private Topic's film whose uploaded image is published with its check still to run
- **WHEN** the Topic turns public
- **THEN** the film has no image of its own for everyone but the uploader, and the film keeps playing as it was
  rendered until the upload is checked

#### Scenario: A film drawn from an unchecked image stops playing

- **GIVEN** a private Topic's ready film whose intro and sign-off were drawn from an image that is published with its
  check still to run
- **WHEN** the Topic turns public
- **THEN** from the moment the change is saved the film's Podcast Episode plays as audio, and its film plays again once
  its intro and sign-off are rebuilt from another image

#### Scenario: A Topic Post's unchecked image goes back to its uploader

- **GIVEN** a private Topic's Topic Post whose uploaded image is published with its check still to run
- **WHEN** the Topic turns public
- **THEN** the Topic Post shows no image to everyone but the uploader, and its files stay

#### Scenario: The record of a replaced image is deleted

- **GIVEN** a private Topic whose unchecked upload a render replaced
- **WHEN** the Topic turns public
- **THEN** the Topic keeps the image the render drew, and the sweep checks the upload no more

#### Scenario: The sweep publishes a returned image once its check passes

- **GIVEN** an image that went back to its uploader because its Topic turned public
- **WHEN** a sweep's check finds it clean
- **THEN** the image becomes its subject's image again for everyone

#### Scenario: An unchecked upload during the change is not published

- **WHEN** an upload whose check could not run arrives while its private Topic is being made public
- **THEN** the upload and the change run one after the other, and the upload is either returned to its uploader by
  the change or shown to its uploader alone after it

#### Scenario: Any other visibility change touches no image

- **WHEN** a Topic turns from invite to public, from public to invite, or to private
- **THEN** no image under it changes
