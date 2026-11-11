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
no film row, and for no other Podcast Episode. A second start SHALL join the one running. It SHALL list public Topics
first, then private and team Topics, a page at a time. The worker SHALL start it on boot in every environment, and
`bun run films:backfill` SHALL start or join it by hand.

#### Scenario: Only the latest Podcast Episode is backfilled

- **GIVEN** a Topic whose two Podcast Episodes were published before films shipped, neither with a film
- **WHEN** the worker boots
- **THEN** the backfill renders a film for the later Podcast Episode only

#### Scenario: A second boot finds nothing

- **GIVEN** a backfill that ended with every Topic's latest Podcast Episode rendered, skipped, or failed
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
user's plan. The backfill SHALL return and log its counts.

#### Scenario: An unrenderable Podcast Episode is skipped once

- **GIVEN** a Topic's latest Podcast Episode with no chapters
- **WHEN** the backfill reaches it
- **THEN** it is counted as skipped, a warning names it, it has no film, and the next run does not list it

#### Scenario: The backfill reports what it did

- **WHEN** the backfill ends
- **THEN** it returns and logs how many films it rendered, skipped, and failed, the total render time, and the stored
  bytes

#### Scenario: A backfilled film bills nobody

- **WHEN** the backfill renders a film for an owner past the podcast episode spend cutoff
- **THEN** the film renders, and its row's cost is zero

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

The first time a film renders, before its intro and sign-off, the worker SHALL draw the film's own image: 16:9 at 1280
by 720, full frame with no paper edge or border, in film lighting and the app's palette, with a calm dark lower third
for the title. The topic image's scene writer and image model SHALL draw it from a film house style prompt. It SHALL be
stored under the film's folder, and its cost SHALL add to the film's cost.

#### Scenario: A new film opens on its own image

- **WHEN** a Podcast Episode's film renders for the first time
- **THEN** a wide image is drawn from the Podcast Episode's title, description, and chapter titles, and the intro, the
  sign-off, and the poster show it

#### Scenario: The image fills the frame

- **WHEN** the film's image is drawn
- **THEN** it is 1280 by 720 with no border, and its lower third is dark enough for the title to read over it

#### Scenario: A second attempt draws no second image

- **GIVEN** a render whose first attempt drew the film's image and then failed
- **WHEN** the render's second attempt runs
- **THEN** it reuses the stored image and makes no image call

### Requirement: A failed image draw never fails the film

Until the film's own image is drawn, and if the draw fails, the film's intro, sign-off, and poster SHALL show the image
that the Podcast Episode shows, its own or its Topic's. A failed draw SHALL be reported and SHALL NOT fail the film's
render. A film left without its own image SHALL get one from an editor's regeneration or upload.

#### Scenario: A rejected draw leaves the podcast episode image

- **WHEN** the image model rejects the film's image
- **THEN** the film renders with the podcast episode image in its intro and sign-off, and the failure is reported

#### Scenario: A spent budget still renders the film

- **GIVEN** an owner whose model budget is spent but who is under the podcast episode spend cutoff
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

Each chapter SHALL show its Finding's link preview image. A chapter whose Finding has no image that can be read SHALL
show its imagined image if it has one, or else the Carl and Vienna podcast card, which a chapter with an unsafe Resource
always shows. A still SHALL zoom slowly through the chapter. An image that is small or not 16:9 SHALL sit over a blurred
fill of itself. A lower third SHALL show the chapter's title and its source's domain for the chapter's first 8 seconds.

#### Scenario: A Finding's image fills its chapter

- **WHEN** the film reaches a chapter whose Finding has a 16:9 link preview image at least 1280 pixels wide
- **THEN** that image covers the frame and zooms slowly while the chapter plays

#### Scenario: A square image sits over its blur

- **WHEN** a chapter's Finding has a square link preview image
- **THEN** the image is centered whole over a blurred fill of itself

#### Scenario: An unsafe Resource shows the podcast card

- **WHEN** a chapter narrates a Finding whose Resource is unsafe
- **THEN** the chapter shows the Carl and Vienna podcast card and never the Resource's image

#### Scenario: The lower third names the source

- **WHEN** a chapter about an article on example.com starts
- **THEN** a lower third shows the chapter's title and "example.com", and fades by the chapter's eighth second

### Requirement: A long chapter with no image gets an imagined image

A chapter whose Finding has no link preview image that can be read, and that runs 90 seconds or longer, SHALL get an
imagined image, drawn as the film renders. A film SHALL get at most 4, for its longest such chapters, and the rest SHALL
keep the podcast card. A chapter whose Resource is unsafe SHALL never get one. The 90 seconds and the 4 SHALL be
settings, and a limit of zero SHALL turn imagined images off. An imagined image SHALL zoom slowly like any still.

#### Scenario: A long chapter with no image is imagined

