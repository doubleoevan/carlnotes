# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: An imagined image bills like the film and never blocks it

A draw SHALL bill the Topic owner's key and add its cost to the film's cost, and the backfill's draws SHALL bill the
platform. An owner's draw SHALL check the spend cutoff first, and an owner past it SHALL draw no more. If the owner's
budget is spent, a draw fails, or a drawn image does not pass the image moderation, the chapter SHALL go on with the
images it has, and the render SHALL go on. A render that is stopped SHALL start no further draw. A generated image
SHALL be stored in the film's folder. A render's second attempt and a re-render SHALL reuse a stored image, and it
SHALL be deleted with the film.

#### Scenario: A draw is billed to the owner

- **WHEN** a film renders for a Topic owner's Podcast Episode and draws two generated images
- **THEN** both draws run on the owner's key, and the film's cost includes both

#### Scenario: A spent budget leaves the podcast card

- **GIVEN** an owner whose model budget is spent but who is under the podcast episode spend cutoff
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

### Requirement: A failed render never touches the Podcast Episode

A first render that fails for good SHALL leave the Podcast Episode, its audio, and its feed item unchanged. That
Podcast Episode SHALL have no film section, no play button over a film, no Video button on its Brews News row, no film
card, no row in Coffee Break films, and no item in the film feed. Its uploaded parts SHALL be deleted, and the failure
SHALL be reported.

#### Scenario: A failed film leaves the audio

- **WHEN** a Podcast Episode's first film render fails
- **THEN** the Podcast Episode plays as audio as before, and no film control or film list row shows for it

## REMOVED Requirements

### Requirement: A long chapter with no image gets an imagined image

**Reason**: A chapter now draws generated images until it has one distinct image for every 30 seconds, so the rule of
90 seconds and four a film no longer decides which chapters get one.

**Migration**: The film's limit stays a setting, with a default of 40, and zero still turns generated images off.
Remove `TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS` from each environment. A re-render reuses
a stored generated image that its chapter still needs.

### Requirement: A chapter's link preview image slides in

**Reason**: A chapter opens with a 0.3 second fade into its first shot and cuts every 5 to 8 seconds after it, so the
0.9 second slide has no place.

**Migration**: None. A re-rendered film opens every chapter with the fade.
