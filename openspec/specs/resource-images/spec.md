# resource-images Specification

## Purpose
A Resource keeps a few images of its own page, filtered for use on screen and stored in R2, so a film that narrates
the Resource can show them without scraping the page again.

## Requirements

### Requirement: A Resource's images are fetched once, the first time a film narrates it

The first render of a film that narrates a Resource SHALL fetch that Resource's images and record that the fetch
ran. A later render, a retry, and a re-render SHALL read the stored images and SHALL NOT fetch again, whether the
fetch kept any image or none. The fetch SHALL read the page's images from the Markdown that the Scan stored for
the Resource. It SHALL NOT scrape the page, and it SHALL NOT change what a Scan fetches or stores.

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

### Requirement: Only an image from the page's own content is kept

The fetch SHALL keep an image only if the page's main-content Markdown shows it outside any link. An image that
sits inside a link SHALL be dropped, since it is the picture of another page. The page's link preview image SHALL be
a candidate too, whether or not the Markdown shows it. The fetch SHALL read the first 200,000 characters of the
Markdown and try at most the first 24 images they show.

#### Scenario: A related story's image is dropped

- **GIVEN** an article whose Markdown shows two photos of its own and seventeen photos that each link to another
  story
- **WHEN** its images are fetched
- **THEN** only the article's own two photos are candidates

#### Scenario: A link preview image outside the content is a candidate

- **GIVEN** a page whose Markdown shows no image and whose tags name a link preview image
- **WHEN** its images are fetched
- **THEN** the link preview image is a candidate

### Requirement: A kept image is a photo or an illustration that the frame can hold

The fetch SHALL keep only a jpeg, png, webp, or avif image. It SHALL drop an image whose url names a logo, an
avatar, an icon, an emoji, a sprite, a badge, a placeholder, an advert, or a tracking pixel. A kept image, at its own
size or fitted inside the 1280 by 720 frame if it is larger, SHALL cover at least a third of the frame. Its width over
its height SHALL be from 2:3 to 21:9.

#### Scenario: A thumbnail is too small

- **WHEN** a page's content shows a 425 by 239 image
- **THEN** the image is dropped

#### Scenario: A 640 by 480 image just passes

- **WHEN** a page's content shows a 640 by 480 jpeg
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

- **WHEN** a page names a 300 by 200 link preview image
- **THEN** the Resource has no link preview image among its images

### Requirement: A Resource keeps at most six images, large enough to zoom

The fetch SHALL keep the first six images that pass, in the order the page shows them, with a link preview image
that the page's content does not show placed first. Each SHALL be stored in R2 under the Resource as a jpeg that fits
inside 2560 by 1440, never enlarged, with its pixel size and whether it is the link preview image recorded.

#### Scenario: A gallery page keeps six

- **WHEN** a page's content shows forty-seven photos that pass the filter
- **THEN** the Resource keeps the first six

#### Scenario: A large image is stored within 2560 by 1440

- **WHEN** a 6000 by 3380 photo is kept
- **THEN** it is stored at 2556 by 1440 or smaller, and its stored size is recorded

#### Scenario: A small image is not enlarged

- **WHEN** a 1200 by 630 image is kept
- **THEN** it is stored at 1200 by 630

### Requirement: Every image fetch is guarded, and an unsafe Resource has none

The fetch SHALL fetch every image and every page tag through the public-url guard that a link preview's fetch
goes through, with a time limit and a size limit, and SHALL check the image's type before it reads the bytes. A fetch
that fails SHALL drop that image alone. An unsafe Resource SHALL have no image fetched, and any image stored for a
Resource that is now unsafe SHALL be deleted the next time a film reads it.

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

### Requirement: A kept image passes the image moderation before it is stored

Each kept image SHALL pass the image moderation before it is stored. An image the moderation flags or cannot read
SHALL be dropped. A check that fails SHALL leave the Resource unfetched, so the next film fetches it again.

#### Scenario: A flagged image is never stored

- **WHEN** the image moderation flags one of a page's kept images
- **THEN** that image is not stored or shown, and the page's other images are

#### Scenario: A failed check leaves the fetch for the next film

- **WHEN** the image moderation's check fails during a fetch
- **THEN** nothing is stored, the Resource stays unfetched, and the next film that narrates it fetches again

### Requirement: A Resource that review does not scrape has its link preview image alone

A Resource with no stored Markdown, such as a Reddit thread, a post on X, a `listen` Resource, or a page whose fetch
stored nothing, SHALL have its link preview image as its only candidate. A YouTube video SHALL have its thumbnail at
its largest size as that candidate. The candidate SHALL pass the same filter.

#### Scenario: A YouTube video keeps its thumbnail

- **WHEN** a film narrates a YouTube video whose largest thumbnail is 1280 by 720
- **THEN** the Resource keeps that one image

#### Scenario: A Reddit thread with no link preview image keeps none

- **WHEN** a film narrates a Reddit thread whose page offers no link preview image
- **THEN** the Resource keeps no image, and the fetch is recorded as run