- **GIVEN** a chapter of 3 minutes whose Finding has no link preview image
- **WHEN** its film renders
- **THEN** the chapter shows an imagined image, which zooms slowly while the chapter plays

#### Scenario: A short chapter keeps the podcast card

- **GIVEN** a chapter of 80 seconds whose Finding has no link preview image
- **WHEN** its film renders
- **THEN** the chapter shows the Carl and Vienna podcast card, and no image is drawn for it

#### Scenario: Only the longest four are imagined

- **GIVEN** a Podcast Episode with six chapters of 2 minutes or longer whose Findings have no link preview image
- **WHEN** its film renders
- **THEN** the four longest show an imagined image, and the other two show the podcast card

#### Scenario: A chapter with a link preview image keeps it

- **GIVEN** a chapter of 5 minutes whose Finding has a link preview image
- **WHEN** its film renders
- **THEN** the chapter shows that image, and no image is drawn for it

#### Scenario: An unsafe Resource is never imagined

- **WHEN** a film renders a chapter of 5 minutes that narrates a Finding whose Resource is unsafe
- **THEN** the chapter shows the podcast card, and no image is drawn for it

#### Scenario: A limit of zero turns imagined images off

- **GIVEN** the imagined image limit set to 0
- **WHEN** a film renders
- **THEN** no image is drawn for any chapter

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
platform. If the owner's budget is spent, a draw fails, or a drawn image does not pass the image moderation, the
chapter SHALL show the podcast card, and the render SHALL go on. An imagined image SHALL be stored in the film's
folder. A render's second attempt SHALL reuse a stored image, and it SHALL be deleted with the film.

#### Scenario: A draw is billed to the owner

- **WHEN** a film renders for a Topic owner's Podcast Episode and draws two imagined images
- **THEN** both draws run on the owner's key, and the film's cost includes both

#### Scenario: A spent budget leaves the podcast card

- **GIVEN** an owner whose model budget is spent but who is under the podcast episode spend cutoff
- **WHEN** their Podcast Episode's film renders
- **THEN** each long chapter with no image shows the podcast card, and the film renders

#### Scenario: A failed draw never fails the film

- **WHEN** the image model rejects a chapter's imagined image
- **THEN** that chapter shows the podcast card, the failure is reported, and the film renders

#### Scenario: A second attempt reuses the stored image

- **GIVEN** a render whose first attempt drew and stored a chapter's imagined image and then failed
- **WHEN** the render's second attempt runs
- **THEN** it shows the stored image and makes no image call for that chapter

#### Scenario: The backfill bills the platform

- **WHEN** the backfill renders a film with a long chapter that has no image
- **THEN** the imagined image is drawn on the platform's key, and the film's cost stays zero

### Requirement: The film fades through espresso between parts and chapters

Each chapter, the intro, and the sign-off SHALL fade out to espresso over their last 1.2 seconds. The intro, the
sign-off, and a chapter that shows an imagined image or the podcast card SHALL fade in from espresso over their first
1.2 seconds. A segment shorter than both fades SHALL split its length between them. The audio SHALL NOT fade at these
points.

#### Scenario: A chapter change dips to espresso

- **GIVEN** a chapter 3 that shows the podcast card
- **WHEN** the film passes from chapter 2 to chapter 3
- **THEN** the picture fades slowly to espresso and back while the hosts keep talking without a break

### Requirement: A chapter's link preview image slides in

A chapter that shows its Finding's link preview image SHALL open with a slide in place of the fade in. The still SHALL
enter over espresso from the left, right, top, or bottom edge, pass its place by about 2.5 percent of the frame, and
settle within 0.9 seconds, or within half of a shorter chapter. The edge SHALL be picked per chapter from the Podcast
Episode and the chapter's position, the same on every render. The zoom, the lower third, and the fade out SHALL stay
as they are.

#### Scenario: A link preview image slides in

- **WHEN** the film reaches a chapter whose Finding has a link preview image
- **THEN** the chapter's first frame is espresso, and the image moves in from one edge, passes its place a little, and
  settles in under a second while the hosts keep talking

#### Scenario: An imagined image and the podcast card fade in

- **WHEN** the film reaches a chapter that shows an imagined image or the podcast card
- **THEN** the chapter fades in from espresso and nothing slides

#### Scenario: A second attempt slides from the same edge

- **GIVEN** a render whose first attempt encoded chapter 4 sliding in from the top
- **WHEN** the render's second attempt encodes chapter 4
- **THEN** its image slides in from the top again

#### Scenario: A short chapter's slide is shorter

- **WHEN** a film renders a chapter of 1 second whose Finding has a link preview image
- **THEN** the image slides in over the chapter's first half second and the chapter fades out over its second

#### Scenario: The lower third keeps its place

- **WHEN** a chapter's link preview image slides in
- **THEN** the lower third fades in where it always sits, 0.6 seconds into the chapter, and never moves with the image

### Requirement: A render that stalls or is cancelled stops and is tried again

