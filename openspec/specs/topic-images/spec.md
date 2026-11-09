# topic-images Specification

## Purpose
Every Topic carries one image: how it is written and rendered, its sizes and urls, who may see it, regeneration under a
plan limit, uploads, removal, reporting, and the backfill that gives existing Topics theirs.

## Requirements

### Requirement: Every Topic gets a generated image on creation

Creating a Topic SHALL start one image render for it on its owner's budget, after the Topic is saved and without
delaying the response. The render SHALL NOT start a Scan, and a Scan SHALL NOT start a render. Until the render
succeeds, every place that shows the image SHALL show what it showed before: the drawn covers and the text share card.

#### Scenario: A new Topic shows the drawn cover at once

- **WHEN** a user creates a Topic
- **THEN** the topic page loads with no image, and within a minute its header, its card, and its share image show the
  rendered image on their next load

#### Scenario: A failed render leaves the Topic as it was

- **WHEN** every attempt of a Topic's render fails
- **THEN** the Topic keeps its drawn covers and text card, the render row reads failed, and no page waits or errors

### Requirement: A scene writer writes the image prompt from the Topic

A text model on the cheap tier SHALL write the image prompt. It SHALL read
the Topic's name, prompt, and tags and up to five of its newest shown Findings' titles, every one fenced as untrusted
data, and SHALL return
one or two sentences describing a scene, objects, place, light, and mood, never what the Topic argues. The scene SHALL
be set in the subject's own world, never a desk or tabletop still life unless the subject is that object, and SHALL
take one framing picked at random from a fixed list of viewpoints and distances, so images vary across Topics and
across regenerations. The house style paragraph SHALL follow the scene unless the owner's image prompt replaces it.

#### Scenario: The scene follows the rules

- **WHEN** the writer runs for a Topic about a car maker
- **THEN** the scene names a car and a place and no badge, face, logo, word, or letter

#### Scenario: A brewed Topic is drawn from what it found

- **WHEN** a Topic with Findings is regenerated
- **THEN** the writer's input holds the titles of its five newest shown Findings

#### Scenario: Fenced text is data

- **WHEN** a Topic's prompt holds an instruction to the writer
- **THEN** the writer's input carries it inside the untrusted fence and the scene does not follow it

### Requirement: The house style is appended to every image prompt

A fixed house style paragraph, held as a versioned prompt, SHALL follow the writer's scene, and the image model SHALL
see only the two together.

#### Scenario: Every render shares the style

- **WHEN** two Topics render
- **THEN** both image prompts end with the same house style paragraph

### Requirement: One original is stored and six files are derived from it

Every write, generated or uploaded, SHALL store one original and derive the `page`, `list`, and `thumbnail` sizes from
it, each at 1x and 2x, all at 3:2. The files SHALL be stored under a hash of the original's bytes, so a new image is a
new url. Nothing SHALL be resized on request, and a new size SHALL be a resize pass over stored originals.

#### Scenario: A render stores seven objects

- **WHEN** a render succeeds
- **THEN** object storage holds the original and six derived files under one content hash

#### Scenario: A replaced image's objects are deleted

- **WHEN** a Topic's image is replaced
- **THEN** the previous image's seven objects are scheduled for deletion and its urls stop serving

### Requirement: An image url is immutable and gated by the Topic's visibility

Each derived file SHALL be served at a url naming the Topic, the content hash, the size, and the density. A public
Topic's image SHALL be served to anyone with immutable edge headers and a cache tag naming the Topic. A non-public
Topic's image SHALL be served only to a session that may view the Topic, with private immutable headers, and never
from the edge. A Topic that stops being public SHALL purge its tag.

#### Scenario: A visitor reads a public image

- **WHEN** a visitor requests a public Topic's `list` file
- **THEN** it is served with immutable public headers and the edge may cache it

#### Scenario: A visitor is refused a private image

- **WHEN** a request with no session asks for a private Topic's image
- **THEN** the response is not found and no bytes are served

#### Scenario: A stale hash is not found

- **WHEN** a request names a hash that is not the Topic's current one
- **THEN** the response is not found

### Requirement: The owner regenerates under a monthly plan limit

An owner SHALL be able to regenerate a Topic's image. Each plan SHALL hold `imageRegenerationLimit`, free 2, plus 15,
premium 30, counted per owner since the start of the UTC month, and an admin SHALL bypass it. The editor SHALL show `X
of Y` and SHALL show no Regenerate control once the limit is spent. A regeneration's cost SHALL land on the owner's
monthly spend.

#### Scenario: A regeneration counts down

- **WHEN** a free owner regenerates once
- **THEN** the editor reads 1 of 2, and after a second regeneration the Regenerate control is gone until the first of
  the next month

#### Scenario: An admin is never limited

- **WHEN** an admin regenerates past any plan's limit
- **THEN** the render runs and the editor shows no count

#### Scenario: A spent budget fails the render

- **WHEN** an owner's monthly budget is spent
- **THEN** the render row reads failed and the Topic keeps its current image

### Requirement: An owner's image prompt steers the scene and replaces the house style

A regeneration SHALL take an optional image prompt of at most 500 characters. An image prompt SHALL pass the text
moderation first, and a flagged one SHALL be rejected with its category before any render starts. The scene writer SHALL
still read the Topic's own words, SHALL work in what the image prompt asks to see and the style it names, under the
three rules, and the image model SHALL draw that scene with no house style. A regeneration with no image prompt SHALL
draw the writer's scene in the house style.

#### Scenario: An image prompt steers the scene

- **WHEN** an owner of a Topic about shipping regenerates with the image prompt "a lighthouse in a storm, oil painting"
- **THEN** the scene is about shipping with a lighthouse in a storm, ends in oil painting, and reaches the image model
  without the house style

