# Design

## Color count over entropy or url words

A placeholder, a silhouette, an identicon, and a logo are a few flat colors. Measured on a 256 pixel copy, each color
read at 5 bits a channel: a stock silhouette has 11 colors, the Gravatar default person 8, an identicon 14, the GitHub
logo 32. The podcast card illustration has 770, and two photos 1,312 and 2,180. A minimum of 64 leaves a wide gap on
both sides. Sharp's channel entropy separates them too, but a count of colors says plainly what is being measured.

A black-and-white photo has at most 32 colors at 5 bits a channel, so it passes on gray levels instead. Of 64 gray
levels, the filter counts one that holds at least 1 percent of the pixels, which leaves out a logo's smoothed edges.
Text on white has 5 such levels and the flat test graphic 5, while a test picture in gray has 17 and a gray gradient
58. A minimum of 12 sits between them. Only a gray pixel counts, one whose channels differ by 16 or less, so a flat
graphic of 16 red stripes at 16 brightnesses shows no gray level and is dropped.

The url word list stays for what a count cannot see cheaply before the fetch: an advert, a tracking pixel, a sprite.
`avatar` and `gravatar` leave it, since a person's own photo is a picture of the page, and a default avatar fails the
color count.

## A side of 200 pixels over a share of the frame

A film draws an image that is not 16:9 at no more than its own size over a blurred copy of itself, and its zoom stops
at what the image's pixels hold, so a small image never looks soft. It only looks small. A favicon is 16 to 64
pixels and a list thumbnail under 200, so a shortest side of 200 drops both and keeps a 480 by 450 photo and a 400 by
400 profile photo.

## Shape from 9:16 to 4.5:1

A profile banner is 4:1, and a film fits it over the blurred backdrop like any other wide image. Beyond 4.5:1 an
image is a divider or a strip of thumbnails. A portrait under 9:16 is a phone screenshot of a long page.

## An honest user agent, and https first

Some CDNs answer 403 to a fetch that sends no user agent. `CarlNotes/1.0 (+https://carlnotes.com)` passes them
without imitating a browser. A page served over http often links its images over http, and some hosts answer an http
request with an error while the same path over https works, so an http image url is tried over https first.

## Fetching again under a new filter

A Resource records the version of the image filter its fetch ran under, 0 for every fetch before this change. A film
that narrates a Resource below the current version deletes its stored images through the same path that an unsafe
Resource's images take, then fetches again under the Resource's lease and records the current version. A future change
to the filter raises the version, and every Resource is fetched again the same way.

Deleting every stored image in the migration instead would race the fetch: an image's key is its Resource and its
position, so a key queued for the deletion sweep could be uploaded again by a fetch before the sweep removes it.

The film render version goes to 3, so the backfill re-renders every film, and each re-render fetches its Resources'
images again. A chapter's generated images are stored beside the film and reused, so a re-render draws only the ones
a chapter still lacks.

## The intro and the sign-off as montages

The intro and the sign-off are planned by the chapters' shot planner with one change: shot 0 of the intro and the last
shot of the sign-off show the film's image and make a fixed move, a zoom in and a zoom out. The other shots cycle
through each chapter's first image, which `prepareChapterImages` already settles, so the parts draw nothing new. The
lower third is the chapters' lower third with its fade out left off.

A rebuild for a changed image needs the chapter images too, so it loads the same audio, timeline, and captions as the
render and runs `prepareChapterImages`, which reuses the stored generated images. It still encodes only the intro and
the sign-off.

