# topic-podcast-episode-video-rendering Specification

## Purpose
A published Podcast Episode also renders as a film from its own audio, chapters, transcript, and images, with an image
of its own for its intro, sign-off, and poster, stored in parts so a changed image rebuilds only the intro and the
sign-off.

## Requirements

### Requirement: A newly published Podcast Episode renders a film after its image

After a Podcast Episode publishes and its image step ends, drawn or not, the worker SHALL render its film. The render
SHALL make no model call but the draws of the film's own image and of its chapters' imagined images. Of the Podcast
Episodes published before this capability shipped, only each Topic's latest SHALL get a film, through the backfill.
The recording SHALL NOT wait for the film. A Podcast Episode SHALL show a film only once its render has finished.

#### Scenario: A new Podcast Episode gets a film

- **WHEN** a Podcast Episode publishes and its image is drawn
- **THEN** its film renders, and once it is stored the Podcast Episode has a film

#### Scenario: An older Podcast Episode gets none

- **GIVEN** a Topic with two Podcast Episodes published before films shipped
- **WHEN** the backfill has run and any user opens the Topic or the older Podcast Episode's page
- **THEN** the older Podcast Episode has no film, and no render is started for it

#### Scenario: The recording ends before the film

- **WHEN** a Podcast Episode publishes
- **THEN** the recording finishes without waiting for the film's render

### Requirement: The backfill gives each Topic's latest Podcast Episode a film

One backfill workflow under a fixed id SHALL render a film for each Topic's latest published Podcast Episode that has
no film row, and SHALL give no other Podcast Episode its first film. It SHALL also re-render every ready film below
the current render version. A second start SHALL join the one running. It SHALL list public Topics first, then private
and team Topics, a page at a time. The worker SHALL start it on boot in every environment, and
`bun run films:backfill` SHALL start or join it by hand.

#### Scenario: Only the latest Podcast Episode is backfilled

- **GIVEN** a Topic whose two Podcast Episodes were published before films shipped, neither with a film
- **WHEN** the worker boots
- **THEN** the backfill renders a film for the later Podcast Episode only

#### Scenario: A second boot finds nothing

- **GIVEN** a backfill that ended with every Topic's latest Podcast Episode rendered, skipped, or failed, and every
  film at the current render version
- **WHEN** the worker boots again
- **THEN** the backfill lists no Podcast Episode and ends with zero counts

#### Scenario: A second start joins the running backfill

- **GIVEN** the backfill running after a boot
- **WHEN** an operator runs `bun run films:backfill`
- **THEN** the script waits for the running backfill and prints its counts

### Requirement: The backfill runs apart, bills nobody, and never loops

The backfill SHALL run on its own task queue at a concurrency of 1 by default, raised by a setting, so it never takes
slots from scans, recordings, or new films. A Podcast Episode it cannot render SHALL be skipped and logged, and one
whose render fails SHALL be marked failed. Neither SHALL be listed again. A backfilled film SHALL count against no
user's plan. The backfill SHALL log its counts so far and the films left after each batch of renders. It SHALL return
and log its counts at its end.

#### Scenario: An unrenderable Podcast Episode is skipped once

- **GIVEN** a Topic's latest Podcast Episode with no chapters
- **WHEN** the backfill reaches it
- **THEN** it is counted as skipped, a warning names it, it has no film, and the next run does not list it

#### Scenario: The backfill reports what it did

- **WHEN** the backfill ends
- **THEN** it returns and logs how many films it rendered, skipped, and failed, how many generated images it drew, the
  total render time, and the stored bytes

#### Scenario: A backfilled film bills nobody

- **WHEN** the backfill renders a film for an owner past the podcast episode spend cutoff
- **THEN** the film renders, and its row's cost is zero

#### Scenario: The backfill logs its progress

- **GIVEN** a backfill with 78 films to re-render
- **WHEN** it finishes its twelfth
- **THEN** the worker's log has a line with the counts so far and the 66 films left

### Requirement: The film is 720p H.264 with the Podcast Episode's own audio

The film SHALL be an MP4 at 1280 by 720 and 24 frames a second, H.264 video and AAC audio, with its index at the front
of the file so playback starts before the download ends. Its audio SHALL be the Podcast Episode's audio, so every
chapter starts at the same second in the film as in the audio, to within one frame.

#### Scenario: Chapter times match the audio

