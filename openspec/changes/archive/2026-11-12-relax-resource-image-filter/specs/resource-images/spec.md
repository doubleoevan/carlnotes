## MODIFIED Requirements

### Requirement: A Resource's images are fetched once, the first time a film narrates it

The first render of a film that narrates a Resource SHALL fetch that Resource's images and record that the fetch
ran, with the version of the image filter it ran under. A later render, a retry, and a re-render SHALL read the stored
images and SHALL NOT fetch again, whether the fetch kept any image or none, while the recorded version is the current
one. A Resource whose fetch ran under an older version SHALL have its stored images deleted and fetched again by the
next film that narrates it. The fetch SHALL read the page's images from the Markdown that the Scan stored for the
Resource. It SHALL NOT scrape the page, and it SHALL NOT change what a Scan fetches or stores.

#### Scenario: A new film fetches its Resources' images

- **GIVEN** a Podcast Episode whose chapters narrate five Resources that no film has narrated
- **WHEN** its film renders
- **THEN** each of the five Resources has its images fetched and stored before the chapters are encoded

#### Scenario: A second film reuses the stored images

- **GIVEN** a Resource whose images were fetched for one film
- **WHEN** another Podcast Episode's film narrates the same Resource
- **THEN** the film shows the stored images, and no image is fetched

#### Scenario: A Resource with no usable image is not fetched twice

- **GIVEN** a Resource whose fetch kept no image
- **WHEN** a film that narrates it renders again
- **THEN** no image is fetched for it

#### Scenario: The fetch spends no scrape

- **WHEN** a film fetches the images of a Resource that review fetched through Firecrawl
- **THEN** the image urls come from the Resource's stored Markdown, and no Firecrawl request is made

#### Scenario: Two films narrate one Resource at the same time

- **WHEN** two films that narrate the same unfetched Resource render at once
- **THEN** one film fetches the Resource's images, and the other waits and shows the same stored images

#### Scenario: A Resource fetched under an older filter is fetched again

- **GIVEN** a Resource with two images stored by a fetch under an older version of the image filter
- **WHEN** a film that narrates it renders
- **THEN** the two images are deleted, the page's images are fetched again under the current filter, and the fetch
  records the current version

### Requirement: A kept image is a photo or an illustration that the frame can hold

The fetch SHALL keep only a jpeg, png, webp, or avif image. It SHALL drop an image whose url names a logo, an icon, an
emoji, a sprite, a badge, a placeholder, an advert, or a tracking pixel. A kept image's shortest side SHALL be at least
200 pixels, and its width over its height SHALL be from 9:16 to 4.5:1. A kept image SHALL show at least 64 colors on a
256 pixel copy, each color read at 5 bits a channel, or at least 12 of 64 gray levels that each hold 1 percent of its
pixels, counting only the gray pixels, whose channels differ by 16 or less. A black-and-white photo is kept, and a
silhouette, an identicon, a logo, an icon, or a flat color graphic is dropped by its pixels no matter what its url
names.

#### Scenario: A thumbnail is too small

- **WHEN** a page's content shows a 160 by 90 image
- **THEN** the image is dropped

#### Scenario: A 640 by 480 image just passes

- **WHEN** a page's content shows a 640 by 480 jpeg
- **THEN** the image is kept

#### Scenario: A small photo is kept

- **WHEN** a page's content shows a 480 by 450 photo
- **THEN** the image is kept

#### Scenario: A profile banner is kept

- **WHEN** a page's content shows a 1584 by 396 photo
- **THEN** the image is kept

#### Scenario: A link preview image named as a logo is dropped

- **WHEN** the page's tags name a link preview image whose url names a logo
- **THEN** the image is not fetched or kept

#### Scenario: A tall screenshot does not fit

- **WHEN** a page's content shows an 800 by 1600 image
- **THEN** the image is dropped for its shape

#### Scenario: A portrait photo is kept

- **WHEN** a page's content shows an 800 by 1067 photo
- **THEN** the image is kept

#### Scenario: A logo, a gif, and an svg are dropped

- **WHEN** a page's content shows an 800 by 564 png whose url holds `company_logos`, a tracking gif, and an svg badge
- **THEN** none of the three is kept

#### Scenario: A stock silhouette is dropped

- **WHEN** a page's content shows a 673 by 673 gray silhouette png whose url names no rejected word
- **THEN** the image is dropped for its few colors

#### Scenario: A black-and-white photo is kept

- **WHEN** a page's content shows an 800 by 600 photo stored as a gray jpeg
- **THEN** the image is kept for its many gray levels

#### Scenario: A flat color graphic is dropped

- **WHEN** a page's content shows a png of 16 red stripes, each at its own brightness
- **THEN** the image is dropped, since it shows few colors and no gray pixels

#### Scenario: A person's avatar is kept

- **WHEN** a page's content shows a 400 by 400 photo of a person whose url holds `avatar`
- **THEN** the image is kept

### Requirement: A Resource keeps one copy of each picture

The fetch SHALL treat two images as one picture if they show the same thing at different sizes, compared after
both are cut to the same shape. Of two copies it SHALL keep the larger, at the place of the one the page shows first.
The link preview image SHALL pass the same filter as every other image, and SHALL be dropped if it fails the filter or
if a larger copy of it is kept.

#### Scenario: A resized copy is dropped

- **GIVEN** a page that shows a photo at 780 by 439 and names the same photo as its link preview image at 5089 by
  2867
- **WHEN** its images are fetched
- **THEN** one image is kept, the larger one, marked as the link preview image

#### Scenario: A link preview image that repeats a larger image of the page is dropped

- **GIVEN** a page that shows a photo at 2560 by 1440 and names a 1120 by 630 copy of it as its link preview image
- **WHEN** its images are fetched
- **THEN** the 2560 by 1440 image is kept, and the smaller copy is dropped

#### Scenario: A link preview image that fails the filter is dropped

- **WHEN** a page names a 180 by 120 link preview image
- **THEN** the Resource has no link preview image among its images

### Requirement: Every image fetch is guarded, and an unsafe Resource has none

The fetch SHALL fetch every image and every page tag through the public-url guard that a link preview's fetch
goes through, with a time limit and a size limit, and SHALL check the image's type before it reads the bytes. Each
fetch SHALL send the user agent `CarlNotes/1.0 (+https://carlnotes.com)`. An image whose url is http SHALL be fetched
over https first, and over http if that fails. A fetch that fails SHALL drop that image alone. An unsafe Resource SHALL
have no image fetched, and any image stored for a Resource that is now unsafe SHALL be deleted the next time a film
reads it.

#### Scenario: An image on an internal address is refused

- **WHEN** a page's content shows an image whose host resolves to an internal address
- **THEN** the image is not fetched, and the Resource's other images are still fetched

#### Scenario: A dead image is dropped

- **WHEN** one of a page's four images answers 404
- **THEN** the Resource keeps the other three

#### Scenario: An unsafe Resource gets none

- **WHEN** a film narrates a Resource that was judged unsafe
- **THEN** no image is fetched or stored for it

#### Scenario: A Resource judged unsafe later loses its images

- **GIVEN** a Resource with four stored images that a later Scan judged unsafe
- **WHEN** a film that narrates it renders
- **THEN** the four images are deleted, and the film shows none of them

#### Scenario: An http image is fetched over https

- **WHEN** a page's content shows an http image url that the host serves only over https
- **THEN** the image is fetched over https and kept