#### Scenario: A flagged image prompt is rejected

- **WHEN** an owner regenerates with an image prompt the text moderation flags
- **THEN** the request is rejected with the category and no render row is written

### Requirement: The owner uploads their own image

An owner SHALL be able to upload a jpeg, png, or webp of up to 10 MB. The upload SHALL be center-cropped to 3:2,
resized to the original's size, stripped of metadata, stored as the original, and derived into the six files. An
upload SHALL replace the generated image until the owner regenerates or removes it.

#### Scenario: An off-ratio upload is cropped

- **WHEN** an owner uploads a tall png with EXIF data
- **THEN** the stored original is 3:2, holds no metadata, and the six files derive from it

#### Scenario: A too-large or wrong-type file is refused

- **WHEN** an owner uploads a 12 MB jpeg or a gif
- **THEN** the upload is rejected with the reason and the image is unchanged

#### Scenario: Removing an upload renders a fresh image

- **WHEN** an owner removes their upload
- **THEN** the upload's objects are scheduled for deletion and a fresh render starts on the owner's budget, counted as
  one of the month's regenerations

### Requirement: An upload passes the image moderation before it is stored

The cropped original of every upload SHALL pass the image moderation before anything is stored. A flagged upload SHALL
be rejected with its category, and an image the moderation cannot read SHALL be rejected as an unsupported type.

#### Scenario: A flagged upload is rejected

- **WHEN** an owner uploads a photo the image moderation flags as sexual
- **THEN** the upload is rejected with that category, nothing is stored, and the image is unchanged

### Requirement: Every render is recorded with its cost

Every image render, on create, Regenerate, an admin's Regenerate, or the backfill, SHALL write one render row holding
its kind, its model, its status, its cost at the model's fixed per-image rate, and the scene. The monthly spend sum
SHALL include the user's render costs.

#### Scenario: A render charges the owner

- **WHEN** a create render succeeds
- **THEN** the owner's monthly spend rises by the model's per-image rate

#### Scenario: The backfill charges nobody

- **WHEN** the backfill renders a Topic
- **THEN** its render row names no user and no user's monthly spend changes

### Requirement: The image calls run through the model proxy on the right key

Image renders SHALL run through the LiteLLM Gemini pass-through route, the way speech does: the owner's virtual key
for a create, a Regenerate, and a removal's fresh render, and the master key for the backfill and an admin's
Regenerate. A proxy that holds no Gemini key SHALL fail the render and leave the drawn covers everywhere.

#### Scenario: A self-hosted install without an image key keeps the drawn covers

- **WHEN** the proxy has no Gemini key and a Topic is created
- **THEN** the render row reads failed and every cover and card is the drawn one

### Requirement: The backfill gives every Topic an image

One idempotent workflow SHALL render an image for every Topic that has none, public Topics first, a few at a time, on
the platform key. It SHALL have a redo mode that renders every generated image again and leaves uploads, and a
resize-only mode that re-derives the six files from stored originals without a model call. A second start while one
runs SHALL join it.

#### Scenario: A rerun regenerates nothing

- **WHEN** the backfill runs after every Topic has an image
- **THEN** no render row is written

#### Scenario: The redo mode keeps uploads

- **WHEN** the backfill runs in redo mode
- **THEN** every generated image is rendered again at a new url and every uploaded image is unchanged

#### Scenario: Covers follow the new image

- **WHEN** the backfill finishes a Topic
- **THEN** the Topic's show and podcast episode covers draw over the new image on their next read

### Requirement: Every published Podcast Episode gets its own image

Publishing a Podcast Episode SHALL draw it an image of its own after the podcast episode is published, without delaying
the publish: the scene writer reads the podcast episode's title, description, its Topic's tags, and up to five chapter
titles, fenced as untrusted data, with the house style and no text in the image, billed to the podcast episode's owner
and added to the podcast episode's cost. The image SHALL be stored as an original and six files at the Topic image's
sizes, under the podcast episode's id and the original's content hash, and served at
`/api/podcast-episode-images/{id}/{hash}/{file}` behind the podcast episode's Topic's visibility, with the Topic image's
cache headers. The podcast episode page, its cards, and its search row SHALL show the podcast episode's own image, and a
card SHALL show the Topic's image until it is drawn. A spent budget or a rejection SHALL leave the podcast episode
without an image and SHALL NOT fail the publish. A root script, `podcast-episode-images:backfill`, SHALL draw an image
for every published podcast episode without one, on the platform key.

#### Scenario: A new podcast episode gets its own image

- **WHEN** a Podcast Episode publishes
- **THEN** within a few minutes its page header shows an image of its own, with no text on it

#### Scenario: A rejected image leaves the podcast episode published

- **WHEN** the image model rejects a podcast episode's scene
- **THEN** the podcast episode stays published, its cards show its Topic's image, and its cover draws over the Topic's
  image

#### Scenario: The backfill skips drawn podcast episodes

- **WHEN** the backfill runs after every published podcast episode has an image
- **THEN** it draws nothing

### Requirement: A Topic's image is reportable and an admin regenerates it

A signed-in user who can see a Topic SHALL be able to report its image. The admin console's Reports view SHALL show
the image on such a report and SHALL offer Regenerate beside Clear and Block. Regenerate SHALL render a fresh image on
the platform key, drop an upload, and resolve the report as removed.

#### Scenario: An admin regenerates from a report

- **WHEN** an admin presses Regenerate on an image report of an uploaded image
- **THEN** a fresh generated image replaces the upload, the upload is scheduled for deletion, and the report resolves
  as removed