- **GIVEN** a Podcast Episode whose chapter 3 starts at 6:12.40 in its audio
- **WHEN** a viewer seeks the film to chapter 3
- **THEN** the film shows chapter 3's image from 6:12.40, within one frame

#### Scenario: The film plays before it fully loads

- **WHEN** a viewer starts a 30-minute film on a slow connection
- **THEN** playback begins before the whole file has arrived

### Requirement: The intro and the sign-off show the film's image

The film's intro SHALL run from its start to the first chapter's start, and SHALL show the film's own image, or the
image that the Podcast Episode shows if the film has none, with the Podcast Episode's title and details line. The
sign-off SHALL run from the last chapter's end to the film's end. It SHALL show the same image with "Coffee Break
podcast with Carl and Vienna" and "Carl and Vienna are AI voices".

#### Scenario: The intro names the Podcast Episode

- **WHEN** a viewer plays a film from the start
- **THEN** the film's image shows with the Podcast Episode's title until the first chapter starts

#### Scenario: The sign-off says the voices are AI

- **WHEN** the film passes the last chapter's end
- **THEN** the film's image shows with "Carl and Vienna are AI voices"

### Requirement: Each film gets its own cinematic image

The first time a film renders, before its intro and sign-off, the worker SHALL draw the film's own image: 16:9 at 2752
by 1536, full frame with no paper edge or border, in film lighting and the app's palette, with a calm dark lower third
for the title. The topic image's scene writer SHALL write its scene, and an image model that draws at that size SHALL
draw it from a film house style prompt. It SHALL be stored under the film's folder as that original and as a 1280 by
720 copy, which the poster shows. Its cost SHALL add to the film's cost.

#### Scenario: A new film opens on its own image

- **WHEN** a Podcast Episode's film renders for the first time
- **THEN** a wide image is drawn from the Podcast Episode's title, description, and chapter titles, and the intro, the
  sign-off, and the poster show it

#### Scenario: The image fills the frame

- **WHEN** the film's image is drawn
- **THEN** its original is 2752 by 1536, its poster copy is 1280 by 720, neither has a border, and its lower third is
  dark enough for the title to read over it

#### Scenario: A second attempt draws no second image

- **GIVEN** a render whose first attempt drew the film's image and then failed
- **WHEN** the render's second attempt runs
- **THEN** it reuses the stored image and makes no image call

#### Scenario: An existing film keeps its image

- **GIVEN** a film whose own image was stored at 1280 by 720 before this size shipped
- **WHEN** the film re-renders
- **THEN** its intro and sign-off show that image, and no image is drawn

### Requirement: A failed image draw never fails the film

Until the film's own image is drawn, and if the draw fails, the film's intro, sign-off, and poster SHALL show the image
that the Podcast Episode shows, its own or its Topic's. A failed draw SHALL be reported and SHALL NOT fail the film's
render. A film left without its own image SHALL get one from an editor's regeneration or upload.

#### Scenario: A rejected draw leaves the podcast episode image

- **WHEN** the image model rejects the film's image
- **THEN** the film renders with the podcast episode image in its intro and sign-off, and the failure is reported

#### Scenario: A spent budget still renders the film

- **GIVEN** an owner whose model budget is spent
- **WHEN** their Podcast Episode's film renders
- **THEN** the film renders with the podcast episode image, and no image cost is added

### Requirement: An editor regenerates or uploads a film's image

A user who may edit a Podcast Episode's image, and an admin, SHALL be able to regenerate its film's image from an
optional image prompt, and to upload a jpeg, png, or webp up to the image upload limit, center-cropped to 16:9 at the
film's frame size, with the origin `uploaded`. A regeneration SHALL count against the user's monthly image regeneration
limit, the one the Topic, Podcast Episode, and Topic Post images share. An upload SHALL NOT count.

#### Scenario: A regeneration counts against the shared limit

- **GIVEN** an editor on a plan of 15 regenerations who has used 14 on Topic images
- **WHEN** they regenerate a film's image
- **THEN** the render starts, the count reads 15 of 15, and a further regeneration of any image is rejected

#### Scenario: An upload is cropped to the frame

- **WHEN** an editor uploads a tall PNG as a film's image
- **THEN** its center is stored at 1280 by 720 with the origin `uploaded`, and the month's count does not change

#### Scenario: Someone who may not edit is turned away