A render SHALL get three attempts of at most four hours each before its film is marked failed. A running render SHALL
report that it is alive every 30 seconds, and an attempt that reports nothing for ten minutes SHALL end. An attempt
that is cancelled or times out SHALL stop its encoder, upload nothing, and remove its work folder.

#### Scenario: A long chapter on a one-core worker keeps rendering

- **WHEN** a chapter of six minutes takes eighteen minutes to encode
- **THEN** the render keeps reporting that it is alive, and the attempt goes on

#### Scenario: A timed-out attempt never renders beside its retry

- **WHEN** an attempt ends at its time limit while its encoder is running
- **THEN** the encoder stops before the next attempt starts, and the attempt's work folder is removed

#### Scenario: Three failed attempts mark the film failed

- **WHEN** a render fails its third attempt
- **THEN** the film is marked failed, and the backfill never lists it again

### Requirement: The film shows the podcast card while the hosts answer hot takes

From the turn where the hosts turn to a chapter's hot takes, or to the closing hot takes after the last chapter, to
the end of that chapter's recording, the film SHALL show the podcast card with a "Hot takes" lower third. That segment
SHALL fade in from espresso and out to it, and SHALL never slide. A chapter whose Finding or whose hot takes would
show for under 4 seconds SHALL keep its Finding's image throughout.

#### Scenario: The closing hot takes show the podcast card

- **GIVEN** a Podcast Episode whose script reads a hot take from hotcup after its last chapter
- **WHEN** the film reaches the turn that hands off to the hot takes
- **THEN** the last chapter's image fades to espresso, the podcast card fades in with a "Hot takes" lower third, and
  the podcast card stays through the goodbye until the sign-off

#### Scenario: A chapter's hot take shows the podcast card

- **GIVEN** a chapter of 70 seconds whose hosts name the writer of a hot take on its Finding 50 seconds in
- **WHEN** the film plays that chapter
- **THEN** the Finding's image shows for 50 seconds and the podcast card for the last 20

#### Scenario: A film with no hot takes has no such segment

- **WHEN** a film renders for a Podcast Episode whose script reads no hot take
- **THEN** every chapter shows its own image to its end

#### Scenario: A hot take at the very end keeps the chapter's image

- **WHEN** the hosts turn to a hot take 2 seconds before the chapter's recording ends
- **THEN** the chapter shows its Finding's image throughout

#### Scenario: Captions sit above the hot takes' lower third

- **WHEN** a caption shows while the "Hot takes" lower third does
- **THEN** the caption sits above the lower third, as it does at a chapter's start

### Requirement: The intro zooms in and the sign-off zooms out

The intro SHALL zoom in to the film's image, from its full frame to 1.8 times, across its length. The sign-off SHALL
start at 1.8 times and zoom back out to the full frame. Every zoom SHALL ease: slow at its start, fastest in its
middle, and slow at its end. The Carl and Vienna podcast card SHALL cover the
frame as a 16:9 band of its illustration, with no blurred fill.

#### Scenario: The film opens moving in and closes moving out

- **WHEN** a film plays from its start to its end
- **THEN** the intro's image grows slowly toward the viewer, and the sign-off's image starts close and settles back to
  its full frame

#### Scenario: A chapter with no image fills the frame

- **WHEN** a chapter's Finding has no image, and the chapter gets no imagined image
- **THEN** the chapter shows both hosts' mugs and the microphone across the whole frame

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

### Requirement: A render counts against the Topic owner's plan

A film's render and each rebuild SHALL add their cost to the monthly spend of the user that the Podcast Episode
bills. A render or a rebuild SHALL NOT start once that user has passed the spend cutoff that stops new Podcast
Episodes. A Podcast Episode whose render was not started SHALL have no film, and the backfill SHALL NOT render one for
it later.

#### Scenario: A render is billed to the owner

- **WHEN** a film renders for a Topic owner's Podcast Episode
- **THEN** the render's cost counts in that owner's monthly spend

#### Scenario: A spent budget skips the film

- **GIVEN** an owner past the podcast episode spend cutoff
- **WHEN** their Podcast Episode publishes
- **THEN** no film renders, and the Podcast Episode has no film

#### Scenario: The backfill leaves a skipped film alone

- **GIVEN** a Topic's latest Podcast Episode whose film was skipped for its owner's spent budget
- **WHEN** the worker boots and the backfill runs
- **THEN** the backfill does not list that Podcast Episode, and it still has no film

### Requirement: A failed render never touches the Podcast Episode

A render that fails for good SHALL leave the Podcast Episode, its audio, and its feed item unchanged. That Podcast
Episode SHALL have no film section, no play button over a film, no Video button on its Brews News row, no film card,
no row in Coffee Break films, and no item in the film feed. Its uploaded parts SHALL be deleted, and the failure SHALL
be reported.

#### Scenario: A failed film leaves the audio

- **WHEN** a Podcast Episode's film fails to render
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