- **WHEN** a follower who may not edit the Topic sends a regeneration or an upload for one of its films
- **THEN** the api responds 404, and nothing is drawn or stored

#### Scenario: A Podcast Episode with no film has no film image

- **WHEN** an editor sends a regeneration for a Podcast Episode whose film is not ready
- **THEN** the api responds 404

### Requirement: A film's image keeps the film frame after an image prompt

A film's image drawn from an editor's image prompt SHALL still be drawn in the film house style: the image prompt is
the scene, and the film house style follows it. The image of a Topic, a Podcast Episode, and a Topic Post is drawn
from an image prompt alone.

#### Scenario: An image prompt still fills the frame

- **WHEN** an editor regenerates a film's image with the image prompt "a foggy morning over a bridge"
- **THEN** the image model is sent that scene followed by the film house style, and the image has no paper edge and a
  dark lower third for the title

### Requirement: Each chapter shows its Finding's image with a lower third

Each chapter SHALL show a montage of its images: its Resource's images, then its generated images, then the Carl and
Vienna podcast card. A chapter with an unsafe Resource SHALL never show the Resource's images. Each shot SHALL move
through its time on screen. An image that is small or not 16:9 SHALL sit over a blurred fill of itself. A lower third
SHALL show the chapter's title and its source's domain for the chapter's first 8 seconds, across whatever cuts those
seconds hold.

#### Scenario: A Finding's image fills its chapter

- **WHEN** the film reaches a chapter whose Resource has a 16:9 image at least 1280 pixels wide
- **THEN** that image covers the frame and moves in each of its shots, and the chapter's other images show between
  them

#### Scenario: A square image sits over its blur

- **WHEN** a chapter's Resource has a square image
- **THEN** in each of its shots the image is centered whole over a blurred fill of itself

#### Scenario: An unsafe Resource shows the podcast card

- **WHEN** a chapter narrates a Finding whose Resource is unsafe
- **THEN** the chapter shows the Carl and Vienna podcast card and the film's own image in turn, and never the
  Resource's image

#### Scenario: The lower third names the source

- **WHEN** a chapter about an article on example.com starts
- **THEN** a lower third shows the chapter's title and "example.com", keeps its place through the chapter's first cut,
  and fades by the chapter's eighth second

### Requirement: An imagined image is drawn from the Finding's public words alone

An imagined image SHALL be drawn by the film image's scene writer, house style prompt, and image model, at the film's
frame size. Its scene SHALL be written from the Finding's title and public relevance explanation alone, fenced as
untrusted text, and never from a private annotation, a Personal sources item or summary, a Note, or a Comment. A drawn
image SHALL pass the image moderation that an uploaded image passes before it is stored or shown.

#### Scenario: Only public words reach the scene writer

- **GIVEN** a Finding with a private annotation from a sender's Personal sources
- **WHEN** an imagined image is drawn for its chapter
- **THEN** the scene writer is sent the Finding's title and public relevance explanation, and nothing else of the Topic

#### Scenario: A flagged image is never shown

- **WHEN** the image moderation flags a drawn image, cannot read it, or fails
- **THEN** the image is not stored, and the chapter shows the podcast card

#### Scenario: A skipped check lets the image through

- **GIVEN** an environment with no moderation key
- **WHEN** an imagined image is drawn
- **THEN** the image is stored and shown, as an uploaded image is there

### Requirement: An imagined image bills like the film and never blocks it

A draw SHALL bill the Topic owner's key and add its cost to the film's cost, and the backfill's draws SHALL bill the
platform. A draw SHALL NOT check the owner's spend cutoff. If the owner's budget is spent, a draw fails, or a drawn
image does not pass the image moderation, the chapter SHALL go on with the images it has, and the render SHALL go on. A
render that is stopped SHALL start no further draw. A generated image SHALL be stored in the film's folder. A render's
second attempt and a re-render SHALL reuse a stored image, and it SHALL be deleted with the film.

#### Scenario: A draw is billed to the owner

- **WHEN** a film renders for a Topic owner's Podcast Episode and draws two generated images
- **THEN** both draws run on the owner's key, and the film's cost includes both

#### Scenario: A spent budget leaves the podcast card

- **GIVEN** an owner whose model budget is spent
- **WHEN** their Podcast Episode's film renders
- **THEN** each chapter with no Resource Image shows the podcast card and the image the intro shows in turn, and the
  film renders

#### Scenario: A failed draw never fails the film

- **WHEN** the image model rejects one of a chapter's generated images
- **THEN** that chapter shows its other images, the failure is reported, and the film renders

#### Scenario: A second attempt reuses the stored image

- **GIVEN** a render whose first attempt drew and stored a chapter's generated image and then failed
- **WHEN** the render's second attempt runs
- **THEN** it shows the stored image and makes no image call for that chapter

#### Scenario: The backfill bills the platform

- **WHEN** the backfill renders a film with a long chapter that lacks images
- **THEN** the generated images are drawn on the platform's key, and the film's cost does not rise

#### Scenario: An owner past the spend cutoff gets every generated image

- **GIVEN** an owner who passed the podcast episode spend cutoff while their Podcast Episode recorded
- **WHEN** its film renders with chapters that lack images
- **THEN** every generated image the chapters need is drawn on the owner's key, and the film's cost includes them

### Requirement: The film fades through espresso between parts and chapters

Each chapter, the intro, and the sign-off SHALL fade in from espresso over their first 0.3 seconds and fade out to
espresso over their last 0.3 seconds. A segment shorter than both fades SHALL split its length between them. The audio
SHALL NOT fade at these points.

#### Scenario: A chapter change dips to espresso

- **WHEN** the film passes from chapter 2 to chapter 3
- **THEN** the picture dips to espresso and back in a little over half a second while the hosts keep talking without
  a break

### Requirement: A render that stalls or is cancelled stops and is tried again

A render SHALL get three attempts of at most four hours each before its film is marked failed, or before a re-render
is recorded as failed at its render version. A running render SHALL report that it is alive every 30 seconds, and an
attempt that reports nothing for ten minutes SHALL end. An attempt that is cancelled or times out SHALL stop its
encoder, upload nothing, and remove its work folder.

#### Scenario: A long chapter on a one-core worker keeps rendering

- **WHEN** a chapter of six minutes takes eighteen minutes to encode
- **THEN** the render keeps reporting that it is alive, and the attempt goes on

#### Scenario: A timed-out attempt never renders beside its retry

- **WHEN** an attempt ends at its time limit while its encoder is running
- **THEN** the encoder stops before the next attempt starts, and the attempt's work folder is removed

#### Scenario: Three failed attempts mark the film failed

- **WHEN** a first render fails its third attempt
- **THEN** the film is marked failed, and the backfill never lists it again

### Requirement: The film shows the podcast card while the hosts answer hot takes

From the turn where the hosts turn to a chapter's hot takes, or to the closing hot takes after the last chapter, to
the end of that chapter's recording, the film SHALL cut between the podcast card and the film's own image, opening on
the podcast card, with a "Hot takes" lower third. That segment SHALL fade in from espresso and out to it. A chapter
whose Finding or whose hot takes would show for under 4 seconds SHALL keep its own montage throughout.

#### Scenario: The closing hot takes show the podcast card

- **GIVEN** a Podcast Episode whose script reads a hot take from hotcup after its last chapter
- **WHEN** the film reaches the turn that hands off to the hot takes
- **THEN** the last chapter's montage fades to espresso, the podcast card fades in with a "Hot takes" lower third, and
  the podcast card and the film's own image take turns through the goodbye until the sign-off

#### Scenario: A chapter's hot take shows the podcast card

- **GIVEN** a chapter of 70 seconds whose hosts name the writer of a hot take on its Finding 50 seconds in
- **WHEN** the film plays that chapter
- **THEN** the chapter's montage shows for 50 seconds, and the last 20 open on the podcast card

#### Scenario: A film with no hot takes has no such segment

- **WHEN** a film renders for a Podcast Episode whose script reads no hot take
- **THEN** every chapter shows its own montage to its end

#### Scenario: A hot take at the very end keeps the chapter's image

- **WHEN** the hosts turn to a hot take 2 seconds before the chapter's recording ends
- **THEN** the chapter shows its own montage throughout

#### Scenario: Captions sit above the hot takes' lower third

- **WHEN** a caption shows while the "Hot takes" lower third does
- **THEN** the caption sits above the lower third, as it does at a chapter's start

### Requirement: The intro zooms in and the sign-off zooms out

The intro SHALL push in to the film's image at 12 percent a second, then creep in at half a percent a second, and
reach 2.5 times as the first chapter starts. The sign-off SHALL be the same move backward: it SHALL start at 2.5 times
and end on the full frame. An intro or a sign-off of 8 seconds or less SHALL zoom at 12 percent a second throughout.
The Carl and Vienna podcast card SHALL cover the frame as a 16:9 band of its illustration, with no blurred fill.

#### Scenario: The film opens moving in and closes moving out

- **WHEN** a film with an intro and a sign-off of 40 seconds each plays from its start to its end
- **THEN** the intro's image comes toward the viewer fast for its first 7 seconds, then slowly, and is at 2.5 times as
  the first chapter starts
- **AND** the sign-off's image starts at 2.5 times, eases back, and pulls back fast to its full frame as it fades out

#### Scenario: A chapter with no image fills the frame

- **WHEN** a chapter's Resource has no image
- **THEN** the chapter's podcast card shots show both hosts' mugs and the microphone across the whole frame

#### Scenario: A short intro is the push alone

- **WHEN** a film's intro runs 5 seconds
- **THEN** its image zooms in at 12 percent a second and ends at about 1.76 times

### Requirement: The film carries captions from the transcript, on by default

The film SHALL carry captions written from the Podcast Episode's transcript, served as a captions file and inside the
film. A cue SHALL hold at most two lines of 42 characters and last at most 7 seconds. The cue that starts a host's
turn SHALL begin with that host's name. Captions SHALL be on by default.

#### Scenario: A turn's first cue names the host

- **WHEN** Vienna's turn begins in the film
- **THEN** the caption reads "Vienna:" followed by the start of her line

#### Scenario: Captions show without a setting

- **WHEN** a viewer plays a film for the first time
- **THEN** captions show

### Requirement: The film is stored as three parts and a joined film

The film SHALL be stored in R2 as an intro, the chapters, and a sign-off, each encoded with the same settings. The
joined film SHALL be built from the three parts by stream copy, without encoding them again. A rebuilt film SHALL be
stored under a new address, so a url already handed out keeps serving the film it named.

#### Scenario: The join copies the parts

- **WHEN** a film's three parts are joined
- **THEN** the film's frames are the parts' frames, byte for byte, and no part is encoded twice

#### Scenario: A rebuild never breaks an open url

- **GIVEN** a viewer who started the film's old url a minute before a rebuild finished
- **WHEN** the viewer seeks
- **THEN** the old film keeps playing until its url expires

### Requirement: A changed image rebuilds only the intro and the sign-off

If the image a film shows, its own or else its Podcast Episode's, differs from the image the film was drawn from, the
next play SHALL start a rebuild and play the current film at once. The rebuild SHALL render only the intro and the
sign-off and join them with the stored chapters. A film nobody plays SHALL never be rebuilt for a changed podcast
episode image. The replaced parts SHALL be deleted after a grace.

#### Scenario: A regenerated image rebuilds on the next play

- **GIVEN** a film with no image of its own, and an editor regenerates its Podcast Episode's image
- **WHEN** a viewer plays its film
- **THEN** the film plays at once with its old intro, and the intro and sign-off render again with the new image
- **AND** the next play shows the new image in the intro

#### Scenario: The chapters are never rendered again

- **WHEN** a film rebuilds
- **THEN** the stored chapters part is reused unchanged

#### Scenario: An unplayed film costs nothing

- **GIVEN** a Topic image regenerated on a Topic whose Podcast Episodes have no image of their own
- **WHEN** nobody plays their films
- **THEN** no film is rebuilt

#### Scenario: A stale film is checked at most once a minute

- **GIVEN** a film drawn from an image it no longer shows
- **WHEN** viewers play it several times within a minute
- **THEN** the spend check and the rebuild start run at most once for that Podcast Episode, and every play returns the
  current film at once

### Requirement: A film's own image decides its rebuild

A regenerated or uploaded film image SHALL start the rebuild at once, and SHALL replace the poster as soon as it is
stored. The rebuild SHALL render the intro and the sign-off alone. Once a film has its own image, a changed Podcast
Episode image or Topic image SHALL NOT rebuild it. The replaced image SHALL be deleted after a grace.

#### Scenario: A new film image rebuilds the intro, the sign-off, and the poster

- **WHEN** an editor uploads a new image for a film
- **THEN** the poster shows the upload at once, the intro and the sign-off render again from it, and the chapters part
  is reused unchanged

#### Scenario: A film with its own image ignores a new podcast episode image

- **GIVEN** a film drawn from its own image
- **WHEN** an editor regenerates its Podcast Episode's image and a viewer plays the film
- **THEN** no rebuild starts, and the film keeps its own image

### Requirement: A failed render never touches the Podcast Episode

A first render that fails for good SHALL leave the Podcast Episode, its audio, and its feed item unchanged. That
Podcast Episode SHALL have no film section, no play button over a film, no Video button on its Brews News row, no film
card, no row in Coffee Break films, and no item in the film feed. Its uploaded parts SHALL be deleted, and the failure
SHALL be reported.

#### Scenario: A failed film leaves the audio

- **WHEN** a Podcast Episode's first film render fails
- **THEN** the Podcast Episode plays as audio as before, and no film control or film list row shows for it

### Requirement: Removing a Podcast Episode or its Topic deletes its film

Removing a Podcast Episode SHALL delete its film's parts, joined film, captions, own image, and imagined images. A
short Podcast Episode replaced by a newer one SHALL do the same, and so SHALL deleting its Topic.

#### Scenario: A removed Podcast Episode's film goes

- **WHEN** a Topic's owner removes a Podcast Episode that has a film
- **THEN** its film's stored objects are deleted, and its film url no longer serves

#### Scenario: A replaced short Podcast Episode's film goes

- **WHEN** a free Topic's new short Podcast Episode replaces the earlier one
- **THEN** the earlier one's film is deleted with its audio

### Requirement: A chapter's shots follow a fixed order of images

A chapter's shots SHALL show its images in this order: its Resource's images in their stored order, then its generated
images, then the podcast card, then again from the first. The same image SHALL NOT show in two shots in a row. A
chapter left with the podcast card alone SHALL take turns between it and the film's own image. The order, the cuts,
and the moves SHALL be the same on every render of the same film.

#### Scenario: The order loops until the chapter ends

- **GIVEN** a chapter of 120 seconds whose Resource has two images, so the chapter gets one generated image
- **WHEN** its film renders
- **THEN** its shots show the first Resource Image, the second, the generated image, the podcast card, and then the
  first Resource Image again, until the chapter ends

#### Scenario: A chapter with only a generated image and the podcast card

- **GIVEN** a chapter of 45 seconds whose Resource has no image and which has one generated image
- **WHEN** its film renders
- **THEN** its shots take turns between the generated image and the podcast card, and neither shows twice in a row

#### Scenario: A chapter with the podcast card alone borrows the film's image

- **GIVEN** a chapter of 30 seconds whose Resource is unsafe
- **WHEN** its film renders
- **THEN** its shots take turns between the podcast card and the film's own image

#### Scenario: A second attempt cuts the same film

- **GIVEN** a render whose first attempt planned a chapter's shots and then failed
- **WHEN** the render's second attempt runs
- **THEN** that chapter has the same shots: the same images, the same cuts, and the same moves

### Requirement: No image stays on screen longer than 8 seconds

A shot SHALL be on screen for at most 8 seconds, counted from its first frame to the end of its crossfade into the
next shot. Shots SHALL run 5 to 8 seconds and vary in length, averaging about 6 seconds across a chapter. A chapter of
8 seconds or less SHALL be one shot. If a chapter's length leaves less than 5 seconds for its last shot, the last two
shots SHALL share their time.

#### Scenario: A three minute chapter cuts about thirty times

- **WHEN** a film renders a chapter of 180 seconds
- **THEN** no shot is on screen longer than 8 seconds, the shots differ in length, and their mean is between 5.5 and
  6.5 seconds

#### Scenario: A short chapter is one shot

- **WHEN** a film renders a chapter of 6 seconds
- **THEN** the chapter is one shot

#### Scenario: A remainder is shared

- **WHEN** a film renders a chapter of 9 seconds
- **THEN** the chapter is two shots of about 4.5 seconds each, and neither is on screen longer than 8 seconds

### Requirement: A cut lands on a caption break

A cut between two shots SHALL move to the nearest caption break within one second of where it was planned, if both
shots stay within 5 to 8 seconds. A cut with no such caption break SHALL stay where it was planned.

#### Scenario: A cut moves to a caption break

- **GIVEN** a cut planned 6.2 seconds into a chapter, and a caption that ends 6.6 seconds into it
- **WHEN** the chapter's shots are planned
- **THEN** the cut falls at 6.6 seconds

#### Scenario: A cut with no caption break near it stays

- **GIVEN** a cut planned 6.2 seconds into a chapter, and no caption break between 5.2 and 7.2 seconds
- **WHEN** the chapter's shots are planned
- **THEN** the cut falls at 6.2 seconds

#### Scenario: A caption break that would hold a shot too long is passed over

- **GIVEN** a cut planned 7 seconds into a shot, and a single caption break 7.9 seconds into it
- **WHEN** the chapter's shots are planned
- **THEN** the cut falls at 7 seconds, and the shot is on screen no longer than 8 seconds

### Requirement: Each shot moves, as fast as its image allows

Each shot SHALL zoom in, zoom out, pan left, or pan right for its whole time on screen, and SHALL NOT use the move of
the shot before it. A zoom SHALL run at 8 percent a second, compounding, so its speed looks constant. An image's zoom
SHALL NOT pass the size its stored pixels hold, 2 times for a 2560 by 1440 image, with 1.25 times allowed for any
image. A zoom that would pass its limit SHALL run slower instead of stopping.

#### Scenario: A large image zooms at full speed

- **WHEN** a 2560 by 1440 Resource Image zooms in through a shot of 6 seconds
- **THEN** it grows 8 percent each second and ends at about 1.59 times

#### Scenario: A small image moves slowly for its whole shot

- **WHEN** a 1200 by 630 link preview image zooms in through a shot of 6 seconds
- **THEN** it ends at 1.25 times, and it moves from the shot's first frame to its last

#### Scenario: No move repeats

- **WHEN** a chapter of ten shots renders
- **THEN** no shot uses the move of the shot before it

#### Scenario: A pan crosses the image

- **WHEN** a shot pans left
- **THEN** the image is shown zoomed in, and the frame travels across it at an even speed for the whole shot

### Requirement: Shots crossfade

Two shots in a row SHALL crossfade over 10 frames, about 0.4 seconds, and both SHALL keep moving through the
crossfade. A crossfade SHALL NOT dip to espresso.

#### Scenario: A cut is a crossfade

- **WHEN** a chapter passes from one shot to the next
- **THEN** the first image fades into the second over 10 frames, about 0.4 seconds, while both keep moving

### Requirement: A chapter has a distinct image for every 30 seconds

A chapter SHALL show at least one distinct image for every 30 seconds of its length, rounded up, and at least two if
it runs longer than 8 seconds. Its Resource's images and the podcast card SHALL count first. Generated images, drawn as
the film renders, SHALL make up the difference. A chapter whose Resource is unsafe SHALL never get a generated image.

#### Scenario: A chapter with enough images draws none

- **GIVEN** a chapter of 120 seconds whose Resource has three images
- **WHEN** its film renders
- **THEN** the chapter shows the three images and the podcast card, and no image is drawn for it

#### Scenario: A long chapter with one image draws the difference

- **GIVEN** a chapter of 180 seconds whose Resource has one image
- **WHEN** its film renders
- **THEN** four generated images are drawn for it, and it shows six distinct images

#### Scenario: A chapter with no Resource Image draws one

- **GIVEN** a chapter of 45 seconds whose Resource has no image
- **WHEN** its film renders
- **THEN** one generated image is drawn for it

#### Scenario: An unsafe Resource is never imagined

- **WHEN** a film renders a chapter of 5 minutes that narrates a Finding whose Resource is unsafe
- **THEN** no image is drawn for it

### Requirement: A film's generated images are limited and differ from one another

A film SHALL draw at most 40 generated images, and a chapter at most 12. The 40 SHALL be a setting, and zero SHALL turn
generated images off. If a film needs more than its limit, every chapter SHALL get its first missing image before any
chapter gets its second, and a chapter left short SHALL loop the images it has. A chapter's generated images SHALL each
be framed differently, from the same public words.

#### Scenario: A limit of zero draws none

- **GIVEN** the generated image limit set to 0
- **WHEN** a film renders
- **THEN** no image is drawn for any chapter, and each chapter shows the images it has

#### Scenario: A film past its limit spreads its images

- **GIVEN** the generated image limit set to 3, and a film with three chapters that each lack two images
- **WHEN** the film renders
- **THEN** each of the three chapters gets one generated image

#### Scenario: Two generated images of one chapter differ

- **WHEN** a chapter draws two generated images
- **THEN** the second scene is written in a different framing from the first, from the same title and public
  relevance explanation

### Requirement: A film records the render version it was rendered at

The renderer SHALL have a current render version, and a film row SHALL record the version its stored film was
rendered at. A film rendered before versions existed SHALL read as version 1. A first render SHALL store its film at
the current version. A render asked for a ready film at the current version SHALL do nothing.

#### Scenario: A new film is current

- **WHEN** a Podcast Episode publishes after this capability ships
- **THEN** its film is stored at the current render version, and the backfill never lists it

#### Scenario: An existing film is below the current version

- **GIVEN** a film rendered before this capability shipped
- **WHEN** the backfill lists the films to re-render
- **THEN** the film reads as version 1 and is listed

#### Scenario: A second render of a current film does nothing

- **WHEN** a render is asked for a ready film at the current render version
- **THEN** nothing is rendered, drawn, or uploaded

### Requirement: The backfill re-renders every film below the current render version

The backfill SHALL re-render every ready film below the current render version, including a film it rendered itself,
on the platform's bill. It SHALL fetch the images of a film's Resources before it renders the film. A Podcast
Episode with no film SHALL get none from the re-render. A second run SHALL list no film that is already current.

#### Scenario: Every existing film is re-rendered

- **GIVEN** 78 ready films at version 1
- **WHEN** the backfill runs
- **THEN** each of the 78 is re-rendered with chapter montages and stored at the current render version

#### Scenario: A film the backfill rendered is re-rendered too

- **GIVEN** a film that the backfill rendered for a Topic's latest Podcast Episode before this capability shipped
- **WHEN** the backfill runs
- **THEN** that film is re-rendered

#### Scenario: A second run does nothing

- **GIVEN** a backfill that ended with every film at the current render version
- **WHEN** the backfill runs again
- **THEN** it lists no film and renders nothing

#### Scenario: A Podcast Episode with no film stays without one

- **GIVEN** a Topic's older Podcast Episode that has no film
- **WHEN** the backfill runs
- **THEN** that Podcast Episode still has no film

#### Scenario: A re-render bills nobody

- **WHEN** the backfill re-renders a film and draws six generated images for it
- **THEN** the draws run on the platform's key, and the film's cost does not rise

### Requirement: A re-render never takes the playing film away

While a film re-renders, its stored film SHALL keep playing. The new film SHALL be stored under new keys, and
SHALL replace the old one in one step once every file is stored. The replaced files SHALL be deleted after a grace period. A
re-render that fails SHALL leave the old film in place and delete what it uploaded. A re-render that fails its last
attempt SHALL NOT be listed again at that render version.

#### Scenario: The old film plays during the re-render

- **GIVEN** a film whose re-render is half encoded
- **WHEN** a visitor opens the Podcast Episode
- **THEN** the film section shows, and the old film plays

#### Scenario: The new film replaces the old in one step

- **GIVEN** a visitor who started the old film's url a minute before its re-render finished
- **WHEN** the re-render stores its last file
- **THEN** the next play gets the new film, and the visitor's old url keeps playing until it expires

#### Scenario: A failed re-render leaves the old film

- **WHEN** a re-render fails while it encodes
- **THEN** the old film still plays, its row is unchanged, and nothing the re-render uploaded is left

#### Scenario: A film that cannot be re-rendered is tried once a version

- **GIVEN** a film whose re-render failed its third attempt
- **WHEN** the worker boots and the backfill runs again
- **THEN** the film is not listed, and its old film still plays

### Requirement: A recorded Podcast Episode's film renders in full and bills its owner

A film's first render SHALL start for every Podcast Episode that publishes, whatever its owner's monthly spend. The
Podcast Episodes cutoff is checked when the Podcast Episode is planned. The render and each rebuild SHALL add their
cost to the monthly spend of the user that the Podcast Episode bills. A rebuild for a new image SHALL NOT start once
that user has passed the spend cutoff that stops new Podcast Episodes, and the film that plays now SHALL stay.

#### Scenario: A film renders past the spend cutoff

- **GIVEN** an owner whose Podcast Episode's own cost took them past the podcast episode spend cutoff
- **WHEN** the Podcast Episode publishes
- **THEN** its film renders in full, and the render's cost counts in that owner's monthly spend

#### Scenario: A rebuild past the spend cutoff keeps the film

- **GIVEN** a ready film and an owner past the podcast episode spend cutoff
- **WHEN** an editor regenerates the film's image
- **THEN** no rebuild starts, and the film that plays now stays
